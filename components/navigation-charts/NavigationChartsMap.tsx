"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { AttributionControl, ImageOverlay, MapContainer, TileLayer, useMap } from "react-leaflet";

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

function FitBoundsChart({ chartBounds }: { chartBounds: [[number, number], [number, number]] | null }) {
  const map = useMap();
  useEffect(() => {
    const b = chartBounds
      ? L.latLngBounds(chartBounds[0] as L.LatLngTuple, chartBounds[1] as L.LatLngTuple)
      : L.latLngBounds([40, -12], [58, 8]);
    map.fitBounds(b, { padding: [12, 12], maxZoom: 14, animate: false });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [map, chartBounds]);
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

const DEFAULT_CENTER: L.LatLngExpression = [49.5, -4.5];
const DEFAULT_ZOOM = 6;

export default function NavigationChartsMap({
  chartBounds,
  overlayUrl,
  overlayOpacity = 0.55,
  showRasterOverlay,
}: Props) {
  const dark = useHtmlDarkClass();
  const placeholderUrl = useMemo(() => chartPlaceholderDataUrl(dark), [dark]);
  const imageUrl = overlayUrl ?? placeholderUrl;

  const latLngBounds = useMemo(() => {
    if (!chartBounds) return L.latLngBounds([40, -12], [58, 8]);
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
        <FitBoundsChart chartBounds={chartBounds} />
        {showRasterOverlay ? (
          <ImageOverlay
            key={imageUrl}
            url={imageUrl}
            bounds={latLngBounds}
            opacity={overlayOpacity}
            interactive={false}
          />
        ) : null}
      </MapContainer>
    </div>
  );
}
