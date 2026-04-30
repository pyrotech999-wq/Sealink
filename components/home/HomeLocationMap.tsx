"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { LifeOnSeasDailyModal } from "@/components/home/LifeOnSeasDailyModal";
import { MapBroadcastPanel } from "@/components/home/MapBroadcastPanel";
import { WeatherForecast7Day } from "@/components/home/WeatherForecast7Day";
import {
  markLifeOnSeasPopupShownToday,
  wasLifeOnSeasPopupShownToday,
} from "@/lib/life-on-seas-popup-storage";
import { WindTimelineControls } from "@/components/home/WindTimelineControls";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";
import { recordLastKnownPosition } from "@/lib/map-last-known";
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
  setBackgroundLocationConsent,
  setBoatName,
  setFullName,
  setShowAvatar,
  setShareNearbyPeers,
} from "@/lib/map-profile-storage";

const DEFAULT_CENTER: [number, number] = [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];
const DEFAULT_ZOOM = 6;

/** Statute miles → metres (for ~5 mi “nearby” ring). */
const NEARBY_RING_METRES = 5 * 1609.344;

function clearMapPresence(keepalive = false) {
  void fetch("/api/map/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive,
    body: JSON.stringify({ shareNearby: false }),
  });
}

function buildNearbyPinIcon(avatarDataUrl: string): L.DivIcon {
  const safeAvatar = avatarDataUrl.replace(/'/g, "");
  const inner = avatarDataUrl
    ? `<img src='${safeAvatar}' alt="" width="36" height="36" style="border-radius:9999px;object-fit:cover;display:block;"/>`
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

type NearbyPeer = { id: string; lat: number; lng: number; label: string; avatarDataUrl?: string };

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

function buildPinIcon(boat: string, avatarUrl: string): L.DivIcon {
  const label = escapeHtml(boat || "Your boat");
  const safeAvatar = avatarUrl.replace(/'/g, "");
  const img = avatarUrl
    ? `<img src='${safeAvatar}' alt="" width="40" height="40" style="border-radius:9999px;object-fit:cover;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)"/>`
    : `<div style="width:40px;height:40px;border-radius:9999px;background:#71717a;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#fff">You</div>`;
  const html = `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding-bottom:4px">${img}<span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,.95);font-size:11px;font-weight:600;color:#18181b;box-shadow:0 1px 4px rgba(0,0,0,.15)">${label}</span></div>`;
  return L.divIcon({
    className: "sealink-map-pin",
    html,
    iconSize: [120, 88],
    iconAnchor: [60, 88],
  });
}

export default function HomeLocationMap() {
  const [boatInput, setBoatInput] = useState(() => (typeof window !== "undefined" ? getBoatName() : ""));
  const [avatarUrl] = useState(() => (typeof window !== "undefined" ? getAvatarDataUrl() : ""));
  const [showAvatar, setShowAvatarState] = useState(() =>
    typeof window !== "undefined" ? getShowAvatar() : true,
  );
  const [fullName, setFullNameState] = useState(() => (typeof window !== "undefined" ? getFullName() : ""));
  const [sharing, setSharing] = useState(false);
  const [bgConsent, setBgConsentState] = useState(() =>
    typeof window !== "undefined" ? getBackgroundLocationConsent() : true,
  );
  const [locMode, setLocMode] = useState<string | null>(null);
  const [pos, setPos] = useState<LatLngAcc | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [windSlots, setWindSlots] = useState<HourlyWindSlot[]>([]);
  const [windSlotIdx, setWindSlotIdx] = useState(0);
  const [windLoading, setWindLoading] = useState(true);
  const [windErr, setWindErr] = useState<string | null>(null);
  const [lifeSeasOpen, setLifeSeasOpen] = useState(false);
  const [shareNearby, setShareNearby] = useState(() =>
    typeof window !== "undefined" ? getShareNearbyPeers() : false,
  );
  const [nearbyPeers, setNearbyPeers] = useState<NearbyPeer[]>([]);
  const pollTimer = useRef<number | null>(null);
  const polling = useRef(false);

  const forecastLat = useMemo(
    () => Number((pos?.lat ?? DEFAULT_MAP_CENTER.lat).toFixed(2)),
    [pos?.lat],
  );
  const forecastLng = useMemo(
    () => Number((pos?.lng ?? DEFAULT_MAP_CENTER.lng).toFixed(2)),
    [pos?.lng],
  );

  const stopPolling = useCallback(() => {
    if (pollTimer.current != null && typeof window !== "undefined") {
      window.clearTimeout(pollTimer.current);
    }
    pollTimer.current = null;
    polling.current = false;
  }, []);

  useEffect(() => {
    if (!sharing) {
      stopPolling();
      queueMicrotask(() => setLocMode(null));
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    let disposed = false;

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
        return batteryLow || saveData ? 15 * 60_000 : 4 * 60_000;
      }
      return 60_000;
    };

    const optsFor = (intervalMs: number | null): PositionOptions => {
      const maxAge = intervalMs == null ? 60_000 : Math.min(intervalMs, 15 * 60_000);
      return {
        // Low-power hint: let the browser use Wi‑Fi/cell when it can.
        enableHighAccuracy: false,
        maximumAge: maxAge,
        timeout: 8_000,
      };
    };

    const tick = () => {
      if (disposed) return;
      const intervalMs = calcIntervalMs();
      setMode(intervalMs);
      if (intervalMs == null) {
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
          setGeoError(null);
          setPos({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracyM: Math.min(Math.max(p.coords.accuracy || 0, 8), 1200),
          });
          pollTimer.current = window.setTimeout(tick, intervalMs);
        },
        (e) => {
          polling.current = false;
          if (disposed) return;
          setGeoError(e.message || "Location error");
          pollTimer.current = window.setTimeout(tick, intervalMs);
        },
        optsFor(intervalMs),
      );
    };

    const onVisibility = () => {
      const intervalMs = calcIntervalMs();
      setMode(intervalMs);
      if (intervalMs == null) {
        stopPolling();
        return;
      }
      if (pollTimer.current != null) window.clearTimeout(pollTimer.current);
      pollTimer.current = window.setTimeout(tick, 250);
    };

    const onBattery = () => {
      if (!battery) return;
      batteryLow = !battery.charging && battery.level <= 0.2;
      onVisibility();
    };

    void (async () => {
      if (!nav.getBattery) {
        batteryLow = false;
        saveData = Boolean(nav.connection?.saveData);
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
      }
    })();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    // Start quickly when sharing begins.
    pollTimer.current = window.setTimeout(tick, 250);
    setMode(calcIntervalMs());

    return () => {
      disposed = true;
      stopPolling();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      if (battery) {
        battery.removeEventListener("levelchange", onBattery);
        battery.removeEventListener("chargingchange", onBattery);
      }
    };
  }, [sharing, bgConsent, stopPolling]);

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

  function setSharingOn(on: boolean) {
    if (!on) {
      clearMapPresence();
      setShareNearby(false);
      setShareNearbyPeers(false);
      setNearbyPeers([]);
      setPos(null);
      setGeoError(null);
      setSharing(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not supported in this browser.");
      return;
    }
    setGeoError(null);
    setSharing(true);
  }

  const pinIconVisible = useMemo(
    () => buildPinIcon(boatInput.trim(), showAvatar ? avatarUrl : ""),
    [boatInput, avatarUrl, showAvatar],
  );

  const baseLat = pos?.lat ?? DEFAULT_MAP_CENTER.lat;
  const baseLng = pos?.lng ?? DEFAULT_MAP_CENTER.lng;
  /** Tiny offset north (~1 m) so the wind readout clears labels. */
  const windMarkerLat = pos ? baseLat + 0.000009 : baseLat;
  const windMarkerLng = baseLng;

  const activeWind = windSlots.length ? windSlots[Math.min(windSlotIdx, windSlots.length - 1)] : null;
  const windIcon = useMemo(
    () => (activeWind ? buildWindArrowDivIcon(activeWind.mph, activeWind.dirFromDeg) : null),
    [activeWind],
  );

  useEffect(() => {
    return () => clearMapPresence(true);
  }, []);

  useEffect(() => {
    if (!sharing || !pos || !shareNearby) return;
    const label = fullName.trim() || boatInput.trim() || "Boat";
    const avatarDataUrl = showAvatar ? (avatarUrl || "") : "";
    const pulse = () => {
      void fetch("/api/map/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareNearby: true,
          lat: pos.lat,
          lng: pos.lng,
          label,
          avatarDataUrl,
        }),
      });
    };
    pulse();
    const id = window.setInterval(pulse, 45_000);
    return () => window.clearInterval(id);
  }, [sharing, pos?.lat, pos?.lng, shareNearby, boatInput, fullName, avatarUrl, showAvatar]);

  useEffect(() => {
    if (!sharing || !pos || !shareNearby) {
      queueMicrotask(() => setNearbyPeers([]));
      return;
    }
    const load = () => {
      void (async () => {
        try {
          const r = await fetch(`/api/map/presence?lat=${encodeURIComponent(String(pos.lat))}&lng=${encodeURIComponent(String(pos.lng))}`);
          const d = (await r.json()) as { peers?: NearbyPeer[] };
          setNearbyPeers(Array.isArray(d.peers) ? d.peers : []);
        } catch {
          setNearbyPeers([]);
        }
      })();
    };
    load();
    const id = window.setInterval(load, 25_000);
    return () => window.clearInterval(id);
  }, [sharing, pos?.lat, pos?.lng, shareNearby]);

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

  const center: [number, number] = pos ? [pos.lat, pos.lng] : DEFAULT_CENTER;
  const zoom = pos ? 14 : DEFAULT_ZOOM;

  return (
    <section className="mt-8 w-full space-y-4" aria-labelledby="map-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="map-heading" className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Your map
          </h2>
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            GPS updates while this page is open, including in the background while the tab stays open (you can pause
            that below). Standard browsers cannot keep GPS after you fully quit the browser — use a native app for that,
            or leave a tab open.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLifeSeasOpen(true)}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-teal-300 bg-teal-50 px-4 text-sm font-semibold text-teal-900 shadow-sm hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-100 dark:hover:bg-teal-900/70"
        >
          Life on the seas
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-w-0 flex-col gap-0">
          <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
            <div className="relative h-[min(55vh,420px)] w-full min-h-[280px] bg-zinc-100 dark:bg-zinc-900">
              <MapContainer
                center={center}
                zoom={zoom}
                className="h-full w-full [&_.leaflet-tile-pane]:opacity-90"
                scrollWheelZoom
                attributionControl
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {activeWind && windIcon ? (
                  <Marker
                    key={`wind-${activeWind.at}-${windSlotIdx}`}
                    position={[windMarkerLat, windMarkerLng]}
                    icon={windIcon}
                    zIndexOffset={650}
                  />
                ) : null}
                {pos ? (
                  <>
                    <MapRecenter lat={pos.lat} lng={pos.lng} zoom={14} />
                    <Circle
                      center={[pos.lat, pos.lng]}
                      radius={pos.accuracyM}
                      pathOptions={{
                        color: "#16a34a",
                        fillColor: "#22c55e",
                        fillOpacity: 0.12,
                        weight: 1,
                      }}
                    />
                    {shareNearby ? (
                      <Circle
                        center={[pos.lat, pos.lng]}
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
                        <Popup>
                          <p className="m-0 text-sm font-semibold text-zinc-900">{p.label || "Nearby boat"}</p>
                        </Popup>
                      </Marker>
                    ))}
                    <Marker
                      key={`${boatInput}:${showAvatar ? avatarUrl.slice(0, 40) : "no-avatar"}`}
                      position={[pos.lat, pos.lng]}
                      icon={pinIconVisible}
                      zIndexOffset={750}
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
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">On your pin</p>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Your name (nearby users see this on tap)
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
          <label
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-[11px] leading-snug ${
              sharing
                ? "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200"
                : "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-green-600 disabled:opacity-50"
              checked={showAvatar}
              disabled={!sharing}
              onChange={(e) => persistShowAvatar(e.target.checked)}
            />
            <span>
              <span className="font-semibold">Show profile image on map pin</span>
              <span className="mt-1 block opacity-90">
                Uses the profile photo you added on sign-up/profile. Turn off if you prefer a plain “You” marker.
              </span>
            </span>
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
            <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
              {locMode}
            </p>
          ) : null}

          <label
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-[11px] leading-snug ${
              sharing && pos
                ? "border-blue-200 bg-blue-50/90 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/35 dark:text-blue-100"
                : "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-blue-600 disabled:opacity-50"
              checked={shareNearby}
              disabled={!sharing || !pos}
              onChange={(e) => {
                const on = e.target.checked;
                setShareNearby(on);
                setShareNearbyPeers(on);
                if (!on) clearMapPresence();
              }}
            />
            <span>
              <span className="font-semibold">Show me to nearby SeaLink users (~5 mi)</span>
              <span className="mt-1 block opacity-90">
                Only members who also turn this on appear on your map (blue pins). Your position is refreshed about
                every 45s while this page is open; others drop off after a couple of minutes without a heartbeat.
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-[11px] leading-snug ${
              sharing
                ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                : "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500"
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-400 text-amber-700 disabled:opacity-50"
              checked={bgConsent}
              disabled={!sharing}
              onChange={(e) => {
                const on = e.target.checked;
                setBackgroundLocationConsent(on);
                setBgConsentState(on);
              }}
            />
            <span>
              <span className="font-semibold">Keep updating in the background</span>
              <span className="mt-1 block opacity-90">
                On by default: we keep requesting your position on a slower cadence while this tab stays open, even if
                you switch apps (browser may still throttle GPS). Turn this off to only update while this tab is visible.
                Fully closing the browser stops tracking — this is not a native app.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-4">
        <MapBroadcastPanel
          readLat={pos?.lat ?? DEFAULT_MAP_CENTER.lat}
          readLng={pos?.lng ?? DEFAULT_MAP_CENTER.lng}
          canSend={Boolean(sharing && pos)}
          sendLat={pos?.lat ?? null}
          sendLng={pos?.lng ?? null}
        />
      </div>

      <WeatherForecast7Day lat={pos?.lat ?? null} lng={pos?.lng ?? null} />

      <LifeOnSeasDailyModal
        open={lifeSeasOpen}
        onClose={() => setLifeSeasOpen(false)}
        pinLive={Boolean(sharing && pos)}
        lat={pos?.lat ?? null}
        lng={pos?.lng ?? null}
      />
    </section>
  );
}
