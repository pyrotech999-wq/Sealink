"use client";

export const ANCHOR_DEVICE_ID_HEADER = "x-sealink-device-id";

export type AnchorSessionCommandApiStatus = "queued" | "received" | "applied" | "failed";

export type AnchorSessionCommandApi = {
  id: string;
  type: "INCREASE_RADIUS" | "RESET_ANCHOR" | "SILENCE_UNTIL_RESET";
  meters: number | null;
  status: AnchorSessionCommandApiStatus;
  sourceDeviceId: string;
  errorMessage: string | null;
  createdAt: string;
  appliedAt: string | null;
};

export function anchorCommandClientLog(phase: string, detail: Record<string, unknown> = {}): void {
  console.info("[anchor-session-command]", phase, detail);
}

export async function postAnchorSessionCommand(args: {
  type: AnchorSessionCommandApi["type"];
  meters?: number;
  sourceDeviceId: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; command: AnchorSessionCommandApi } | { ok: false; status: number; error: string }> {
  const body: Record<string, unknown> = { type: args.type, sourceDeviceId: args.sourceDeviceId };
  if (args.type === "INCREASE_RADIUS") body.meters = args.meters ?? 10;
  anchorCommandClientLog("create_request", { type: args.type, meters: body.meters, sourceDeviceId: args.sourceDeviceId });
  const r = await fetch("/api/anchor/commands", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [ANCHOR_DEVICE_ID_HEADER]: args.sourceDeviceId,
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  const j = (await r.json().catch(() => ({}))) as { command?: AnchorSessionCommandApi; error?: string };
  if (!r.ok) {
    anchorCommandClientLog("create_failed", { status: r.status, error: j?.error });
    return { ok: false, status: r.status, error: typeof j?.error === "string" ? j.error : `HTTP ${r.status}` };
  }
  const c = j.command;
  if (!c?.id) return { ok: false, status: r.status, error: "Missing command in response" };
  anchorCommandClientLog("create_ok", { id: c.id, type: c.type, status: c.status });
  return { ok: true, command: c };
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
  const intervalMs = args.intervalMs ?? 2000;
  const timeoutMs = args.timeoutMs ?? 120_000;
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
  sourceDeviceId: string;
  signal?: AbortSignal;
  onWaitingForBoat?: () => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const posted = await postAnchorSessionCommand({
      type: args.type,
      meters: args.meters,
      sourceDeviceId: args.sourceDeviceId,
      signal: args.signal,
    });
    if (!posted.ok) return { ok: false, error: posted.error };

    let warned = false;
    const last = await pollAnchorSessionCommandUntilTerminal({
      id: posted.command.id,
      signal: args.signal,
      onTick(c, elapsed) {
        if (!warned && elapsed > 8000 && (c.status === "queued" || c.status === "received")) {
          warned = true;
          args.onWaitingForBoat?.();
        }
      },
    });
    if (last.status === "applied") return { ok: true };
    if (last.status === "failed") return { ok: false, error: last.errorMessage?.trim() || "Command failed on the boat device." };
    return {
      ok: false,
      error: "Waiting for boat device — command is still queued. Keep SeaLink open on the monitoring handset with GPS.",
    };
  } catch (e) {
    if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Cancelled." };
    }
    anchorCommandClientLog("enqueue_await_error", { message: e instanceof Error ? e.message : String(e) });
    return { ok: false, error: "Could not complete command. Check connection." };
  }
}
