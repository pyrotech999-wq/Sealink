"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";

type LayerMode = "wind" | "waves" | "rain" | "pressure";
type BaseMapMode = "streets" | "light" | "satellite";

function WmsOverlay({ mode, opacity }: { mode: LayerMode; opacity: number }) {
  const map = useMap();

  useEffect(() => {
    const windUrl =
      "https://pae-paha.pacioos.hawaii.edu/thredds/wms/ncep_global/NCEP_Global_Atmospheric_Model_best.ncd";
    const wavesUrl =
      "https://pae-paha.pacioos.hawaii.edu/thredds/wms/ww3_global/WaveWatch_III_Global_Wave_Model_fmrc.ncd";

    // ncWMS supports vector styling when two layers are provided.
    const wind = L.tileLayer.wms(windUrl, {
      layers: "ugrd10m,vgrd10m",
      styles: "vector",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
    } as any);

    const waves = L.tileLayer.wms(wavesUrl, {
      layers: "Thgt",
      styles: "boxfill/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
    } as any);

    const rain = L.tileLayer.wms(windUrl, {
      layers: "pratesfc",
      styles: "boxfill/occam",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
    } as any);

    const pressure = L.tileLayer.wms(windUrl, {
      layers: "prmslmsl",
      styles: "boxfill/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
    } as any);

    const layer =
      mode === "wind" ? wind : mode === "waves" ? waves : mode === "rain" ? rain : pressure;
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
      map.removeLayer(wind);
      map.removeLayer(waves);
      map.removeLayer(rain);
      map.removeLayer(pressure);
    };
  }, [map, mode, opacity]);

  return null;
}

export function WeatherSeaMap() {
  const [mode, setMode] = useState<LayerMode>("wind");
  const [base, setBase] = useState<BaseMapMode>("satellite");
  const [opacity, setOpacity] = useState(0.75);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let disposed = false;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (disposed) return;
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(next);
        if (!initialCenter) setInitialCenter([next.lat, next.lng]);
      },
      () => {
        /* ignore */
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
    return () => {
      disposed = true;
    };
  }, [initialCenter]);

  const center = useMemo<[number, number]>(() => initialCenter ?? [20, 0], [initialCenter]);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setBase("satellite")}
              className={`h-9 px-3 text-sm font-semibold ${
                base === "satellite"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setBase("streets")}
              className={`h-9 px-3 text-sm font-semibold ${
                base === "streets"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Streets
            </button>
            <button
              type="button"
              onClick={() => setBase("light")}
              className={`h-9 px-3 text-sm font-semibold ${
                base === "light"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Light
            </button>
          </div>

          <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <button
            type="button"
            onClick={() => setMode("wind")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "wind"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Wind
          </button>
          <button
            type="button"
            onClick={() => setMode("waves")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "waves"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Waves
          </button>
          <button
            type="button"
            onClick={() => setMode("rain")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "rain"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Rain
          </button>
          <button
            type="button"
            onClick={() => setMode("pressure")}
            className={`h-9 px-3 text-sm font-semibold ${
              mode === "pressure"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
            }`}
          >
            Pressure
          </button>
        </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Overlay</span>
          <input
            type="range"
            min={0.2}
            max={0.95}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
          <span className="w-10 text-right text-xs text-zinc-500">{Math.round(opacity * 100)}%</span>
        </div>
      </div>

      <div className="h-[min(70vh,620px)] w-full bg-zinc-100 dark:bg-zinc-900">
        <MapContainer
          center={center}
          zoom={pos ? 7 : 2}
          maxZoom={18}
          className="h-full w-full"
          scrollWheelZoom
          attributionControl
        >
          {base === "satellite" ? (
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          ) : base === "light" ? (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
              detectRetina
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
              detectRetina
            />
          )}
          <WmsOverlay mode={mode} opacity={opacity} />
        </MapContainer>
      </div>
      <div className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">Tip:</span> drag/zoom anywhere in the world —
        this map won’t snap back to you. Wind and sea overlays are global model layers.
      </div>
    </div>
  );
}

