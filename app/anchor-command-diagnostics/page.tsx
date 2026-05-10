"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ANCHOR_COMMAND_STALE_QUEUED_MS, ANCHOR_COMMAND_STALE_RECEIVED_MS } from "@/lib/anchor-command-constants";
import { getOrCreateDeviceId } from "@/lib/device-id";

type DiagnosticsPayload = {
  effectiveMonitorDeviceId: string | null;
  serverMonitorDeviceId: string | null;
  geofenceMonitorDeviceId: string;
  geofenceArmed: boolean;
  pendingCommands: {
    id: string;
    type: string;
    status: string;
    meters: number | null;
    sourceDeviceId: string;
    errorMessage: string | null;
    createdAt: string;
  }[];
  transport: "http_poll";
  note: string;
};

type Heartbeat = {
  at: number;
  pollOk?: boolean;
  pollAccepted?: boolean | null;
  commandCount?: number;
  visibility?: string;
  httpStatus?: number;
} | null;

const HEARTBEAT_KEY = "sealink_anchor_cmd_boat_heartbeat";

export default function AnchorCommandDiagnosticsPage() {
  const deviceId = useMemo(() => (typeof window !== "undefined" ? getOrCreateDeviceId() : ""), []);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [heartbeat, setHeartbeat] = useState<Heartbeat>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const me = await fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" });
      const mj = (await me.json()) as { signedIn?: boolean };
      setSignedIn(Boolean(mj.signedIn));
      if (!mj.signedIn) {
        setData(null);
        return;
      }
      const r = await fetch("/api/anchor/commands?role=diagnostics", { credentials: "same-origin", cache: "no-store" });
      const raw = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        const msg =
          typeof raw.error === "string"
            ? raw.error
            : typeof raw.errorMessage === "string"
              ? raw.errorMessage
              : `Diagnostics HTTP ${r.status}`;
        setErr(msg);
        setData(null);
        return;
      }
      if (!Array.isArray(raw.pendingCommands) || typeof raw.geofenceArmed !== "boolean") {
        setErr("Invalid diagnostics response from server.");
        setData(null);
        return;
      }
      setData(raw as unknown as DiagnosticsPayload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
      setData(null);
    }
    try {
      const raw = localStorage.getItem(HEARTBEAT_KEY);
      setHeartbeat(raw ? (JSON.parse(raw) as Heartbeat) : null);
    } catch {
      setHeartbeat(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const isThisDeviceMonitor =
    data?.effectiveMonitorDeviceId && deviceId ? data.effectiveMonitorDeviceId === deviceId : false;

  return (
    <div className="min-h-screen bg-zinc-950 pb-16">
    <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
      <p className="text-sm text-zinc-400">
        <Link href="/anchor-alarm" className="text-sky-400 underline hover:text-sky-300">
          ← Anchor alarm
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Anchor command diagnostics</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Remote actions use an HTTP-polled queue on the monitoring handset (not Supabase Realtime). If{" "}
        <strong className="text-zinc-300">pollAccepted</strong> is false on the boat, the server effective monitor id does
        not match this device&apos;s id — fix monitor settings or re-save geofence from the boat so{" "}
        <code className="text-zinc-200">this</code> resolves to a concrete device id.
      </p>

      {signedIn === false ? (
        <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          Sign in to load diagnostics.
        </p>
      ) : null}

      {err ? (
        <p className="mt-6 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-100">{err}</p>
      ) : null}

      {data ? (
        <dl className="mt-8 space-y-4 rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 text-sm">
          <div>
            <dt className="font-semibold text-zinc-300">This handset device id</dt>
            <dd className="mt-1 break-all font-mono text-xs text-zinc-100">{deviceId || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Effective monitoring device (server)</dt>
            <dd className="mt-1 break-all font-mono text-xs text-zinc-100">{data.effectiveMonitorDeviceId ?? "null"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">This device is effective monitor</dt>
            <dd className="mt-1 text-zinc-100">{isThisDeviceMonitor ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">anchor_monitor_config.monitor_device_id</dt>
            <dd className="mt-1 break-all font-mono text-xs text-zinc-100">{data.serverMonitorDeviceId ?? "null"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Geofence monitor_device_id (stored)</dt>
            <dd className="mt-1 break-all font-mono text-xs text-zinc-100">{data.geofenceMonitorDeviceId}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Geofence armed</dt>
            <dd className="mt-1 text-zinc-100">{data.geofenceArmed ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Transport</dt>
            <dd className="mt-1 text-zinc-100">{data.transport}</dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Stale thresholds (server)</dt>
            <dd className="mt-1 text-zinc-100">
              queued → failed after {ANCHOR_COMMAND_STALE_QUEUED_MS / 1000}s; received → failed after total age{" "}
              {ANCHOR_COMMAND_STALE_RECEIVED_MS / 1000}s
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Boat poll heartbeat (this browser, localStorage)</dt>
            <dd className="mt-1 break-all font-mono text-[11px] leading-relaxed text-zinc-200">
              {heartbeat ? JSON.stringify(heartbeat, null, 2) : "No heartbeat yet (only written when Home map command processor runs)."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Listener / connection state</dt>
            <dd className="mt-1 text-zinc-200">
              No Realtime subscription — processing is <strong className="text-zinc-100">HTTP poll</strong> on the boat
              while the map is mounted and anchor is armed. iOS Safari and background Android WebViews may throttle{" "}
              <code className="text-zinc-100">setInterval</code>; we shorten the interval when the tab is visible and run
              an immediate poll on visibility/focus.
            </dd>
          </div>
          <div>
            <dt className="mb-2 font-semibold text-zinc-300">Pending commands ({data.pendingCommands.length})</dt>
            <dd>
              {data.pendingCommands.length === 0 ? (
                <span className="text-zinc-400">None</span>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto font-mono text-[11px] text-zinc-200">
                  {data.pendingCommands.map((c) => (
                    <li key={c.id} className="rounded border border-zinc-700/80 bg-black/30 p-2">
                      <div>id: {c.id}</div>
                      <div>
                        {c.type} · {c.status}
                        {c.meters != null ? ` · ${c.meters}m` : ""}
                      </div>
                      <div className="break-all">source: {c.sourceDeviceId}</div>
                      <div>created: {c.createdAt}</div>
                      {c.errorMessage ? <div className="text-amber-200/90">err: {c.errorMessage}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-zinc-300">Note</dt>
            <dd className="mt-1 text-xs leading-relaxed text-zinc-400">{data.note}</dd>
          </div>
        </dl>
      ) : null}

      <button
        type="button"
        onClick={() => void load()}
        className="mt-8 rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
      >
        Refresh now
      </button>
    </div>
    </div>
  );
}
