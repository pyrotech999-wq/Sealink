import { NextResponse } from "next/server";
import { fetchStormglassHourRow, pickStormglassNumeric } from "@/lib/stormglass-weather-grid-server";
import { openMeteoWaveGridPoints, openMeteoWindGridPoints } from "@/lib/open-meteo-map-grid-server";

export const runtime = "nodejs";

const MAX_POINTS = 48;
const CHUNK = 8;

type Body = {
  timeIso?: string;
  layer?: string;
  points?: { lat: number; lng: number }[];
};

type Out = {
  lat: number;
  lng: number;
  windSpeed?: number;
  windDirection?: number;
  waveHeight?: number;
};

function countWindGood(rows: Out[]): number {
  return rows.filter(
    (p) =>
      typeof p.windSpeed === "number" &&
      typeof p.windDirection === "number" &&
      Number.isFinite(p.windSpeed) &&
      Number.isFinite(p.windDirection),
  ).length;
}

function countWaveGood(rows: Out[]): number {
  return rows.filter((p) => typeof p.waveHeight === "number" && Number.isFinite(p.waveHeight)).length;
}

function windThreshold(n: number): number {
  return Math.max(4, Math.ceil(n * 0.22));
}

function waveThreshold(n: number): number {
  return Math.max(4, Math.ceil(n * 0.22));
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const timeIso = typeof body.timeIso === "string" ? body.timeIso.trim() : "";
  const layer = body.layer;
  const rawPts = Array.isArray(body.points) ? body.points : [];
  const points = rawPts
    .filter(
      (p) =>
        p &&
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng),
    )
    .slice(0, MAX_POINTS);

  if (!timeIso || (layer !== "wind" && layer !== "waves") || points.length === 0) {
    return NextResponse.json({ ok: false, error: "timeIso, layer (wind|waves), and points required" }, { status: 400 });
  }

  const key = process.env.STORMGLASS_API_KEY?.trim() ?? "";
  let provider: "stormglass" | "open-meteo" | "mixed" = "open-meteo";
  let out: Out[] = [];

  if (layer === "wind") {
    if (key) {
      const storm: Out[] = [];
      const params = "windSpeed,windDirection";
      for (let i = 0; i < points.length; i += CHUNK) {
        const slice = points.slice(i, i + CHUNK);
        const rows = await Promise.all(
          slice.map(async (pt) => {
            const hour = await fetchStormglassHourRow(key, pt.lat, pt.lng, timeIso, params, req.signal);
            if (!hour) return { lat: pt.lat, lng: pt.lng } as Out;
            const windSpeed = pickStormglassNumeric(hour.windSpeed);
            const windDirection = pickStormglassNumeric(hour.windDirection);
            return {
              lat: pt.lat,
              lng: pt.lng,
              ...(windSpeed != null ? { windSpeed } : {}),
              ...(windDirection != null ? { windDirection } : {}),
            } as Out;
          }),
        );
        storm.push(...rows);
      }
      const good = countWindGood(storm);
      if (good >= windThreshold(points.length)) {
        out = storm;
        provider = "stormglass";
      } else {
        const om = await openMeteoWindGridPoints(points, timeIso, req.signal);
        const merged: Out[] = points.map((pt, idx) => {
          const s = storm[idx];
          const o = om[idx];
          if (
            s &&
            typeof s.windSpeed === "number" &&
            typeof s.windDirection === "number" &&
            Number.isFinite(s.windSpeed) &&
            Number.isFinite(s.windDirection)
          ) {
            return { lat: pt.lat, lng: pt.lng, windSpeed: s.windSpeed, windDirection: s.windDirection };
          }
          if (o && Number.isFinite(o.windSpeed) && Number.isFinite(o.windDirection)) {
            return {
              lat: pt.lat,
              lng: pt.lng,
              windSpeed: o.windSpeed,
              windDirection: o.windDirection,
            };
          }
          return { lat: pt.lat, lng: pt.lng };
        });
        out = merged;
        provider = good > 0 ? "mixed" : "open-meteo";
      }
    } else {
      const om = await openMeteoWindGridPoints(points, timeIso, req.signal);
      out = points.map((pt, idx) => {
        const o = om[idx];
        if (o && Number.isFinite(o.windSpeed) && Number.isFinite(o.windDirection)) {
          return { lat: pt.lat, lng: pt.lng, windSpeed: o.windSpeed, windDirection: o.windDirection };
        }
        return { lat: pt.lat, lng: pt.lng };
      });
      provider = "open-meteo";
    }
  } else {
    if (key) {
      const storm: Out[] = [];
      const params = "waveHeight";
      for (let i = 0; i < points.length; i += CHUNK) {
        const slice = points.slice(i, i + CHUNK);
        const rows = await Promise.all(
          slice.map(async (pt) => {
            const hour = await fetchStormglassHourRow(key, pt.lat, pt.lng, timeIso, params, req.signal);
            if (!hour) return { lat: pt.lat, lng: pt.lng } as Out;
            const waveHeight = pickStormglassNumeric(hour.waveHeight);
            return {
              lat: pt.lat,
              lng: pt.lng,
              ...(waveHeight != null ? { waveHeight } : {}),
            } as Out;
          }),
        );
        storm.push(...rows);
      }
      const good = countWaveGood(storm);
      if (good >= waveThreshold(points.length)) {
        out = storm;
        provider = "stormglass";
      } else {
        const om = await openMeteoWaveGridPoints(points, timeIso, req.signal);
        const merged: Out[] = points.map((pt, idx) => {
          const s = storm[idx];
          const o = om[idx];
          if (s && typeof s.waveHeight === "number" && Number.isFinite(s.waveHeight)) {
            return { lat: pt.lat, lng: pt.lng, waveHeight: s.waveHeight };
          }
          if (o && Number.isFinite(o.waveHeight)) {
            return { lat: pt.lat, lng: pt.lng, waveHeight: o.waveHeight };
          }
          return { lat: pt.lat, lng: pt.lng };
        });
        out = merged;
        provider = good > 0 ? "mixed" : "open-meteo";
      }
    } else {
      const om = await openMeteoWaveGridPoints(points, timeIso, req.signal);
      out = points.map((pt, idx) => {
        const o = om[idx];
        if (o && Number.isFinite(o.waveHeight)) {
          return { lat: pt.lat, lng: pt.lng, waveHeight: o.waveHeight };
        }
        return { lat: pt.lat, lng: pt.lng };
      });
      provider = "open-meteo";
    }
  }

  return NextResponse.json({ ok: true, provider, layer, points: out });
}
