import { subscribeSharedPoller } from "@/lib/client/shared-poller";
import { getLastKnownPosition } from "@/lib/map-last-known";

export type MapLiveResponse = {
  ok?: boolean;
  messages?: unknown[];
  replyAlerts?: unknown[];
  error?: string;
};

type Coords = { lat: number; lng: number };

type Subscriber = {
  id: string;
  getCoords: () => Coords | null;
  onData: (d: MapLiveResponse) => void;
};

const GKEY = "__sealink_map_live_store_v1";

type Store = {
  subs: Map<string, Subscriber>;
  last: MapLiveResponse | null;
  inFlight: Promise<MapLiveResponse> | null;
  unsubPoller: (() => void) | null;
};

function store(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  if (!g[GKEY]) {
    g[GKEY] = { subs: new Map(), last: null, inFlight: null, unsubPoller: null };
  }
  return g[GKEY]!;
}

function pickCoords(s: Store): Coords | null {
  // Prefer any subscriber-provided coords.
  for (const sub of s.subs.values()) {
    const c = sub.getCoords();
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) return c;
  }
  // Fallback to last-known GPS (if any).
  const g = getLastKnownPosition();
  if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) return { lat: g.lat, lng: g.lng };
  return null;
}

async function fetchOnce(): Promise<MapLiveResponse> {
  const s = store();
  if (s.inFlight) return s.inFlight;
  const coords = pickCoords(s);
  if (!coords) return {};

  // TEMP (maintenance): this module is the single fetch point for `/api/map/live`.
  // If production logs show legacy endpoints, those callers are not coming from current client code.
  s.inFlight = fetch(
    `/api/map/live?lat=${encodeURIComponent(String(coords.lat))}&lng=${encodeURIComponent(String(coords.lng))}`,
    { credentials: "same-origin", cache: "no-store" },
  )
    .then(async (r) => {
      let j: MapLiveResponse = {};
      try {
        j = (await r.json()) as MapLiveResponse;
      } catch {
        j = { error: r.ok ? "Invalid response" : `HTTP ${r.status}` };
      }
      if (!r.ok) return j;
      return j;
    })
    .catch(() => ({}))
    .finally(() => {
      const cur = store();
      cur.inFlight = null;
    });

  return s.inFlight;
}

async function pollTick() {
  const s = store();
  if (s.subs.size === 0) return;
  const d = await fetchOnce();
  s.last = d;
  for (const sub of s.subs.values()) {
    try {
      sub.onData(d);
    } catch {
      /* */
    }
  }
}

function ensurePoller() {
  const s = store();
  if (s.unsubPoller) return;
  // Single shared poller for all map live data.
  s.unsubPoller = subscribeSharedPoller(
    "sealink:/api/map/live",
    async () => {
      await pollTick();
    },
    {
      enabled: true,
      minIntervalMs: 15_000,
      maxIntervalMs: 15_000,
      backgroundMinIntervalMs: 60_000,
      backgroundMaxIntervalMs: 60_000,
    },
  );
}

function maybeStopPoller() {
  const s = store();
  if (s.subs.size !== 0) return;
  if (s.unsubPoller) s.unsubPoller();
  s.unsubPoller = null;
}

/** Subscribe to the single `/api/map/live` poller. */
export function subscribeMapLive(opts: {
  id: string;
  getCoords: () => Coords | null;
  onData: (d: MapLiveResponse) => void;
}): () => void {
  const s = store();
  s.subs.set(opts.id, { id: opts.id, getCoords: opts.getCoords, onData: opts.onData });
  ensurePoller();
  // Push last value immediately (if any).
  if (s.last) {
    queueMicrotask(() => {
      try {
        opts.onData(s.last!);
      } catch {
        /* */
      }
    });
  }
  // Kick once to fill cache quickly.
  queueMicrotask(() => void pollTick());

  return () => {
    const cur = store();
    cur.subs.delete(opts.id);
    maybeStopPoller();
  };
}

/** Immediate refresh (still in-flight deduped). */
export function refreshMapLive(): Promise<MapLiveResponse> {
  return fetchOnce().then((d) => {
    const s = store();
    s.last = d;
    for (const sub of s.subs.values()) {
      try {
        sub.onData(d);
      } catch {
        /* */
      }
    }
    return d;
  });
}

export function getLastMapLive(): MapLiveResponse | null {
  return store().last;
}

