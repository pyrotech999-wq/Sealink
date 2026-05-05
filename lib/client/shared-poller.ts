type PollerOptions = {
  /** Randomized between min/max after each successful/failed run. */
  minIntervalMs: number;
  maxIntervalMs: number;
  /** If false, the poller will not run and will clear cached results. */
  enabled: boolean;
};

type PollerEntry = {
  subscribers: number;
  opts: PollerOptions;
  timer: number | null;
  inFlight: Promise<void> | null;
  lastRunAtMs: number;
  run: () => Promise<void>;
};

const pollers = new Map<string, PollerEntry>();

function randInt(min: number, max: number): number {
  const lo = Math.max(0, Math.floor(min));
  const hi = Math.max(lo, Math.floor(max));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function isVisible(): boolean {
  return typeof document === "undefined" ? true : document.visibilityState === "visible";
}

function scheduleNext(key: string) {
  const e = pollers.get(key);
  if (!e) return;
  if (e.timer != null) window.clearTimeout(e.timer);
  e.timer = null;
  if (!e.opts.enabled) return;
  if (e.subscribers <= 0) return;
  if (!isVisible()) return;
  const delay = randInt(e.opts.minIntervalMs, e.opts.maxIntervalMs);
  e.timer = window.setTimeout(() => void tick(key), delay);
}

async function tick(key: string) {
  const e = pollers.get(key);
  if (!e) return;
  if (!e.opts.enabled || e.subscribers <= 0 || !isVisible()) {
    scheduleNext(key);
    return;
  }

  const now = Date.now();
  // Hard cap: never run more frequently than minIntervalMs even if multiple triggers occur.
  if (e.lastRunAtMs && now - e.lastRunAtMs < e.opts.minIntervalMs) {
    scheduleNext(key);
    return;
  }

  if (e.inFlight) {
    await e.inFlight.catch(() => undefined);
    scheduleNext(key);
    return;
  }

  e.lastRunAtMs = now;
  e.inFlight = (async () => {
    await e.run();
  })()
    .catch(() => undefined)
    .finally(() => {
      const cur = pollers.get(key);
      if (cur) cur.inFlight = null;
    });

  await e.inFlight.catch(() => undefined);
  scheduleNext(key);
}

let visHooked = false;
function ensureVisibilityHook() {
  if (visHooked) return;
  if (typeof document === "undefined") return;
  visHooked = true;
  const onVis = () => {
    if (document.visibilityState !== "visible") return;
    // When the tab becomes visible, kick all active pollers once and reschedule.
    for (const key of pollers.keys()) {
      void tick(key);
    }
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pageshow", onVis);
}

export function subscribeSharedPoller(
  key: string,
  run: () => Promise<void>,
  opts: PollerOptions,
): () => void {
  ensureVisibilityHook();
  const existing = pollers.get(key);
  if (existing) {
    existing.subscribers += 1;
    existing.run = run;
    existing.opts = opts;
    scheduleNext(key);
    // First subscriber on a visible tab should kick immediately.
    if (existing.subscribers === 1 && opts.enabled && isVisible()) queueMicrotask(() => void tick(key));
  } else {
    pollers.set(key, {
      subscribers: 1,
      opts,
      timer: null,
      inFlight: null,
      lastRunAtMs: 0,
      run,
    });
    if (opts.enabled && isVisible()) queueMicrotask(() => void tick(key));
  }

  return () => {
    const e = pollers.get(key);
    if (!e) return;
    e.subscribers = Math.max(0, e.subscribers - 1);
    if (e.subscribers <= 0) {
      if (e.timer != null) window.clearTimeout(e.timer);
      pollers.delete(key);
    } else {
      scheduleNext(key);
    }
  };
}

export function triggerSharedPollerNow(key: string) {
  queueMicrotask(() => void tick(key));
}

