"use client";

import { ANCHOR_COMMAND_STALE_BOAT_ERROR } from "@/lib/anchor-command-constants";
import { ANCHOR_DEVICE_ID_HEADER } from "@/lib/anchor-device-id-header";

export { ANCHOR_DEVICE_ID_HEADER };

export const ANCHOR_COMMAND_BOAT_OFFLINE_MSG = ANCHOR_COMMAND_STALE_BOAT_ERROR;

export type AnchorSessionCommandApiStatus = "queued" | "received" | "applied" | "failed";

export type AnchorSessionCommandApi = {
  id: string;
  type: "INCREASE_RADIUS" | "RESET_ANCHOR" | "SILENCE_UNTIL_RESET";
  meters: number | null;
  status: AnchorSessionCommandApiStatus;
  sourceDeviceId: string;
  sessionId?: string | null;
  targetDeviceId?: string | null;
  errorMessage: string | null;
  createdAt: string;
  appliedAt: string | null;
};

/** Last POST /api/anchor/commands outcome for remote-handset debugging. */
export type AnchorRemoteCommandPostDebug = {
  postStatus: number;
  postResponse: unknown;
  commandId: string | null;
  targetDeviceId: string | null;
  sessionId: string | null;
  status: string | null;
};

export function anchorCommandClientLog(phase: string, detail: Record<string, unknown> = {}): void {
  console.info("[anchor-session-command]", phase, detail);
}

function postDebugFromPosted(
  posted:
    | { ok: true; httpStatus: number; rawJson: unknown; command: AnchorSessionCommandApi }
    | { ok: false; httpStatus: number; rawJson: unknown; error: string },
): AnchorRemoteCommandPostDebug {
  if (!posted.ok) {
    return {
      postStatus: posted.httpStatus,
      postResponse: posted.rawJson,
      commandId: null,
      targetDeviceId: null,
      sessionId: null,
      status: null,
    };
  }
  return {
    postStatus: posted.httpStatus,
    postResponse: posted.rawJson,
    commandId: posted.command.id,
    targetDeviceId: posted.command.targetDeviceId ?? null,
    sessionId: posted.command.sessionId ?? null,
    status: posted.command.status,
  };
}

