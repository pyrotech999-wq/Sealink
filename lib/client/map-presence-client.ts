import { subscribeSharedPoller } from "@/lib/client/shared-poller";

type Coords = { lat: number; lng: number };

type PresencePeer = { id: string; lat: number; lng: number; label: string; avatarDataUrl?: string };

type StartOpts = {
  signedIn: boolean;
  shareNearby: boolean;
  getCoords: () => Coords | null;
  getLabel: () => string;
  onPeers: (peers: PresencePeer[]) => void;
  onUnauthorized: () => void;
};

const GKEY = "__sealink_map_presence_client_v1";

type State = {
  unsub: (() => void) | null;
  inflightGet: Promise<void> | null;
  inflightPost: Promise<void> | null;
  lastGetAtMs: number;
  lastPostAtMs: number;
  backoffUntilMs: number;
  blocked401: boolean;
  running: boolean;
  visHooked: boolean;
  opts: StartOpts | null;
};

function st(): State {
  const g = globalThis as unknown as Record<string, State | undefined>;
  if (!g[GKEY]) {
    g[GKEY] = {
      unsub: null,
      inflightGet: null,
      inflightPost: null,
      lastGetAtMs: 0,
      lastPostAtMs: 0,
      backoffUntilMs: 0,
      blocked401: false,
      running: false,
      visHooked: false,
      opts: null,
    };
  }
  return g[GKEY]!;
}

function isVisible(): boolean {
  return typeof document === "undefined" ? true : document.visibilityState === "visible";
}

function ensureVisibilityLog() {
  const s = st();
  if (s.visHooked) return;
  if (typeof document === "undefined") return;
  s.visHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    if (!s.running) return;
    console.info("PRESENCE_SKIPPED_HIDDEN");
  });
}

async function postHeartbeat(opts: StartOpts): Promise<void> {
  const s = st();
  if (s.inflightPost) return s.inflightPost;
  const now = Date.now();
  if (s.backoffUntilMs && now < s.backoffUntilMs) {
    console.info("PRESENCE_BACKOFF", { method: "POST", msRemaining: s.backoffUntilMs - now });
    return;
  }
  if (s.lastPostAtMs && now - s.lastPostAtMs < 60_000) {
    console.info("PRESENCE_CLIENT_SKIP_TOO_SOON", { method: "POST", msSinceLast: now - s.lastPostAtMs });
    return;
  }
  const coords = opts.getCoords();
  if (!coords) return;
  const label = opts.getLabel().trim().slice(0, 40) || "Nearby boat";
  s.lastPostAtMs = now;
  console.info("PRESENCE_POST", { url: "/api/map/presence" });
  s.inflightPost = fetch("/api/map/presence", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: coords.lat, lng: coords.lng, label, shareNearby: true }),
  })
    .then(async (r) => {
      if (r.status === 401) {
        s.blocked401 = true;
        opts.onUnauthorized();
        return;
      }
      if (!r.ok) return;
      const d = (await r.json().catch(() => ({}))) as { rateLimited?: boolean };
      if (d.rateLimited) {
        console.info("PRESENCE_RATE_LIMITED", { method: "POST" });
        s.backoffUntilMs = Date.now() + 60_000;
        console.info("PRESENCE_BACKOFF", { method: "POST", ms: 60_000 });
      }
    })
    .finally(() => {
      s.inflightPost = null;
    });
  return s.inflightPost;
}

async function getPeers(opts: StartOpts): Promise<void> {
  const s = st();
  if (s.inflightGet) return s.inflightGet;
  const now = Date.now();
  if (s.backoffUntilMs && now < s.backoffUntilMs) {
    console.info("PRESENCE_BACKOFF", { method: "GET", msRemaining: s.backoffUntilMs - now });
    return;
  }
  if (s.lastGetAtMs && now - s.lastGetAtMs < 60_000) {
    console.info("PRESENCE_CLIENT_SKIP_TOO_SOON", { method: "GET", msSinceLast: now - s.lastGetAtMs });
    return;
  }
  const coords = opts.getCoords();
  if (!coords) return;
  s.lastGetAtMs = now;
  console.info("PRESENCE_GET");
  const url = `/api/map/presence?lat=${encodeURIComponent(String(coords.lat))}&lng=${encodeURIComponent(String(coords.lng))}`;
  s.inflightGet = fetch(url, { credentials: "same-origin", cache: "no-store" })
    .then(async (r) => {
      if (r.status === 401) {
        s.blocked401 = true;
        opts.onUnauthorized();
        return;
      }
      if (!r.ok) return;
      const d = (await r.json().catch(() => ({}))) as { peers?: PresencePeer[]; throttled?: boolean };
      if (d.throttled) {
        console.info("PRESENCE_RATE_LIMITED", { method: "GET" });
        s.backoffUntilMs = Date.now() + 60_000;
        console.info("PRESENCE_BACKOFF", { method: "GET", ms: 60_000 });
      }
      const peers = Array.isArray(d.peers) ? d.peers : [];
      opts.onPeers(peers);
    })
    .finally(() => {
      s.inflightGet = null;
    });
  return s.inflightGet;
}

function stop(): void {
  const s = st();
  s.running = false;
  s.opts = null;
  if (s.unsub) s.unsub();
  s.unsub = null;
}

export function startNearbyPresence(opts: StartOpts): () => void {
  const s = st();
  ensureVisibilityLog();

  s.opts = opts;

  if (!opts.signedIn || !opts.shareNearby) {
    s.running = false;
    return () => undefined;
  }

  if (!s.running) {
    s.blocked401 = false;
    s.lastGetAtMs = 0;
    s.lastPostAtMs = 0;
    s.backoffUntilMs = 0;
    s.running = true;
    console.info("PRESENCE_POLLING_START");
  }

  const tick = async () => {
    const cur = st();
    const live = cur.opts;
    if (!live) return;
    if (!isVisible()) return; // shared poller won't tick hidden; safety.
    if (!live.signedIn || !live.shareNearby) return;
    if (cur.blocked401) return;
    // No aggressive retry: best-effort once per minute.
    await postHeartbeat(live);
    await getPeers(live);
  };

  if (!s.unsub) {
    s.unsub = subscribeSharedPoller(
      "sealink:/api/map/presence",
      async () => void tick(),
      { enabled: true, minIntervalMs: 60_000, maxIntervalMs: 60_000 },
    );
  }

  return () => stop();
}

export function refreshNearbyPresenceNow(opts: StartOpts): void {
  const s = st();
  if (!opts.signedIn || !opts.shareNearby) return;
  if (!isVisible()) {
    console.info("PRESENCE_SKIPPED_HIDDEN");
    return;
  }
  if (s.blocked401) return;
  void postHeartbeat(opts).then(() => void getPeers(opts));
}

