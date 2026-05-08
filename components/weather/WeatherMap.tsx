"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttributionControl, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

type Overlay = "waves" | "wave_direction" | "wind" | "wind_direction" | "rain" | "pressure";

type GridPoint = {
  lat: number;
  lng: number;
  waveHeightM?: number | null;
  waveDirDeg?: number | null;
  windSpeedMs?: number | null;
  windDirDeg?: number | null;
  precipMm?: number | null;
  pressureHpa?: number | null;
};

type ApiOk = { ok: true; points: GridPoint[]; fetchedAtIso: string };

const DEFAULT_ZOOM = 9;

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const emit = () => onZoom(map.getZoom());
    emit();
    map.on("zoomend", emit);
    return () => {
      map.off("zoomend", emit);
    };
  }, [map, onZoom]);
  return null;
}

function wavesColor(m: number): string {
  const t = clamp(m / 6, 0, 1);
  const stops = [
    [0, 80, 220],
    [0, 200, 255],
    [60, 220, 140],
    [240, 220, 80],
    [245, 160, 60],
    [220, 60, 60],
  ] as const;
  const idx = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const localT = t * (stops.length - 1) - idx;
  const a = stops[idx]!;
  const b = stops[idx + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgba(${r},${g},${bl},0.75)`;
}

function arrowIcon(deg: number, color: string): L.DivIcon {
  const rot = Number.isFinite(deg) ? deg : 0;
  const html = `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:18px solid ${color};transform:rotate(${rot}deg);transform-origin:50% 70%;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))"></div>`;
  return L.divIcon({ className: "sealink-wx-arrow", html, iconSize: [18, 18], iconAnchor: [9, 9] });
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const did = useRef(false);
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!did.current) {
      did.current = true;
      map.setView([lat, lng], Math.max(map.getZoom(), DEFAULT_ZOOM));
      return;
    }
    map.panTo([lat, lng], { animate: true, duration: 0.35 });
  }, [lat, lng, map]);
  return null;
}

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function WeatherMap() {
  const [overlay, setOverlay] = useState<Overlay>("waves");
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiOk | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [lastRefreshedAtMs, setLastRefreshedAtMs] = useState(0);
  const [cooldownUntilMs, setCooldownUntilMs] = useState(0);
  const nowMsRef = useRef(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      nowMsRef.current = Date.now();
      // force rerender for labels
      setLastRefreshedAtMs((x) => x);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoErr("Geolocation not supported.");
      return;
    }
    let disposed = false;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (disposed) return;
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy ?? 9999 };
        setGeoErr(null);
        setPos((prev) => {
          if (!prev) return next;
          // Meaningful move: ~250m
          if (distM(prev, next) < 250) return prev;
          return next;
        });
      },
      (e) => {
        if (!disposed) setGeoErr(e.message || "Could not read location.");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const canRefresh = useMemo(() => Date.now() >= cooldownUntilMs, [cooldownUntilMs, lastRefreshedAtMs]);

  const refresh = useCallback(async () => {
    if (!pos) return;
    if (!canRefresh) return;
    setCooldownUntilMs(Date.now() + 10_000); // prevent spam clicks
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        lat: String(pos.lat),
        lng: String(pos.lng),
        overlay,
      });
      const r = await fetch(`/api/weather/map-grid?${qs.toString()}`, { cache: "no-store" });
      const j = (await r.json()) as ApiOk | { error?: string };
      if (!r.ok || !("ok" in j)) throw new Error((j as { error?: string }).error || "Weather fetch failed");
      setData(j as ApiOk);
      setLastRefreshedAtMs(Date.now());
    } catch (e) {
      // keep old data visible
      setGeoErr(e instanceof Error ? e.message : "Weather fetch failed");
    } finally {
      setLoading(false);
      setCooldownUntilMs(Date.now() + 1500);
    }
  }, [pos?.lat, pos?.lng, overlay, canRefresh]);

  // Fetch only on overlay change or meaningful location change (no render spam).
  useEffect(() => {
    if (!pos) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, pos?.lat, pos?.lng]);

  const lastLabel = useMemo(() => {
    if (!lastRefreshedAtMs) return "";
    const s = Math.max(0, Math.floor((nowMsRef.current - lastRefreshedAtMs) / 1000));
    if (s < 10) return "Last refreshed just now";
    if (s < 60) return `Last refreshed ${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `Last refreshed ${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `Last refreshed ${h}h ago`;
    const d = Math.floor(h / 24);
    return `Last refreshed ${d}d ago`;
  }, [lastRefreshedAtMs]);

  const points = data?.points ?? [];
  const center: [number, number] = pos ? [pos.lat, pos.lng] : [51.505, -0.09];

  // Increase vector density as the user zooms in (more local detail).
  // The API grid is fairly dense; thinning avoids clutter at low zoom.
  const vectorStride = useMemo(() => {
    if (zoom >= 12) return 1;
    if (zoom >= 11) return 2;
    if (zoom >= 10) return 3;
    if (zoom >= 9) return 4;
    if (zoom >= 8) return 6;
    return 8;
  }, [zoom]);

  const vectorPoints = useMemo(() => {
    if (vectorStride <= 1) return points;
    return points.filter((_, i) => i % vectorStride === 0);
  }, [points, vectorStride]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Weather</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Open‑Meteo overlays near your location. No nearby users here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {(
              [
                ["waves", "Waves"],
                ["wave_direction", "Wave dir"],
                ["wind", "Wind"],
                ["wind_direction", "Wind dir"],
                ["rain", "Rain"],
                ["pressure", "Pressure"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOverlay(k)}
                className={`h-9 px-3 text-xs font-semibold ${
                  overlay === k
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!pos || loading}
            onClick={() => void refresh()}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            {loading ? "Refreshing…" : "Refresh weather"}
          </button>
        </div>
      </div>

      {lastLabel ? <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{lastLabel}</p> : null}
      {geoErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          {geoErr}
        </p>
      ) : null}

      <div className="min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="h-[min(70vh,640px)] w-full bg-zinc-100 dark:bg-zinc-900">
          <MapContainer center={center} zoom={DEFAULT_ZOOM} className="h-full w-full" scrollWheelZoom attributionControl={false}>
            <AttributionControl position="bottomright" prefix={false} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ZoomWatcher onZoom={setZoom} />
            {pos ? <MapRecenter lat={pos.lat} lng={pos.lng} /> : null}
            {pos ? (
              <Marker position={[pos.lat, pos.lng]}>
                <Popup>
                  <p className="m-0 text-sm font-semibold">You</p>
                  <p className="m-0 text-xs text-zinc-600">GPS ±{Math.round(pos.accuracyM)}m</p>
                </Popup>
              </Marker>
            ) : null}

            {overlay === "waves"
              ? points.map((p, i) => {
                  const h = p.waveHeightM ?? null;
                  if (h == null) return null;
                  const color = wavesColor(h);
                  return (
                    <CircleMarker
                      key={`w-${i}`}
                      center={[p.lat, p.lng]}
                      radius={10}
                      pathOptions={{ color: "rgba(255,255,255,0.25)", weight: 1, fillColor: color, fillOpacity: 0.9 }}
                    >
                      <Popup>
                        <p className="m-0 text-sm font-semibold">Wave height</p>
                        <p className="m-0 text-xs text-zinc-600">{h.toFixed(1)} m</p>
                      </Popup>
                    </CircleMarker>
                  );
                })
              : null}

            {overlay === "wave_direction"
              ? vectorPoints.map((p, i) => {
                  const deg = p.waveDirDeg ?? null;
                  const h = p.waveHeightM ?? null;
                  // Open-Meteo marine can return direction-like values over land; only draw if waves are meaningful.
                  if (deg == null || h == null || h < 0.05) return null;
                  return (
                    <Marker
                      key={`wd-${i}`}
                      position={[p.lat, p.lng]}
                      icon={arrowIcon(deg, "rgba(59,130,246,0.95)")}
                    />
                  );
                })
              : null}

            {overlay === "wind"
              ? vectorPoints.map((p, i) => {
                  const ms = p.windSpeedMs ?? null;
                  const deg = p.windDirDeg ?? null;
                  if (ms == null || deg == null) return null;
                  const c = ms >= 12 ? "rgba(239,68,68,0.95)" : ms >= 7 ? "rgba(245,158,11,0.95)" : "rgba(16,185,129,0.95)";
                  return (
                    <Marker
                      key={`wsp-${i}`}
                      position={[p.lat, p.lng]}
                      icon={arrowIcon(deg, c)}
                    />
                  );
                })
              : null}

            {overlay === "wind_direction"
              ? vectorPoints.map((p, i) => {
                  const deg = p.windDirDeg ?? null;
                  if (deg == null) return null;
                  return (
                    <Marker
                      key={`wdir-${i}`}
                      position={[p.lat, p.lng]}
                      icon={arrowIcon(deg, "rgba(16,185,129,0.95)")}
                    />
                  );
                })
              : null}
          </MapContainer>
        </div>

        {(overlay === "rain" || overlay === "pressure") && points.length ? (
          <div className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
            <p className="m-0 font-semibold">{overlay === "rain" ? "Precipitation (sample grid)" : "Pressure (sample grid)"}</p>
            <p className="m-0 mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Summary panel (simple v1). Switch overlays to see markers/arrows.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {points.slice(0, 6).map((p, i) => (
                <span key={`s-${i}`} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] dark:border-zinc-800 dark:bg-zinc-950">
                  {overlay === "rain"
                    ? `${(p.precipMm ?? 0).toFixed(1)} mm`
                    : `${Math.round(p.pressureHpa ?? 0)} hPa`}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

