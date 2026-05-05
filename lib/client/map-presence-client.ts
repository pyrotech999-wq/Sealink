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
  blocked401: boolean;
  running: boolean;
  visHooked: boolean;
};

function st(): State {
  const g = globalThis as unknown as Record<string, State | undefined>;
  if (!g[GKEY]) {
    g[GKEY] = {
      unsub: null,
      inflightGet: null,
      inflightPost: null,
      blocked401: false,
      running: false,
      visHooked: false,
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
  const coords = opts.getCoords();
  if (!coords) return;
  const label = opts.getLabel().trim().slice(0, 40) || "Nearby boat";
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
      if (d.rateLimited) console.info("PRESENCE_RATE_LIMITED", { method: "POST" });
    })
    .finally(() => {
      s.inflightPost = null;
    });
  return s.inflightPost;
}

async function getPeers(opts: StartOpts): Promise<void> {
  const s = st();
  if (s.inflightGet) return s.inflightGet;
  const coords = opts.getCoords();
  if (!coords) return;
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
      if (d.throttled) console.info("PRESENCE_RATE_LIMITED", { method: "GET" });
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
  if (s.unsub) s.unsub();
  s.unsub = null;
}

export function startNearbyPresence(opts: StartOpts): () => void {
  const s = st();
  ensureVisibilityLog();

  stop();

  s.blocked401 = false;
  s.running = true;

  if (!opts.signedIn || !opts.shareNearby) {
    s.running = false;
    return () => undefined;
  }

  console.info("PRESENCE_POLLING_START");

  const tick = async () => {
    if (!isVisible()) return; // shared poller won't tick hidden; safety.
    if (!opts.signedIn || !opts.shareNearby) return;
    if (s.blocked401) return;
    // No aggressive retry: best-effort once per minute.
    await postHeartbeat(opts);
    await getPeers(opts);
  };

  s.unsub = subscribeSharedPoller(
    "sealink:/api/map/presence",
    async () => void tick(),
    { enabled: true, minIntervalMs: 60_000, maxIntervalMs: 60_000 },
  );

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

