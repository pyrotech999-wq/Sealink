"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Circle,
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Rectangle,
  TileLayer,
  useMap,
} from "react-leaflet";

// TODO: Tide / weather overlays — compositor layer above chart raster (GRIB or tile service).
// TODO: GPS vessel overlay — Leaflet marker synced to watchPosition with COG/SOG styling.
// TODO: Offline chart cache — persist parsed metadata + extracted bitmap in IndexedDB / Capacitor filesystem.

type Props = {
  /** [[south, west], [north, east]] */
  chartBounds: [[number, number], [number, number]] | null;
  /** Placeholder or future decoded raster URL (object URL / data URL). */
  overlayUrl: string | null;
  overlayOpacity?: number;
  /** When true, draw georeferenced image overlay (placeholder until raster decode exists). */
  showRasterOverlay: boolean;
  /** Bumps when chart bounds change so the map refits (e.g. new KAP load). */
  fitBoundsNonce?: number;
  /** Temporary debug: red stroke around chartBounds. */
  showDebugBounds?: boolean;
};

function useHtmlDarkClass(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

function chartPlaceholderDataUrl(dark: boolean): string {
  const bg = dark ? "%230f172a" : "%23f1f5f9";
  const stroke = dark ? "%2334d3999" : "%2310b98155";
  const label = dark ? "%2394a3b8" : "%23334155";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="100%" height="100%" fill="${bg}"/><defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${stroke}" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(%23g)"/><text x="320" y="300" text-anchor="middle" fill="${label}" font-size="20" font-family="system-ui,sans-serif">Georeferenced chart</text><text x="320" y="334" text-anchor="middle" fill="${label}" font-size="14" font-family="system-ui,sans-serif">Raster extraction pending</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function FitBoundsChart({
  chartBounds,
  fitBoundsNonce,
}: {
  chartBounds: [[number, number], [number, number]] | null;
  fitBoundsNonce?: number;
}) {
  const map = useMap();
  useEffect(() => {
    const b = chartBounds
      ? L.latLngBounds(chartBounds[0] as L.LatLngTuple, chartBounds[1] as L.LatLngTuple)
      : L.latLngBounds([26, -18], [48, 40]);
    map.fitBounds(b, { padding: [12, 12], maxZoom: 14, animate: false });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [map, chartBounds, fitBoundsNonce]);
  return null;
}

function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => window.setTimeout(() => map.invalidateSize(), 0);
    window.addEventListener("orientationchange", fix);
    window.addEventListener("resize", fix);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", fix);
    return () => {
      window.removeEventListener("orientationchange", fix);
      window.removeEventListener("resize", fix);
      vv?.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}

function UserLocationLayer({
  enabled,
  onStatus,
}: {
  enabled: boolean;
  onStatus: (s: { ok: boolean; message: string }) => void;
}) {
  const map = useMap();
  const watchIdRef = useRef<number | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracyM: number } | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setPos(null);
      return;
    }

    if (!("geolocation" in navigator)) {
      onStatus({ ok: false, message: "Geolocation is not available in this browser." });
      return;
    }

    onStatus({ ok: true, message: "Requesting location…" });
    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        const accuracyM = p.coords.accuracy ?? 0;
        setPos({ lat, lng, accuracyM });
        onStatus({ ok: true, message: `Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}` });
      },
      (err) => {
        onStatus({ ok: false, message: err.message || "Could not get your location." });
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, onStatus]);

  useEffect(() => {
    if (!enabled || !pos) return;
    map.panTo([pos.lat, pos.lng], { animate: true });
  }, [enabled, map, pos?.lat, pos?.lng]);

  if (!enabled || !pos) return null;

  return (
    <>
      {pos.accuracyM > 0 ? (
        <Circle
          center={[pos.lat, pos.lng]}
          radius={pos.accuracyM}
          pathOptions={{ color: "#3b82f6", weight: 1, fillColor: "#3b82f6", fillOpacity: 0.12 }}
        />
      ) : null}
      <CircleMarker
        center={[pos.lat, pos.lng]}
        radius={6}
        pathOptions={{ color: "#1d4ed8", weight: 2, fillColor: "#60a5fa", fillOpacity: 0.95 }}
      />
    </>
  );
}

