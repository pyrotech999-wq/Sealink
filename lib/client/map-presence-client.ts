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
  inflightManual: Promise<boolean> | null;
  lastManualAtMs: number;
};

function st(): State {
  const g = globalThis as unknown as Record<string, State | undefined>;
  if (!g[GKEY]) {
    g[GKEY] = {
      inflightManual: null,
      lastManualAtMs: 0,
    };
  }
  return g[GKEY]!;
}

export function startNearbyPresence(_opts: StartOpts): () => void {
  // Emergency mode: automatic presence polling is disabled.
  return () => undefined;
}

export function refreshNearbyPresenceNow(opts: StartOpts): void {
  // Backwards-compatible API: manual refresh only.
  void manualRefreshNearbyPresence(opts);
}

export async function manualRefreshNearbyPresence(opts: StartOpts): Promise<boolean> {
  const s = st();
  if (!opts.signedIn || !opts.shareNearby) return false;

  const now = Date.now();
  if (s.lastManualAtMs && now - s.lastManualAtMs < 60_000) return false;
  if (s.inflightManual) {
    console.info("PRESENCE_MANUAL_SKIPPED_INFLIGHT");
    void s.inflightManual;
    return false;
  }

  const coords = opts.getCoords();
  if (!coords) return false;
  const label = opts.getLabel().trim().slice(0, 40) || "Nearby boat";

  s.lastManualAtMs = now;
  console.info("PRESENCE_MANUAL_START");

  const doWork = async (): Promise<boolean> => {
    // POST heartbeat once
    console.info("PRESENCE_MANUAL_POST");
    const post = await fetch("/api/map/presence", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: coords.lat, lng: coords.lng, label, shareNearby: true }),
    });
    if (post.status === 401) {
      opts.onUnauthorized();
      return false;
    }
    if (!post.ok) return false;

    // GET peers once
    console.info("PRESENCE_MANUAL_GET");
    const url = `/api/map/presence?lat=${encodeURIComponent(String(coords.lat))}&lng=${encodeURIComponent(String(coords.lng))}`;
    const get = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (get.status === 401) {
      opts.onUnauthorized();
      return false;
    }
    if (!get.ok) return false;
    const d = (await get.json().catch(() => ({}))) as { peers?: PresencePeer[] };
    const peers = Array.isArray(d.peers) ? d.peers : [];
    opts.onPeers(peers);
    return true;
  };

  // Set inflight immediately to prevent same-tick duplicates.
  s.inflightManual = doWork()
    .catch(() => false)
    .finally(() => {
      console.info("PRESENCE_MANUAL_DONE");
      s.inflightManual = null;
    });
  return s.inflightManual;
}

