"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { distanceMiles } from "@/lib/geo-haversine";
import { getAvatarDataUrl, getBoatName, getFullName, getProfilePhone } from "@/lib/map-profile-storage";

type FilterMode = "all" | "friends" | "local";

type IfmPeer = {
  uid: string;
  lat: number;
  lng: number;
  fullName: string;
  boatName: string;
  avatarDataUrl: string;
  updatedAt: string;
};

type FriendRow = { kind: "email" | "phone"; value: string; addedAt: string };

function buildAvatarIcon(avatarDataUrl: string): L.DivIcon {
  const safeAvatar = (avatarDataUrl || "").replace(/'/g, "");
  const inner = safeAvatar
    ? `<img src='${safeAvatar}' alt="" width="34" height="34" style="border-radius:9999px;object-fit:cover;display:block;"/>`
    : `<div style="width:34px;height:34px;border-radius:9999px;background:#0ea5e9;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff">⛵</div>`;
  const html = `<div style="width:38px;height:38px;border-radius:9999px;background:#fff;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25);overflow:hidden;display:flex;align-items:center;justify-content:center">${inner}</div>`;
  return L.divIcon({ className: "sealink-ifm-pin", html, iconSize: [38, 38], iconAnchor: [19, 19] });
}

function MapBinder({ onMap }: { onMap: (m: L.Map) => void }) {
  const m = useMap();
  useEffect(() => onMap(m), [m, onMap]);
  return null;
}

export function IfmMapClient() {
  const [mode, setMode] = useState<FilterMode>("all");
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);
  const [peers, setPeers] = useState<IfmPeer[]>([]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [contact, setContact] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sharing, setSharing] = useState(true);
  const [map, setMap] = useState<L.Map | null>(null);

  const lastShareAt = useRef<number>(0);

  const myDisplay = useMemo(() => {
    const fullName = getFullName().trim();
    const boatName = getBoatName().trim();
    const avatarDataUrl = getAvatarDataUrl() || "";
    const phone = getProfilePhone().trim();
    return { fullName, boatName, avatarDataUrl, phone };
  }, []);

  const myIcon = useMemo(() => buildAvatarIcon(myDisplay.avatarDataUrl), [myDisplay.avatarDataUrl]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr("Geolocation not supported in this browser.");
      return;
    }
    let disposed = false;
    const tick = () => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (disposed) return;
          const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy || 0 };
          setPos(next);
          if (!initialCenter) setInitialCenter([next.lat, next.lng]);
          setErr(null);
        },
        () => {
          if (!disposed) setErr("Could not get your location. Allow location permissions to use IFM.");
        },
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 },
      );
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [initialCenter]);

  const sharePresence = useCallback(async () => {
    if (!sharing) return;
    if (!pos) return;
    const now = Date.now();
    if (now - lastShareAt.current < 45_000) return;
    lastShareAt.current = now;
    try {
      await fetch("/api/ifm/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share: true,
          lat: pos.lat,
          lng: pos.lng,
          fullName: myDisplay.fullName,
          boatName: myDisplay.boatName,
          avatarDataUrl: myDisplay.avatarDataUrl,
          phone: myDisplay.phone,
        }),
      });
    } catch {
      /* ignore */
    }
  }, [sharing, pos?.lat, pos?.lng, myDisplay]);

  useEffect(() => {
    void sharePresence();
  }, [sharePresence]);

  const loadPeers = useCallback(async () => {
    setErr(null);
    try {
      if (mode === "local") {
        if (!pos) return;
        const r = await fetch(`/api/ifm/presence?mode=local&lat=${encodeURIComponent(String(pos.lat))}&lng=${encodeURIComponent(String(pos.lng))}`, {
          cache: "no-store",
        });
        const d = (await r.json()) as { peers?: IfmPeer[]; error?: string };
        if (!r.ok) throw new Error(d.error || "Could not load IFM peers");
        setPeers(Array.isArray(d.peers) ? d.peers : []);
        return;
      }
      if (mode === "friends") {
        const r = await fetch("/api/ifm/presence?mode=friends", { cache: "no-store" });
        const d = (await r.json()) as { peers?: IfmPeer[]; friends?: FriendRow[]; error?: string };
        if (!r.ok) throw new Error(d.error || "Could not load friends");
        setPeers(Array.isArray(d.peers) ? d.peers : []);
        setFriends(Array.isArray(d.friends) ? d.friends : []);
        return;
      }
      const r = await fetch("/api/ifm/presence?mode=all", { cache: "no-store" });
      const d = (await r.json()) as { peers?: IfmPeer[]; error?: string };
      if (!r.ok) throw new Error(d.error || "Could not load IFM peers");
      setPeers(Array.isArray(d.peers) ? d.peers : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not load IFM peers");
    }
  }, [mode, pos?.lat, pos?.lng]);

  useEffect(() => {
    void loadPeers();
    const id = window.setInterval(() => void loadPeers(), 20_000);
    return () => window.clearInterval(id);
  }, [loadPeers]);

  const addFriend = useCallback(async () => {
    const v = contact.trim();
    if (!v) return;
    setErr(null);
    try {
      const r = await fetch("/api/ifm/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: v }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; friends?: FriendRow[] };
      if (!r.ok || d.ok === false) throw new Error(d.error || "Could not add friend");
      setContact("");
      setFriends(Array.isArray(d.friends) ? d.friends : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not add friend");
    }
  }, [contact]);

  const removeFriend = useCallback(async (f: FriendRow) => {
    setErr(null);
    try {
      const r = await fetch(`/api/ifm/friends?kind=${encodeURIComponent(f.kind)}&value=${encodeURIComponent(f.value)}`, {
        method: "DELETE",
      });
      const d = (await r.json()) as { ok?: boolean; friends?: FriendRow[]; error?: string };
      if (!r.ok || d.ok === false) throw new Error(d.error || "Could not remove friend");
      setFriends(Array.isArray(d.friends) ? d.friends : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not remove friend");
    }
  }, []);

  const peersWithLocalSort = useMemo(() => {
    if (mode !== "local" || !pos) return peers;
    return peers
      .slice()
      .sort(
        (a, b) =>
          distanceMiles(pos.lat, pos.lng, a.lat, a.lng) - distanceMiles(pos.lat, pos.lng, b.lat, b.lng),
      );
  }, [peers, mode, pos?.lat, pos?.lng]);

  const center = initialCenter ?? [51.505, -0.09];
  const friendsPeersSorted = useMemo(() => {
    if (mode !== "friends") return [];
    return peers
      .slice()
      .sort((a, b) => (a.fullName || a.boatName).localeCompare(b.fullName || b.boatName));
  }, [peers, mode]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              IFM — International Friends Map
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Explore all users worldwide, your friends list, or only boats within 10 miles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                onClick={() => setMode("all")}
                className={`h-9 px-3 text-sm font-semibold ${
                  mode === "all"
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                All users
              </button>
              <button
                type="button"
                onClick={() => setMode("friends")}
                className={`h-9 px-3 text-sm font-semibold ${
                  mode === "friends"
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                Friends
              </button>
              <button
                type="button"
                onClick={() => setMode("local")}
                className={`h-9 px-3 text-sm font-semibold ${
                  mode === "local"
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                Local (10mi)
              </button>
            </div>

            <button
              type="button"
              disabled={!pos || !map}
              onClick={() => {
                if (!pos || !map) return;
                map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 8), { animate: true, duration: 0.6 });
              }}
              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              title="Center the map on your location"
            >
              Center on me
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !sharing;
                setSharing(next);
                if (!next) {
                  void fetch("/api/ifm/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ share: false }) });
                } else {
                  void sharePresence();
                }
              }}
              className={`h-9 rounded-xl px-3 text-sm font-semibold ${
                sharing
                  ? "border border-green-300 bg-green-50 text-green-900 hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-100"
                  : "border border-red-300 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
              }`}
              title="Toggle sharing your own location on IFM"
            >
              {sharing ? "Sharing: ON" : "Sharing: OFF"}
            </button>
          </div>
        </div>

        {err ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="h-[min(68vh,560px)] w-full bg-zinc-100 dark:bg-zinc-900">
              <MapContainer
                center={center as any}
                zoom={pos ? 4 : 2}
                className="h-full w-full"
                scrollWheelZoom
                attributionControl
              >
                <MapBinder onMap={(m) => setMap(m)} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {pos ? (
                  <Marker position={[pos.lat, pos.lng]} icon={myIcon}>
                    <Popup>
                      <p className="m-0 text-sm font-semibold text-zinc-900">{myDisplay.fullName || "You"}</p>
                      {myDisplay.boatName ? <p className="m-0 text-xs text-zinc-600">{myDisplay.boatName}</p> : null}
                    </Popup>
                  </Marker>
                ) : null}
                {mode === "all" ? (
                  <MarkerClusterGroup chunkedLoading>
                    {peersWithLocalSort.map((p) => (
                      <Marker key={p.uid} position={[p.lat, p.lng]} icon={buildAvatarIcon(p.avatarDataUrl)}>
                        <Popup>
                          <p className="m-0 text-sm font-semibold text-zinc-900">{p.fullName || "SeaLink user"}</p>
                          {p.boatName ? <p className="m-0 text-xs text-zinc-600">{p.boatName}</p> : null}
                          <p className="m-0 mt-1 text-[11px] text-zinc-500">
                            updated {new Date(p.updatedAt).toLocaleString("en-GB")}
                          </p>
                        </Popup>
                      </Marker>
                    ))}
                  </MarkerClusterGroup>
                ) : (
                  peersWithLocalSort.map((p) => (
                    <Marker key={p.uid} position={[p.lat, p.lng]} icon={buildAvatarIcon(p.avatarDataUrl)}>
                      <Popup>
                        <p className="m-0 text-sm font-semibold text-zinc-900">{p.fullName || "SeaLink user"}</p>
                        {p.boatName ? <p className="m-0 text-xs text-zinc-600">{p.boatName}</p> : null}
                        <p className="m-0 mt-1 text-[11px] text-zinc-500">
                          updated {new Date(p.updatedAt).toLocaleString("en-GB")}
                        </p>
                      </Popup>
                    </Marker>
                  ))
                )}
              </MapContainer>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <span>
                Showing <span className="font-semibold text-zinc-900 dark:text-zinc-100">{peers.length}</span>{" "}
                {mode === "friends" ? "friends" : mode === "local" ? "nearby users" : "users"}.
              </span>
              <span>{pos ? `GPS ±${Math.round(pos.accuracyM)}m` : "Waiting for GPS…"}</span>
            </div>
          </div>

          <aside className="space-y-4">
            {mode === "friends" ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Friends on map</p>
                <p className="mt-1 text-xs text-zinc-500">Tap a friend to zoom to them.</p>
                <div className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {friendsPeersSorted.length ? (
                    <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                      {friendsPeersSorted.map((p) => (
                        <li key={`peer-${p.uid}`}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!map) return;
                              map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 8), { animate: true, duration: 0.6 });
                            }}
                            className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                {p.fullName || "SeaLink user"}
                              </p>
                              {p.boatName ? (
                                <p className="truncate text-[11px] text-zinc-600 dark:text-zinc-400">{p.boatName}</p>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-[10px] text-zinc-500">
                              {new Date(p.updatedAt).toLocaleDateString("en-GB")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-3 text-xs text-zinc-500">No friends currently sharing on IFM.</p>
                  )}
                </div>
              </div>
            ) : null}
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Friends list</p>
              <p className="mt-1 text-xs text-zinc-500">
                Add by email or phone. Max 100. Switch to <span className="font-semibold">Friends</span> to view them on the map.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="email@example.com or +447700900123"
                  className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <button
                  type="button"
                  onClick={() => void addFriend()}
                  className="h-9 shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>

              <div className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                {friends.length ? (
                  <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                    {friends.map((f) => (
                      <li key={`${f.kind}:${f.value}`} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {f.kind === "email" ? "Email" : "Phone"} · {f.value}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            added {new Date(f.addedAt).toLocaleDateString("en-GB")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeFriend(f)}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-3 text-xs text-zinc-500">No friends added yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

