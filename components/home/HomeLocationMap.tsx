"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { LifeOnSeasDailyModal } from "@/components/home/LifeOnSeasDailyModal";
import { AnchorAlertModal } from "@/components/home/AnchorAlertModal";
import { HomeMessagesCtaButton } from "@/components/home/HomeMessagesCtaButton";
import { WeatherForecast7Day } from "@/components/home/WeatherForecast7Day";
import {
  markLifeOnSeasPopupShownToday,
  wasLifeOnSeasPopupShownToday,
} from "@/lib/life-on-seas-popup-storage";
import { WindTimelineControls } from "@/components/home/WindTimelineControls";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";
import { getLastKnownPosition, recordLastKnownPosition } from "@/lib/map-last-known";
import { angleDiffDeg, bearingDeg, distanceMiles } from "@/lib/geo-haversine";
import { fetchWindSlotsEvery3h, nearestSlotIndex, type HourlyWindSlot } from "@/lib/open-meteo-hourly";
import { buildWindArrowDivIcon } from "@/lib/wind-map-icon";
import {
  escapeHtml,
  getAvatarDataUrl,
  getBackgroundLocationConsent,
  getBoatName,
  getFullName,
  getShowAvatar,
  getShareNearbyPeers,
  getShareOnMap,
  MAP_PROFILE,
  setBackgroundLocationConsent,
  setBoatName,
  setFullName,
  setShowAvatar,
  setShareNearbyPeers,
  setShareOnMap,
} from "@/lib/map-profile-storage";
import {
  ANCHOR_MAX_HORIZ_ACCURACY_M,
  createAnchorGpsStabilizer,
  processAnchorGeoSample,
  type AnchorGpsQuality,
} from "@/lib/anchor-gps-stabilizer";
import { getAnchorAlertConfig, setAnchorAlertConfig } from "@/lib/anchor-alert-storage";
import {
  GPS_REFINE_MAX_MS,
  GPS_REFINE_TARGET_ACCURACY_M,
  GPS_REFINE_WATCH_OPTIONS,
} from "@/lib/gps-refinement";
import { isLikelyIOS } from "@/lib/location-env";
import { getNativeLocationBridge } from "@/lib/native-location-bridge";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";
import { clampGeoAccuracyM, humanGeolocationMessage } from "@/lib/geolocation-utils";
import { logMapPresenceClient } from "@/lib/map-presence-client-log";
import {
  tryBeginPresenceClientTick,
  tryConsumeMapPresenceClearPost,
  tryConsumeMapPresenceGetTurn,
  tryConsumeMapPresencePostTurn,
} from "@/lib/map-presence-network-guard";
import { presenceIsPausedAfter401, presenceSetPausedAfter401 } from "@/lib/map-presence-session-pause";

const DEFAULT_CENTER: [number, number] = [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];
const DEFAULT_ZOOM = 6;

/** Statute miles → metres (for ~5 mi “nearby” ring). */
const NEARBY_RING_METRES = 5 * 1609.344;

/** One interval drives nearby presence; POST/GET are further throttled inside the tick + module guard. */
const PRESENCE_TICK_MS = 180_000;
/** In-tick soft throttle (network guard is the hard cap: POST 30s, GET 60s). */
const PRESENCE_POST_MIN_MS = 30_000;
const PRESENCE_GET_MIN_MS = 60_000;
/** While anchor alert is armed, POST periodically (≤ same cadence as MIN_POST / network guard). */
const PRESENCE_ANCHOR_HEARTBEAT_POST_MS = 30_000;
const PRESENCE_SIGNIFICANT_MOVE_M = 30;

