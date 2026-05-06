"use client";

import { dynamicMapLayer } from "esri-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { AttributionControl, MapContainer, TileLayer, useMap } from "react-leaflet";

/** NOAA Maritime Chart Server — ENC cells (US coverage; not a substitute for approved ECDIS). */
export const NOAA_ENC_MAPSERVER =
  "https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer";

const DEFAULT_CENTER: L.LatLngExpression = [39.5, -75.2];
const DEFAULT_ZOOM = 8;

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

  useEffect(() => {
    setLayerError(null);
    const layer = dynamicMapLayer({
      url: NOAA_ENC_MAPSERVER,
      opacity: 1,
      useCors: true,
    });
    const onErr = () => setLayerError("ENC layer could not be loaded from NOAA (network or service).");
    layer.on("error", onErr);
    layer.addTo(map);
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      layer.off("error", onErr);
      map.removeLayer(layer);
    };
  }, [map]);

  return layerError ? (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-[1000] flex justify-center px-2">
      <p className="rounded-lg bg-red-950/90 px-3 py-1.5 text-center text-xs text-red-100 shadow-lg">{layerError}</p>
    </div>
  ) : null;
}

export default function EncNavigationMap() {
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
        <NoaaEncLayer />
      </MapContainer>
    </div>
  );
}
