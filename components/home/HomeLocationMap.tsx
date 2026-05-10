"use client";

/**
 * Nearby map presence (`/api/map/presence`) is disabled on the client.
 * Do not add fetch/axios/SWR, `setInterval`/`setTimeout` polling, or any tick that hits that route.
 * `nearbyPeers` is UI-only (cleared locally); re-enable only after restoring vetted client + server code.
 */

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
import {
  anchorRadiusAfterAddingMeters,
  getAnchorAlertConfig,
  setAnchorAlertConfig,
} from "@/lib/anchor-alert-storage";
import {
  ANCHOR_DEVICE_ID_HEADER,
  anchorCommandClientLog,
  enqueueAndAwaitAnchorCommand,
  patchAnchorSessionCommandStatus,
  type AnchorSessionCommandApi,
} from "@/lib/anchor-commands-client";
import {
  GPS_REFINE_MAX_MS,
  GPS_REFINE_TARGET_ACCURACY_M,
  GPS_REFINE_WATCH_OPTIONS,
} from "@/lib/gps-refinement";
import { isLikelyIOS } from "@/lib/location-env";
import {
  clearNativeAndroidAnchorAlarm,
  fetchNativeAnchorStatus,
  getAndroidAnchorMonitoringPermissionStatus,
  isCapacitorAndroidNative,
  readAnchorAndroidTestModeFromStorage,
  type NativeAnchorBreachPayload,
  SeaLinkAnchorAlert,
  startAndroidAnchorForegroundMonitoring,
  stopAndroidAnchorNativeMonitoringIfNeeded,
} from "@/lib/capacitor-anchor-alert-android";
import { getNativeLocationBridge } from "@/lib/native-location-bridge";
import { clearPresentedAnchorAlertId, shouldReceiveAnchorAlarmPopUp, writePresentedAnchorAlertId } from "@/lib/anchor-alarm-recipient";
import {
  createAnchorResetNetworkAbort,
  effectiveMonitorDeviceIdForHomeMap,
  isAnchorResetAbortError,
  resolveAnchorResetCentreCoordinates,
} from "@/lib/anchor-reset-centre-client";
import { getGpsFixForAnchorReset } from "@/lib/anchor-reset-gps";
import { ANCHOR_LIVE_APIS_BLOCKED } from "@/lib/anchor-live-client-flags";
import { startAnchorAlarmSiren, stopAnchorAlarmSiren } from "@/lib/anchor-alarm-sound";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";
import { clampGeoAccuracyM, humanGeolocationMessage } from "@/lib/geolocation-utils";
import { manualRefreshNearbyPresence } from "@/lib/client/map-presence-client";
const DEFAULT_CENTER: [number, number] = [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];
const DEFAULT_ZOOM = 6;

/** When true: no client calls to map presence, broadcast, vicinity inbox, or anchor live APIs from this tree. */
const EMERGENCY_DISABLE_LIVE_MAP_APIS = true;

/**
 * Emergency exception: allow read-only `/api/map/live` polling (broadcasts + reply alerts) while keeping
 * nearby presence, IFM presence, and anchor live APIs disabled.
 */
const EMERGENCY_REENABLE_MAP_LIVE_POLLING = true;

/** Safe-mode: nearby friends (≤ ~5 mi) on the Home map. */
const EMERGENCY_REENABLE_NEARBY_PRESENCE = true;

/** Statute miles → metres (for ~5 mi “nearby” ring). */
const NEARBY_RING_METRES = 5 * 1609.344;

