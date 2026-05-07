"use client";

import "esri-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { AttributionControl, MapContainer, TileLayer, useMap } from "react-leaflet";

/** NOAA Maritime Chart Server — ENC cells (US coverage; not a substitute for approved ECDIS). */
export const NOAA_ENC_MAPSERVER =
  "https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer";

const DEFAULT_CENTER: L.LatLngExpression = [38, -75];
const DEFAULT_ZOOM = 5;

type Props = {
  /** When set (e.g. from loaded KAP), ENC map matches the same geographic frame as the raster viewer. */
  chartBounds: [[number, number], [number, number]] | null;
  /** Bumps when KAP bounds change so this map refits. */
  fitBoundsNonce?: number;
};

function FitBoundsEnc({
  chartBounds,
  fitBoundsNonce,
}: {
  chartBounds: [[number, number], [number, number]] | null;
  fitBoundsNonce?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (chartBounds) {
      const b = L.latLngBounds(chartBounds[0] as L.LatLngTuple, chartBounds[1] as L.LatLngTuple);
      map.fitBounds(b, { padding: [12, 12], maxZoom: 14, animate: false });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
    }
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [map, chartBounds, fitBoundsNonce]);
  return null;
}

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

function NoaaEncLayer() {
  const map = useMap();
  const [layerError, setLayerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLayerError(null);
    setLoading(true);

    const layer = (L as unknown as { esri?: { tiledMapLayer?: (opts: Record<string, unknown>) => L.Layer } }).esri?.tiledMapLayer?.(
      {
        url: NOAA_ENC_MAPSERVER,
        opacity: 1,
        useCors: true,
        attribution: "NOAA Office of Coast Survey",
      },
    );

    if (!layer) {
      setLoading(false);
      setLayerError("ENC layer could not be initialised (Esri Leaflet plugin missing).");
      return;
    }

    // Leaflet GridLayer events.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gridLayer = layer as any;
    gridLayer.options = gridLayer.options ?? {};
    gridLayer.options.attribution = gridLayer.options.attribution ?? "NOAA Office of Coast Survey";

    // Ensure attribution shows even if the plugin doesn't set it.
    map.attributionControl?.addAttribution("NOAA Office of Coast Survey");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layerWithEvents = layer as any;

    let tileErrorCount = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLoad = () => setLoading(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLoading = () => setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onTileError = () => {
      tileErrorCount += 1;
      if (tileErrorCount >= 2) {
        setLayerError("ENC tiles could not be loaded from NOAA (network or service).");
      }
    };

    layerWithEvents.on("loading", onLoading);
    layerWithEvents.on("load", onLoad);
    layerWithEvents.on("tileerror", onTileError);

    layer.addTo(map);
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      layerWithEvents.off("loading", onLoading);
      layerWithEvents.off("load", onLoad);
      layerWithEvents.off("tileerror", onTileError);
      map.removeLayer(layer);
    };
  }, [map]);

  return (
    <>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-[900] grid place-items-center bg-black/10 dark:bg-black/25">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-100">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-500" />
            Loading NOAA ENC tiles…
          </div>
        </div>
      ) : null}
      {layerError ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center px-2">
          <p className="rounded-lg bg-red-950/90 px-3 py-1.5 text-center text-xs text-red-100 shadow-lg">
            {layerError}
          </p>
        </div>
      ) : null}
    </>
  );
}

export default function EncNavigationMap({ chartBounds, fitBoundsNonce = 0 }: Props) {
  const dark = useHtmlDarkClass();
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
        <TileLayer attribution={baseAttr} url={baseUrl} subdomains={dark ? "abcd" : "abc"} maxZoom={19} opacity={0.35} />
        <MapResizeFix />
        <FitBoundsEnc chartBounds={chartBounds} fitBoundsNonce={fitBoundsNonce} />
        <NoaaEncLayer />
      </MapContainer>
    </div>
  );
}
