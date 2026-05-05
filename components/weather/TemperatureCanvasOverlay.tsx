"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import { CircleMarker, Popup, useMap } from "react-leaflet";

export type TempPoint = { lat: number; lng: number; tempC: number };

const LAYER_OPACITY = 0.54;

type Rgb = readonly [number, number, number];

const PURPLE: Rgb = [88, 28, 135];
const BLUE: Rgb = [37, 99, 235];
const GREEN: Rgb = [34, 197, 94];
const YELLOW: Rgb = [250, 204, 21];
const ORANGE: Rgb = [249, 115, 22];
const RED: Rgb = [220, 38, 38];
const RED_HOT: Rgb = [185, 28, 28];

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(c1: Rgb, c2: Rgb, t: number): { r: number; g: number; b: number } {
  return {
    r: Math.round(lerp(c1[0], c2[0], t)),
    g: Math.round(lerp(c1[1], c2[1], t)),
    b: Math.round(lerp(c1[2], c2[2], t)),
  };
}

/** &lt; -10 purple/blue → -10..0 blue → 0..10 green → 10..20 yellow → 20..30 orange → &gt;30 red */
function tempRgb(tempC: number): { r: number; g: number; b: number } {
  const c = tempC;
  if (c < -10) {
    const t = clamp((c + 25) / 15, 0, 1);
    return lerpRgb(PURPLE, BLUE, t);
  }
  if (c < 0) {
    const t = (c + 10) / 10;
    return lerpRgb(BLUE, GREEN, t);
  }
  if (c < 10) {
    const t = c / 10;
    return lerpRgb(GREEN, YELLOW, t);
  }
  if (c < 20) {
    const t = (c - 10) / 10;
    return lerpRgb(YELLOW, ORANGE, t);
  }
  if (c <= 30) {
    const t = (c - 20) / 10;
    return lerpRgb(ORANGE, RED, t);
  }
  const t = clamp((c - 30) / 15, 0, 1);
  return lerpRgb(RED, RED_HOT, t);
}

function drawTempCanvas(map: L.Map, canvas: HTMLCanvasElement, points: TempPoint[], gridStepDeg: number): void {
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

  const visible = [...points].sort((a, b) => a.tempC - b.tempC);

  for (const p of visible) {
    const pt = map.latLngToContainerPoint(L.latLng(p.lat, p.lng));
    if (pt.x < -160 || pt.y < -160 || pt.x > w + 160 || pt.y > h + 160) continue;

    const edge = map.latLngToContainerPoint(L.latLng(p.lat + gridStepDeg * 0.72, p.lng));
    const R = Math.max(32, Math.min(128, pt.distanceTo(edge)));

    const { r, g, b } = tempRgb(p.tempC);
    const peak = LAYER_OPACITY * Math.min(0.94, 0.36 + Math.min(Math.abs(p.tempC) / 35, 1) * 0.48);

    const grd = octx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, R);
    grd.addColorStop(0, `rgba(${r},${g},${b},${peak})`);
    grd.addColorStop(0.35, `rgba(${r},${g},${b},${peak * 0.52})`);
    grd.addColorStop(0.65, `rgba(${r},${g},${b},${peak * 0.2})`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);

    octx.fillStyle = grd;
    octx.beginPath();
    octx.arc(pt.x, pt.y, R, 0, Math.PI * 2);
    octx.fill();
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.filter = "blur(12px)";
  ctx.globalAlpha = 0.96;
  ctx.drawImage(off, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
}

export function TemperatureCanvasOverlay({
  points,
  gridStepDeg,
  leadKey,
}: {
  points: TempPoint[];
  gridStepDeg: number;
  leadKey: number;
}) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (c) drawTempCanvas(map, c, points, gridStepDeg);
  }, [map, points, gridStepDeg]);

  useEffect(() => {
    const container = map.getContainer();
    const canvas = L.DomUtil.create("canvas", "sealink-temp-canvas") as HTMLCanvasElement;
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

    const onChange = () => requestAnimationFrame(draw);
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

export function TemperatureHitMarkers({ points, leadKey }: { points: TempPoint[]; leadKey: number }) {
  return (
    <>
      {points.map((p, i) => (
        <CircleMarker
          key={`tth-${leadKey}-${i}-${p.tempC}-${p.lat}-${p.lng}`}
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
              <div className="font-semibold">2 m temperature</div>
              <div className="font-mono">{p.tempC.toFixed(1)} °C</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