/** When no chart bounds yet: central Mediterranean / southern Europe (not a fake “chart” box). */
const DEFAULT_CENTER: L.LatLngExpression = [37.5, 14];
const DEFAULT_ZOOM = 5;

function effectiveOverlayOpacity(overlayOpacity: number | undefined): number {
  if (overlayOpacity == null || overlayOpacity === 0 || Number.isNaN(overlayOpacity)) return 0.85;
  return overlayOpacity;
}

export default function NavigationChartsMap({
  chartBounds,
  overlayUrl,
  overlayOpacity,
  showRasterOverlay,
  fitBoundsNonce = 0,
  showDebugBounds = true,
}: Props) {
  const dark = useHtmlDarkClass();
  const placeholderUrl = useMemo(() => chartPlaceholderDataUrl(dark), [dark]);
  const imageUrl = overlayUrl ?? placeholderUrl;
  const opacity = effectiveOverlayOpacity(overlayOpacity);
  const [locEnabled, setLocEnabled] = useState(false);
  const [locStatus, setLocStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const onLocationToggle = useCallback(() => {
    setLocStatus(null);
    setLocEnabled((v) => !v);
  }, []);

  const latLngBounds = useMemo(() => {
    if (!chartBounds) return L.latLngBounds([26, -18], [48, 40]);
    const [[s, w], [n, e]] = chartBounds;
    return L.latLngBounds([s, w], [n, e]);
  }, [chartBounds]);

  const baseUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const baseAttr = dark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  return (
    <div className="relative isolate h-[min(58dvh,520px)] w-full min-h-[280px] overflow-hidden rounded-2xl border border-zinc-200 ring-1 ring-zinc-200/80 dark:border-zinc-700 dark:ring-zinc-800 [&_.leaflet-control-attribution]:max-w-[min(100%,calc(100vw-2rem))] [&_.leaflet-control-attribution]:whitespace-normal [&_.leaflet-control-attribution]:text-[10px]">
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
        <button
          type="button"
          onClick={onLocationToggle}
          className="pointer-events-auto inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 px-3 text-xs font-semibold text-zinc-900 shadow-sm backdrop-blur hover:bg-white dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          {locEnabled ? "Stop showing my location" : "Show my location"}
        </button>
        {locStatus ? (
          <div
            className={`pointer-events-none rounded-lg border px-2 py-1 text-[11px] backdrop-blur ${
              locStatus.ok
                ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/35 dark:text-emerald-100"
                : "border-red-200/80 bg-red-50/80 text-red-950 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-100"
            }`}
            role="status"
            aria-live="polite"
          >
            {locStatus.message}
          </div>
        ) : null}
      </div>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full bg-zinc-900"
        scrollWheelZoom
        attributionControl={false}
      >
        <AttributionControl position="bottomright" prefix={false} />
        <TileLayer attribution={baseAttr} url={baseUrl} subdomains={dark ? "abcd" : "abc"} maxZoom={19} />
        {!dark ? (
          <TileLayer
            attribution='Sea marks: <a href="https://openseamap.org">OpenSeaMap</a>'
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            opacity={0.65}
            maxZoom={18}
          />
        ) : null}
        <MapResizeFix />
        <FitBoundsChart chartBounds={chartBounds} fitBoundsNonce={fitBoundsNonce} />
        <UserLocationLayer enabled={locEnabled} onStatus={setLocStatus} />
        {chartBounds && showDebugBounds ? (
          <Rectangle
            bounds={latLngBounds}
            pathOptions={{
              color: "#ef4444",
              weight: 2,
              fillOpacity: 0,
              dashArray: "6 6",
            }}
          />
        ) : null}
        {showRasterOverlay ? (
          <ImageOverlay
            key={imageUrl}
            url={imageUrl}
            bounds={latLngBounds}
            opacity={opacity}
            interactive={false}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