/** How often the anchor geofence is evaluated and remote monitor fixes are polled (ms). Uses the same {@link pos} as the map. */
const ANCHOR_POSITION_CHECK_INTERVAL_MS = 30_000;

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
  isAdmin = false,
  sharingUiMode = "home",
  anchorPlacement = "full",
  showHomeMapExtras = true,
  showNearbyFriends = true,
}: {
  signedIn?: boolean;
  /** When true, anchor dialog offers a 2 m admin-only test geofence. */
  isAdmin?: boolean;
  /** `home`: map + link to settings. `settings`: options + share toggle only (no map). */
  sharingUiMode?: "home" | "settings";
  /** `full`: anchor controls + modal here. `compact`: pill only — open /anchor-alarm to arm or change settings. */
  anchorPlacement?: "full" | "compact";
  showHomeMapExtras?: boolean;
  /** When false: hide friends toggle, nearby ring, and peer pins (e.g. dedicated anchor page). */
  showNearbyFriends?: boolean;
}) {
  const isSettings = sharingUiMode === "settings";
  const anchorCompact = anchorPlacement === "compact" && !isSettings;
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
    typeof window !== "undefined" ? getAnchorAlertConfig({ isAdmin }) : getAnchorAlertConfig({ isAdmin }),
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

  const [anchorBreachResetBusyKind, setAnchorBreachResetBusyKind] = useState<
    null | "monitor" | "this" | "remote_reset" | "remote_increase" | "remote_silence"
  >(null);
  const [anchorBreachResetError, setAnchorBreachResetError] = useState<string | null>(null);
  useEffect(() => {
    setAnchorBreachResetError(null);
    setAnchorBreachResetBusyKind(null);
  }, [activeAnchorAlert?.id]);

  useEffect(() => {
    const id = activeAnchorAlert?.id;
    if (!id || id.startsWith("local-") || id.startsWith("native-")) return;
    writePresentedAnchorAlertId(id);
  }, [activeAnchorAlert?.id]);

  /** When true, native Android MediaPlayer handles the siren — skip Web Audio. */
  const nativeAudioLatchRef = useRef(false);

  const [alarmBlocked, setAlarmBlocked] = useState(false);
  const deviceId = useMemo(() => (typeof window !== "undefined" ? getOrCreateDeviceId() : "server"), []);

  useEffect(() => {
    if (!isCapacitorAndroidNative()) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void SeaLinkAnchorAlert.addListener("nativeAnchorBreach", (e: unknown) => {
      const payload = e as NativeAnchorBreachPayload;
      const msg = typeof payload.message === "string" ? payload.message : "Anchor alert";
      const now = Date.now();
      const cur = anchorCfgRef.current;
      const last = cur.lastAlertAt ? new Date(cur.lastAlertAt).getTime() : 0;
      if (now - last < 2 * 60_000) return;

      const next = { ...cur, lastAlertAt: new Date(now).toISOString() };
      queueMicrotask(() => {
        setAnchorCfg(next);
        setAnchorAlertConfig(next);
      });
      if (!ANCHOR_LIVE_APIS_BLOCKED) {
        void fetch("/api/anchor/geofence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ lastAlertAt: next.lastAlertAt, lastBearingDeg: next.lastBearingDeg }),
          keepalive: true,
        }).catch(() => undefined);
      }

      const mayReceivePopUp = shouldReceiveAnchorAlarmPopUp(anchorMonitorRef.current?.alertDeviceIds, deviceId);
      if (ANCHOR_LIVE_APIS_BLOCKED) {
        if (mayReceivePopUp && !activeAnchorAlertRef.current) {
          queueMicrotask(() =>
            setActiveAnchorAlert({
              id: `local-${now}`,
              message: msg,
              createdAt: new Date(now).toISOString(),
            }),
          );
        }
        return;
      }

      void (async () => {
        try {
          const r = await fetch("/api/anchor/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg, kind: "alert" }),
            credentials: "same-origin",
            keepalive: true,
          });
          const popHere = shouldReceiveAnchorAlarmPopUp(anchorMonitorRef.current?.alertDeviceIds, deviceId);
          if (r.ok) {
            try {
              const data = (await r.json()) as {
                alert?: { id?: string; message?: string; createdAt?: string; created_at?: string };
              };
              const a = data?.alert;
              const id = typeof a?.id === "string" ? a.id : "";
              const text = typeof a?.message === "string" ? a.message : "";
              const created =
                typeof a?.createdAt === "string"
                  ? a.createdAt
                  : typeof a?.created_at === "string"
                    ? a.created_at
                    : new Date(now).toISOString();
              if (popHere && id && text && !activeAnchorAlertRef.current) {
                setActiveAnchorAlert({ id, message: text, createdAt: created });
              }
            } catch {
              if (popHere && !activeAnchorAlertRef.current) {
                setActiveAnchorAlert({
                  id: `native-${now}`,
                  message: msg,
                  createdAt: new Date(now).toISOString(),
                });
              }
            }
          } else if (popHere && !activeAnchorAlertRef.current) {
            setActiveAnchorAlert({
              id: `native-${now}`,
              message: msg,
              createdAt: new Date(now).toISOString(),
            });
          }
        } catch {
          if (shouldReceiveAnchorAlarmPopUp(anchorMonitorRef.current?.alertDeviceIds, deviceId) && !activeAnchorAlertRef.current) {
            setActiveAnchorAlert({
              id: `native-${now}`,
              message: msg,
              createdAt: new Date(now).toISOString(),
            });
          }
        }
      })();
    }).then((h) => {
      if (disposed) void h.remove();
      else listener = h;
    });
    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [deviceId]);

  useEffect(() => {
    if (!isCapacitorAndroidNative()) return;
    const lat = anchorCfg.lat;
    const lng = anchorCfg.lng;
    if (!anchorCfg.armed || lat == null || lng == null) {
      void stopAndroidAnchorNativeMonitoringIfNeeded();
      return;
    }
    const mid = anchorCfg.monitorDeviceId;
    const monitorsThis = mid === "this" || mid === deviceId;
    if (!monitorsThis) {
      void stopAndroidAnchorNativeMonitoringIfNeeded();
      return;
    }
    let cancelled = false;
    void (async () => {
      const st = await getAndroidAnchorMonitoringPermissionStatus();
      if (cancelled) return;
      if (!st.fineLocation || !st.postNotifications || !st.backgroundLocation) return;
      if (cancelled) return;
      await startAndroidAnchorForegroundMonitoring({
        monitorDeviceId: mid,
        deviceId,
        lat,
        lng,
        radiusM: anchorCfg.radiusM,
        angleDeg: anchorCfg.angleDeg,
        lastBearingDeg: anchorCfg.lastBearingDeg,
        testMode: readAnchorAndroidTestModeFromStorage(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [anchorCfg.armed, anchorCfg.lat, anchorCfg.lng, anchorCfg.radiusM, anchorCfg.angleDeg, anchorCfg.monitorDeviceId, deviceId]);

  // Native Android: poll drift/alarm status so UI can open after a background breach; suppress Web Audio when native plays.
  useEffect(() => {
    if (!isCapacitorAndroidNative()) return;
    if (!anchorCfg.armed) {
      nativeAudioLatchRef.current = false;
      return;
    }
    const mid = anchorCfg.monitorDeviceId;
    if (!(mid === "this" || mid === deviceId)) return;

    let disposed = false;
    const tick = async () => {
      try {
        const s = await fetchNativeAnchorStatus();
        if (disposed) return;
        const latch = Boolean(s.driftAlarmPending || s.nativeAlarmPlaying);
        nativeAudioLatchRef.current = latch;
        if (latch) stopAnchorAlarmSiren();
        if (
          s.driftAlarmPending &&
          typeof s.lastAlarmMessage === "string" &&
          s.lastAlarmMessage.trim()
        ) {
          if (!shouldReceiveAnchorAlarmPopUp(anchorMonitorRef.current?.alertDeviceIds, deviceId)) return;
          const cur = activeAnchorAlertRef.current;
          if (!cur || cur.id.startsWith("native-")) {
            setActiveAnchorAlert({
              id: `native-${s.lastFixTimeMs || Date.now()}`,
              message: s.lastAlarmMessage,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [anchorCfg.armed, anchorCfg.monitorDeviceId, deviceId]);

  const localDeviceName = useMemo(() => (typeof window !== "undefined" ? getDeviceName() : ""), []);
  const [monitorDeviceLabel, setMonitorDeviceLabel] = useState<string>("");
  const [anchorMonitor, setAnchorMonitor] = useState<{ monitorDeviceId: string | null; alertDeviceIds: string[] } | null>(null);
  const breachEffectiveMonitor = useMemo(
    () =>
      effectiveMonitorDeviceIdForHomeMap({
        thisDeviceId: deviceId,
        serverMonitorDeviceId: anchorMonitor?.monitorDeviceId,
        geofenceMonitorDeviceId: anchorCfg.monitorDeviceId,
      }),
    [deviceId, anchorMonitor?.monitorDeviceId, anchorCfg.monitorDeviceId],
  );
  const breachIsMonitoringDevice = breachEffectiveMonitor === deviceId;
  const anchorCfgLoadedFromServerRef = useRef(false);
  const [shareNearby, setShareNearby] = useState(() =>
    typeof window !== "undefined" ? getShareNearbyPeers() : false,
  );
  const [nearbyPeers, setNearbyPeers] = useState<NearbyPeer[]>([]);
  const friendsActive = showNearbyFriends && shareNearby;
  const posRef = useRef<LatLngAcc | null>(null);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const anchorMonitorRef = useRef(anchorMonitor);
  useEffect(() => {
    anchorMonitorRef.current = anchorMonitor;
  }, [anchorMonitor]);

  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  const anchorArmedRef = useRef(false);
  useEffect(() => {
    anchorArmedRef.current = anchorCfg.armed;
  }, [anchorCfg.armed]);

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

  const presenceEnabled = Boolean(
    EMERGENCY_REENABLE_NEARBY_PRESENCE && signedIn && sharing && pos && friendsActive,
  );

  const [presenceDebugUi, setPresenceDebugUi] = useState(false);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setPresenceDebugUi(sp.get("presence_debug") === "1");
    } catch {
      setPresenceDebugUi(false);
    }
  }, []);

  useEffect(() => {
    console.info("PRESENCE_CONDITION_CHECK", {
      signedIn: Boolean(signedIn),
      sharing: Boolean(sharing),
      gps: Boolean(pos),
      shareNearby: Boolean(shareNearby),
      showNearbyFriends,
      friendsActive: Boolean(friendsActive),
      presenceEnabled,
      flag: EMERGENCY_REENABLE_NEARBY_PRESENCE,
      hidden: typeof document !== "undefined" ? document.visibilityState !== "visible" : false,
    });
  }, [signedIn, sharing, Boolean(pos), shareNearby, showNearbyFriends, friendsActive, presenceEnabled]);

  // Report this device's last fix (for cross-device monitoring).
  useEffect(() => {
    if (ANCHOR_LIVE_APIS_BLOCKED) return;
    if (!sharing || !pos) return;
    const now = Date.now();
    if (now - lastAnchorReportAt.current < 180_000) return; // 3 minutes
    lastAnchorReportAt.current = now;
    const name = getDeviceName() || "This device";
    const payload = { deviceId, name, lat: pos.lat, lng: pos.lng };
    void fetch("/api/anchor/devices", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  }, [sharing, pos?.lat, pos?.lng, deviceId]);

  // Emergency mode: no automatic presence polling. Manual refresh only.

  const [nearbyRefreshBlockedUntilMs, setNearbyRefreshBlockedUntilMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastNearbyRefreshOkAtMs, setLastNearbyRefreshOkAtMs] = useState(0);
  const nearbyRefreshBlocked = nowMs < nearbyRefreshBlockedUntilMs;
  const nearbyRefreshCooldownLeftS = nearbyRefreshBlocked
    ? Math.max(0, Math.ceil((nearbyRefreshBlockedUntilMs - nowMs) / 1000))
    : 0;

  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const nearbyUiTimer = useRef<number | null>(null);
  useEffect(() => {
    const clear = () => {
      if (nearbyUiTimer.current != null) {
        window.clearTimeout(nearbyUiTimer.current);
        nearbyUiTimer.current = null;
      }
    };

    const schedule = () => {
      clear();
      const t = Date.now();
      const blocked = t < nearbyRefreshBlockedUntilMs;
      const recentOk = lastNearbyRefreshOkAtMs > 0 && t - lastNearbyRefreshOkAtMs < 120_000;
      if (!blocked && !recentOk) return;

      nearbyUiTimer.current = window.setTimeout(() => {
        setNowMs(Date.now());
        schedule();
      }, 1000);
    };

    schedule();
    return () => clear();
  }, [nearbyRefreshBlockedUntilMs, lastNearbyRefreshOkAtMs]);

  const nearbyRefreshStatusText = useMemo(() => {
    if (nearbyRefreshBlocked && nearbyRefreshCooldownLeftS > 0) {
      return `Refresh again in ${nearbyRefreshCooldownLeftS}s`;
    }
    if (lastNearbyRefreshOkAtMs) {
      const agoS = Math.max(0, Math.floor((nowMs - lastNearbyRefreshOkAtMs) / 1000));
      if (agoS < 5) return "Last refreshed just now";
      if (agoS < 60) return `Last refreshed ${agoS}s ago`;
      const agoM = Math.floor(agoS / 60);
      return `Last refreshed ${agoM}m ago`;
    }
    return "";
  }, [nearbyRefreshBlocked, nearbyRefreshCooldownLeftS, lastNearbyRefreshOkAtMs, nowMs]);

  const refreshCoords = useMemo(() => {
    if (!sharing) return null;
    const p = mapPinPos ?? pos;
    if (!p) return null;
    return { lat: p.lat, lng: p.lng };
  }, [sharing, mapPinPos?.lat, mapPinPos?.lng, pos?.lat, pos?.lng]);

  const requestNearbyManualRefresh = useCallback(() => {
    if (!EMERGENCY_REENABLE_NEARBY_PRESENCE) return;
    if (!showNearbyFriends) return;
    if (!signedIn || !sharing || !shareNearby) return;
    if (!refreshCoords) return;
    if (nearbyRefreshBlocked) return;
    setNearbyRefreshBlockedUntilMs(Date.now() + 60_000);
    void manualRefreshNearbyPresence({
      signedIn,
      shareNearby,
      getCoords: () => refreshCoords,
      getLabel: () => `${(boatInput || "Boat").trim()} · ${(fullName || "").trim()}`.trim().slice(0, 40),
      onPeers: (peers) => setNearbyPeers(peers),
      onUnauthorized: () => setNearbyPeers([]),
    }).then((ok) => {
      if (ok) setLastNearbyRefreshOkAtMs(Date.now());
    });
  }, [
    signedIn,
    sharing,
    refreshCoords?.lat,
    refreshCoords?.lng,
    shareNearby,
    showNearbyFriends,
    boatInput,
    fullName,
    nearbyRefreshBlocked,
  ]);

  const [monitoredFix, setMonitoredFix] = useState<{ lat: number; lng: number; at: string } | null>(null);
  const monitoredFixRef = useRef(monitoredFix);
  useEffect(() => {
    monitoredFixRef.current = monitoredFix;
  }, [monitoredFix]);

  useEffect(() => {
    anchorCfgRef.current = anchorCfg;
  }, [anchorCfg]);

  // Load server-backed geofence config so both devices can reset/sync.
  useEffect(() => {
    if (ANCHOR_LIVE_APIS_BLOCKED) return;
    if (!sharing) return;
    let disposed = false;
    void (async () => {
      try {
        const r = await fetch("/api/anchor/geofence", { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { config?: typeof anchorCfg };
        const cfg = d.config;
        if (disposed) return;
        if (cfg && typeof cfg === "object") {
          anchorCfgLoadedFromServerRef.current = true;
          setAnchorCfg(cfg);
          setAnchorAlertConfig(cfg);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      disposed = true;
    };
  }, [sharing]);

  useEffect(() => {
    anchorGpsStabilizerRef.current = createAnchorGpsStabilizer();
    if (!anchorCfg.armed) queueMicrotask(() => setAnchorLocQuality(null));
  }, [anchorCfg.armed]);

  // If monitoring another device, pull its latest fix periodically.
  useEffect(() => {
    if (ANCHOR_LIVE_APIS_BLOCKED) {
      queueMicrotask(() => setMonitoredFix(null));
      return;
    }
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
        const r = await fetch("/api/anchor/devices", { credentials: "same-origin", cache: "no-store" });
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
    const id = window.setInterval(() => void load(), ANCHOR_POSITION_CHECK_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [sharing, anchorCfg.monitorDeviceId, anchorMonitor?.monitorDeviceId, deviceId]);

  // Load server-backed monitor config (single monitor device + alert recipients).
  useEffect(() => {
    if (ANCHOR_LIVE_APIS_BLOCKED) return;
    if (!sharing) return;
    let disposed = false;
    const load = async () => {
      try {
        const r = await fetch("/api/anchor/monitor", { credentials: "same-origin", cache: "no-store" });
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

  const anchorSessionCommandApplyBusyRef = useRef(false);

  /** Monitoring handset: pull queued remote commands and apply them locally (source of truth). */
  useEffect(() => {
    if (ANCHOR_LIVE_APIS_BLOCKED || !sharing || !deviceId || deviceId === "server") return;
    let disposed = false;

    const tick = async () => {
      if (disposed || anchorSessionCommandApplyBusyRef.current) return;
      const snap = anchorCfgRef.current;
      if (!snap.armed) return;
      const serverMonitor = anchorMonitorRef.current?.monitorDeviceId;
      const eff = effectiveMonitorDeviceIdForHomeMap({
        thisDeviceId: deviceId,
        serverMonitorDeviceId: serverMonitor,
        geofenceMonitorDeviceId: snap.monitorDeviceId,
      });
      if (eff !== deviceId) return;

      anchorSessionCommandApplyBusyRef.current = true;
      try {
        const hr = await fetch("/api/anchor/commands?role=monitor", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { [ANCHOR_DEVICE_ID_HEADER]: deviceId },
        });
        if (!hr.ok) {
          anchorCommandClientLog("monitor_poll_http_error", { status: hr.status });
          return;
        }
        const hd = (await hr.json()) as { commands?: AnchorSessionCommandApi[] };
        const list = Array.isArray(hd.commands) ? hd.commands : [];
        if (list.length === 0) return;

        for (const cmd of list) {
          if (disposed) return;
          anchorCommandClientLog("boat_apply_start", { id: cmd.id, type: cmd.type });
          try {
            if (cmd.type === "RESET_ANCHOR") {
              const pos = posRef.current;
              const mapPos =
                pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng) ? { lat: pos.lat, lng: pos.lng } : null;
              const fix = await resolveAnchorResetCentreCoordinates({
                thisDeviceId: deviceId,
                effectiveMonitorDeviceId: eff,
                mapPosIfThisDeviceIsMonitor: mapPos,
                allowBrowserGpsFallback: true,
              });
              if (!fix) throw new Error("no_boat_gps_for_reset");
              const gr = await fetch("/api/anchor/geofence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                  lat: fix.lat,
                  lng: fix.lng,
                  lastAlertAt: null,
                  lastBearingDeg: null,
                  remoteAlarmSilencedUntilReset: false,
                }),
              });
              if (!gr.ok) throw new Error(`geofence_http_${gr.status}`);
              const gj = (await gr.json()) as { config?: typeof snap };
              await fetch("/api/anchor/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ markAllSeen: true }),
              }).catch(() => undefined);
              if (gj.config) {
                setAnchorCfg(gj.config);
                setAnchorAlertConfig(gj.config);
              }
            } else if (cmd.type === "INCREASE_RADIUS") {
              const add = typeof cmd.meters === "number" && Number.isFinite(cmd.meters) ? cmd.meters : 10;
              const curR = anchorCfgRef.current.radiusM;
              const nextR = anchorRadiusAfterAddingMeters(curR, add, { fromTrustedStore: true });
              const gr = await fetch("/api/anchor/geofence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ radiusM: nextR }),
              });
              if (!gr.ok) throw new Error(`geofence_http_${gr.status}`);
              const gj = (await gr.json()) as { config?: typeof snap };
              if (gj.config) {
                setAnchorCfg(gj.config);
                setAnchorAlertConfig(gj.config);
              }
            } else if (cmd.type === "SILENCE_UNTIL_RESET") {
              const gr = await fetch("/api/anchor/geofence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ remoteAlarmSilencedUntilReset: true }),
              });
              if (!gr.ok) throw new Error(`geofence_http_${gr.status}`);
              const ar = await fetch("/api/anchor/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ markAllSeen: true }),
              });
              if (!ar.ok) throw new Error(`alerts_http_${ar.status}`);
              const gj = (await gr.json()) as { config?: typeof snap };
              if (gj.config) {
                setAnchorCfg(gj.config);
                setAnchorAlertConfig(gj.config);
              }
            }
            const patched = await patchAnchorSessionCommandStatus({
              id: cmd.id,
              monitorDeviceId: deviceId,
              status: "applied",
            });
            if (!patched.ok) {
              anchorCommandClientLog("boat_apply_patch_applied_failed", { id: cmd.id, status: patched.status });
            } else {
              anchorCommandClientLog("boat_apply_done", { id: cmd.id, type: cmd.type });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message.slice(0, 400) : "apply_error";
            anchorCommandClientLog("boat_apply_failed", { id: cmd.id, type: cmd.type, msg });
            await patchAnchorSessionCommandStatus({
              id: cmd.id,
              monitorDeviceId: deviceId,
              status: "failed",
              errorMessage: msg,
            });
          }
        }
      } finally {
        anchorSessionCommandApplyBusyRef.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [sharing, deviceId]);

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

  // Anchor geofence check: same `pos` as map/forecasts (via posRef); runs every ANCHOR_POSITION_CHECK_INTERVAL_MS on this device when it is the monitor.
  useEffect(() => {
    if (!sharing) return;
    const anchorCfgSnap = anchorCfgRef.current;
    if (!anchorCfgSnap.armed || anchorCfgSnap.lat == null || anchorCfgSnap.lng == null) return;
    const serverMonitor = anchorMonitorRef.current?.monitorDeviceId;
    const effectiveMonitor = serverMonitor
      ? serverMonitor
      : anchorCfgSnap.monitorDeviceId === "this"
        ? deviceId
        : anchorCfgSnap.monitorDeviceId;
    if (effectiveMonitor && effectiveMonitor !== deviceId) return;

    const runCheck = () => {
      const anchorCfg = anchorCfgRef.current;
      if (!anchorCfg.armed || anchorCfg.lat == null || anchorCfg.lng == null) return;
      if (isCapacitorAndroidNative()) {
        const mid = anchorCfg.monitorDeviceId;
        const monitorsThis = mid === "this" || mid === deviceId;
        if (monitorsThis) return;
      }
      const pos = posRef.current;
      const monitoredFix = monitoredFixRef.current;
      const src =
        anchorCfg.monitorDeviceId && anchorCfg.monitorDeviceId !== "this" && monitoredFix
          ? { lat: monitoredFix.lat, lng: monitoredFix.lng }
          : pos
            ? { lat: pos.lat, lng: pos.lng }
            : null;
      if (!src) return;

      const m = distanceMiles(src.lat, src.lng, anchorCfg.lat, anchorCfg.lng) * 1609.344;
      const brng = bearingDeg(anchorCfg.lat, anchorCfg.lng, src.lat, src.lng);
      const gpsBufferM =
        anchorCfg.monitorDeviceId && anchorCfg.monitorDeviceId !== "this"
          ? 12 // we don't have accuracy for remote fixes; be conservative
          : Math.max(8, Math.round(pos?.accuracyM || 0));

      const angleLimit = Math.max(0, Math.min(360, Math.round(anchorCfg.angleDeg ?? 360)));

      /* Bearing baseline only matters when angle-change alerts are enabled; drift uses distance only. */
      if (anchorCfg.lastBearingDeg == null && Number.isFinite(brng) && angleLimit < 360) {
        const next = { ...anchorCfg, lastBearingDeg: brng };
        queueMicrotask(() => setAnchorCfg(next));
        setAnchorAlertConfig(next);
        if (!ANCHOR_LIVE_APIS_BLOCKED) {
          void fetch("/api/anchor/geofence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastBearingDeg: brng }),
            keepalive: true,
          }).catch(() => undefined);
        }
        return;
      }
      const angleDelta =
        anchorCfg.lastBearingDeg != null && angleLimit < 360 ? angleDiffDeg(brng, anchorCfg.lastBearingDeg) : 0;

      const driftTriggered = m > anchorCfg.radiusM + gpsBufferM;

      const meaningfulDistM = Math.max(12, Math.round(anchorCfg.radiusM * 0.6));
      const angleTriggered =
        angleLimit < 360 && m >= meaningfulDistM && Number.isFinite(brng) && angleDelta > angleLimit;

      if (!driftTriggered && !angleTriggered && angleLimit < 360 && Number.isFinite(brng) && m <= anchorCfg.radiusM) {
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
      if (now - last < 2 * 60_000) return;

      const next = { ...anchorCfg, lastAlertAt: new Date(now).toISOString(), lastBearingDeg: brng };
      queueMicrotask(() => setAnchorCfg(next));
      setAnchorAlertConfig(next);
      if (!ANCHOR_LIVE_APIS_BLOCKED) {
        void fetch("/api/anchor/geofence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastAlertAt: new Date(now).toISOString(), lastBearingDeg: brng }),
          keepalive: true,
        }).catch(() => undefined);
      }

      const parts: string[] = [];
      if (driftTriggered) parts.push(`drifted ~${Math.round(m)}m (limit ${anchorCfg.radiusM}m)`);
      if (angleTriggered) parts.push(`bearing changed ~${Math.round(angleDelta)}° (limit ${angleLimit}°)`);
      const msg = `Anchor alert: ${parts.join(" and ")}.`;
      const mayReceivePopUp = shouldReceiveAnchorAlarmPopUp(anchorMonitorRef.current?.alertDeviceIds, deviceId);

      if (ANCHOR_LIVE_APIS_BLOCKED) {
        if (mayReceivePopUp && !activeAnchorAlertRef.current) {
          setActiveAnchorAlert({ id: `local-${now}`, message: msg, createdAt: new Date(now).toISOString() });
        }
      } else {
        void (async () => {
          try {
            const r = await fetch("/api/anchor/alerts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: msg, kind: "alert" }),
              credentials: "same-origin",
              keepalive: true,
            });
            const popHere = shouldReceiveAnchorAlarmPopUp(anchorMonitorRef.current?.alertDeviceIds, deviceId);
            if (r.ok) {
              try {
                const data = (await r.json()) as {
                  alert?: { id?: string; message?: string; createdAt?: string; created_at?: string };
                };
                const a = data?.alert;
                const id = typeof a?.id === "string" ? a.id : "";
                const text = typeof a?.message === "string" ? a.message : "";
                const created =
                  typeof a?.createdAt === "string"
                    ? a.createdAt
                    : typeof a?.created_at === "string"
                      ? a.created_at
                      : new Date(now).toISOString();
                if (popHere && id && text && !activeAnchorAlertRef.current) {
                  setActiveAnchorAlert({ id, message: text, createdAt: created });
                }
              } catch {
                if (popHere && !activeAnchorAlertRef.current) {
                  setActiveAnchorAlert({ id: `local-${now}`, message: msg, createdAt: new Date(now).toISOString() });
                }
              }
            } else if (popHere && !activeAnchorAlertRef.current) {
              setActiveAnchorAlert({ id: `local-${now}`, message: msg, createdAt: new Date(now).toISOString() });
            }
          } catch {
            if (shouldReceiveAnchorAlarmPopUp(anchorMonitorRef.current?.alertDeviceIds, deviceId) && !activeAnchorAlertRef.current) {
              setActiveAnchorAlert({ id: `local-${now}`, message: msg, createdAt: new Date(now).toISOString() });
            }
          }
        })();
      }

      if (mayReceivePopUp) {
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            const opts = {
              body: msg,
              tag: "sealink-anchor-alert",
              renotify: true,
              requireInteraction: true,
              vibrate: [200, 100, 200, 100, 400, 120, 300, 120, 400],
            } as NotificationOptions & Record<string, unknown>;
            new Notification("SEALINK — ANCHOR ALERT", opts);
          }
        } catch {
          /* ignore */
        }
      }
    };

    runCheck();
    const id = window.setInterval(runCheck, ANCHOR_POSITION_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    sharing,
    anchorCfg.armed,
    anchorCfg.lat,
    anchorCfg.lng,
    anchorCfg.monitorDeviceId,
    anchorMonitor?.monitorDeviceId,
    deviceId,
  ]);

  // Display label for which device is being monitored.
  useEffect(() => {
    if (ANCHOR_LIVE_APIS_BLOCKED) return;
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
        const r = await fetch("/api/anchor/devices", { credentials: "same-origin", cache: "no-store" });
        const d = (await r.json()) as {
          devices?: { deviceId: string; name: string; updatedAt: string; lastFixAt: string | null }[];
        };
        if (disposed) return;
        const row = d.devices?.find((x) => x.deviceId === anchorCfg.monitorDeviceId);
        if (row) {
          setMonitorDeviceLabel(row.name?.trim() ? row.name.trim() : "Other signed-in device");
        } else {
          setMonitorDeviceLabel("Other signed-in device");
        }
      } catch {
        if (!disposed) setMonitorDeviceLabel("Other signed-in device");
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [anchorCfg.armed, anchorCfg.monitorDeviceId, localDeviceName]);

  function stopAlarm() {
    stopAnchorAlarmSiren();
  }

  async function startAlarm(): Promise<void> {
    stopAlarm();
    if (nativeAudioLatchRef.current) {
      setAlarmBlocked(false);
      return;
    }
    const ok = await startAnchorAlarmSiren();
    if (!ok) {
      setAlarmBlocked(true);
      return;
    }
    setAlarmBlocked(false);
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
    if (!showHomeMapExtras) return;
    if (typeof window === "undefined") return;
    if (wasLifeOnSeasPopupShownToday()) return;
    const t = window.setTimeout(() => {
      markLifeOnSeasPopupShownToday();
      setLifeSeasOpen(true);
    }, 1100);
    return () => window.clearTimeout(t);
  }, [showHomeMapExtras]);

  useEffect(() => {
    if (!showHomeMapExtras) return;
    const onOpen = () => setLifeSeasOpen(true);
    window.addEventListener("sealink-seas-the-day-open", onOpen);
    return () => window.removeEventListener("sealink-seas-the-day-open", onOpen);
  }, [showHomeMapExtras]);

  const setSharingOn = useCallback((on: boolean) => {
    if (!on) {
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
  }, []);

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

      {EMERGENCY_REENABLE_NEARBY_PRESENCE ? (
        <>
          <div
            className={`flex flex-col gap-2 rounded-lg border p-3 text-[11px] leading-snug sm:flex-row sm:items-center sm:justify-between ${
              sharing && !pos
                ? "cursor-wait border-blue-200/80 bg-blue-50/50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/25 dark:text-blue-100"
                : "border-blue-200 bg-blue-50/90 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/35 dark:text-blue-100"
            }`}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-blue-600 disabled:opacity-50"
                checked={shareNearby}
                disabled={Boolean(sharing && !pos)}
                onChange={(e) => {
                  const on = e.target.checked;
                  setShareNearby(on);
                  setShareNearbyPeers(on);
                  if (!on) setNearbyPeers([]);
                }}
              />
              <span className="font-semibold">Show friends (within ~5 miles)</span>
            </label>
            {sharing && shareNearby ? (
              <div className="flex min-w-0 shrink-0 flex-col items-stretch gap-1 sm:items-end">
                <button
                  type="button"
                  onClick={() => requestNearbyManualRefresh()}
                  disabled={nearbyRefreshBlocked || !signedIn || !refreshCoords}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-900 shadow-sm hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-100 dark:hover:bg-blue-950/50"
                >
                  Refresh nearby users
                </button>
                {nearbyRefreshStatusText ? (
                  <p className="text-[10px] font-medium text-blue-900/80 dark:text-blue-100/80">{nearbyRefreshStatusText}</p>
                ) : null}
                {!refreshCoords ? (
                  <p className="text-[10px] font-medium text-blue-900/70 dark:text-blue-100/70">Waiting for GPS…</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
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
          {presenceDebugUi ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[10px] text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              presence_debug signedIn={String(Boolean(signedIn))} gps={String(Boolean(pos))} sharing=
              {String(Boolean(sharing))} shareNearby={String(Boolean(shareNearby))} enabled=
              {String(Boolean(presenceEnabled))}
            </p>
          ) : null}
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
          {!isSettings && sharing && showNearbyFriends ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !shareNearby;
                  setShareNearby(next);
                  setShareNearbyPeers(next);
                  if (!next) setNearbyPeers([]);
                }}
                className={`inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold ${
                  shareNearby
                    ? "border border-blue-700 bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-zinc-300 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {shareNearby ? "Friends: ON" : "Show friends"}
              </button>
              {EMERGENCY_REENABLE_NEARBY_PRESENCE && shareNearby ? (
                <div className="flex flex-col items-stretch gap-0.5 sm:items-end">
                  <button
                    type="button"
                    onClick={() => requestNearbyManualRefresh()}
                    disabled={nearbyRefreshBlocked || !signedIn || !refreshCoords}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-900 shadow-sm hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-100 dark:hover:bg-blue-950/50"
                  >
                    Refresh nearby users
                  </button>
                  {nearbyRefreshStatusText ? (
                    <p className="text-center text-[10px] font-medium text-blue-900/80 sm:text-right dark:text-blue-100/80">
                      {nearbyRefreshStatusText}
                    </p>
                  ) : null}
                  {!refreshCoords ? (
                    <p className="text-center text-[10px] font-medium text-blue-900/70 sm:text-right dark:text-blue-100/70">
                      Waiting for GPS…
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col items-start gap-1">
            {anchorCompact ? null : (
              <button
                type="button"
                onClick={() => setAnchorOpen(true)}
                className="relative z-50 inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 px-4 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-100 dark:hover:bg-indigo-900/70"
              >
                Anchor alert
              </button>
            )}
            {anchorCompact && !anchorCfg.armed ? (
              <Link
                href="/anchor-alarm"
                className="relative z-50 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-900 hover:bg-red-100 sm:min-h-9 sm:px-3.5 sm:text-sm dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/60"
                title="Open Anchor alarm page to arm or change settings"
              >
                <span className="shrink-0">Anchor</span>
                <span className="text-red-800/90 dark:text-red-100/90">·</span>
                <span className="shrink-0">Off</span>
                <span className="min-w-0 truncate font-medium opacity-85">· Tap to set up</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (anchorCfg.armed) {
                    void stopAndroidAnchorNativeMonitoringIfNeeded();
                    const merged = { ...anchorCfg, armed: false, lastAlertAt: null };
                    setAnchorCfg(merged);
                    setAnchorAlertConfig(merged);
                  } else if (!anchorCompact) {
                    setAnchorOpen(true);
                  }
                }}
                className={`relative z-50 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:min-h-9 sm:px-3.5 sm:text-sm ${
                  anchorCfg.armed
                    ? "border-green-300 bg-green-50 text-green-900 hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-100 dark:hover:bg-green-950/60"
                    : "border-red-300 bg-red-50 text-red-900 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/60"
                }`}
                title={anchorCfg.armed ? "Turn anchor alarm off" : "Open anchor alert settings"}
              >
                <span className="shrink-0">Anchor</span>
                <span className="opacity-80">·</span>
                <span className="shrink-0">{anchorCfg.armed ? "On" : "Off"}</span>
                {anchorCfg.armed ? (
                  <span className="min-w-0 truncate text-left font-medium opacity-90">
                    · Monitoring {monitorDeviceLabel || "…"}
                  </span>
                ) : null}
              </button>
            )}
            {anchorCfg.armed && anchorLocQuality && anchorLocQuality !== "ok" ? (
              <p className="max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                {anchorLocQuality === "poor_accuracy"
                  ? `GPS accuracy is coarser than about ±${ANCHOR_MAX_HORIZ_ACCURACY_M}m — drift alerts are paused until the fix improves (open sky, wait, or enable Precise Location on iPhone).`
                  : "Stabilizing GPS for the anchor — hold steady a few seconds so the geofence isn’t thrown off by jitter."}
              </p>
            ) : null}
          </div>
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
                    {friendsActive ? (
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
                    {friendsActive
                      ? nearbyPeers.map((p) => (
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
                        ))
                      : null}
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

      {!isSettings && showHomeMapExtras ? (
        <HomeMessagesCtaButton
          signedIn={signedIn}
          readLat={forecastLat}
          readLng={forecastLng}
          emergencyDisableLiveMapApis={EMERGENCY_DISABLE_LIVE_MAP_APIS && !EMERGENCY_REENABLE_MAP_LIVE_POLLING}
        />
      ) : null}

      {!isSettings && showHomeMapExtras ? (
        <WeatherForecast7Day lat={forecastCoords.lat} lng={forecastCoords.lng} />
      ) : null}

      {showHomeMapExtras ? (
        <LifeOnSeasDailyModal
          open={lifeSeasOpen}
          onClose={() => setLifeSeasOpen(false)}
          pinLive={Boolean(sharing && pos)}
          lat={pos?.lat ?? null}
          lng={pos?.lng ?? null}
        />
      ) : null}

      {activeAnchorAlert ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="sealink-anchor-alarm-title"
          aria-describedby="sealink-anchor-alarm-detail"
          className="sealink-anchor-siren-overlay fixed inset-0 z-[1200] flex flex-col shadow-[inset_0_0_80px_rgba(0,0,0,0.35)]"
        >
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] text-center">
            <p
              id="sealink-anchor-alarm-title"
              className="text-4xl font-black uppercase leading-none tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:text-5xl"
            >
              Anchor alarm
            </p>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-amber-200">Geofence breach — check the boat</p>
            <p
              id="sealink-anchor-alarm-detail"
              className="mt-6 max-w-lg text-lg font-semibold leading-snug text-white sm:text-xl"
            >
              {activeAnchorAlert.message}
            </p>
            <p className="mt-4 text-xs font-medium text-white/80">
              {new Date(activeAnchorAlert.createdAt).toLocaleString("en-GB")}
            </p>
            {alarmBlocked ? (
              <button
                type="button"
                onClick={() => void startAlarm()}
                className="mt-6 rounded-xl border-2 border-white/90 bg-black/25 px-5 py-3 text-sm font-bold text-white backdrop-blur-sm hover:bg-black/40"
              >
                Tap to play alarm sound
              </button>
            ) : null}
            {anchorBreachResetError ? (
              <p className="mt-4 max-w-md rounded-lg border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-xs leading-snug text-amber-100">
                {anchorBreachResetError}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t-2 border-white/25 bg-black/35 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:flex-row sm:justify-center">
            {breachIsMonitoringDevice ? (
              <>
            <button
              type="button"
              disabled={anchorBreachResetBusyKind !== null}
              onClick={() => {
                stopAlarm();
                if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                const seenId = activeAnchorAlert.id;
                void (async () => {
                  setAnchorBreachResetError(null);
                  setAnchorBreachResetBusyKind("monitor");
                  const { signal, clear } = createAnchorResetNetworkAbort();
                  try {
                    if (ANCHOR_LIVE_APIS_BLOCKED) {
                      const effectiveMonitor = effectiveMonitorDeviceIdForHomeMap({
                        thisDeviceId: deviceId,
                        serverMonitorDeviceId: anchorMonitor?.monitorDeviceId,
                        geofenceMonitorDeviceId: anchorCfgRef.current.monitorDeviceId,
                      });
                      const mapPos =
                        pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)
                          ? { lat: pos.lat, lng: pos.lng }
                          : null;
                      const fix = await resolveAnchorResetCentreCoordinates({
                        thisDeviceId: deviceId,
                        effectiveMonitorDeviceId: effectiveMonitor,
                        mapPosIfThisDeviceIsMonitor: mapPos,
                        allowBrowserGpsFallback: true,
                        signal,
                      });
                      if (!fix) {
                        setAnchorBreachResetError("Could not resolve a position in offline mode.");
                        return;
                      }
                      const merged = {
                        ...anchorCfgRef.current,
                        lat: fix.lat,
                        lng: fix.lng,
                        lastAlertAt: null,
                        lastBearingDeg: null,
                      };
                      setAnchorCfg(merged);
                      setAnchorAlertConfig(merged);
                      clearPresentedAnchorAlertId();
                      setActiveAnchorAlert(null);
                      return;
                    }

                    const effectiveMonitor = effectiveMonitorDeviceIdForHomeMap({
                      thisDeviceId: deviceId,
                      serverMonitorDeviceId: anchorMonitor?.monitorDeviceId,
                      geofenceMonitorDeviceId: anchorCfgRef.current.monitorDeviceId,
                    });
                    const mapPos =
                      pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)
                        ? { lat: pos.lat, lng: pos.lng }
                        : null;
                    const fix = await resolveAnchorResetCentreCoordinates({
                      thisDeviceId: deviceId,
                      effectiveMonitorDeviceId: effectiveMonitor,
                      mapPosIfThisDeviceIsMonitor: mapPos,
                      allowBrowserGpsFallback: false,
                      signal,
                    });
                    if (!fix) {
                      setAnchorBreachResetError(
                        "No monitor GPS on the server yet. Try “This phone’s GPS”, wait for the boat phone to report a fix, or tap Mark seen.",
                      );
                      return;
                    }

                    try {
                      await fetch("/api/anchor/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ seenId }),
                        credentials: "same-origin",
                        signal,
                      });
                      const merged = {
                        ...anchorCfgRef.current,
                        lat: fix.lat,
                        lng: fix.lng,
                        lastAlertAt: null,
                        lastBearingDeg: null,
                      };
                      setAnchorCfg(merged);
                      setAnchorAlertConfig(merged);
                      await fetch("/api/anchor/geofence", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        signal,
                        body: JSON.stringify({
                          lat: fix.lat,
                          lng: fix.lng,
                          lastAlertAt: null,
                          lastBearingDeg: null,
                          remoteAlarmSilencedUntilReset: false,
                        }),
                      });
                    } catch (e) {
                      if (isAnchorResetAbortError(e)) throw e;
                      setAnchorBreachResetError("Could not save. Check your connection and try again.");
                      return;
                    }
                    clearPresentedAnchorAlertId();
                    setActiveAnchorAlert(null);
                  } catch (e) {
                    if (isAnchorResetAbortError(e)) {
                      setAnchorBreachResetError(
                        "Request timed out. Try “This phone’s GPS”, check your connection, or open Anchor alarm.",
                      );
                    }
                  } finally {
                    clear();
                    setAnchorBreachResetBusyKind(null);
                  }
                })();
              }}
              className="h-14 w-full rounded-xl bg-emerald-500 text-base font-bold text-white shadow-lg hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
            >
              {anchorBreachResetBusyKind === "monitor"
                ? "Loading monitor position…"
                : anchorBreachResetBusyKind === "this"
                  ? "Please wait…"
                  : "Reset at monitor position"}
            </button>
            <button
              type="button"
              disabled={anchorBreachResetBusyKind !== null}
              onClick={() => {
                stopAlarm();
                if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                const seenId = activeAnchorAlert.id;
                void (async () => {
                  setAnchorBreachResetError(null);
                  setAnchorBreachResetBusyKind("this");
                  const { signal, clear } = createAnchorResetNetworkAbort(45_000);
                  try {
                    if (ANCHOR_LIVE_APIS_BLOCKED) {
                      const mapPos =
                        pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)
                          ? { lat: pos.lat, lng: pos.lng }
                          : null;
                      const fix = await getGpsFixForAnchorReset(mapPos);
                      if (!fix) {
                        setAnchorBreachResetError("Could not read GPS in offline mode.");
                        return;
                      }
                      const merged = {
                        ...anchorCfgRef.current,
                        lat: fix.lat,
                        lng: fix.lng,
                        lastAlertAt: null,
                        lastBearingDeg: null,
                      };
                      setAnchorCfg(merged);
                      setAnchorAlertConfig(merged);
                      clearPresentedAnchorAlertId();
                      setActiveAnchorAlert(null);
                      return;
                    }

                    const mapPos =
                      pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)
                        ? { lat: pos.lat, lng: pos.lng }
                        : null;
                    const fix = await getGpsFixForAnchorReset(mapPos);
                    if (!fix) {
                      setAnchorBreachResetError(
                        "Could not read GPS on this phone (permission, timeout, or no signal). Allow location for SeaLink, try outdoors, or use Mark seen.",
                      );
                      return;
                    }

                    try {
                      await fetch("/api/anchor/alerts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ seenId }),
                        credentials: "same-origin",
                        signal,
                      });
                      const merged = {
                        ...anchorCfgRef.current,
                        lat: fix.lat,
                        lng: fix.lng,
                        lastAlertAt: null,
                        lastBearingDeg: null,
                      };
                      setAnchorCfg(merged);
                      setAnchorAlertConfig(merged);
                      await fetch("/api/anchor/geofence", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        signal,
                        body: JSON.stringify({
                          lat: fix.lat,
                          lng: fix.lng,
                          lastAlertAt: null,
                          lastBearingDeg: null,
                          remoteAlarmSilencedUntilReset: false,
                        }),
                      });
                    } catch (e) {
                      if (isAnchorResetAbortError(e)) throw e;
                      setAnchorBreachResetError("Could not save. Check your connection and try again.");
                      return;
                    }
                    clearPresentedAnchorAlertId();
                    setActiveAnchorAlert(null);
                  } catch (e) {
                    if (isAnchorResetAbortError(e)) {
                      setAnchorBreachResetError(
                        "Request timed out while saving. Check your connection, try again, or use Mark seen.",
                      );
                    }
                  } finally {
                    clear();
                    setAnchorBreachResetBusyKind(null);
                  }
                })();
              }}
              className="h-14 w-full rounded-xl border-2 border-emerald-300/90 bg-emerald-950/50 text-base font-bold text-emerald-50 shadow-lg hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
            >
              {anchorBreachResetBusyKind === "this" ? "Getting this phone’s GPS…" : "This phone’s GPS"}
            </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={anchorBreachResetBusyKind !== null || ANCHOR_LIVE_APIS_BLOCKED}
                  onClick={() => {
                    stopAlarm();
                    if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                    const seenId = activeAnchorAlert.id;
                    void (async () => {
                      setAnchorBreachResetError(null);
                      setAnchorBreachResetBusyKind("remote_reset");
                      const { signal, clear } = createAnchorResetNetworkAbort(120_000);
                      try {
                        const r = await enqueueAndAwaitAnchorCommand({
                          type: "RESET_ANCHOR",
                          sourceDeviceId: deviceId,
                          signal,
                          onWaitingForBoat: () => setAnchorBreachResetError("Waiting for boat device…"),
                        });
                        if (!r.ok) {
                          setAnchorBreachResetError(r.error);
                          return;
                        }
                        if (!ANCHOR_LIVE_APIS_BLOCKED) {
                          try {
                            await fetch("/api/anchor/alerts", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ seenId }),
                              credentials: "same-origin",
                              signal,
                            });
                          } catch {
                            /* ignore */
                          }
                        }
                        clearPresentedAnchorAlertId();
                        setActiveAnchorAlert(null);
                        setAnchorBreachResetError(null);
                      } finally {
                        clear();
                        setAnchorBreachResetBusyKind(null);
                      }
                    })();
                  }}
                  className="h-14 w-full rounded-xl bg-emerald-500 text-base font-bold text-white shadow-lg hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
                >
                  {anchorBreachResetBusyKind === "remote_reset" ? "Sending to boat…" : "Reset anchor at boat GPS"}
                </button>
                <button
                  type="button"
                  disabled={anchorBreachResetBusyKind !== null || ANCHOR_LIVE_APIS_BLOCKED}
                  onClick={() => {
                    stopAlarm();
                    if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                    const seenId = activeAnchorAlert.id;
                    void (async () => {
                      setAnchorBreachResetError(null);
                      setAnchorBreachResetBusyKind("remote_increase");
                      const { signal, clear } = createAnchorResetNetworkAbort(120_000);
                      try {
                        const r = await enqueueAndAwaitAnchorCommand({
                          type: "INCREASE_RADIUS",
                          meters: 10,
                          sourceDeviceId: deviceId,
                          signal,
                          onWaitingForBoat: () => setAnchorBreachResetError("Waiting for boat device…"),
                        });
                        if (!r.ok) {
                          setAnchorBreachResetError(r.error);
                          return;
                        }
                        if (!ANCHOR_LIVE_APIS_BLOCKED) {
                          try {
                            await fetch("/api/anchor/alerts", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ seenId }),
                              credentials: "same-origin",
                              signal,
                            });
                          } catch {
                            /* ignore */
                          }
                        }
                        clearPresentedAnchorAlertId();
                        setActiveAnchorAlert(null);
                        setAnchorBreachResetError(null);
                      } finally {
                        clear();
                        setAnchorBreachResetBusyKind(null);
                      }
                    })();
                  }}
                  className="h-12 w-full rounded-xl border border-sky-300/80 bg-sky-950/45 text-sm font-bold text-sky-50 hover:bg-sky-900/55 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
                >
                  {anchorBreachResetBusyKind === "remote_increase" ? "Sending…" : "Increase geofence (+10 m)"}
                </button>
                <button
                  type="button"
                  disabled={anchorBreachResetBusyKind !== null || ANCHOR_LIVE_APIS_BLOCKED}
                  onClick={() => {
                    stopAlarm();
                    if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                    const seenId = activeAnchorAlert.id;
                    void (async () => {
                      setAnchorBreachResetError(null);
                      setAnchorBreachResetBusyKind("remote_silence");
                      const { signal, clear } = createAnchorResetNetworkAbort(120_000);
                      try {
                        const r = await enqueueAndAwaitAnchorCommand({
                          type: "SILENCE_UNTIL_RESET",
                          sourceDeviceId: deviceId,
                          signal,
                          onWaitingForBoat: () => setAnchorBreachResetError("Waiting for boat device…"),
                        });
                        if (!r.ok) {
                          setAnchorBreachResetError(r.error);
                          return;
                        }
                        if (!ANCHOR_LIVE_APIS_BLOCKED) {
                          try {
                            await fetch("/api/anchor/alerts", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ seenId }),
                              credentials: "same-origin",
                              signal,
                            });
                          } catch {
                            /* ignore */
                          }
                        }
                        clearPresentedAnchorAlertId();
                        setActiveAnchorAlert(null);
                        setAnchorBreachResetError(null);
                      } finally {
                        clear();
                        setAnchorBreachResetBusyKind(null);
                      }
                    })();
                  }}
                  className="h-12 w-full rounded-xl border border-zinc-400/90 bg-zinc-800/80 text-sm font-bold text-zinc-100 hover:bg-zinc-700/90 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
                >
                  {anchorBreachResetBusyKind === "remote_silence" ? "Sending…" : "Silence until anchor reset"}
                </button>
              </>
            )}
            <button
              type="button"
              disabled={anchorBreachResetBusyKind !== null}
              onClick={() => {
                stopAlarm();
                if (isCapacitorAndroidNative()) void clearNativeAndroidAnchorAlarm();
                if (ANCHOR_LIVE_APIS_BLOCKED) {
                  clearPresentedAnchorAlertId();
                  setActiveAnchorAlert(null);
                  return;
                }
                const id = activeAnchorAlert.id;
                void (async () => {
                  try {
                    await fetch("/api/anchor/alerts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ seenId: id }),
                      credentials: "same-origin",
                    });
                  } catch {
                    /* ignore */
                  }
                  clearPresentedAnchorAlertId();
                  setActiveAnchorAlert(null);
                })();
              }}
              className="h-14 w-full rounded-xl border-2 border-white bg-white/95 text-base font-bold text-red-700 shadow-lg hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
            >
              Mark seen (stop alarm)
            </button>
          </div>
          <p className="bg-black/40 px-4 py-2 text-center text-[11px] text-white/75">
            {breachIsMonitoringDevice ? (
              <>
                <strong className="text-white/85">Reset at monitor position</strong> keeps your radius (e.g. 10&nbsp;m)
                and moves the orange ring to the <strong className="text-white/85">monitoring device’s</strong> latest GPS
                (from the server). <strong className="text-white/85">This phone’s GPS</strong> uses{" "}
                <em className="not-italic text-white/85">this</em> handset instead.{" "}
                <strong className="text-white/85">Mark seen</strong> stops the alarm without moving the ring. Sound stops
                when you dismiss, or after 3 hours if left open.
              </>
            ) : (
              <>
                This handset is <strong className="text-white/85">not</strong> the monitoring device — actions are sent
                as commands to the boat. <strong className="text-white/85">Reset</strong> uses only the boat GPS.{" "}
                <strong className="text-white/85">Silence</strong> mutes remote alerts until the boat resets the anchor.{" "}
                <strong className="text-white/85">Mark seen</strong> stops the alarm here without changing the geofence.
              </>
            )}
          </p>
        </div>
      ) : null}

      {!anchorCompact ? (
        <AnchorAlertModal
          open={anchorOpen}
          onClose={() => setAnchorOpen(false)}
          isAdmin={isAdmin}
          emergencyDisableLiveMapApis={ANCHOR_LIVE_APIS_BLOCKED}
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
            lastBearingDeg: anchorCfg.lastBearingDeg,
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
            if (!ANCHOR_LIVE_APIS_BLOCKED && sharing) {
              void fetch("/api/anchor/geofence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(merged),
              }).catch(() => undefined);
            }
          }}
          onMonitorRolesSaved={(cfg) => setAnchorMonitor(cfg)}
        />
      ) : null}
    </section>
  );
}