export async function postAnchorSessionCommand(args: {
  type: AnchorSessionCommandApi["type"];
  meters?: number;
  /** Caller handset id — sent only as {@link ANCHOR_DEVICE_ID_HEADER}, never as target monitor. */
  callerDeviceId: string;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; httpStatus: number; rawJson: unknown; command: AnchorSessionCommandApi }
  | { ok: false; httpStatus: number; rawJson: unknown; error: string }
> {
  const body: Record<string, unknown> = { type: args.type };
  if (args.type === "INCREASE_RADIUS") body.meters = args.meters ?? 10;
  anchorCommandClientLog("create_request", { type: args.type, meters: body.meters, callerDeviceId: args.callerDeviceId });
  const r = await fetch("/api/anchor/commands", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [ANCHOR_DEVICE_ID_HEADER]: args.callerDeviceId,
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  const text = await r.text();
  let rawJson: unknown = text;
  try {
    rawJson = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    rawJson = { _parseError: true as const, text: text.slice(0, 2000) };
  }
  const j = (typeof rawJson === "object" && rawJson !== null ? rawJson : {}) as {
    command?: AnchorSessionCommandApi;
    error?: string;
    ok?: boolean;
  };
  if (!r.ok) {
    anchorCommandClientLog("create_failed", { status: r.status, error: j?.error });
    return { ok: false, httpStatus: r.status, rawJson, error: typeof j?.error === "string" ? j.error : `HTTP ${r.status}` };
  }
  const c = j.command;
  if (!c?.id) return { ok: false, httpStatus: r.status, rawJson, error: "Missing command in response" };
  anchorCommandClientLog("create_ok", { id: c.id, type: c.type, status: c.status });
  return { ok: true, httpStatus: r.status, rawJson, command: c };
}

export async function getAnchorSessionCommandById(
  id: string,
  opts?: { signal?: AbortSignal },
): Promise<AnchorSessionCommandApi | null> {
  const r = await fetch(`/api/anchor/commands?id=${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...(opts?.signal ? { signal: opts.signal } : {}),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { command?: AnchorSessionCommandApi };
  return j.command ?? null;
}

export async function patchAnchorSessionCommandStatus(args: {
  id: string;
  monitorDeviceId: string;
  status: AnchorSessionCommandApiStatus;
  errorMessage?: string | null;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; command?: AnchorSessionCommandApi; status: number; error?: string }> {
  anchorCommandClientLog("patch_request", { id: args.id, status: args.status });
  const r = await fetch(`/api/anchor/commands/${encodeURIComponent(args.id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      [ANCHOR_DEVICE_ID_HEADER]: args.monitorDeviceId,
    },
    credentials: "same-origin",
    body: JSON.stringify({
      status: args.status,
      ...(args.errorMessage != null && args.errorMessage !== "" ? { errorMessage: args.errorMessage } : {}),
    }),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  const j = (await r.json().catch(() => ({}))) as { command?: AnchorSessionCommandApi; error?: string };
  if (!r.ok) {
    anchorCommandClientLog("patch_failed", { id: args.id, httpStatus: r.status, error: j?.error });
    return { ok: false, status: r.status, error: typeof j?.error === "string" ? j.error : `HTTP ${r.status}` };
  }
  anchorCommandClientLog("patch_ok", { id: args.id, status: j.command?.status });
  return { ok: true, command: j.command, status: r.status };
}

export async function pollAnchorSessionCommandUntilTerminal(args: {
  id: string;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onTick?: (c: AnchorSessionCommandApi, elapsedMs: number) => void;
}): Promise<AnchorSessionCommandApi> {
  const intervalMs = args.intervalMs ?? 1500;
  const timeoutMs = args.timeoutMs ?? 22_000;
  const start = Date.now();
  for (;;) {
    if (args.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const c = await getAnchorSessionCommandById(args.id, { signal: args.signal });
    if (!c) throw new Error("command_not_found");
    args.onTick?.(c, Date.now() - start);
    if (c.status === "applied" || c.status === "failed") return c;
    if (Date.now() - start > timeoutMs) return c;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Remote handset: enqueue a session command and wait until the boat applies it (or failure / timeout). */
export async function enqueueAndAwaitAnchorCommand(args: {
  type: AnchorSessionCommandApi["type"];
  meters?: number;
  callerDeviceId: string;
  signal?: AbortSignal;
  onWaitingForBoat?: () => void;
}): Promise<
  | { ok: true; postDebug: AnchorRemoteCommandPostDebug; terminalStatus: string }
  | { ok: false; error: string; postDebug: AnchorRemoteCommandPostDebug }
> {
  const emptyPostDebug: AnchorRemoteCommandPostDebug = {
    postStatus: 0,
    postResponse: null,
    commandId: null,
    targetDeviceId: null,
    sessionId: null,
    status: null,
  };
  try {
    const posted = await postAnchorSessionCommand({
      type: args.type,
      meters: args.meters,
      callerDeviceId: args.callerDeviceId,
      signal: args.signal,
    });
    const postDebug = postDebugFromPosted(posted);
    if (!posted.ok) return { ok: false, error: posted.error, postDebug };

    let warned = false;
    const last = await pollAnchorSessionCommandUntilTerminal({
      id: posted.command.id,
      signal: args.signal,
      onTick(c, elapsed) {
        if (!warned && elapsed > 5000 && (c.status === "queued" || c.status === "received")) {
          warned = true;
          args.onWaitingForBoat?.();
        }
      },
    });
    if (last.status === "applied") return { ok: true, postDebug, terminalStatus: last.status };
    if (last.status === "failed") {
      const msg = last.errorMessage?.trim() || "Command failed on the boat device.";
      return { ok: false, error: msg, postDebug };
    }
    return {
      ok: false,
      error: ANCHOR_COMMAND_STALE_BOAT_ERROR,
      postDebug,
    };
  } catch (e) {
    if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Cancelled.", postDebug: emptyPostDebug };
    }
    anchorCommandClientLog("enqueue_await_error", { message: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: "Could not complete command. Check connection.", postDebug: emptyPostDebug };
  }
}
