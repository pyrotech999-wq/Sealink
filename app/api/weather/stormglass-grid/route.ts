import { NextResponse } from "next/server";
import {
  STORMGLASS_COMBINED_WEATHER_PARAMS,
  fetchStormglassHourRowCached,
  peekStormglassHourRowCache,
  pickStormglassNumeric,
} from "@/lib/stormglass-weather-grid-server";
import {
  stormglassBudgetClientKey,
  stormglassMemoryReleaseUpstreamSlot,
  stormglassMemoryReserveUpstreamSlot,
} from "@/lib/stormglass-session-budget";
import { openMeteoWaveGridPoints, openMeteoWindGridPoints } from "@/lib/open-meteo-map-grid-server";

export const runtime = "nodejs";

/** Max grid points per request — keeps Stormglass usage predictable on free tiers. */
const MAX_POINTS = 24;
const CHUNK = 6;

type Body = {
  timeIso?: string;
  layer?: string;
  points?: { lat: number; lng: number }[];
  /** Echo from client so wave raster indexing matches the sampled grid. */
  cols?: number;
  rows?: number;
  /** When true, bypass the 60-minute server cache for this request only. */
  forceRefresh?: boolean;
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

function rowToOut(pt: { lat: number; lng: number }, hour: Record<string, unknown> | null): Out {
  if (!hour) return { lat: pt.lat, lng: pt.lng };
  const windSpeed = pickStormglassNumeric(hour.windSpeed);
  const windDirection = pickStormglassNumeric(hour.windDirection);
  const waveHeight = pickStormglassNumeric(hour.waveHeight);
  return {
    lat: pt.lat,
    lng: pt.lng,
    ...(windSpeed != null ? { windSpeed } : {}),
    ...(windDirection != null ? { windDirection } : {}),
    ...(waveHeight != null ? { waveHeight } : {}),
  };
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
  const forceRefresh = body.forceRefresh === true;
  const colsIn =
    typeof body.cols === "number" && Number.isFinite(body.cols) && body.cols > 0 ? Math.floor(body.cols) : null;
  const rowsIn =
    typeof body.rows === "number" && Number.isFinite(body.rows) && body.rows > 0 ? Math.floor(body.rows) : null;
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

  if (!timeIso || points.length === 0) {
    return NextResponse.json({ ok: false, error: "timeIso and points required" }, { status: 400 });
  }

  const key = process.env.STORMGLASS_API_KEY?.trim() ?? "";

  if (layer === "combined") {
    if (!key) {
      const omW = await openMeteoWindGridPoints(points, timeIso, req.signal);
      const omWa = await openMeteoWaveGridPoints(points, timeIso, req.signal);
      const out: Out[] = points.map((pt, idx) => {
        const w = omW[idx];
        const wa = omWa[idx];
        return {
          lat: pt.lat,
          lng: pt.lng,
          ...(w && Number.isFinite(w.windSpeed) && Number.isFinite(w.windDirection)
            ? { windSpeed: w.windSpeed, windDirection: w.windDirection }
            : {}),
          ...(wa && Number.isFinite(wa.waveHeight) ? { waveHeight: wa.waveHeight } : {}),
        };
      });
      console.info("[Stormglass] combined grid: no API key — Open‑Meteo only", { points: points.length });
      return NextResponse.json({
        ok: true,
        layer: "combined",
        points: out,
        cols: colsIn ?? null,
        rows: rowsIn ?? null,
        providerWind: "open-meteo",
        providerWaves: "open-meteo",
        stormglassUpstreamCalls: 0,
        stormglassCacheHits: 0,
        usedCache: false,
        quotaExceeded: false,
        sessionStormglassLimitReached: false,
      });
    }

    let stormglassUpstreamCalls = 0;
    let stormglassCacheHits = 0;
    let quotaExceeded = false;
    let sessionStormglassLimitReached = false;
    let budgetIncrement = 0;

    const centroidLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const centroidLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

    const cookieHeader = req.headers.get("cookie");
    const wouldUseUpstream =
      forceRefresh ||
      !peekStormglassHourRowCache(centroidLat, centroidLng, timeIso, STORMGLASS_COMBINED_WEATHER_PARAMS);

    let storm: Out[];

    if (wouldUseUpstream && !stormglassUpstreamAllowed(cookieHeader)) {
      sessionStormglassLimitReached = true;
      storm = points.map((pt) => ({ lat: pt.lat, lng: pt.lng }));
    } else {
      const { row, meta } = await fetchStormglassHourRowCached(
        key,
        centroidLat,
        centroidLng,
        timeIso,
        STORMGLASS_COMBINED_WEATHER_PARAMS,
        req.signal,
        { forceRefresh },
      );
      if (meta.fromCache) stormglassCacheHits = 1;
      else if (!meta.deduped) {
        stormglassUpstreamCalls = 1;
        budgetIncrement = 1;
      }
      if (meta.httpStatus === 429) {
        quotaExceeded = true;
        console.warn("[Stormglass] combined grid: 429 / quota — centroid request hit limit");
      }
      const cell = rowToOut({ lat: centroidLat, lng: centroidLng }, row);
      storm = points.map((pt) => ({
        lat: pt.lat,
        lng: pt.lng,
        ...(typeof cell.windSpeed === "number" && Number.isFinite(cell.windSpeed) ? { windSpeed: cell.windSpeed } : {}),
        ...(typeof cell.windDirection === "number" && Number.isFinite(cell.windDirection)
          ? { windDirection: cell.windDirection }
          : {}),
        ...(typeof cell.waveHeight === "number" && Number.isFinite(cell.waveHeight) ? { waveHeight: cell.waveHeight } : {}),
      }));
    }

    const goodW = countWindGood(storm);
    const goodWa = countWaveGood(storm);
    const windOk = goodW >= windThreshold(points.length);
    const waveOk = goodWa >= waveThreshold(points.length);

    let providerWind: "stormglass" | "open-meteo" | "mixed" = "open-meteo";
    let providerWaves: "stormglass" | "open-meteo" | "mixed" = "open-meteo";
    let out: Out[] = [];

    if (windOk && waveOk && !quotaExceeded) {
      out = storm;
      providerWind = "stormglass";
      providerWaves = "stormglass";
    } else {
      const omW = await openMeteoWindGridPoints(points, timeIso, req.signal);
      const omWa = await openMeteoWaveGridPoints(points, timeIso, req.signal);
      out = points.map((pt, idx) => {
        const s = storm[idx];
        const ow = omW[idx];
        const owa = omWa[idx];
        let windSpeed: number | undefined;
        let windDirection: number | undefined;
        let waveHeight: number | undefined;
        if (
          s &&
          typeof s.windSpeed === "number" &&
          typeof s.windDirection === "number" &&
          Number.isFinite(s.windSpeed) &&
          Number.isFinite(s.windDirection)
        ) {
          windSpeed = s.windSpeed;
          windDirection = s.windDirection;
        } else if (ow && Number.isFinite(ow.windSpeed) && Number.isFinite(ow.windDirection)) {
          windSpeed = ow.windSpeed;
          windDirection = ow.windDirection;
        }
        if (s && typeof s.waveHeight === "number" && Number.isFinite(s.waveHeight)) {
          waveHeight = s.waveHeight;
        } else if (owa && Number.isFinite(owa.waveHeight)) {
          waveHeight = owa.waveHeight;
        }
        return {
          lat: pt.lat,
          lng: pt.lng,
          ...(windSpeed != null ? { windSpeed } : {}),
          ...(windDirection != null ? { windDirection } : {}),
          ...(waveHeight != null ? { waveHeight } : {}),
        };
      });
      providerWind = goodW > 0 ? "mixed" : "open-meteo";
      providerWaves = goodWa > 0 ? "mixed" : "open-meteo";
    }

    const usedCache = stormglassCacheHits > 0 && stormglassUpstreamCalls === 0;
    console.info("[Stormglass] combined grid summary", {
      points: points.length,
      centroid: { lat: centroidLat, lng: centroidLng },
      stormglassUpstreamCalls,
      stormglassCacheHits,
      providerWind,
      providerWaves,
      quotaExceeded,
      sessionStormglassLimitReached,
      forceRefresh,
    });

    const res = NextResponse.json({
      ok: true,
      layer: "combined",
      points: out,
      cols: colsIn ?? null,
      rows: rowsIn ?? null,
      providerWind,
      providerWaves,
      stormglassUpstreamCalls,
      stormglassCacheHits,
      usedCache,
      quotaExceeded,
      sessionStormglassLimitReached,
    });
    appendStormglassBudgetCookie(res, req, budgetIncrement);
    return res;
  }

  if (layer !== "wind" && layer !== "waves") {
    return NextResponse.json(
      { ok: false, error: "layer must be wind, waves, or combined" },
      { status: 400 },
    );
  }

  let provider: "stormglass" | "open-meteo" | "mixed" = "open-meteo";
  let out: Out[] = [];

  if (layer === "wind") {
    if (key) {
      const storm: Out[] = [];
      const params = "windSpeed,windDirection";
      for (let i = 0; i < points.length; i += CHUNK) {
        const slice = points.slice(i, i + CHUNK);
        const chunkRows = await Promise.all(
          slice.map(async (pt) => {
            const { row } = await fetchStormglassHourRowCached(key, pt.lat, pt.lng, timeIso, params, req.signal, {
              forceRefresh,
            });
            return rowToOut(pt, row);
          }),
        );
        storm.push(...chunkRows);
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
        const chunkRows = await Promise.all(
          slice.map(async (pt) => {
            const { row } = await fetchStormglassHourRowCached(key, pt.lat, pt.lng, timeIso, params, req.signal, {
              forceRefresh,
            });
            return rowToOut(pt, row);
          }),
        );
        storm.push(...chunkRows);
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