/** Fixed anchor point for geofence (orange ⚓ — drawn under your moving boat pin). */
function buildAnchorGeofenceCenterIcon(): L.DivIcon {
  return L.divIcon({
    className: "sealink-anchor-geofence-pin",
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:#d97706;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1" aria-hidden="true">⚓</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function buildNearbyPinIcon(avatarDataUrl: string): L.DivIcon {
  const safeAvatar = avatarDataUrl.replace(/'/g, "");
  const inner = avatarDataUrl
    ? `<img src='${safeAvatar}' alt="" width="36" height="36" style="max-width:36px;max-height:36px;border-radius:9999px;object-fit:cover;display:block;"/>`
    : `<div style="width:36px;height:36px;border-radius:9999px;background:#2563eb;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff">⌖</div>`;
  const html = `<div style="width:40px;height:40px;border-radius:9999px;background:#fff;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25);overflow:hidden;display:flex;align-items:center;justify-content:center">${inner}</div>`;
  return L.divIcon({
    className: "sealink-nearby-pin",
    html,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

type LatLngAcc = { lat: number; lng: number; accuracyM: number };

/** Keep showing a cached pin while GPS warms up or briefly drops (mobile). */
const LAST_KNOWN_PIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readCachedPinForSharing(): LatLngAcc | null {
  if (typeof window === "undefined") return null;
  const lk = getLastKnownPosition(LAST_KNOWN_PIN_MAX_AGE_MS);
  if (!lk) return null;
  return { lat: lk.lat, lng: lk.lng, accuracyM: 80 };
}

type NearbyPeer = { id: string; lat: number; lng: number; label: string; avatarDataUrl?: string };

/** Compact lines for map popup (label is "boat · name" or a single field). */
function NearbyPeerPopupBody({ label }: { label: string }) {
  const raw = (label || "Nearby boat").trim();
  const parts = raw.includes(" · ") ? raw.split(" · ").map((s) => s.trim()).filter(Boolean) : [raw];
  const title = parts.join(" · ");
  return (
    <div className="max-w-[11rem]">
      {parts.map((line, i) => (
        <p
          key={i}
          className={`m-0 max-w-[11rem] truncate text-zinc-900 ${i === 0 ? "text-sm font-semibold" : "mt-0.5 text-xs font-medium text-zinc-600"}`}
          title={title}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function MapRecenter({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  const framed = useRef(false);
  useEffect(() => {
    const next: [number, number] = [lat, lng];
    if (!framed.current) {
      map.setView(next, zoom);
      framed.current = true;
      return;
    }
    map.panTo(next, { animate: true, duration: 0.35 });
  }, [lat, lng, zoom, map]);
  return null;
}

/** Mobile browsers resize the map when the URL bar shows/hides; Leaflet needs a nudge. */
function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => {
      window.setTimeout(() => {
        map.invalidateSize();
      }, 0);
    };
    window.addEventListener("orientationchange", fix);
    window.addEventListener("resize", fix);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", fix);
    vv?.addEventListener("scroll", fix);
    return () => {
      window.removeEventListener("orientationchange", fix);
      window.removeEventListener("resize", fix);
      vv?.removeEventListener("resize", fix);
      vv?.removeEventListener("scroll", fix);
    };
  }, [map]);
  return null;
}

function buildPinIcon(boat: string, avatarUrl: string, peekAvatar: boolean): L.DivIcon {
  const label = escapeHtml(boat || "Your boat");
  const safeAvatar = avatarUrl.replace(/'/g, "");
  const initial = escapeHtml((boat || "You").trim().slice(0, 1).toUpperCase() || "Y");

  const showPhoto = Boolean(avatarUrl) && peekAvatar;
  const head = showPhoto
    ? `<div style="width:40px;height:40px;border-radius:9999px;background:#fff;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25);overflow:hidden;display:flex;align-items:center;justify-content:center"><img src='${safeAvatar}' alt="" width="40" height="40" style="display:block;object-fit:cover"/></div>`
    : `<div style="width:40px;height:40px;border-radius:9999px;background:#71717a;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff">${initial}</div>`;

  const html = `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding-bottom:4px">${head}<span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,.95);font-size:11px;font-weight:600;color:#18181b;box-shadow:0 1px 4px rgba(0,0,0,.15)">${label}</span></div>`;
  return L.divIcon({
    className: "sealink-map-pin",
    html,
    iconSize: [120, 72],
    iconAnchor: [60, 72],
  });
}

export default function HomeLocationMap({
  signedIn = false,
  sharingUiMode = "home",
}: {
  signedIn?: boolean;
  /** `home`: map + link to settings. `settings`: options + share toggle only (no map). */
  sharingUiMode?: "home" | "settings";
}) {
  const isSettings = sharingUiMode === "settings";
  const [boatInput, setBoatInput] = useState(() => (typeof window !== "undefined" ? getBoatName() : ""));
  const [avatarUrl] = useState(() => (typeof window !== "undefined" ? getAvatarDataUrl() : ""));
  const [pinAvatarPeek, setPinAvatarPeek] = useState(false);
  const pinPeekTimer = useRef<number | null>(null);
  const [showAvatar, setShowAvatarState] = useState(() =>
    typeof window !== "undefined" ? getShowAvatar() : true,
  );
  const [fullName, setFullNameState] = useState(() => (typeof window !== "undefined" ? getFullName() : ""));
  const [sharing, setSharing] = useState(() => (typeof window !== "undefined" ? getShareOnMap() : false));
  const [bgConsent, setBgConsentState] = useState(() =>
    typeof window !== "undefined" ? getBackgroundLocationConsent() : true,
  );
  const [locMode, setLocMode] = useState<string | null>(null);
  const [pos, setPos] = useState<LatLngAcc | null>(null);
  /** While sharing, keep showing the last good fix (or localStorage seed) so the map does not jump to the default ocean view between GPS reads on phones. */
  const [heldSharingPos, setHeldSharingPos] = useState<LatLngAcc | null>(() =>
    typeof window !== "undefined" && getShareOnMap() ? readCachedPinForSharing() : null,
  );
  const [geoError, setGeoError] = useState<string | null>(null);
  const [windSlots, setWindSlots] = useState<HourlyWindSlot[]>([]);
  const [windSlotIdx, setWindSlotIdx] = useState(0);
  const [windLoading, setWindLoading] = useState(true);
  const [windErr, setWindErr] = useState<string | null>(null);
  const [lifeSeasOpen, setLifeSeasOpen] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorCfg, setAnchorCfg] = useState(() =>
    typeof window !== "undefined" ? getAnchorAlertConfig() : getAnchorAlertConfig(),
  );
  const [anchorLocQuality, setAnchorLocQuality] = useState<AnchorGpsQuality | null>(null);
  /** Reported horizontal accuracy from the last sensor sample (unclamped), for anchor arm gating. */
  const [geoAccuracyRawM, setGeoAccuracyRawM] = useState<number | null>(null);
  /** Browser-only: short aggressive GPS lock until accuracy ≤ target or time cap (native shell skips this). */
  const [gpsRefining, setGpsRefining] = useState(false);
  const gpsRefinementActiveRef = useRef(false);
  const gpsRefinementStartedAtRef = useRef(0);
  const anchorGpsStabilizerRef = useRef(createAnchorGpsStabilizer());
  const nativeLocWatchRef = useRef<{ remove: () => void } | null>(null);
  const anchorCfgRef = useRef(anchorCfg);
  const [activeAnchorAlert, setActiveAnchorAlert] = useState<{ id: string; message: string; createdAt: string; kind?: string } | null>(
    null,
  );
  const activeAnchorAlertRef = useRef(activeAnchorAlert);
  useEffect(() => {
    activeAnchorAlertRef.current = activeAnchorAlert;
  }, [activeAnchorAlert]);
  const [alarmBlocked, setAlarmBlocked] = useState(false);
  const alarmTimer = useRef<number | null>(null);
  const deviceId = useMemo(() => (typeof window !== "undefined" ? getOrCreateDeviceId() : "server"), []);
  const localDeviceName = useMemo(() => (typeof window !== "undefined" ? getDeviceName() : ""), []);
  const [monitorDeviceLabel, setMonitorDeviceLabel] = useState<string>("");
  const [anchorMonitor, setAnchorMonitor] = useState<{ monitorDeviceId: string | null; alertDeviceIds: string[] } | null>(null);
  const [shareNearby, setShareNearby] = useState(() =>
    typeof window !== "undefined" ? getShareNearbyPeers() : false,
  );
  const [nearbyPeers, setNearbyPeers] = useState<NearbyPeer[]>([]);
  const posRef = useRef<LatLngAcc | null>(null);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  const anchorArmedRef = useRef(false);
  useEffect(() => {
    anchorArmedRef.current = anchorCfg.armed;
  }, [anchorCfg.armed]);

  const presenceProfileRef = useRef({
    boatInput: "",
    fullName: "",
    avatarUrl: "",
    showAvatar: true,
  });
  useEffect(() => {
    presenceProfileRef.current = {
      boatInput: boatInput.trim(),
      fullName: fullName.trim(),
      avatarUrl,
      showAvatar,
    };
  }, [boatInput, fullName, avatarUrl, showAvatar]);

  const lastPresencePostAtRef = useRef(0);
  const lastPresenceGetAtRef = useRef(0);
  const lastPostSnapshotRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastPostedProfileKeyRef = useRef("");
  const initialPresenceGetDoneRef = useRef(false);
  const forcePresenceGetRef = useRef(false);
  /** One-shot: first GPS fix after enabling nearby can run even if tryBegin would block (e.g. empty tick consumed the slot). */
  const presenceKickBypassTickGapRef = useRef(false);
  const presenceTickInFlightRef = useRef(false);
  const runNearbyPresenceTickRef = useRef<(() => void) | null>(null);
  const hadPosForNearbySharingRef = useRef(false);
  const prevSignedInForPresenceRef = useRef(signedIn);
  useEffect(() => {
    if (signedIn && !prevSignedInForPresenceRef.current) {
      presenceSetPausedAfter401(false);
      logMapPresenceClient("401-pause-cleared", { reason: "signed-in-transition" });
    }
    prevSignedInForPresenceRef.current = signedIn;
  }, [signedIn]);

  const clearMapPresence = useCallback(
    (keepalive = false, reason = "unspecified") => {
      if (!signedIn) {
        logMapPresenceClient("clear-skipped", { reason: "not-signed-in", keepalive, intent: reason });
        return;
      }
      if (presenceIsPausedAfter401()) {
        logMapPresenceClient("clear-skipped", { reason: "paused-after-401", keepalive, intent: reason });
        return;
      }
      if (keepalive && !tryConsumeMapPresenceClearPost()) {
        logMapPresenceClient("clear-skipped", { reason: "client-throttle-clear-post", keepalive, intent: reason });
        return;
      }
      if (!signedInRef.current) {
        logMapPresenceClient("clear-skipped", { reason: "not-signed-in-before-fetch", keepalive, intent: reason });
        return;
      }
      void fetch("/api/map/presence", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        keepalive,
        body: JSON.stringify({ shareNearby: false }),
      }).then((res) => {
        if (res.status === 401) {
          presenceSetPausedAfter401(true);
          logMapPresenceClient("clear-401-pauses-polling", { intent: reason });
        }
      });
    },
    [signedIn],
  );

  useEffect(() => {
    if (!sharing || !shareNearby) {
      queueMicrotask(() => setNearbyPeers([]));
      lastPresencePostAtRef.current = 0;
      lastPresenceGetAtRef.current = 0;
      lastPostSnapshotRef.current = null;
      lastPostedProfileKeyRef.current = "";
      initialPresenceGetDoneRef.current = false;
      hadPosForNearbySharingRef.current = false;
      runNearbyPresenceTickRef.current = null;
      return;
    }
    if (!signedIn) {
      logMapPresenceClient("presence-interval-inactive", { reason: "not-signed-in" });
      queueMicrotask(() => setNearbyPeers([]));
      return;
    }

    let disposed = false;
    let bootTimer: number | null = null;

    const tick = async () => {
      if (disposed || presenceTickInFlightRef.current) return;
      if (!signedInRef.current) {
        logMapPresenceClient("tick-skipped", { reason: "not-signed-in" });
        return;
      }
      if (presenceIsPausedAfter401()) {
        logMapPresenceClient("tick-skipped", { reason: "paused-after-401" });
        return;
      }
      const p = posRef.current;
      if (!p) return;
      const forceGetEarly = forcePresenceGetRef.current;
      const bypassTickGap = forceGetEarly || presenceKickBypassTickGapRef.current;
      if (presenceKickBypassTickGapRef.current) presenceKickBypassTickGapRef.current = false;
      if (!bypassTickGap && !tryBeginPresenceClientTick()) {
        logMapPresenceClient("tick-skipped", { reason: "client-guard-min-tick-interval" });
        return;
      }
      if (bootTimer != null) {
        window.clearTimeout(bootTimer);
        bootTimer = null;
      }
      presenceTickInFlightRef.current = true;
      const ac = new AbortController();
      try {
        const prf = presenceProfileRef.current;
        const label =
          [prf.boatInput, prf.fullName].filter(Boolean).join(" · ").slice(0, 40) || "Nearby boat";
        const avatarDataUrl = prf.showAvatar ? (prf.avatarUrl || "") : "";
        const avatarFp = avatarDataUrl ? `${avatarDataUrl.length}:${avatarDataUrl.slice(0, 48)}` : "";
        const profileKey = `${label}|${prf.showAvatar ? 1 : 0}|${avatarFp}`;

        const now = Date.now();
        const forceGet = forcePresenceGetRef.current;
        if (forceGet) forcePresenceGetRef.current = false;

        const sinceGet =
          lastPresenceGetAtRef.current === 0 ? Number.POSITIVE_INFINITY : now - lastPresenceGetAtRef.current;
        const shouldGet =
          forceGet || !initialPresenceGetDoneRef.current || sinceGet >= PRESENCE_GET_MIN_MS;

        const sincePost =
          lastPresencePostAtRef.current === 0 ? Number.POSITIVE_INFINITY : now - lastPresencePostAtRef.current;
        const postThrottleOk = sincePost >= PRESENCE_POST_MIN_MS;

        const snap = lastPostSnapshotRef.current;
        let significantMove = snap == null;
        if (snap) {
          const m = distanceMiles(snap.lat, snap.lng, p.lat, p.lng) * 1609.344;
          significantMove = m >= PRESENCE_SIGNIFICANT_MOVE_M;
        }
        const profileChanged = profileKey !== lastPostedProfileKeyRef.current;
        const anchorHeartbeat =
          anchorArmedRef.current &&
          (lastPresencePostAtRef.current === 0 || now - lastPresencePostAtRef.current >= PRESENCE_ANCHOR_HEARTBEAT_POST_MS);
        const shouldPost =
          postThrottleOk && (significantMove || profileChanged || anchorHeartbeat);

        let aborted401ThisTick = false;

        if (shouldPost) {
          if (!signedInRef.current) {
            logMapPresenceClient("post-skipped", { reason: "not-signed-in-before-fetch" });
          } else if (presenceIsPausedAfter401()) {
            logMapPresenceClient("post-skipped", { reason: "paused-after-401" });
          } else if (!tryConsumeMapPresencePostTurn(now)) {
            logMapPresenceClient("post-skipped", { reason: "client-guard-post-interval" });
          } else {
            if (!signedInRef.current || presenceIsPausedAfter401()) {
              logMapPresenceClient("post-skipped", {
                reason: !signedInRef.current ? "not-signed-in-before-fetch" : "paused-after-401",
              });
            } else {
              try {
                const pr = await fetch("/api/map/presence", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json" },
                  signal: ac.signal,
                  body: JSON.stringify({
                    shareNearby: true,
                    lat: p.lat,
                    lng: p.lng,
                    label,
                    avatarDataUrl,
                  }),
                });
                if (!disposed && !ac.signal.aborted) {
                  if (pr.status === 401) {
                    presenceSetPausedAfter401(true);
                    aborted401ThisTick = true;
                    logMapPresenceClient("post-401-stops-polling", {});
                    setNearbyPeers([]);
                  } else if (!pr.ok) {
                    setNearbyPeers([]);
                  } else {
                    const postBody = (await pr.json()) as { ok?: boolean; rateLimited?: boolean };
                    if (postBody.rateLimited) {
                      logMapPresenceClient("post-skipped", { reason: "server-rate-limit" });
                    } else {
                      lastPresencePostAtRef.current = Date.now();
                      lastPostSnapshotRef.current = { lat: p.lat, lng: p.lng };
                      lastPostedProfileKeyRef.current = profileKey;
                    }
                  }
                }
              } catch {
                if (!disposed && !ac.signal.aborted) setNearbyPeers([]);
              }
            }
          }
        }

        if (!aborted401ThisTick && shouldGet) {
          if (!signedInRef.current) {
            logMapPresenceClient("get-skipped", { reason: "not-signed-in-before-fetch" });
          } else if (presenceIsPausedAfter401()) {
            logMapPresenceClient("get-skipped", { reason: "paused-after-401" });
          } else if (!tryConsumeMapPresenceGetTurn(now)) {
            logMapPresenceClient("get-skipped", { reason: "client-guard-get-interval" });
          } else {
            if (!signedInRef.current || presenceIsPausedAfter401()) {
              logMapPresenceClient("get-skipped", {
                reason: !signedInRef.current ? "not-signed-in-before-fetch" : "paused-after-401",
              });
            } else {
              try {
                const r = await fetch(
                  `/api/map/presence?lat=${encodeURIComponent(String(p.lat))}&lng=${encodeURIComponent(String(p.lng))}`,
                  { credentials: "same-origin", signal: ac.signal },
                );
                if (!disposed && !ac.signal.aborted) {
                  if (r.status === 401) {
                    presenceSetPausedAfter401(true);
                    logMapPresenceClient("get-401-stops-polling", {});
                    setNearbyPeers([]);
                  } else if (!r.ok) {
                    setNearbyPeers([]);
                  } else {
                    const d = (await r.json()) as { peers?: NearbyPeer[]; throttled?: boolean };
                    if (d.throttled) {
                      logMapPresenceClient("get-skipped", { reason: "server-throttle" });
                    } else {
                      setNearbyPeers(Array.isArray(d.peers) ? d.peers : []);
                      lastPresenceGetAtRef.current = Date.now();
                      initialPresenceGetDoneRef.current = true;
                    }
                  }
                }
              } catch {
                if (!disposed && !ac.signal.aborted) setNearbyPeers([]);
              }
            }
          }
        }
      } finally {
        presenceTickInFlightRef.current = false;
      }
    };

    runNearbyPresenceTickRef.current = () => {
      void tick();
    };

    bootTimer = window.setTimeout(() => {
      bootTimer = null;
      void tick();
    }, 8_000);
    const id = window.setInterval(() => void tick(), PRESENCE_TICK_MS);

    return () => {
      disposed = true;
      runNearbyPresenceTickRef.current = null;
      if (bootTimer != null) window.clearTimeout(bootTimer);
      window.clearInterval(id);
    };
  }, [sharing, shareNearby, signedIn]);

  /**
   * First tick after nearby sharing turns on (GPS may arrive after the effect). Do not reset when `pos` is briefly
   * null — that used to re-fire tick on every GPS gap and spam POST+GET ~1/s on some devices.
   */
  useEffect(() => {
    if (!sharing || !shareNearby) {
      hadPosForNearbySharingRef.current = false;
      return;
    }
    if (!signedIn) return;
    if (!pos) return;
    if (hadPosForNearbySharingRef.current) return;
    hadPosForNearbySharingRef.current = true;
    presenceKickBypassTickGapRef.current = true;
    runNearbyPresenceTickRef.current?.();
  }, [sharing, shareNearby, signedIn, pos != null]);

  const pollTimer = useRef<number | null>(null);
  const polling = useRef(false);
  const lastAnchorReportAt = useRef<number>(0);

  useEffect(() => {
    if (!sharing) {
      setHeldSharingPos(null);
      return;
    }
    if (pos) {
      setHeldSharingPos(pos);
      return;
    }
    setHeldSharingPos((prev) => {
      if (prev) return prev;
      return readCachedPinForSharing();
    });
  }, [sharing, pos]);

  /** Pin for map + forecasts: live fix, then last held fix, then localStorage seed — avoids null gaps before state effects run (which was flickering forecasts). */
  const mapPinPos = useMemo(() => {
    if (!sharing) return null;
    if (pos) return pos;
    if (heldSharingPos) return heldSharingPos;
    if (typeof window !== "undefined") {
      const cached = readCachedPinForSharing();
      if (cached) return cached;
    }
    return null;
  }, [sharing, pos, heldSharingPos]);

  /** Rounded once for weather children so GPS micro-moves don’t retrigger client effects. */
  const forecastCoords = useMemo((): { lat: number | null; lng: number | null } => {
    if (!mapPinPos) return { lat: null, lng: null };
    return {
      lat: Number(mapPinPos.lat.toFixed(2)),
      lng: Number(mapPinPos.lng.toFixed(2)),
    };
  }, [mapPinPos?.lat, mapPinPos?.lng]);

  const forecastLat = useMemo(
    () => Number((mapPinPos?.lat ?? pos?.lat ?? DEFAULT_MAP_CENTER.lat).toFixed(2)),
    [mapPinPos?.lat, pos?.lat],
  );
  const forecastLng = useMemo(
    () => Number((mapPinPos?.lng ?? pos?.lng ?? DEFAULT_MAP_CENTER.lng).toFixed(2)),
    [mapPinPos?.lng, pos?.lng],
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current != null && typeof window !== "undefined") {
      window.clearTimeout(pollTimer.current);
    }
    pollTimer.current = null;
    polling.current = false;
  }, []);

  // Report this device's last fix (for cross-device monitoring).
  useEffect(() => {
    if (!sharing || !pos) return;
    const now = Date.now();
    if (now - lastAnchorReportAt.current < 180_000) return; // 3 minutes
    lastAnchorReportAt.current = now;
    const name = getDeviceName() || "This device";
    const payload = { deviceId, name, lat: pos.lat, lng: pos.lng };
    void fetch("/api/anchor/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }, [sharing, pos?.lat, pos?.lng, deviceId]);

  const [monitoredFix, setMonitoredFix] = useState<{ lat: number; lng: number; at: string } | null>(null);

  useEffect(() => {
    anchorCfgRef.current = anchorCfg;
  }, [anchorCfg]);

  useEffect(() => {
    anchorGpsStabilizerRef.current = createAnchorGpsStabilizer();
    if (!anchorCfg.armed) queueMicrotask(() => setAnchorLocQuality(null));
  }, [anchorCfg.armed]);

  // If monitoring another device, pull its latest fix periodically.
  useEffect(() => {
    if (!sharing) return;
    const serverMonitor = anchorMonitor?.monitorDeviceId;
    const effectiveMonitor = serverMonitor ? serverMonitor : anchorCfg.monitorDeviceId === "this" ? deviceId : anchorCfg.monitorDeviceId;
    if (!effectiveMonitor || effectiveMonitor === deviceId) {
      queueMicrotask(() => setMonitoredFix(null));
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const r = await fetch("/api/anchor/devices");
        const d = (await r.json()) as { devices?: { deviceId: string; lastLat: number | null; lastLng: number | null; lastFixAt: string | null }[] };
        const row = d.devices?.find((x) => x.deviceId === effectiveMonitor);
        if (!row || row.lastLat == null || row.lastLng == null || !row.lastFixAt) return;
        if (disposed) return;
        setMonitoredFix({ lat: row.lastLat, lng: row.lastLng, at: row.lastFixAt });
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [sharing, anchorCfg.monitorDeviceId, anchorMonitor?.monitorDeviceId, deviceId]);

  // Load server-backed monitor config (single monitor device + alert recipients).
  useEffect(() => {
    if (!sharing) return;
    let disposed = false;
    const load = async () => {
      try {
        const r = await fetch("/api/anchor/monitor", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { config?: { monitorDeviceId: string | null; alertDeviceIds: string[] } };
        if (disposed) return;
        if (d?.config) setAnchorMonitor(d.config);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [sharing]);

  // Best-effort: keep screen awake on the "boat device" when anchor monitoring is armed.
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock?.request) return;
    if (!sharing) return;
    if (!anchorCfg.armed) return;
    if (anchorCfg.monitorDeviceId && anchorCfg.monitorDeviceId !== "this") return;

    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;
    const request = async () => {
      try {
        lock = await nav.wakeLock!.request("screen");
      } catch {
        lock = null;
      }
    };
    void request();

    const onVis = () => {
      if (disposed) return;
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVis);
      if (lock) void lock.release();
    };
  }, [sharing, anchorCfg.armed, anchorCfg.monitorDeviceId]);

  // Anchor alert check (runs whenever position updates).
  useEffect(() => {
    if (!sharing || !pos) return;
    const anchorCfg = anchorCfgRef.current;
    if (!anchorCfg.armed || anchorCfg.lat == null || anchorCfg.lng == null) return;
    // Enforce single-device monitoring: only the selected monitor device performs drift checks.
    const serverMonitor = anchorMonitor?.monitorDeviceId;
    const effectiveMonitor = serverMonitor ? serverMonitor : anchorCfg.monitorDeviceId === "this" ? deviceId : anchorCfg.monitorDeviceId;
    if (effectiveMonitor && effectiveMonitor !== deviceId) return;
    const src =
      anchorCfg.monitorDeviceId && anchorCfg.monitorDeviceId !== "this" && monitoredFix
        ? { lat: monitoredFix.lat, lng: monitoredFix.lng }
        : { lat: pos.lat, lng: pos.lng };
    const m = distanceMiles(src.lat, src.lng, anchorCfg.lat, anchorCfg.lng) * 1609.344;
    const brng = bearingDeg(anchorCfg.lat, anchorCfg.lng, src.lat, src.lng);
    const gpsBufferM =
      anchorCfg.monitorDeviceId && anchorCfg.monitorDeviceId !== "this"
        ? 12 // we don't have accuracy for remote fixes; be conservative
        : Math.max(8, Math.round(pos.accuracyM || 0));

    // Update last bearing so angle checks have a baseline even after reload.
    if (anchorCfg.lastBearingDeg == null && Number.isFinite(brng)) {
      const next = { ...anchorCfg, lastBearingDeg: brng };
      queueMicrotask(() => setAnchorCfg(next));
      setAnchorAlertConfig(next);
      return;
    }

    const angleLimit = Math.max(0, Math.min(360, Math.round(anchorCfg.angleDeg ?? 360)));
    const angleDelta =
      anchorCfg.lastBearingDeg != null && angleLimit < 360 ? angleDiffDeg(brng, anchorCfg.lastBearingDeg) : 0;

    // Avoid false positives from GPS jitter by requiring the drift to exceed the radius + a buffer based on accuracy.
    const driftTriggered = m > anchorCfg.radiusM + gpsBufferM;

    // Bearing is very noisy when very close to the anchor point; only allow angle alerts once "meaningfully away".
    const meaningfulDistM = Math.max(12, Math.round(anchorCfg.radiusM * 0.6));
    const angleTriggered =
      angleLimit < 360 && m >= meaningfulDistM && Number.isFinite(brng) && angleDelta > angleLimit;

    // If we're safely inside the zone, keep updating lastBearingDeg to track natural jitter.
    if (!driftTriggered && !angleTriggered && angleLimit < 360 && Number.isFinite(brng) && m <= anchorCfg.radiusM) {
      // Only update if bearing actually changed enough to matter (avoid churn).
      const delta = anchorCfg.lastBearingDeg != null ? angleDiffDeg(brng, anchorCfg.lastBearingDeg) : 999;
      if (delta < 3) return;
      const next = { ...anchorCfg, lastBearingDeg: brng };
      queueMicrotask(() => setAnchorCfg(next));
      setAnchorAlertConfig(next);
      return;
    }

    if (!driftTriggered && !angleTriggered) return;

    const last = anchorCfg.lastAlertAt ? new Date(anchorCfg.lastAlertAt).getTime() : 0;
    const now = Date.now();
    if (now - last < 2 * 60_000) return; // avoid spam

    const next = { ...anchorCfg, lastAlertAt: new Date(now).toISOString(), lastBearingDeg: brng };
    queueMicrotask(() => setAnchorCfg(next));
    setAnchorAlertConfig(next);

    const parts: string[] = [];
    if (driftTriggered) parts.push(`drifted ~${Math.round(m)}m (limit ${anchorCfg.radiusM}m)`);
    if (angleTriggered) parts.push(`bearing changed ~${Math.round(angleDelta)}° (limit ${angleLimit}°)`);
    const msg = `Anchor alert: ${parts.join(" and ")}.`;

    // Prefer server inbox (syncs across devices), but fall back to local overlay if the request fails
    // (e.g. signed out / network issues) so the user can always press “Seen”.
    void (async () => {
      try {
        const r = await fetch("/api/anchor/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, kind: "alert" }),
          keepalive: true,
        });
        if (!r.ok) {
          if (!activeAnchorAlertRef.current) {
            setActiveAnchorAlert({ id: `local-${now}`, message: msg, createdAt: new Date(now).toISOString() });
          }
        }
      } catch {
        if (!activeAnchorAlertRef.current) {
          setActiveAnchorAlert({ id: `local-${now}`, message: msg, createdAt: new Date(now).toISOString() });
        }
      }
    })();

    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const opts = {
          body: msg,
          tag: "sealink-anchor-alert",
          // Non-standard / partial support across browsers, but helps alerts stand out where available.
          renotify: true,
          requireInteraction: true,
          // Vibration works on some Android browsers.
          vibrate: [250, 150, 250, 150, 400],
        } as NotificationOptions & Record<string, unknown>;
        new Notification("SEALINK — ANCHOR ALERT", opts);
      }
    } catch {
      /* ignore */
    }
  }, [
    sharing,
    pos?.lat,
    pos?.lng,
    pos?.accuracyM,
    monitoredFix?.lat,
    monitoredFix?.lng,
    anchorCfg.armed,
    anchorCfg.lat,
    anchorCfg.lng,
    anchorCfg.radiusM,
    anchorCfg.angleDeg,
    anchorCfg.monitorDeviceId,
  ]);

  // Anchor alert inbox poll (keeps alerts in sync across both devices).
  useEffect(() => {
    if (!sharing) return;
    let disposed = false;
    const load = async () => {
      try {
        const r = await fetch("/api/anchor/alerts", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { alerts?: { id: string; message: string; createdAt: string; kind?: string }[] };
        const list = Array.isArray(d.alerts) ? d.alerts : [];
        if (disposed) return;
        const allowed = anchorMonitor?.alertDeviceIds?.length ? anchorMonitor.alertDeviceIds.includes(deviceId) : true;
        if (!allowed) return;
        if (!activeAnchorAlertRef.current && list.length) setActiveAnchorAlert(list[0]!);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [sharing, anchorMonitor?.alertDeviceIds, deviceId]);

  // Display label for which device is being monitored.
  useEffect(() => {
    if (!anchorCfg.armed) {
      queueMicrotask(() => setMonitorDeviceLabel(""));
      return;
    }
    if (!anchorCfg.monitorDeviceId || anchorCfg.monitorDeviceId === "this") {
      queueMicrotask(() =>
        setMonitorDeviceLabel(localDeviceName?.trim() ? `This device (${localDeviceName.trim()})` : "This device"),
      );
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const r = await fetch("/api/anchor/devices", { cache: "no-store" });
        const d = (await r.json()) as {
          devices?: { deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[];
        };
        if (disposed) return;
        const row = d.devices?.find((x) => x.deviceId === anchorCfg.monitorDeviceId);
        if (row) {
          setMonitorDeviceLabel(row.name?.trim() ? row.name.trim() : row.deviceId.slice(0, 8));
        } else {
          setMonitorDeviceLabel(anchorCfg.monitorDeviceId.slice(0, 8));
        }
      } catch {
        if (!disposed) setMonitorDeviceLabel(anchorCfg.monitorDeviceId.slice(0, 8));
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [anchorCfg.armed, anchorCfg.monitorDeviceId, localDeviceName]);

  function stopAlarm() {
    if (alarmTimer.current != null) window.clearInterval(alarmTimer.current);
    alarmTimer.current = null;
  }

  async function beepOnce(): Promise<boolean> {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.stop(now + 0.38);
      window.setTimeout(() => void ctx.close().catch(() => undefined), 600);
      return true;
    } catch {
      return false;
    }
  }

  async function startAlarm(): Promise<void> {
    stopAlarm();
    const ok = await beepOnce();
    if (!ok) {
      setAlarmBlocked(true);
      return;
    }
    setAlarmBlocked(false);
    alarmTimer.current = window.setInterval(() => void beepOnce(), 2500);
    // Stop sound after 15 minutes even if not seen.
    window.setTimeout(() => stopAlarm(), 15 * 60_000);
  }

  // In-app urgent alarm while alert is visible (until Seen).
  useEffect(() => {
    if (!activeAnchorAlert) {
      stopAlarm();
      queueMicrotask(() => setAlarmBlocked(false));
      return;
    }
    queueMicrotask(() => void startAlarm());
    return () => stopAlarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnchorAlert?.id]);

  useEffect(() => {
    if (!sharing) {
      gpsRefinementActiveRef.current = false;
      queueMicrotask(() => setGpsRefining(false));
      stopPolling();
      queueMicrotask(() => setLocMode(null));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const useNativeShell = Boolean(getNativeLocationBridge());
    if (!useNativeShell) {
      gpsRefinementActiveRef.current = true;
      gpsRefinementStartedAtRef.current = Date.now();
      queueMicrotask(() => setGpsRefining(true));
    } else {
      gpsRefinementActiveRef.current = false;
      queueMicrotask(() => setGpsRefining(false));
    }

    let disposed = false;
    let watchId: number | undefined;
    /** Avoid restarting watchPosition on every visibility tick — iOS/Android often drop the fix briefly when we do. */
    let geoTrackingMode: "off" | "watch" | "poll" = "off";
    let lastDocHidden = typeof document !== "undefined" ? document.hidden : false;

    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (k: string, fn: () => void) => void; removeEventListener: (k: string, fn: () => void) => void }>;
      connection?: { saveData?: boolean };
    };

    let batteryLow = false;
    let saveData = Boolean(nav.connection?.saveData);
    let battery: Awaited<ReturnType<NonNullable<typeof nav.getBattery>>> | null = null;

    const setMode = (intervalMs: number | null) => {
      let next: string;
      if (intervalMs == null) {
        next = "Background updates paused (disabled).";
      } else if (typeof document !== "undefined" && !document.hidden) {
        next = "Live GPS while this tab is visible.";
      } else if (intervalMs >= 15 * 60_000) {
        next = "Low power mode: updating about every 15 minutes.";
      } else if (intervalMs >= 4 * 60_000) {
        next = "Background mode: updating about every 4 minutes.";
      } else {
        next = "Active mode: updating about every minute.";
      }
      if (batteryLow) next += " (Battery low)";
      else if (saveData) next += " (Data saver)";
      queueMicrotask(() => setLocMode(next));
    };

    const calcIntervalMs = () => {
      if (typeof document !== "undefined" && document.hidden) {
        if (!bgConsent) return null;
        if (anchorCfgRef.current.armed) return 60_000;
        return batteryLow || saveData ? 15 * 60_000 : 4 * 60_000;
      }
      return 60_000;
    };

    const optsFor = (intervalMs: number | null): PositionOptions => {
      if (gpsRefinementActiveRef.current && !getNativeLocationBridge()) {
        return GPS_REFINE_WATCH_OPTIONS;
      }
      const armed = anchorCfgRef.current.armed;
      const maxAge =
        intervalMs == null
          ? 60_000
          : armed
            ? Math.min(10_000, intervalMs)
            : Math.min(intervalMs, 15 * 60_000);
      return {
        enableHighAccuracy: armed,
        maximumAge: maxAge,
        timeout: armed ? 45_000 : 15_000,
      };
    };

    const readHorizontalAccuracyM = (accuracy: number | null | undefined): number | null => {
      if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= 0) return null;
      return accuracy;
    };

    const accuracyForStabilizer = (accuracyRaw: number | null): number =>
      accuracyRaw ?? ANCHOR_MAX_HORIZ_ACCURACY_M;

    let tryFinishRefinement: (accuracyRaw: number | null) => void = () => {};

    const applyGeoSample = (lat: number, lng: number, accuracyRaw: number | null, timestampMs: number) => {
      if (disposed) return;
      setGeoError(null);
      setGeoAccuracyRawM(accuracyRaw);
      const accProc = accuracyForStabilizer(accuracyRaw);
      const sample = { lat, lng, accuracyM: accProc, t: timestampMs };
      const armed = anchorCfgRef.current.armed;
      const refining = gpsRefinementActiveRef.current && !getNativeLocationBridge();

      if (armed && refining) {
        setAnchorLocQuality(null);
        setPos({
          lat: sample.lat,
          lng: sample.lng,
          accuracyM: clampGeoAccuracyM(sample.accuracyM),
        });
        tryFinishRefinement(accuracyRaw);
        return;
      }

      if (armed) {
        const r = processAnchorGeoSample(anchorGpsStabilizerRef.current, sample, {
          armed: true,
          maxAccuracyM: ANCHOR_MAX_HORIZ_ACCURACY_M,
        });
        if (r.quality != null) setAnchorLocQuality(r.quality);
        if (r.fix) {
          setPos({
            lat: r.fix.lat,
            lng: r.fix.lng,
            accuracyM: clampGeoAccuracyM(r.fix.accuracyM),
          });
        }
        return;
      }

      setAnchorLocQuality(null);
      setPos({
        lat: sample.lat,
        lng: sample.lng,
        accuracyM: clampGeoAccuracyM(sample.accuracyM),
      });
      tryFinishRefinement(accuracyRaw);
    };

    function kickFreshFix() {
      const refining = gpsRefinementActiveRef.current && !getNativeLocationBridge();
      const armed = anchorCfgRef.current.armed;
      const opts: PositionOptions = refining
        ? GPS_REFINE_WATCH_OPTIONS
        : {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: armed ? 55_000 : 35_000,
          };
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (disposed) return;
          const acc = readHorizontalAccuracyM(p.coords.accuracy);
          const t = Number.isFinite(p.timestamp) ? p.timestamp : Date.now();
          applyGeoSample(p.coords.latitude, p.coords.longitude, acc, t);
        },
        () => {
          /* watch/poll still active; avoid noisy errors on resume */
        },
        opts,
      );
    }

    function stopWatch() {
      nativeLocWatchRef.current?.remove();
      nativeLocWatchRef.current = null;
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = undefined;
      }
    }

    function startWatch() {
      stopWatch();
      const bridge = getNativeLocationBridge();
      if (bridge) {
        nativeLocWatchRef.current = bridge.watchPosition(
          (fix) => {
            applyGeoSample(fix.latitude, fix.longitude, Math.max(1, fix.accuracyM), fix.timestampMs);
          },
          (_code, msg) => {
            if (!disposed) setGeoError(msg || "Native location error");
          },
        );
        return;
      }
      const refining = gpsRefinementActiveRef.current && !getNativeLocationBridge();
      const armed = anchorCfgRef.current.armed;
      const watchOpts: PositionOptions = refining
        ? GPS_REFINE_WATCH_OPTIONS
        : armed
          ? { enableHighAccuracy: true, maximumAge: 0, timeout: 50_000 }
          : { enableHighAccuracy: true, maximumAge: 20_000, timeout: 30_000 };
      watchId = navigator.geolocation.watchPosition(
        (p) => {
          if (disposed) return;
          const acc = readHorizontalAccuracyM(p.coords.accuracy);
          const t = Number.isFinite(p.timestamp) ? p.timestamp : Date.now();
          applyGeoSample(p.coords.latitude, p.coords.longitude, acc, t);
        },
        (e) => {
          if (disposed) return;
          setGeoError(humanGeolocationMessage(e));
        },
        watchOpts,
      );
    }

    tryFinishRefinement = (accuracyRaw: number | null) => {
      if (!gpsRefinementActiveRef.current || getNativeLocationBridge()) return;
      const elapsed = Date.now() - gpsRefinementStartedAtRef.current;
      const good = accuracyRaw != null && accuracyRaw <= GPS_REFINE_TARGET_ACCURACY_M;
      if (!good && elapsed < GPS_REFINE_MAX_MS) return;
      gpsRefinementActiveRef.current = false;
      queueMicrotask(() => setGpsRefining(false));
      if (typeof document !== "undefined" && !document.hidden && geoTrackingMode === "watch") {
        stopWatch();
        startWatch();
      }
    };

    function syncTracking() {
      if (disposed) return;
      const intervalMs = calcIntervalMs();
      setMode(intervalMs);
      const nextMode: "off" | "watch" | "poll" =
        intervalMs == null ? "off" : typeof document !== "undefined" && !document.hidden ? "watch" : "poll";

      if (nextMode === "off") {
        if (geoTrackingMode === "off") return;
        geoTrackingMode = "off";
        stopWatch();
        stopPolling();
        return;
      }

      if (nextMode === "watch") {
        if (geoTrackingMode === "watch") return;
        geoTrackingMode = "watch";
        stopWatch();
        stopPolling();
        startWatch();
        return;
      }

      if (geoTrackingMode === "poll") return;
      geoTrackingMode = "poll";
      stopWatch();
      stopPolling();
      pollTimer.current = window.setTimeout(tick, 250);
    }

    function tick() {
      if (disposed) return;
      if (typeof document !== "undefined" && !document.hidden) {
        syncTracking();
        return;
      }
      const intervalMs = calcIntervalMs();
      setMode(intervalMs);
      if (intervalMs == null) {
        geoTrackingMode = "off";
        stopPolling();
        return;
      }
      if (polling.current) {
        pollTimer.current = window.setTimeout(tick, intervalMs);
        return;
      }
      polling.current = true;
      navigator.geolocation.getCurrentPosition(
        (p) => {
          polling.current = false;
          if (disposed) return;
          const acc = readHorizontalAccuracyM(p.coords.accuracy);
          const t = Number.isFinite(p.timestamp) ? p.timestamp : Date.now();
          applyGeoSample(p.coords.latitude, p.coords.longitude, acc, t);
          pollTimer.current = window.setTimeout(tick, intervalMs);
        },
        (e) => {
          polling.current = false;
          if (disposed) return;
          setGeoError(humanGeolocationMessage(e));
          pollTimer.current = window.setTimeout(tick, intervalMs);
        },
        optsFor(intervalMs),
      );
    }

    const onVisibility = () => {
      const hidden = typeof document !== "undefined" && document.hidden;
      const becameVisible = lastDocHidden && !hidden;
      lastDocHidden = hidden;
      syncTracking();
      if (becameVisible) kickFreshFix();
    };

    const onBattery = () => {
      if (!battery) return;
      batteryLow = !battery.charging && battery.level <= 0.2;
      syncTracking();
    };

    void (async () => {
      if (!nav.getBattery) {
        batteryLow = false;
        saveData = Boolean(nav.connection?.saveData);
        syncTracking();
        return;
      }
      try {
        battery = await nav.getBattery();
        if (disposed) return;
        onBattery();
        battery.addEventListener("levelchange", onBattery);
        battery.addEventListener("chargingchange", onBattery);
      } catch {
        battery = null;
        syncTracking();
      }
    })();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      disposed = true;
      stopWatch();
      stopPolling();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      if (battery) {
        battery.removeEventListener("levelchange", onBattery);
        battery.removeEventListener("chargingchange", onBattery);
      }
    };
  }, [sharing, bgConsent, stopPolling, anchorCfg.armed]);

  useEffect(() => {
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setWindLoading(true);
      setWindErr(null);
      fetchWindSlotsEvery3h(forecastLat, forecastLng, ac.signal)
        .then((data) => {
          if (ac.signal.aborted) return;
          setWindSlots(data);
          setWindSlotIdx(data.length ? nearestSlotIndex(data) : 0);
          setWindLoading(false);
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
          setWindErr(e instanceof Error ? e.message : "Could not load hourly wind");
          setWindSlots([]);
          setWindLoading(false);
        });
    }, 320);

    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [forecastLat, forecastLng]);

  useEffect(() => {
    if (sharing && pos) {
      recordLastKnownPosition(pos.lat, pos.lng);
    }
  }, [sharing, pos?.lat, pos?.lng]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (wasLifeOnSeasPopupShownToday()) return;
    const t = window.setTimeout(() => {
      markLifeOnSeasPopupShownToday();
      setLifeSeasOpen(true);
    }, 1100);
    return () => window.clearTimeout(t);
  }, []);

  const setSharingOn = useCallback((on: boolean) => {
    if (!on) {
      clearMapPresence(false, "stop_sharing");
      setShareNearby(false);
      setNearbyPeers([]);
      setPos(null);
      setGeoAccuracyRawM(null);
      setAnchorLocQuality(null);
      gpsRefinementActiveRef.current = false;
      setGpsRefining(false);
      setGeoError(null);
      setShareOnMap(false);
      setSharing(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not supported in this browser.");
      return;
    }
    setGeoError(null);
    const seed = readCachedPinForSharing();
    if (seed) setHeldSharingPos(seed);
    setShareOnMap(true);
    setSharing(true);
    setShareNearby(getShareNearbyPeers());
  }, [clearMapPresence]);

  /** After trial/payment success, start map sharing without an extra tap (when signed in). */
  useEffect(() => {
    if (!signedIn) return;
    let pending = false;
    try {
      if (localStorage.getItem(MAP_PROFILE.pendingAutoShareAfterPayment) === "1") {
        pending = true;
        localStorage.removeItem(MAP_PROFILE.pendingAutoShareAfterPayment);
      }
    } catch {
      return;
    }
    if (!pending) return;
    setSharingOn(true);
  }, [signedIn, setSharingOn]);

  const pinIconVisible = useMemo(
    () => buildPinIcon(boatInput.trim(), avatarUrl, pinAvatarPeek),
    [boatInput, avatarUrl, pinAvatarPeek],
  );

  useEffect(() => {
    return () => {
      if (pinPeekTimer.current != null) window.clearTimeout(pinPeekTimer.current);
    };
  }, []);

  function peekMyAvatarOnPin() {
    if (!avatarUrl) return;
    if (pinPeekTimer.current != null) window.clearTimeout(pinPeekTimer.current);
    setPinAvatarPeek(true);
    pinPeekTimer.current = window.setTimeout(() => {
      setPinAvatarPeek(false);
      pinPeekTimer.current = null;
    }, 2000);
  }

  const baseLat = mapPinPos?.lat ?? DEFAULT_MAP_CENTER.lat;
  const baseLng = mapPinPos?.lng ?? DEFAULT_MAP_CENTER.lng;
  /** Tiny offset north (~1 m) so the wind readout clears labels. */
  const windMarkerLat = mapPinPos ? baseLat + 0.000009 : baseLat;
  const windMarkerLng = baseLng;

  const activeWind = windSlots.length ? windSlots[Math.min(windSlotIdx, windSlots.length - 1)] : null;
  const windIcon = useMemo(
    () => (activeWind ? buildWindArrowDivIcon(activeWind.mph, activeWind.dirFromDeg) : null),
    [activeWind],
  );

  useEffect(() => {
    return () => clearMapPresence(true, "component_unmount");
  }, [clearMapPresence]);

  function persistBoat() {
    setBoatName(boatInput);
  }

  function persistFullName() {
    setFullName(fullName);
  }

  function persistShowAvatar(on: boolean) {
    setShowAvatar(on);
    setShowAvatarState(on);
  }

  const anchorGeofenceIcon = useMemo(() => buildAnchorGeofenceCenterIcon(), []);

  const hasAnchorGeofence =
    anchorCfg.armed && anchorCfg.lat != null && anchorCfg.lng != null && Number.isFinite(anchorCfg.radiusM);
  const center: [number, number] = mapPinPos
    ? [mapPinPos.lat, mapPinPos.lng]
    : hasAnchorGeofence
      ? [anchorCfg.lat!, anchorCfg.lng!]
      : DEFAULT_CENTER;
  const zoom = mapPinPos ? 14 : hasAnchorGeofence ? 17 : DEFAULT_ZOOM;

  const sharingSettingsPanel = (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">On your pin</p>
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Your name (shown after boat in the small nearby pin popup)
        <input
          value={fullName}
          onChange={(e) => setFullNameState(e.target.value)}
          onBlur={persistFullName}
          placeholder="e.g. Colin"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-green-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Boat name
        <input
          value={boatInput}
          onChange={(e) => setBoatInput(e.target.value)}
          onBlur={persistBoat}
          placeholder="e.g. Sea Sprite"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-green-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
      <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        Map sharing choices (defaults on — set before or after you press Share). Nearby peers need a GPS fix after
        sharing starts.
      </p>

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px] leading-snug text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-green-600"
          checked={showAvatar}
          onChange={(e) => persistShowAvatar(e.target.checked)}
        />
        <span className="font-semibold">Show profile image on map pin</span>
      </label>

      <label
        className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-[11px] leading-snug ${
          sharing && !pos
            ? "cursor-wait border-blue-200/80 bg-blue-50/50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/25 dark:text-blue-100"
            : "border-blue-200 bg-blue-50/90 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/35 dark:text-blue-100"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-blue-600 disabled:opacity-50"
          checked={shareNearby}
          disabled={Boolean(sharing && !pos)}
          onChange={(e) => {
            const on = e.target.checked;
            setShareNearby(on);
            setShareNearbyPeers(on);
            if (!on) clearMapPresence(false, "share_nearby_unchecked");
          }}
        />
        <span className="font-semibold">Show me to nearby SeaLink users (~5 mi)</span>
      </label>

      {sharing && pos && shareNearby ? (
        <button
          type="button"
          onClick={() => {
            forcePresenceGetRef.current = true;
            runNearbyPresenceTickRef.current?.();
          }}
          className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-900 shadow-sm hover:bg-blue-50 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-100 dark:hover:bg-blue-950/50"
        >
          Refresh nearby boats
        </button>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-amber-700"
          checked={bgConsent}
          onChange={(e) => {
            const on = e.target.checked;
            setBackgroundLocationConsent(on);
            setBgConsentState(on);
          }}
        />
        <span className="font-semibold">Keep updating in the background</span>
      </label>

      <hr className="border-zinc-200 dark:border-zinc-800" />

      <button
        type="button"
        onClick={() => {
          setGeoError(null);
          setSharingOn(!sharing);
        }}
        className={`flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium ${
          sharing
            ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {sharing ? "Stop sharing location on map" : "Share my location on this map"}
      </button>

      {sharing && locMode ? (
        <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">{locMode}</p>
      ) : null}
    </div>
  );

  return (
    <section className={`w-full space-y-4 ${isSettings ? "mt-4" : "mt-8"}`} aria-labelledby="map-heading">
      <div className="relative z-50 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="map-heading" className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {isSettings ? "Map sharing settings" : "Your map"}
          </h2>
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {isSettings ? (
              <>
                Choose the three options below, then press{" "}
                <span className="font-medium text-zinc-600 dark:text-zinc-300">
                  Share my location on this map
                </span>{" "}
                or <span className="font-medium text-zinc-600 dark:text-zinc-300">Stop sharing</span> to apply.
              </>
            ) : (
              <>
                GPS updates while this page is open, including in the background while the tab stays open (you can pause
                that in map sharing settings).
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto sm:justify-end">
          {isSettings ? (
            <Link
              href="/"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              ← Back to map
            </Link>
          ) : null}
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => setAnchorOpen(true)}
              className="relative z-50 inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-4 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-100 dark:hover:bg-indigo-900/70"
            >
              Anchor alert
            </button>
            <button
              type="button"
              onClick={() => {
                if (anchorCfg.armed) {
                  const merged = { ...anchorCfg, armed: false, lastAlertAt: null };
                  setAnchorCfg(merged);
                  setAnchorAlertConfig(merged);
                } else {
                  setAnchorOpen(true);
                }
              }}
              className={`relative z-50 inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold ${
                anchorCfg.armed
                  ? "border-green-300 bg-green-50 text-green-900 hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-100 dark:hover:bg-green-950/60"
                  : "border-red-300 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/60"
              }`}
              title={anchorCfg.armed ? "Turn anchor alert off" : "Open anchor alert settings"}
            >
              {anchorCfg.armed ? "ON" : "OFF"}
              {anchorCfg.armed ? (
                <span className="max-w-[200px] truncate font-normal opacity-80">
                  · {monitorDeviceLabel ? `Monitoring ${monitorDeviceLabel}` : "Monitoring…"}
                </span>
              ) : null}
            </button>
            {anchorCfg.armed && anchorLocQuality && anchorLocQuality !== "ok" ? (
              <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                {anchorLocQuality === "poor_accuracy"
                  ? `GPS accuracy is coarser than about ±${ANCHOR_MAX_HORIZ_ACCURACY_M}m — drift alerts are paused until the fix improves (open sky, wait, or enable Precise Location on iPhone).`
                  : "Stabilizing GPS for the anchor — hold steady a few seconds so the geofence isn’t thrown off by jitter."}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setLifeSeasOpen(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-teal-300 bg-teal-50 px-4 text-sm font-semibold text-teal-900 shadow-sm hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-100 dark:hover:bg-teal-900/70"
          >
            Sea&apos;s the day!
          </button>
        </div>
      </div>

      {isSettings ? (
        <div className="max-w-lg space-y-3">
          {geoError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/50 dark:text-red-200">
              {geoError}
            </p>
          ) : null}
          {sharingSettingsPanel}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-0">
          <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
            <div className="relative h-[min(55vh,420px)] w-full min-h-[280px] bg-zinc-100 dark:bg-zinc-900">
              <MapContainer
                center={center}
                zoom={zoom}
                className="h-full w-full [&_.leaflet-tile-pane]:opacity-90 [&_.leaflet-popup-content]:max-w-[200px] [&_.leaflet-popup-content]:!m-0 [&_.leaflet-popup-content]:p-2 [&_.leaflet-popup-content]:text-sm"
                scrollWheelZoom
                attributionControl={false}
              >
                <AttributionControl position="bottomright" prefix={false} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapResizeFix />
                {activeWind && windIcon ? (
                  <Marker
                    key={`wind-${activeWind.at}-${windSlotIdx}`}
                    position={[windMarkerLat, windMarkerLng]}
                    icon={windIcon}
                    zIndexOffset={650}
                  />
                ) : null}
                {hasAnchorGeofence ? (
                  <>
                    <Circle
                      center={[anchorCfg.lat!, anchorCfg.lng!]}
                      radius={anchorCfg.radiusM}
                      pathOptions={{
                        color: "#d97706",
                        fillColor: "#f59e0b",
                        fillOpacity: 0.1,
                        weight: 2,
                        dashArray: "10 8",
                      }}
                    />
                    <Marker
                      position={[anchorCfg.lat!, anchorCfg.lng!]}
                      icon={anchorGeofenceIcon}
                      zIndexOffset={580}
                    >
                      <Popup maxWidth={220}>
                        <p className="m-0 text-xs font-semibold text-zinc-900">Anchor geofence</p>
                        <p className="mt-1 m-0 text-xs text-zinc-600">
                          Allowed radius {anchorCfg.radiusM}m. Alert fires if the monitored device leaves this circle
                          (plus GPS buffer).
                        </p>
                      </Popup>
                    </Marker>
                  </>
                ) : null}
                {mapPinPos ? (
                  <>
                    <MapRecenter lat={mapPinPos.lat} lng={mapPinPos.lng} zoom={14} />
                    <Circle
                      center={[mapPinPos.lat, mapPinPos.lng]}
                      radius={mapPinPos.accuracyM}
                      pathOptions={{
                        color: "#16a34a",
                        fillColor: "#22c55e",
                        fillOpacity: 0.12,
                        weight: 1,
                      }}
                    />
                    {shareNearby ? (
                      <Circle
                        center={[mapPinPos.lat, mapPinPos.lng]}
                        radius={NEARBY_RING_METRES}
                        pathOptions={{
                          color: "#3b82f6",
                          fillColor: "#3b82f6",
                          fillOpacity: 0.04,
                          weight: 1,
                          dashArray: "6 10",
                        }}
                      />
                    ) : null}
                    {nearbyPeers.map((p) => (
                      <Marker
                        key={`nearby-${p.id}`}
                        position={[p.lat, p.lng]}
                        icon={buildNearbyPinIcon(p.avatarDataUrl || "")}
                        zIndexOffset={620}
                      >
                        <Popup maxWidth={200}>
                          <NearbyPeerPopupBody label={p.label} />
                        </Popup>
                      </Marker>
                    ))}
                    <Marker
                      key={`${boatInput}:${pinAvatarPeek ? "peek" : "circle"}:${avatarUrl ? avatarUrl.slice(0, 24) : "no-avatar"}`}
                      position={[mapPinPos.lat, mapPinPos.lng]}
                      icon={pinIconVisible}
                      zIndexOffset={750}
                      eventHandlers={{
                        click: () => peekMyAvatarOnPin(),
                      }}
                    />
                  </>
                ) : null}
              </MapContainer>
            </div>
            {geoError && (
              <p className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/50 dark:text-red-200">
                {geoError}
              </p>
            )}
          </div>
          {windErr ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              Hourly wind: {windErr}
            </p>
          ) : null}
          <WindTimelineControls
            slots={windSlots}
            index={windSlotIdx}
            loading={windLoading}
            onPrev={() => setWindSlotIdx((i) => Math.max(0, i - 1))}
            onNext={() => setWindSlotIdx((i) => Math.min(windSlots.length - 1, i + 1))}
          />

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Map location sharing is{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{sharing ? "on" : "off"}</span>
              {sharing && (pos || gpsRefining) ? (
                <>
                  {pos ? " · GPS active" : " · Acquiring GPS"}
                  {geoAccuracyRawM != null && Number.isFinite(geoAccuracyRawM) ? (
                    <>
                      {" · live horizontal accuracy "}
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {Math.round(geoAccuracyRawM)} m
                      </span>
                    </>
                  ) : gpsRefining ? (
                    " · live accuracy …"
                  ) : null}
                  .
                </>
              ) : null}
              {sharing && !pos && !gpsRefining ? " · Waiting for GPS…" : null}
            </p>
            {sharing && gpsRefining ? (
              <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-100">
                <span className="font-semibold text-sky-900 dark:text-sky-50">GPS lock (browser):</span> high-accuracy
                fixes only, 2s timeout per read, no cached positions. Updates until accuracy is about{" "}
                {GPS_REFINE_TARGET_ACCURACY_M} m or better, or for {GPS_REFINE_MAX_MS / 1000} seconds — whichever comes
                first. Current:{" "}
                <span className="font-semibold">
                  {geoAccuracyRawM != null && Number.isFinite(geoAccuracyRawM)
                    ? `${Math.round(geoAccuracyRawM)} m`
                    : "…"}
                </span>
                .
              </p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Open map sharing settings to choose pin options and turn sharing on or off.
            </p>
            <Link
              href="/map-sharing"
              prefetch={false}
              className={`mt-3 flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium ${
                sharing
                  ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {sharing ? "Stop sharing location on map" : "Share my location on this map"}
            </Link>
            {sharing && locMode ? (
              <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">{locMode}</p>
            ) : null}
          </div>
        </div>
      )}

      {!isSettings ? (
        <HomeMessagesCtaButton signedIn={signedIn} readLat={forecastLat} readLng={forecastLng} />
      ) : null}

      {!isSettings ? (
      <WeatherForecast7Day lat={forecastCoords.lat} lng={forecastCoords.lng} />
      ) : null}

      <LifeOnSeasDailyModal
        open={lifeSeasOpen}
        onClose={() => setLifeSeasOpen(false)}
        pinLive={Boolean(sharing && pos)}
        lat={pos?.lat ?? null}
        lng={pos?.lng ?? null}
      />

      {activeAnchorAlert ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-xl dark:border-red-900/50 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Anchor alert</h3>
                <p className="mt-1 text-sm leading-5 text-zinc-700 dark:text-zinc-300">{activeAnchorAlert.message}</p>
                <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
                  {new Date(activeAnchorAlert.createdAt).toLocaleString("en-GB")}
                </p>
                {alarmBlocked ? (
                  <button
                    type="button"
                    onClick={() => void startAlarm()}
                    className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100 dark:hover:bg-red-950/50"
                  >
                    Enable alarm sound
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  const id = activeAnchorAlert.id;
                  void (async () => {
                    try {
                      await fetch("/api/anchor/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ seenId: id }),
                      });
                    } catch {
                      /* ignore */
                    }
                    setActiveAnchorAlert(null);
                  })();
                }}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Seen
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              This alert will show on every device signed into your account until you press “Seen”.
            </p>
          </div>
        </div>
      ) : null}

      <AnchorAlertModal
        open={anchorOpen}
        onClose={() => setAnchorOpen(false)}
        sharing={sharing}
        hasFix={Boolean(pos)}
        pos={pos ? { lat: pos.lat, lng: pos.lng } : null}
        horizontalAccuracyM={geoAccuracyRawM}
        anchorGpsQuality={anchorCfg.armed ? anchorLocQuality : null}
        showIOSPreciseHint={isLikelyIOS()}
        deviceId={deviceId}
        monitor={anchorMonitor}
        config={{
          armed: anchorCfg.armed,
          lat: anchorCfg.lat,
          lng: anchorCfg.lng,
          radiusM: anchorCfg.radiusM,
          angleDeg: anchorCfg.angleDeg ?? 360,
          monitorDeviceId: anchorCfg.monitorDeviceId,
        }}
        onUpdate={(next) => {
          const anchorChanged = next.lat !== anchorCfg.lat || next.lng !== anchorCfg.lng;
          const merged = {
            ...anchorCfg,
            ...next,
            lastAlertAt: null,
            lastBearingDeg: anchorChanged ? null : anchorCfg.lastBearingDeg,
          };
          setAnchorCfg(merged);
          setAnchorAlertConfig(merged);
        }}
      />
    </section>
  );
}
