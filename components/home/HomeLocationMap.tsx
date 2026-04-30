"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { LifeOnSeasDailyModal } from "@/components/home/LifeOnSeasDailyModal";
import { AnchorAlertModal } from "@/components/home/AnchorAlertModal";
import { MapBroadcastPanel } from "@/components/home/MapBroadcastPanel";
import { WeatherForecast7Day } from "@/components/home/WeatherForecast7Day";
import {
  markLifeOnSeasPopupShownToday,
  wasLifeOnSeasPopupShownToday,
} from "@/lib/life-on-seas-popup-storage";
import { WindTimelineControls } from "@/components/home/WindTimelineControls";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";
import { recordLastKnownPosition } from "@/lib/map-last-known";
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
  setBackgroundLocationConsent,
  setBoatName,
  setFullName,
  setShowAvatar,
  setShareNearbyPeers,
} from "@/lib/map-profile-storage";
import { getAnchorAlertConfig, setAnchorAlertConfig } from "@/lib/anchor-alert-storage";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";

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
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorCfg, setAnchorCfg] = useState(() =>
    typeof window !== "undefined" ? getAnchorAlertConfig() : getAnchorAlertConfig(),
  );
  const anchorCfgRef = useRef(anchorCfg);
  const [activeAnchorAlert, setActiveAnchorAlert] = useState<{ id: string; message: string; createdAt: string } | null>(
    null,
  );
  const [alarmBlocked, setAlarmBlocked] = useState(false);
  const alarmTimer = useRef<number | null>(null);
  const deviceId = useMemo(() => (typeof window !== "undefined" ? getOrCreateDeviceId() : "server"), []);
  const localDeviceName = useMemo(() => (typeof window !== "undefined" ? getDeviceName() : ""), []);
  const [monitorDeviceLabel, setMonitorDeviceLabel] = useState<string>("");
  const [shareNearby, setShareNearby] = useState(() =>
    typeof window !== "undefined" ? getShareNearbyPeers() : false,
  );
  const [nearbyPeers, setNearbyPeers] = useState<NearbyPeer[]>([]);
  const pollTimer = useRef<number | null>(null);
  const polling = useRef(false);
  const lastAnchorReportAt = useRef<number>(0);

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

  // If monitoring another device, pull its latest fix periodically.
  useEffect(() => {
    if (!sharing) return;
    if (!anchorCfg.monitorDeviceId || anchorCfg.monitorDeviceId === "this") {
      queueMicrotask(() => setMonitoredFix(null));
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const r = await fetch("/api/anchor/devices");
        const d = (await r.json()) as { devices?: { deviceId: string; lastLat: number | null; lastLng: number | null; lastFixAt: string | null }[] };
        const row = d.devices?.find((x) => x.deviceId === anchorCfg.monitorDeviceId);
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
  }, [sharing, anchorCfg.monitorDeviceId]);

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
          body: JSON.stringify({ message: msg }),
          keepalive: true,
        });
        if (!r.ok) {
          if (!activeAnchorAlert) {
            setActiveAnchorAlert({ id: `local-${now}`, message: msg, createdAt: new Date(now).toISOString() });
          }
        }
      } catch {
        if (!activeAnchorAlert) {
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
        const d = (await r.json()) as { alerts?: { id: string; message: string; createdAt: string }[] };
        const list = Array.isArray(d.alerts) ? d.alerts : [];
        if (disposed) return;
        if (!activeAnchorAlert && list.length) setActiveAnchorAlert(list[0]!);
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [sharing, activeAnchorAlert]);

  // Display label for which device is being monitored.
  useEffect(() => {
    if (!anchorCfg.armed) {
      setMonitorDeviceLabel("");
      return;
    }
    if (!anchorCfg.monitorDeviceId || anchorCfg.monitorDeviceId === "this") {
      setMonitorDeviceLabel(localDeviceName?.trim() ? `This device (${localDeviceName.trim()})` : "This device");
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
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
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
  }

  // In-app urgent alarm while alert is visible (until Seen).
  useEffect(() => {
    if (!activeAnchorAlert) {
      stopAlarm();
      setAlarmBlocked(false);
      return;
    }
    void startAlarm();
    return () => stopAlarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnchorAlert?.id]);

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
        // Anchor monitoring: tighter background interval (battery trade-off).
        if (anchorCfg.armed) return 180_000;
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
      <div className="relative z-50 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
        <div className="flex flex-wrap gap-2 pointer-events-auto">
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
          </div>
          <button
            type="button"
            onClick={() => setLifeSeasOpen(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-teal-300 bg-teal-50 px-4 text-sm font-semibold text-teal-900 shadow-sm hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-100 dark:hover:bg-teal-900/70"
          >
            Life on the seas
          </button>
        </div>
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
