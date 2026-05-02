"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { startTransition, useEffect, useMemo, useState } from "react";
import { AttributionControl, MapContainer, ScaleControl, TileLayer, useMap } from "react-leaflet";

type LayerMode = "wind" | "waves" | "rain" | "pressure";
type BaseMapMode = "streets" | "light" | "satellite";

type OpenMeteoBlock = {
  latitude?: number;
  longitude?: number;
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
    wave_height?: number[];
  };
};

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/** Cap Stormglass point calls per map move (same key as tide STORMGLASS_API_KEY). */
const STORMGLASS_GRID_CAP = 48;

function wavesColor(m: number): string {
  // 0..6m -> blue->cyan->green->yellow->orange->red
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
  return `rgba(${r},${g},${bl},0.68)`;
}

function windColor(ms: number, alpha = 0.55): string {
  // Windy-ish scale: low=blue -> cyan -> green -> yellow -> orange -> red -> magenta.
  const t = clamp(ms / 30, 0, 1);
  const stops = [
    [40, 90, 255],
    [0, 200, 255],
    [60, 220, 140],
    [240, 220, 80],
    [245, 160, 60],
    [235, 80, 70],
    [190, 70, 210],
  ] as const;
  const idx = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const localT = t * (stops.length - 1) - idx;
  const a = stops[idx]!;
  const b = stops[idx + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgba(${r},${g},${bl},${alpha})`;
}

function Legend({ mode }: { mode: LayerMode }) {
  const windBase =
    "https://pae-paha.pacioos.hawaii.edu/thredds/wms/ncep_global/NCEP_Global_Atmospheric_Model_best.ncd";
  const legendImg =
    mode === "wind"
      ? null
      : mode === "rain"
        ? `${windBase}?REQUEST=GetLegendGraphic&LAYER=pratesfc&PALETTE=occam`
        : mode === "pressure"
          ? `${windBase}?REQUEST=GetLegendGraphic&LAYER=prmslmsl&PALETTE=jet`
          : null;

  if (mode === "waves") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">Legend · Wave height (m)</p>
        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-3 w-full rounded-full border border-zinc-200 dark:border-zinc-800"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,80,220,0.68), rgba(0,200,255,0.68), rgba(60,220,140,0.68), rgba(240,220,80,0.68), rgba(245,160,60,0.68), rgba(220,60,60,0.68))",
            }}
          />
          <span className="w-8 text-right">6+</span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>0</span>
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5</span>
          <span>6m+</span>
        </div>
        <p className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          Base map stays Esri; wave heights use Stormglass when{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">STORMGLASS_API_KEY</code> is set, with Open‑Meteo
          Marine filling gaps. Without a key, the overlay is Open‑Meteo only.
        </p>
      </div>
    );
  }

  if (mode === "wind") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">Legend · Wind (ECMWF IFS)</p>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          Particles show flow direction; colour shows speed. The base map stays Esri tiles (Leaflet); only the wind
          overlay comes from Stormglass or Open‑Meteo. With a Stormglass server key, wind is sampled from Stormglass
          when the API returns enough points; otherwise the server fills in with Open‑Meteo.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-3 w-full rounded-full border border-zinc-200 dark:border-zinc-800"
            style={{
              background:
                "linear-gradient(90deg, rgba(40,90,255,0.75), rgba(0,200,255,0.75), rgba(60,220,140,0.75), rgba(240,220,80,0.75), rgba(245,160,60,0.75), rgba(235,80,70,0.75), rgba(190,70,210,0.75))",
            }}
          />
          <span className="w-10 text-right">30</span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>0</span>
          <span>5</span>
          <span>10</span>
          <span>15</span>
          <span>20</span>
          <span>25</span>
          <span>30m/s</span>
        </div>
      </div>
    );
  }

  if (!legendImg) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">
        Legend · {mode === "rain" ? "Rain" : "Pressure"}
      </p>
      <img
        src={legendImg}
        alt=""
        className="mt-2 max-w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
      />
    </div>
  );
}

type WindPoint = { lat: number; lng: number; u: number; v: number };
type WindSamplePx = { x: number; y: number; u: number; v: number; s: number };

function WindParticlesOverlay({
  enabled,
  timeIso,
  opacity,
  motionScale,
}: {
  enabled: boolean;
  timeIso: string;
  opacity: number;
  /** 1 = normal speed, <1 = slower motion while timeline paused */
  motionScale: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;

    const pane = map.getPanes().overlayPane;
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "400";
    pane.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return () => canvas.remove();

    let disposed = false;
    let raf = 0;
    let particles: { x: number; y: number; age: number }[] = [];
    let field: WindPoint[] = [];
    let fieldPx: WindSamplePx[] = [];
    let lastFetchKey = "";
    let lastT = 0;

    const sizeCanvas = () => {
      const size = map.getSize();
      canvas.width = Math.max(1, Math.floor(size.x * (window.devicePixelRatio || 1)));
      canvas.height = Math.max(1, Math.floor(size.y * (window.devicePixelRatio || 1)));
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    };

    const reseed = () => {
      const size = map.getSize();
      // Lower density than before (less clutter), but still “Windy-like” at typical viewport sizes.
      const count = clamp(Math.round((size.x * size.y) / 14000), 520, 1700);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * size.x,
        y: Math.random() * size.y,
        age: Math.random() * 80,
      }));
    };

    const rebuildFieldPx = () => {
      if (!field.length) {
        fieldPx = [];
        return;
      }
      fieldPx = field
        .map((p) => {
          const pt = map.latLngToContainerPoint(L.latLng(p.lat, p.lng));
          const s = Math.sqrt(p.u * p.u + p.v * p.v);
          return { x: pt.x, y: pt.y, u: p.u, v: p.v, s };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    };

    const fetchField = async () => {
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const size = map.getSize();

      // Sample grid in view, cap to keep query string reasonable.
      let cols: number = clamp(Math.round(size.x / 80), 10, 24);
      let rows: number = clamp(Math.round(size.y / 80), 8, 20);
      const MAX_SAMPLES = 180;
      while (cols * rows > MAX_SAMPLES) {
        if (cols >= rows) cols -= 1;
        else rows -= 1;
      }

      const lats: number[] = [];
      const lngs: number[] = [];
      for (let y = 0; y < rows; y++) {
        const fy = rows === 1 ? 0.5 : y / (rows - 1);
        const lat = sw.lat + (ne.lat - sw.lat) * fy;
        for (let x = 0; x < cols; x++) {
          const fx = cols === 1 ? 0.5 : x / (cols - 1);
          const lng = sw.lng + (ne.lng - sw.lng) * fx;
          lats.push(Number(lat.toFixed(4)));
          lngs.push(Number(lng.toFixed(4)));
        }
      }

      const key = `${sw.lat.toFixed(2)},${sw.lng.toFixed(2)},${ne.lat.toFixed(2)},${ne.lng.toFixed(2)}|${timeIso}|${cols}x${rows}`;
      if (key === lastFetchKey) return;
      lastFetchKey = key;

      const gridPoints = lats.map((lat, i) => ({ lat, lng: lngs[i]! }));

      try {
        const sgRes = await fetch("/api/weather/stormglass-grid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeIso,
            layer: "wind",
            points: gridPoints.slice(0, STORMGLASS_GRID_CAP),
          }),
        });
        if (sgRes.ok) {
          const sg = (await sgRes.json()) as {
            ok?: boolean;
            points?: { lat: number; lng: number; windSpeed?: number; windDirection?: number }[];
          };
          if (sg.ok && Array.isArray(sg.points) && sg.points.length) {
            const next: WindPoint[] = [];
            for (const p of sg.points) {
              const spd = p.windSpeed;
              const dir = p.windDirection;
              if (typeof spd !== "number" || typeof dir !== "number" || !Number.isFinite(spd) || !Number.isFinite(dir)) {
                continue;
              }
              const rad = ((dir + 180) * Math.PI) / 180;
              const u = spd * Math.sin(rad);
              const v = spd * Math.cos(rad);
              next.push({ lat: p.lat, lng: p.lng, u, v });
            }
            if (next.length) {
              field = next;
              rebuildFieldPx();
              return;
            }
          }
        }
      } catch {
        /* fall through to Open‑Meteo */
      }

      const api = new URL("https://api.open-meteo.com/v1/forecast");
      api.searchParams.set("latitude", lats.join(","));
      api.searchParams.set("longitude", lngs.join(","));
      api.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
      api.searchParams.set("models", "ecmwf_ifs");
      api.searchParams.set("forecast_days", "5");
      api.searchParams.set("timezone", "GMT");
      api.searchParams.set("wind_speed_unit", "ms");
      api.searchParams.set("cell_selection", "nearest");

      const r = await fetch(api.toString(), { cache: "no-store" });
      if (!r.ok) return;
      const d: unknown = await r.json();
      const blocks: OpenMeteoBlock[] = Array.isArray(d)
        ? (d as OpenMeteoBlock[])
        : typeof d === "object" && d !== null && Array.isArray((d as OpenMeteoBlock).hourly?.time)
          ? [d as OpenMeteoBlock]
          : [];
      if (!blocks.length) return;
      const times = blocks[0]?.hourly?.time as string[] | undefined;
      if (!times?.length) return;

      const targetMs = new Date(timeIso).getTime();
      let idx = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < times.length; i++) {
        const ms = new Date(times[i]!).getTime();
        const dist = Math.abs(ms - targetMs);
        if (dist < best) {
          best = dist;
          idx = i;
        }
      }

      const next: WindPoint[] = [];
      for (const b of blocks) {
        const usedLat = typeof b?.latitude === "number" ? b.latitude : null;
        const usedLng = typeof b?.longitude === "number" ? b.longitude : null;
        const spdArr = b?.hourly?.wind_speed_10m as number[] | undefined;
        const dirArr = b?.hourly?.wind_direction_10m as number[] | undefined;
        const spd = typeof spdArr?.[idx] === "number" ? spdArr[idx] : NaN;
        const dir = typeof dirArr?.[idx] === "number" ? dirArr[idx] : NaN;
        if (!Number.isFinite(spd) || !Number.isFinite(dir) || usedLat == null || usedLng == null) continue;
        // Direction is "from" degrees; convert to math heading.
        const rad = ((dir + 180) * Math.PI) / 180;
        const u = spd * Math.sin(rad);
        const v = spd * Math.cos(rad);
        next.push({ lat: usedLat, lng: usedLng, u, v });
      }

      // If the multi-point request produced no usable samples (can happen due to API hiccups),
      // fall back to a single-point forecast at map center so the layer remains visible.
      if (!next.length) {
        const c = map.getCenter();
        const one = new URL("https://api.open-meteo.com/v1/forecast");
        one.searchParams.set("latitude", String(c.lat));
        one.searchParams.set("longitude", String(c.lng));
        one.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
        one.searchParams.set("models", "ecmwf_ifs");
        one.searchParams.set("forecast_days", "5");
        one.searchParams.set("timezone", "GMT");
        one.searchParams.set("wind_speed_unit", "ms");
        one.searchParams.set("cell_selection", "nearest");
        try {
          const r1 = await fetch(one.toString(), { cache: "no-store" });
          if (r1.ok) {
            const d1: unknown = await r1.json();
            const b1 = d1 as OpenMeteoBlock;
            const t1 = b1?.hourly?.time as string[] | undefined;
            const spdArr1 = b1?.hourly?.wind_speed_10m as number[] | undefined;
            const dirArr1 = b1?.hourly?.wind_direction_10m as number[] | undefined;
            if (t1?.length && spdArr1?.length && dirArr1?.length) {
              const targetMs1 = new Date(timeIso).getTime();
              let idx1 = 0;
              let best1 = Number.POSITIVE_INFINITY;
              for (let i = 0; i < t1.length; i++) {
                const ms = new Date(t1[i]!).getTime();
                const dist = Math.abs(ms - targetMs1);
                if (dist < best1) {
                  best1 = dist;
                  idx1 = i;
                }
              }
              const spd = typeof spdArr1[idx1] === "number" ? spdArr1[idx1] : NaN;
              const dir = typeof dirArr1[idx1] === "number" ? dirArr1[idx1] : NaN;
              if (Number.isFinite(spd) && Number.isFinite(dir)) {
                const rad = ((dir + 180) * Math.PI) / 180;
                const u = spd * Math.sin(rad);
                const v = spd * Math.cos(rad);
                next.push({ lat: c.lat, lng: c.lng, u, v });
              }
            }
          }
        } catch {
          // ignore
        }
      }

      field = next;
      rebuildFieldPx();
    };

    const windAtPx = (x: number, y: number): { u: number; v: number; s: number } | null => {
      if (!fieldPx.length) return null;
      // Nearest neighbour in pixel space (fast + stable under pan/zoom).
      let best = Number.POSITIVE_INFINITY;
      let pick: WindSamplePx | null = null;
      for (const p of fieldPx) {
        const dx = x - p.x;
        const dy = y - p.y;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          pick = p;
        }
      }
      if (!pick) return null;
      return { u: pick.u, v: pick.v, s: pick.s };
    };

    const step = () => {
      if (disposed) return;
      const size = map.getSize();

      const now = performance.now();
      const dt = lastT ? clamp((now - lastT) / 1000, 0.008, 0.05) : 1 / 60;
      lastT = now;

      // Fade previous frame by scaling alpha (no “black wash”).
      const keep = clamp(0.86 + clamp(opacity, 0.2, 0.95) * 0.10, 0.84, 0.95);
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = `rgba(0,0,0,${keep})`;
      ctx.fillRect(0, 0, size.x, size.y);
      ctx.globalCompositeOperation = "source-over";

      ctx.lineWidth = 1.35;

      // Convert m/s to px/s using local map scale (improves realism + fixes “too fast” feel).
      const mid = map.containerPointToLatLng(L.point(size.x * 0.5, size.y * 0.5));
      const mX = map.distance(mid, map.containerPointToLatLng(L.point(size.x * 0.5 + 120, size.y * 0.5))) / 120;
      const mY = map.distance(mid, map.containerPointToLatLng(L.point(size.x * 0.5, size.y * 0.5 + 120))) / 120;
      const mPerPxX = Number.isFinite(mX) && mX > 0 ? mX : 1;
      const mPerPxY = Number.isFinite(mY) && mY > 0 ? mY : 1;

      for (const p of particles) {
        p.age += 1;
        if (p.age > 120) {
          p.x = Math.random() * size.x;
          p.y = Math.random() * size.y;
          p.age = 0;
          continue;
        }
        const w = windAtPx(p.x, p.y);
        if (!w) continue;
        const speed = clamp(w.s, 0, 30);
        // Windy-like motion: accelerate “simulation time” so motion is visible at normal map scales.
        // (Real m/s would barely move a pixel per frame at typical zoom levels.)
        const ms = clamp(motionScale, 0.05, 1);
        const timeScale = 3200; // seconds of simulated time per real second (tuned for visibility)
        const x2 = p.x + ((w.u * dt) / mPerPxX) * timeScale * ms;
        const y2 = p.y - ((w.v * dt) / mPerPxY) * timeScale * ms;

        // Slightly more transparent at low speeds, more vivid at high speeds.
        const a = clamp(0.35 + (speed / 30) * 0.45, 0.25, 0.9) * clamp(opacity, 0.2, 0.95);
        ctx.strokeStyle = windColor(speed, a);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        p.x = x2;
        p.y = y2;
        if (p.x < 0 || p.x > size.x || p.y < 0 || p.y > size.y) {
          p.x = Math.random() * size.x;
          p.y = Math.random() * size.y;
          p.age = 0;
        }
      }

      raf = window.requestAnimationFrame(step);
    };

    const scheduleFetch = () => {
      window.setTimeout(() => void fetchField(), 250);
    };

    sizeCanvas();
    reseed();
    void fetchField().then(() => {
      if (!disposed) raf = window.requestAnimationFrame(step);
    });

    const onMove = () => {
      rebuildFieldPx();
      scheduleFetch();
    };
    const onResize = () => {
      sizeCanvas();
      reseed();
      rebuildFieldPx();
      scheduleFetch();
    };
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      map.off("moveend", onMove);
      map.off("zoomend", onMove);
      window.removeEventListener("resize", onResize);
      if (raf) window.cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, [map, enabled, timeIso, opacity, motionScale]);

  return null;
}

function OpenMeteoWavesOverlay({ enabled, timeIso, opacity }: { enabled: boolean; timeIso: string; opacity: number }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let overlay: L.ImageOverlay | null = null;
    let timer: number | null = null;

    const render = async () => {
      try {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        // Sample a grid across the viewport, but cap total samples to avoid URL-length failures.
        // (Open-Meteo multi-point API is GET-only, so we must keep the query string reasonable.)
        const size = map.getSize();
        let cols: number = clamp(Math.round(size.x / 70), 10, 22);
        let rows: number = clamp(Math.round(size.y / 70), 8, 18);
        const MAX_SAMPLES = 160;
        while (cols * rows > MAX_SAMPLES) {
          if (cols >= rows) cols -= 1;
          else rows -= 1;
          if (cols < 8 || rows < 6) break;
        }
        const lats: number[] = [];
        const lngs: number[] = [];
        const req: { lat: number; lng: number }[] = [];
        for (let y = 0; y < rows; y++) {
          const fy = rows === 1 ? 0.5 : y / (rows - 1);
          const lat = sw.lat + (ne.lat - sw.lat) * fy;
          for (let x = 0; x < cols; x++) {
            const fx = cols === 1 ? 0.5 : x / (cols - 1);
            const lng = sw.lng + (ne.lng - sw.lng) * fx;
            const rlat = Number(lat.toFixed(4));
            const rlng = Number(lng.toFixed(4));
            lats.push(rlat);
            lngs.push(rlng);
            req.push({ lat: rlat, lng: rlng });
          }
        }

        const publishWaveRaster = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
          const smooth = document.createElement("canvas");
          smooth.width = canvas.width;
          smooth.height = canvas.height;
          const sctx = smooth.getContext("2d");
          if (sctx) {
            const sctx2 = sctx as CanvasRenderingContext2D & { filter?: string };
            sctx.imageSmoothingEnabled = true;
            sctx.clearRect(0, 0, smooth.width, smooth.height);
            sctx2.filter = "blur(10px)";
            sctx.drawImage(canvas, 0, 0, smooth.width, smooth.height);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            (ctx as CanvasRenderingContext2D & { filter?: string }).filter = "none";
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(smooth, 0, 0);
          }
          const url = canvas.toDataURL("image/png");
          const imgBounds = L.latLngBounds([sw.lat, sw.lng], [ne.lat, ne.lng]);
          if (overlay) {
            overlay.setUrl(url);
            overlay.setBounds(imgBounds);
          } else {
            overlay = L.imageOverlay(url, imgBounds, { opacity: 1 });
            overlay.addTo(map);
          }
        };

        try {
          const sgRes = await fetch("/api/weather/stormglass-grid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              timeIso,
              layer: "waves",
              points: req.slice(0, STORMGLASS_GRID_CAP),
            }),
          });
          if (sgRes.ok) {
            const sg = (await sgRes.json()) as { ok?: boolean; points?: { waveHeight?: number }[] };
            if (sg.ok && Array.isArray(sg.points) && sg.points.length) {
              const canvas = document.createElement("canvas");
              canvas.width = cols * 24;
              canvas.height = rows * 24;
              const sgCtx = canvas.getContext("2d");
              if (sgCtx) {
                sgCtx.clearRect(0, 0, canvas.width, canvas.height);
                const cell = 24;
                const alpha = clamp(opacity, 0.2, 0.95);
                let painted = false;
                for (let i = 0; i < sg.points.length; i++) {
                  const v = sg.points[i]?.waveHeight;
                  if (typeof v !== "number" || !Number.isFinite(v)) continue;
                  painted = true;
                  const x = i % cols;
                  const y = Math.floor(i / cols);
                  sgCtx.fillStyle = wavesColor(v).replace(/,0\.68\)$/, `,${alpha})`);
                  sgCtx.fillRect(x * cell, y * cell, cell, cell);
                }
                if (painted) {
                  publishWaveRaster(sgCtx, canvas);
                  return;
                }
              }
            }
          }
        } catch {
          /* Open‑Meteo marine */
        }

        const api = new URL("https://marine-api.open-meteo.com/v1/marine");
        api.searchParams.set("latitude", lats.join(","));
        api.searchParams.set("longitude", lngs.join(","));
        api.searchParams.set("hourly", "wave_height");
        api.searchParams.set("forecast_days", "5");
        api.searchParams.set("timezone", "GMT");
        api.searchParams.set("cell_selection", "sea");

        const r = await fetch(api.toString(), { cache: "no-store" });
        if (!r.ok) return;
        const d: unknown = await r.json();
        const blocks: OpenMeteoBlock[] = Array.isArray(d)
          ? (d as OpenMeteoBlock[])
          : typeof d === "object" && d !== null && Array.isArray((d as OpenMeteoBlock).hourly?.time)
            ? [d as OpenMeteoBlock]
            : [];
        if (!blocks.length) return;

        const times = blocks[0]?.hourly?.time as string[] | undefined;
        if (!times?.length) return;

        const targetMs = new Date(timeIso).getTime();
        let idx = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < times.length; i++) {
          const ms = new Date(times[i]!).getTime();
          const dist = Math.abs(ms - targetMs);
          if (dist < best) {
            best = dist;
            idx = i;
          }
        }

        // Render a smooth raster: write colors into a low-res grid then upscale with smoothing.
        const canvas = document.createElement("canvas");
        canvas.width = cols * 24;
        canvas.height = rows * 24;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;

        const cell = 24;
        const alpha = clamp(opacity, 0.2, 0.95);
        // If Open-Meteo had to "snap" a request far away to find sea, treat it as land and do not paint it.
        const SNAP_DEG = 0.12; // ~13km latitude; avoids big inland smearing

        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          const usedLat = typeof b?.latitude === "number" ? b.latitude : null;
          const usedLng = typeof b?.longitude === "number" ? b.longitude : null;
          const arr = b?.hourly?.wave_height as number[] | undefined;
          const v = typeof arr?.[idx] === "number" ? arr[idx] : NaN;
          if (!Number.isFinite(v) || usedLat == null || usedLng == null) continue;

          const r = req[i];
          if (r && (Math.abs(usedLat - r.lat) > SNAP_DEG || Math.abs(usedLng - r.lng) > SNAP_DEG)) continue;

          const x = i % (cols as number);
          const y = Math.floor(i / (cols as number));
          ctx.fillStyle = wavesColor(v).replace(/,0\.68\)$/, `,${alpha})`);
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }

        publishWaveRaster(ctx, canvas);
      } catch {
        /* ignore */
      }
    };

    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void render(), 300);
    };

    schedule();
    const onMove = () => schedule();
    map.on("moveend", onMove);

    return () => {
      disposed = true;
      if (timer != null) window.clearTimeout(timer);
      map.off("moveend", onMove);
      if (overlay) map.removeLayer(overlay);
      overlay = null;
      void disposed;
    };
  }, [map, enabled, timeIso, opacity]);

  return null;
}

function WmsOverlay({ mode, opacity, timeIso }: { mode: LayerMode; opacity: number; timeIso: string }) {
  const map = useMap();

  useEffect(() => {
    if (mode === "waves" || mode === "wind") return;
    const windUrl =
      "https://pae-paha.pacioos.hawaii.edu/thredds/wms/ncep_global/NCEP_Global_Atmospheric_Model_best.ncd";
    const wavesUrl =
      "https://pae-paha.pacioos.hawaii.edu/thredds/wms/ww3_global/WaveWatch_III_Global_Wave_Model_fmrc.ncd";

    // PacIOOS exposes a combined vector field layer "wind" with barb/vector styles and a time dimension.
    const wind = L.tileLayer.wms(windUrl, {
      layers: "wind",
      styles: "barb/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as L.WMSOptions & { time: string });

    const waves = L.tileLayer.wms(wavesUrl, {
      layers: "Thgt",
      styles: "boxfill/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as L.WMSOptions & { time: string });

    const rain = L.tileLayer.wms(windUrl, {
      layers: "pratesfc",
      styles: "boxfill/occam",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as L.WMSOptions & { time: string });

    const pressure = L.tileLayer.wms(windUrl, {
      layers: "prmslmsl",
      styles: "boxfill/jet",
      format: "image/png",
      transparent: true,
      opacity,
      version: "1.3.0",
      time: timeIso,
    } as L.WMSOptions & { time: string });

    const layer = mode === "rain" ? rain : pressure;
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
      map.removeLayer(wind);
      map.removeLayer(waves);
      map.removeLayer(rain);
      map.removeLayer(pressure);
    };
  }, [map, mode, opacity, timeIso]);

  return null;
}

function MapToolbar({
  pos,
  mode,
  timeIso,
  insightLoading,
  onStartInsight,
  onEndInsight,
  onInsightText,
  onInsightError,
  onInsightHint,
}: {
  pos: { lat: number; lng: number } | null;
  mode: LayerMode;
  timeIso: string;
  insightLoading: boolean;
  onStartInsight: () => void;
  onEndInsight: () => void;
  onInsightText: (t: string) => void;
  onInsightError: (e: string) => void;
  onInsightHint: (h: string) => void;
}) {
  const map = useMap();

  return (
    <div className="leaflet-top leaflet-right" style={{ pointerEvents: "auto" }}>
      <div className="pointer-events-auto mt-14 mr-2 flex flex-col items-end gap-2">
        {pos ? (
          <button
            type="button"
            onClick={() => map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 7), { duration: 1.1 })}
            className="rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-md backdrop-blur-sm hover:bg-white dark:border-zinc-600 dark:bg-zinc-900/95 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            My location
          </button>
        ) : null}
        <button
          type="button"
          disabled={insightLoading}
          onClick={() => {
            void (async () => {
              onStartInsight();
              try {
                const c = map.getCenter();
                const r = await fetch("/api/weather/map-insight", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lat: c.lat, lng: c.lng, mode, timeIso }),
                });
                const j = (await r.json()) as { text?: string; error?: string; hint?: string };
                if (!r.ok) {
                  onInsightError(j.error || "Request failed");
                  return;
                }
                if (typeof j.hint === "string" && j.hint.trim() && !j.text) {
                  onInsightHint(j.hint.trim());
                  return;
                }
                if (typeof j.text === "string" && j.text.trim()) {
                  onInsightText(j.text.trim());
                  return;
                }
                onInsightError("No outlook returned");
              } catch {
                onInsightError("Network error");
              } finally {
                onEndInsight();
              }
            })();
          }}
          className="rounded-lg border border-indigo-200 bg-indigo-50/95 px-2.5 py-1.5 text-xs font-semibold text-indigo-950 shadow-md backdrop-blur-sm hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950/90 dark:text-indigo-100 dark:hover:bg-indigo-900"
        >
          {insightLoading ? "…" : "AI outlook"}
        </button>
      </div>
    </div>
  );
}

function roundTo3hUtc(d: Date): Date {
  const ms = d.getTime();
  const threeH = 3 * 60 * 60 * 1000;
  return new Date(Math.floor(ms / threeH) * threeH);
}

function buildFrames4d(): string[] {
  const start = roundTo3hUtc(new Date());
  const out: string[] = [];
  const step = 3 * 60 * 60 * 1000;
  const end = start.getTime() + 4 * 24 * 60 * 60 * 1000;
  for (let t = start.getTime(); t <= end; t += step) {
    out.push(new Date(t).toISOString().replace(/\.\d{3}Z$/, ".000Z"));
  }
  return out;
}

export function WeatherSeaMap() {
  const [mode, setMode] = useState<LayerMode>("wind");
  const [base, setBase] = useState<BaseMapMode>("satellite");
  const [opacity, setOpacity] = useState(0.75);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);
  const frames = useMemo(() => buildFrames4d(), []);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightText, setInsightText] = useState<string | null>(null);
  const [insightErr, setInsightErr] = useState<string | null>(null);
  const [insightHint, setInsightHint] = useState<string | null>(null);

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
      { enableHighAccuracy: true, maximumAge: 120_000, timeout: 22_000 },
    );
    return () => {
      disposed = true;
    };
  }, [initialCenter]);

  const center = useMemo<[number, number]>(() => initialCenter ?? [20, 0], [initialCenter]);
  const timeIso = frames[Math.min(Math.max(frameIdx, 0), frames.length - 1)] ?? new Date().toISOString();

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setFrameIdx((i) => {
        const next = i + 1;
        if (next >= frames.length) return 0;
        return next;
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  useEffect(() => {
    startTransition(() => {
      setInsightText(null);
      setInsightErr(null);
      setInsightHint(null);
    });
  }, [mode, frameIdx, base]);

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

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Time</span>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              title="Play/pause forecast animation"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <span className="text-[11px] text-zinc-500">
              {new Date(timeIso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            step={1}
            value={frameIdx}
            onChange={(e) => {
              setPlaying(false);
              setFrameIdx(Number(e.target.value));
            }}
            className="w-48"
            aria-label="Forecast time"
          />

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

      <div className="h-[min(78vh,720px)] w-full bg-zinc-100 dark:bg-zinc-900">
        <MapContainer
          center={center}
          zoom={pos ? 7 : 2}
          maxZoom={18}
          className="h-full w-full"
          scrollWheelZoom
          attributionControl={false}
        >
          <AttributionControl position="bottomright" prefix={false} />
          <ScaleControl position="bottomleft" metric imperial />
          <MapToolbar
            pos={pos}
            mode={mode}
            timeIso={timeIso}
            insightLoading={insightLoading}
            onStartInsight={() => {
              setInsightLoading(true);
              setInsightText(null);
              setInsightErr(null);
              setInsightHint(null);
            }}
            onEndInsight={() => setInsightLoading(false)}
            onInsightText={(t) => setInsightText(t)}
            onInsightError={(e) => setInsightErr(e)}
            onInsightHint={(h) => setInsightHint(h)}
          />
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
          <WindParticlesOverlay
            enabled={mode === "wind"}
            timeIso={timeIso}
            opacity={opacity}
            motionScale={playing ? 1 : 0.32}
          />
          {/* Open-Meteo marine raster — good coverage in enclosed seas (e.g. Mediterranean). */}
          <OpenMeteoWavesOverlay enabled={mode === "waves"} timeIso={timeIso} opacity={opacity} />
          <WmsOverlay mode={mode} opacity={opacity} timeIso={timeIso} />
        </MapContainer>
      </div>
      <div className="grid gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <Legend mode={mode} />
        {insightLoading ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Generating outlook for map centre…</p>
        ) : insightErr ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {insightErr}
          </p>
        ) : insightHint ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            {insightHint}
          </p>
        ) : insightText ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs leading-relaxed text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-100">
            <p className="font-semibold text-indigo-900 dark:text-indigo-200">Outlook (map centre)</p>
            <p className="mt-1 whitespace-pre-wrap">{insightText}</p>
          </div>
        ) : null}
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">Tip:</span> drag/zoom anywhere in the world —
          this map won’t snap back to you. Use Play to animate the timeline;{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">AI outlook</span> uses the centre of the map and
          the selected frame.
        </p>
      </div>
    </div>
  );
}

