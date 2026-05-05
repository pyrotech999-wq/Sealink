"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import { CircleMarker, Popup, useMap } from "react-leaflet";

/** Open‑Meteo GFS hourly `precipitation` — mm for that hour (shown as mm/h). */
export type PrecipPoint = { lat: number; lng: number; mm: number };

const PRECIP_MIN_DRAW = 0.2;
const LAYER_OPACITY = 0.55;

function precipRgb(mm: number): { r: number; g: number; b: number } {
  if (mm <= 1) {
    const t = (mm - PRECIP_MIN_DRAW) / (1 - PRECIP_MIN_DRAW);
    return {
      r: Math.round(186 + (147 - 186) * t),
      g: Math.round(230 + (204 - 230) * t),
      b: Math.round(255 + (255 - 255) * t),
    };
  }
  if (mm <= 3) {
    const t = (mm - 1) / 2;
    return {
      r: Math.round(147 + (37 - 147) * t),
      g: Math.round(204 + (99 - 204) * t),
      b: Math.round(255 + (235 - 255) * t),
    };
  }
  if (mm <= 8) {
    const t = (mm - 3) / 5;
    return {
      r: Math.round(37 + (234 - 37) * t),
      g: Math.round(99 + (179 - 99) * t),
      b: Math.round(235 + (8 - 235) * t),
    };
  }
  const t = Math.min(1, (mm - 8) / 12);
  return {
    r: Math.round(234 + (220 - 234) * t),
    g: Math.round(179 + (38 - 179) * t),
    b: Math.round(8 + (38 - 8) * t),
  };
}

function drawPrecipCanvas(
  map: L.Map,
  canvas: HTMLCanvasElement,
  points: PrecipPoint[],
  gridStepDeg: number,
): void {
  const container = map.getContainer();
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w <= 0 || h <= 0) return;

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const pw = Math.floor(w * dpr);
  const ph = Math.floor(h * dpr);
  canvas.width = pw;
  canvas.height = ph;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const off = document.createElement("canvas");
  off.width = pw;
  off.height = ph;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  octx.globalCompositeOperation = "source-over";

  const visible = points.filter((p) => p.mm >= PRECIP_MIN_DRAW).sort((a, b) => a.mm - b.mm);

  for (const p of visible) {
    const pt = map.latLngToContainerPoint(L.latLng(p.lat, p.lng));
    if (pt.x < -160 || pt.y < -160 || pt.x > w + 160 || pt.y > h + 160) continue;

    const edge = map.latLngToContainerPoint(L.latLng(p.lat + gridStepDeg * 0.72, p.lng));
    const R = Math.max(32, Math.min(128, pt.distanceTo(edge)));

    const { r, g, b } = precipRgb(p.mm);
    const peak = LAYER_OPACITY * Math.min(0.95, 0.38 + Math.min(p.mm / 6, 1) * 0.55);

    const grd = octx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, R);
    grd.addColorStop(0, `rgba(${r},${g},${b},${peak})`);
    grd.addColorStop(0.35, `rgba(${r},${g},${b},${peak * 0.5})`);
    grd.addColorStop(0.65, `rgba(${r},${g},${b},${peak * 0.18})`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);

    octx.fillStyle = grd;
    octx.beginPath();
    octx.arc(pt.x, pt.y, R, 0, Math.PI * 2);
    octx.fill();
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.filter = "blur(12px)";
  ctx.globalAlpha = 0.96;
  ctx.drawImage(off, 0, 0, w, h);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
}

/**
 * Soft heatmap-style precipitation (radial splats + blur). Canvas is non-interactive;
 * use PrecipitationHitMarkers for tap → popup.
 */
export function PrecipitationCanvasOverlay({
  points,
  gridStepDeg,
  leadKey,
}: {
  points: PrecipPoint[];
  gridStepDeg: number;
  leadKey: number;
}) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (c) drawPrecipCanvas(map, c, points, gridStepDeg);
  }, [map, points, gridStepDeg]);

  useEffect(() => {
    const container = map.getContainer();
    const canvas = L.DomUtil.create("canvas", "sealink-precip-canvas") as HTMLCanvasElement;
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "500",
    });
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const onChange = () => {
      requestAnimationFrame(draw);
    };
    map.on("moveend", onChange);
    map.on("zoomend", onChange);
    map.on("resize", onChange);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onChange) : null;
    ro?.observe(container);
    requestAnimationFrame(draw);

    return () => {
      map.off("moveend", onChange);
      map.off("zoomend", onChange);
      map.off("resize", onChange);
      ro?.disconnect();
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map, draw]);

  useEffect(() => {
    requestAnimationFrame(draw);
  }, [draw, leadKey]);

  return null;
}

/** Nearly invisible circles so taps open a popup (canvas cannot receive events). */
export function PrecipitationHitMarkers({ points, leadKey }: { points: PrecipPoint[]; leadKey: number }) {
  const visible = points.filter((p) => p.mm >= PRECIP_MIN_DRAW);
  return (
    <>
      {visible.map((p, i) => (
        <CircleMarker
          key={`pph-${leadKey}-${i}-${p.mm}-${p.lat}-${p.lng}`}
          center={[p.lat, p.lng]}
          radius={11}
          pathOptions={{
            stroke: false,
            fillColor: "#000000",
            fillOpacity: 0.001,
          }}
        >
          <Popup>
            <div className="text-xs">
              <div className="font-semibold">Precipitation</div>
              <div className="font-mono">{p.mm.toFixed(2)} mm/h</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
