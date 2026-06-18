"use client";

/**
 * IFM `/api/ifm/presence` is disabled on the client when `IFM_PRESENCE_CLIENT_DISABLED` is true.
 * No fetch/interval may call that route until re-enabled. `/api/ifm/friends` is unchanged.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { SeaLinkBrandFooter } from "@/components/SeaLinkBrandFooter";
import { distanceMiles } from "@/lib/geo-haversine";
import { clampGeoAccuracyM, humanGeolocationMessage } from "@/lib/geolocation-utils";
import { isContactPickerAvailable, pickEmailsFromDeviceContacts } from "@/lib/device-contact-picker";
import { useIsMobileApp } from "@/hooks/useIsMobileApp";
import { getAvatarDataUrl, getBoatName, getFullName, getProfilePhone } from "@/lib/map-profile-storage";
import Link from "next/link";
import { ChevronLeft, Compass } from "lucide-react";
const IFM_SHARE_CONTACT_KEY = "sealink_ifm_share_contact_v1";

/** Client-side IFM presence toggle. */
const IFM_PRESENCE_CLIENT_DISABLED = false;

type FilterMode = "all" | "friends" | "local";

type IfmPeer = {
  uid: string;
  lat: number;
  lng: number;
  fullName: string;
  boatName: string;
  avatarDataUrl: string;
  /** Normalised phone from profile when shared via IFM presence. */
  phoneNorm?: string;
  /** Sign-in email when the user opted in to share it on IFM. */
  contactEmail?: string;
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

function peerFriendContact(p: IfmPeer): string {
  const email = (p.contactEmail ?? "").trim();
  if (email) return email;
  const phone = (p.phoneNorm ?? "").trim();
  if (phone) return phone;
  return "";
}

function IfmPeerPopup({
  peer,
  onAdd,
  adding,
}: {
  peer: IfmPeer;
  onAdd: () => void;
  adding: boolean;
}) {
  const contact = peerFriendContact(peer);
  const via = (peer.contactEmail ?? "").trim() ? "email" : contact ? "phone" : null;
  return (
    <div className="min-w-[220px] max-w-[280px]">
      <p className="m-0 text-sm font-semibold text-zinc-900">{peer.fullName || "SeaLink user"}</p>
      {peer.boatName ? <p className="m-0 text-xs text-zinc-600">{peer.boatName}</p> : null}
      <p className="m-0 mt-1 text-[11px] text-zinc-500">
        updated {new Date(peer.updatedAt).toLocaleString("en-GB")}
      </p>
      {contact ? (
        <>
          <p className="m-0 mt-2 text-[11px] text-zinc-600">
            {via === "email" ? "Email" : "Phone"} (for adding as friend)
          </p>
          <p className="m-0 break-all text-xs font-medium text-zinc-800">{contact}</p>
          <button
            type="button"
            disabled={adding}
            onClick={onAdd}
            className="mt-2 w-full rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add to friends"}
          </button>
        </>
      ) : (
        <p className="m-0 mt-2 text-[11px] leading-snug text-zinc-500">
          This sailor has not shared an email (opt-in) or phone on IFM, so you can’t add them from the map. Ask them to
          enable “Share contact on IFM” or add them manually below.
        </p>
      )}
    </div>
  );
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
  const [err, setErr] = useState<string | null>(() =>
    typeof navigator === "undefined" || !navigator.geolocation ? "Geolocation not supported in this browser." : null,
  );
  const [sharing, setSharing] = useState(true);
  const [shareContactOnIfm, setShareContactOnIfm] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(IFM_SHARE_CONTACT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { isMobile, mounted } = useIsMobileApp();
  const [map, setMap] = useState<L.Map | null>(null);
  /** Bumped after a successful presence POST so the “me” pin reflects latest profile from storage. */
  const [profileSync, setProfileSync] = useState(0);
  const [addingFriendUid, setAddingFriendUid] = useState<string | null>(null);
  const [contactSuggestEmails, setContactSuggestEmails] = useState<string[]>([]);
  const [pickingContacts, setPickingContacts] = useState(false);
  const [lastRefreshedAtMs, setLastRefreshedAtMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const lastShareAt = useRef<number>(0);
  const forceNextPresencePost = useRef(false);
  const peerIconCacheRef = useRef<Map<string, { avatar: string; icon: L.DivIcon }>>(new Map());

  const myDisplay = useMemo(() => {
    const fullName = getFullName().trim();
    const boatName = getBoatName().trim();
    const avatarDataUrl = getAvatarDataUrl() || "";
    const phone = getProfilePhone().trim();
    return { fullName, boatName, avatarDataUrl, phone };
  }, [profileSync]);

  const myIcon = useMemo(() => buildAvatarIcon(myDisplay.avatarDataUrl), [myDisplay.avatarDataUrl]);

  const getPeerIcon = useCallback((uid: string, avatarDataUrl: string) => {
    const avatar = avatarDataUrl || "";
    const cache = peerIconCacheRef.current;
    const existing = cache.get(uid);
    if (existing && existing.avatar === avatar) return existing.icon;
    const icon = buildAvatarIcon(avatar);
    cache.set(uid, { avatar, icon });
    return icon;
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    let disposed = false;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (disposed) return;
        const next = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: clampGeoAccuracyM(p.coords.accuracy),
        };
        setPos(next);
        setInitialCenter((c) => (c ? c : [next.lat, next.lng]));
        setErr(null);
      },
      (e) => {
        if (!disposed) setErr(humanGeolocationMessage(e));
      },
      { enableHighAccuracy: true, maximumAge: 45_000, timeout: 35_000 },
    );
    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const sharePresence = useCallback(async () => {
    if (IFM_PRESENCE_CLIENT_DISABLED) return;
    if (!sharing) return;
    if (!pos) return;
    const now = Date.now();
    const force = forceNextPresencePost.current;
    forceNextPresencePost.current = false;
    if (!force && lastShareAt.current !== 0 && now - lastShareAt.current < 30_000) return;
    const fullName = getFullName().trim();
    const boatName = getBoatName().trim();
    const avatarDataUrl = getAvatarDataUrl() || "";
    const phone = getProfilePhone().trim();
    try {
      const r = await fetch("/api/ifm/presence", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share: true,
          shareContactOnIfm,
          lat: pos.lat,
          lng: pos.lng,
          fullName,
          boatName,
          avatarDataUrl,
          phone,
        }),
      });
      if (r.ok) {
        lastShareAt.current = Date.now();
        setProfileSync((n) => n + 1);
      }
    } catch {
      /* ignore */
    }
  }, [sharing, shareContactOnIfm, pos?.lat, pos?.lng]);

  useEffect(() => {
    if (IFM_PRESENCE_CLIENT_DISABLED) return;
    void sharePresence();
  }, [sharePresence]);

  const loadPeers = useCallback(async () => {
    if (IFM_PRESENCE_CLIENT_DISABLED) {
      setPeers([]);
      return;
    }
    setErr(null);
    try {
      if (mode === "local") {
        if (!pos) return;
        const r = await fetch(`/api/ifm/presence?mode=local&lat=${encodeURIComponent(String(pos.lat))}&lng=${encodeURIComponent(String(pos.lng))}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const d = (await r.json()) as { peers?: IfmPeer[]; error?: string };
        if (!r.ok) throw new Error(d.error || "Could not load IFM peers");
        setPeers(Array.isArray(d.peers) ? d.peers : []);
        return;
      }
      if (mode === "friends") {
        const r = await fetch("/api/ifm/presence?mode=friends", { credentials: "same-origin", cache: "no-store" });
        const d = (await r.json()) as { peers?: IfmPeer[]; friends?: FriendRow[]; error?: string };
        if (!r.ok) throw new Error(d.error || "Could not load friends");
        setPeers(Array.isArray(d.peers) ? d.peers : []);
        setFriends(Array.isArray(d.friends) ? d.friends : []);
        return;
      }
      const r = await fetch("/api/ifm/presence?mode=all", { credentials: "same-origin", cache: "no-store" });
      const d = (await r.json()) as { peers?: IfmPeer[]; error?: string };
      if (!r.ok) throw new Error(d.error || "Could not load IFM peers");
      setPeers(Array.isArray(d.peers) ? d.peers : []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not load IFM peers");
    }
  }, [mode, pos?.lat, pos?.lng]);

  useEffect(() => {
    if (IFM_PRESENCE_CLIENT_DISABLED) {
      setPeers([]);
      return;
    }
    // No polling: IFM peers are refreshed manually (or once on initial load below).
  }, [loadPeers]);

  // One-time initial load so the map isn't empty on first visit.
  useEffect(() => {
    if (IFM_PRESENCE_CLIENT_DISABLED) return;
    let disposed = false;
    (async () => {
      await loadPeers();
      if (!disposed) setLastRefreshedAtMs(Date.now());
    })().catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [loadPeers]);

  const refreshFriendsList = useCallback(async () => {
    try {
      const r = await fetch("/api/ifm/friends", { credentials: "same-origin", cache: "no-store" });
      const d = (await r.json()) as { friends?: FriendRow[] };
      if (r.ok && Array.isArray(d.friends)) setFriends(d.friends);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshFriendsList();
  }, [refreshFriendsList]);

  useEffect(() => {
    if (!lastRefreshedAtMs) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [lastRefreshedAtMs]);

  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAtMs) return "Never";
    const s = Math.max(0, Math.floor((nowMs - lastRefreshedAtMs) / 1000));
    if (s < 10) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }, [lastRefreshedAtMs, nowMs]);

  const manualRefreshPeers = useCallback(async () => {
    if (IFM_PRESENCE_CLIENT_DISABLED) return;
    await loadPeers();
    setLastRefreshedAtMs(Date.now());
    // Friends list can change as you add/remove; keep it fresh on refresh.
    void refreshFriendsList();
  }, [loadPeers, refreshFriendsList]);

  const addFriendWithContact = useCallback(async (raw: string, opts?: { zoomFriendsMap?: boolean }) => {
    const v = raw.trim();
    if (!v) return;
    setErr(null);
    try {
      const r = await fetch("/api/ifm/friends", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: v }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; friends?: FriendRow[] };
      if (!r.ok || d.ok === false) throw new Error(d.error || "Could not add friend");
      setContact("");
      setFriends(Array.isArray(d.friends) ? d.friends : []);
      if (opts?.zoomFriendsMap) setMode("friends");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not add friend");
    }
  }, []);

  const addFriend = useCallback(async () => {
    await addFriendWithContact(contact, { zoomFriendsMap: false });
  }, [contact, addFriendWithContact]);

  const addFriendFromDeviceContacts = useCallback(async () => {
    if (!isContactPickerAvailable()) return;
    setPickingContacts(true);
    setErr(null);
    try {
      const emails = await pickEmailsFromDeviceContacts();
      if (!emails.length) {
        setErr("No email addresses in the contacts you selected.");
        return;
      }
      setContactSuggestEmails((prev) => [...new Set([...prev, ...emails])]);
      setContact((c) => (c.trim() ? c : emails[0] ?? ""));
    } catch (e: unknown) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
      if (name === "AbortError" || name === "NotAllowedError") {
        return;
      }
      setErr(e instanceof Error ? e.message : "Could not open contacts.");
    } finally {
      setPickingContacts(false);
    }
  }, []);

  const addPeerAsFriend = useCallback(
    async (p: IfmPeer) => {
      const v = peerFriendContact(p);
      if (!v) return;
      setAddingFriendUid(p.uid);
      setErr(null);
      try {
        await addFriendWithContact(v, { zoomFriendsMap: true });
      } finally {
        setAddingFriendUid(null);
      }
    },
    [addFriendWithContact],
  );

  const removeFriend = useCallback(async (f: FriendRow) => {
    setErr(null);
    try {
      const r = await fetch(`/api/ifm/friends?kind=${encodeURIComponent(f.kind)}&value=${encodeURIComponent(f.value)}`, {
        method: "DELETE",
        credentials: "same-origin",
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

  const center: [number, number] = initialCenter ?? [51.505, -0.09];
  const friendsPeersSorted = useMemo(() => {
    if (mode !== "friends") return [];
    return peers
      .slice()
      .sort((a, b) => (a.fullName || a.boatName).localeCompare(b.fullName || b.boatName));
  }, [peers, mode]);

  if (mounted && isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-top safe-bottom flex flex-col justify-between overflow-x-hidden">
        {/* Immersive Cockpit Header */}
        <div className="p-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
              aria-label="Back to home"
            >
              <ChevronLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.15)]">
                <Compass size={16} />
              </span>
              <div className="text-left">
                <h1 className="text-sm font-extrabold tracking-tight text-slate-100">
                  Friends Map (IFM)
                </h1>
                <p className="text-[9px] text-zinc-500">
                  Explore and connect with sailors worldwide
                </p>
              </div>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => {
              const next = !sharing;
              setSharing(next);
              if (!next) {
                if (!IFM_PRESENCE_CLIENT_DISABLED) {
                  void fetch("/api/ifm/presence", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ share: false }),
                  });
                }
              } else {
                void sharePresence();
              }
            }}
            className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border cursor-pointer ${
              sharing
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                : "border-rose-500/30 bg-rose-500/10 text-rose-400"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${sharing ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            Share: {sharing ? "ON" : "OFF"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-20">
          {/* Main Controls Card */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 space-y-3.5 shadow-md">
            {/* Filter mode segments */}
            <div className="grid grid-cols-3 rounded-xl border border-white/[0.08] bg-black/35 p-1">
              <button
                type="button"
                onClick={() => setMode("all")}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === "all" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 active:text-white"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setMode("friends")}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === "friends" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 active:text-white"
                }`}
              >
                Friends
              </button>
              <button
                type="button"
                onClick={() => setMode("local")}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === "local" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 active:text-white"
                }`}
              >
                Local (10mi)
              </button>
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!pos || !map}
                onClick={() => {
                  if (!pos || !map) return;
                  map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 8), { animate: true, duration: 0.6 });
                }}
                className="flex-1 h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] active:bg-white/[0.08] text-xs font-bold text-slate-200 transition-all disabled:opacity-40"
              >
                Center on me
              </button>
              
              <div className="flex-1 flex flex-col items-stretch">
                <button
                  type="button"
                  onClick={() => void manualRefreshPeers()}
                  className="h-10 rounded-xl border border-indigo-500/20 bg-indigo-500/10 active:bg-indigo-500/20 text-xs font-bold text-indigo-300 transition-all"
                >
                  Refresh
                </button>
              </div>
            </div>
            <p className="text-[9px] text-zinc-500 text-right -mt-1 font-mono">
              Last refreshed: {lastRefreshedLabel}
            </p>

            {/* Share contact toggling option card */}
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-zinc-400">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-700 text-indigo-600"
                checked={shareContactOnIfm}
                disabled={!sharing}
                onChange={(e) => {
                  const on = e.target.checked;
                  forceNextPresencePost.current = true;
                  setShareContactOnIfm(on);
                  try {
                    window.localStorage.setItem(IFM_SHARE_CONTACT_KEY, on ? "1" : "0");
                  } catch {
                    /* ignore */
                  }
                }}
              />
              <div>
                <span className="font-bold text-zinc-200">Share contact info on map pin</span>
                <span className="mt-0.5 block text-[9.5px] leading-normal text-zinc-500">
                  Lets others add you as a friend from your map pin. Shares your email and profile phone.
                </span>
              </div>
            </label>
          </div>

          {err ? (
            <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              {err}
            </p>
          ) : null}

          {/* Leaflet Map Frame */}
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c182c]/40 shadow-2xl h-[340px] w-full min-h-[250px] p-0.5">
            <MapContainer
              center={center}
              zoom={pos ? 4 : 2}
              className="h-full w-full rounded-[22px]"
              scrollWheelZoom
              attributionControl={false}
            >
              <AttributionControl position="bottomright" prefix={false} />
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
                    <Marker key={p.uid} position={[p.lat, p.lng]} icon={getPeerIcon(p.uid, p.avatarDataUrl)}>
                      <Popup>
                        <IfmPeerPopup
                          peer={p}
                          onAdd={() => void addPeerAsFriend(p)}
                          adding={addingFriendUid === p.uid}
                        />
                      </Popup>
                    </Marker>
                  ))}
                </MarkerClusterGroup>
              ) : (
                peersWithLocalSort.map((p) => (
                  <Marker key={p.uid} position={[p.lat, p.lng]} icon={getPeerIcon(p.uid, p.avatarDataUrl)}>
                    <Popup>
                      <IfmPeerPopup
                        peer={p}
                        onAdd={() => void addPeerAsFriend(p)}
                        adding={addingFriendUid === p.uid}
                      />
                    </Popup>
                  </Marker>
                ))
              )}
            </MapContainer>
            <div className="absolute bottom-2 left-2 right-2 z-[400] flex items-center justify-between bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-[9px] font-bold text-zinc-400">
              <span>
                Showing <span className="text-white">{peers.length}</span>{" "}
                {mode === "friends" ? "friends" : mode === "local" ? "nearby users" : "users"}.
              </span>
              <span>{pos ? `GPS ±${Math.round(pos.accuracyM)}m` : "Waiting for GPS…"}</span>
            </div>
          </div>

          {/* Friends list Directory Card */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 space-y-4 shadow-md">
            <div>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Friends directory</p>
              <p className="text-[10px] text-zinc-500 mt-1">
                Add by email/phone or tap pin on map. Switch filters to view friends on radar.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <input
                id="ifm-friend-contact-input"
                list="sealink-ifm-friend-email-datalist"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="email@example.com or +447700900123"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 text-sm text-zinc-100 outline-none focus:border-indigo-600"
              />
              <datalist id="sealink-ifm-friend-email-datalist">
                {contactSuggestEmails.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void addFriend()}
                  className="flex-1 h-12 rounded-xl bg-indigo-600 font-bold text-sm text-white active:bg-indigo-700 transition-all"
                >
                  Add Friend
                </button>
                {isContactPickerAvailable() ? (
                  <button
                    type="button"
                    disabled={pickingContacts}
                    onClick={() => void addFriendFromDeviceContacts()}
                    className="flex-1 h-12 rounded-xl border border-white/[0.08] bg-white/[0.03] font-bold text-xs text-zinc-200 active:bg-white/[0.08] transition-all disabled:opacity-40"
                  >
                    {pickingContacts ? "Opening…" : "Add from contacts"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* List of Added Friends */}
            <div className="max-h-[220px] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 divide-y divide-white/[0.04]">
              {friends.length ? (
                friends.map((f) => (
                  <div key={`${f.kind}:${f.value}`} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-200">
                        {f.kind === "email" ? "✉️" : "📞"} {f.value}
                      </p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">
                        added {new Date(f.addedAt).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeFriend(f)}
                      className="h-8 px-2.5 rounded-lg border border-red-500/20 bg-red-500/10 text-[10px] font-extrabold uppercase text-red-400 active:bg-red-500/25 transition-all"
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-xs text-zinc-500 text-center">No friends added yet.</p>
              )}
            </div>
          </div>

          {/* Friends on map list list - shown when Friends mode is selected */}
          {mode === "friends" ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 space-y-3.5 shadow-md">
              <div>
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Friends on map</p>
                <p className="text-[10px] text-zinc-500 mt-1">Tap a friend to zoom map to their boat.</p>
              </div>

              <div className="max-h-[200px] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 divide-y divide-white/[0.04]">
                {friendsPeersSorted.length ? (
                  friendsPeersSorted.map((p) => (
                    <button
                      key={`peer-${p.uid}`}
                      type="button"
                      onClick={() => {
                        if (!map) return;
                        map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 8), { animate: true, duration: 0.6 });
                      }}
                      className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left active:bg-white/[0.04] transition-all"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-200">
                          {p.fullName || "SeaLink user"}
                        </p>
                        {p.boatName ? (
                          <p className="truncate text-[10px] text-zinc-500 mt-0.5">⛵ {p.boatName}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[9px] text-zinc-500 font-mono">
                        {new Date(p.updatedAt).toLocaleDateString("en-GB")}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-xs text-zinc-500 text-center">No friends currently sharing on IFM.</p>
                )}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-black">
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

              <div className="flex flex-col items-stretch gap-0.5 sm:items-end">
                <button
                  type="button"
                  onClick={() => void manualRefreshPeers()}
                  className="h-9 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
                  title="Refresh IFM users"
                >
                  Refresh
                </button>
                <p className="text-center text-[10px] font-medium text-zinc-500 sm:text-right dark:text-zinc-400">
                  Last refreshed {lastRefreshedLabel}
                </p>
              </div>

            <button
              type="button"
              onClick={() => {
                const next = !sharing;
                setSharing(next);
                if (!next) {
                  if (!IFM_PRESENCE_CLIENT_DISABLED) {
                    void fetch("/api/ifm/presence", {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ share: false }),
                    });
                  }
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
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-indigo-600"
              checked={shareContactOnIfm}
              disabled={!sharing}
              onChange={(e) => {
                const on = e.target.checked;
                forceNextPresencePost.current = true;
                setShareContactOnIfm(on);
                try {
                  window.localStorage.setItem(IFM_SHARE_CONTACT_KEY, on ? "1" : "0");
                } catch {
                  /* ignore */
                }
              }}
            />
            <span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Share contact on IFM</span>
              <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                Lets others add you as a friend from your map pin: your sign-in email (if checked) and the phone from
                your profile (already shared with your position) can be used.
              </span>
            </span>
          </label>
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
                center={center}
                zoom={pos ? 4 : 2}
                className="h-full w-full"
                scrollWheelZoom
                attributionControl={false}
              >
                <AttributionControl position="bottomright" prefix={false} />
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
                      <Marker key={p.uid} position={[p.lat, p.lng]} icon={getPeerIcon(p.uid, p.avatarDataUrl)}>
                        <Popup>
                          <IfmPeerPopup
                            peer={p}
                            onAdd={() => void addPeerAsFriend(p)}
                            adding={addingFriendUid === p.uid}
                          />
                        </Popup>
                      </Marker>
                    ))}
                  </MarkerClusterGroup>
                ) : (
                  peersWithLocalSort.map((p) => (
                    <Marker key={p.uid} position={[p.lat, p.lng]} icon={getPeerIcon(p.uid, p.avatarDataUrl)}>
                      <Popup>
                        <IfmPeerPopup
                          peer={p}
                          onAdd={() => void addPeerAsFriend(p)}
                          adding={addingFriendUid === p.uid}
                        />
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
                Add by email or phone, or tap someone on the map when they share contact on IFM. On supported phones
                you can pick emails from this device&apos;s contacts; matching addresses appear as suggestions while you
                type. Max 100. Switch to <span className="font-semibold">Friends</span> to view them on the map.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="flex min-w-0 flex-1 gap-2">
                  <input
                    id="ifm-friend-contact-input"
                    list="sealink-ifm-friend-email-datalist"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="email@example.com or +447700900123"
                    autoComplete="email"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  <datalist id="sealink-ifm-friend-email-datalist">
                    {contactSuggestEmails.map((e) => (
                      <option key={e} value={e} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={() => void addFriend()}
                    className="h-9 shrink-0 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Add
                  </button>
                </div>
                {isContactPickerAvailable() ? (
                  <button
                    type="button"
                    disabled={pickingContacts}
                    onClick={() => void addFriendFromDeviceContacts()}
                    className="h-9 shrink-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:whitespace-nowrap"
                  >
                    {pickingContacts ? "Opening…" : "Add from contacts"}
                  </button>
                ) : null}
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

        <SeaLinkBrandFooter />
      </main>
    </div>
  );
}

