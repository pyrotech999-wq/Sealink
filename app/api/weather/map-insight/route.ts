import { NextResponse } from "next/server";
import type { HourlyContextPoint } from "@/lib/open-meteo-ai-context";
import { openAiChatCompletionsUrl, parseOpenAiErrorBody } from "@/lib/openai-server-helpers";

export const runtime = "nodejs";

type LayerMode = "wind" | "waves" | "rain" | "pressure";

type Body = { lat?: unknown; lng?: unknown; mode?: unknown; timeIso?: unknown };

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function nearestHourlyIndex(times: string[], targetMs: number): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const ms = new Date(times[i]!).getTime();
    if (!Number.isFinite(ms)) continue;
    const d = Math.abs(ms - targetMs);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** ~5 days hourly at a point (matches map timeline better than the 48h home helper). */
async function fetchFiveDayHourlyContext(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<HourlyContextPoint[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation,weather_code,relative_humidity_2m,dew_point_2m,pressure_msl,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("temperature_unit", "celsius");

  const res = await fetch(url.toString(), { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo hourly failed (${res.status})`);

  const data = (await res.json()) as {
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation?: number[];
      weather_code?: number[];
      relative_humidity_2m?: number[];
      dew_point_2m?: number[];
      pressure_msl?: number[];
      wind_speed_10m?: number[];
      wind_direction_10m?: number[];
    };
  };
  const t = data.hourly?.time ?? [];
  const T = data.hourly?.temperature_2m ?? [];
  const P = data.hourly?.precipitation ?? [];
  const W = data.hourly?.weather_code ?? [];
  const H = data.hourly?.relative_humidity_2m ?? [];
  const D = data.hourly?.dew_point_2m ?? [];
  const M = data.hourly?.pressure_msl ?? [];
  const S = data.hourly?.wind_speed_10m ?? [];
  const Dir = data.hourly?.wind_direction_10m ?? [];

  const num = (v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);
  const out: HourlyContextPoint[] = [];
  const n = Math.min(120, t.length);
  for (let i = 0; i < n; i++) {
    const time = t[i];
    if (!time) continue;
    out.push({
      time,
      tempC: num(T[i]),
      rainMm: num(P[i]),
      wmo: num(W[i]),
      rh: num(H[i]),
      dewC: num(D[i]),
      hPa: num(M[i]),
      windMph: num(S[i]),
      windDir: num(Dir[i]),
    });
  }
  return out;
}

async function waveHeightAtTime(
  lat: number,
  lng: number,
  targetMs: number,
  signal?: AbortSignal,
): Promise<number | null> {
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "wave_height");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("timezone", "GMT");
  const r = await fetch(url.toString(), { cache: "no-store", signal });
  if (!r.ok) return null;
  const d = (await r.json()) as {
    hourly?: { time?: string[]; wave_height?: number[] };
  };
  const times = d.hourly?.time ?? [];
  const heights = d.hourly?.wave_height ?? [];
  if (!times.length || times.length !== heights.length) return null;
  const idx = nearestHourlyIndex(times, targetMs);
  const v = heights[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({
      ok: true as const,
      openAi: false as const,
      text: null,
      hint: "Add OPENAI_API_KEY to enable AI outlook for the map view.",
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });

  const modeRaw = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";
  const mode: LayerMode =
    modeRaw === "waves" || modeRaw === "rain" || modeRaw === "pressure" ? modeRaw : "wind";

  const timeIso = typeof body.timeIso === "string" ? body.timeIso.trim() : "";
  if (!timeIso) return NextResponse.json({ error: "timeIso required" }, { status: 400 });
  const targetMs = new Date(timeIso).getTime();
  if (!Number.isFinite(targetMs)) return NextResponse.json({ error: "Invalid timeIso" }, { status: 400 });

  let hourly: HourlyContextPoint[];
  try {
    hourly = await fetchFiveDayHourlyContext(coords.lat, coords.lng, req.signal);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Weather data failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  if (!hourly.length) return NextResponse.json({ error: "No forecast data" }, { status: 502 });

  const times = hourly.map((h) => h.time);
  const idx = nearestHourlyIndex(times, targetMs);
  const h = hourly[Math.min(idx, hourly.length - 1)]!;
  if (!h) return NextResponse.json({ error: "No hourly row" }, { status: 502 });

  let waveM: number | null = null;
  if (mode === "waves" || mode === "wind") {
    try {
      waveM = await waveHeightAtTime(coords.lat, coords.lng, targetMs, req.signal);
    } catch {
      waveM = null;
    }
  }

  const snapshot = {
    map_layer: mode,
    model_time_utc: timeIso,
    nearest_hour_sample: {
      time: h.time,
      temp_C: h.tempC,
      precip_mm_per_h: h.rainMm,
      rh_pct: h.rh,
      dew_C: h.dewC,
      pressure_msl_hPa: h.hPa,
      wind_mph: h.windMph,
      wind_dir_deg_from: h.windDir,
      wmo_weather_code: h.wmo,
      wave_height_m: waveM,
    },
  };

  const layerHint =
    mode === "wind"
      ? "Wind overlay (particle field uses ECMWF IFS wind in m/s; values below are mph from the same family of model output at the map centre)."
      : mode === "waves"
        ? "Significant wave height (Open‑Meteo marine) when available."
        : mode === "rain"
          ? "Precipitation rate from global model (WMS / forecast context)."
          : "Mean sea level pressure from global model (WMS / forecast context).";

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const user = `${layerHint}

Snapshot JSON at map centre (interpret only this; do not invent storms or harbours):
${JSON.stringify(snapshot)}

Write two short paragraphs in British English for a coastal / small-boat skipper: what this view suggests for the selected layer and time, and one practical caution (e.g. verify wind against observations, sea breeze, gusts, or chart datum). End with one sentence that this is automated model guidance, not a substitute for official shipping forecasts or your own judgement.`;

  try {
    const res = await fetch(openAiChatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 380,
        messages: [
          {
            role: "system" as const,
            content:
              "You are a concise marine weather assistant. Use only the JSON snapshot; no web search. No markdown headings.",
          },
          { role: "user" as const, content: user },
        ],
      }),
      cache: "no-store",
      signal: req.signal,
    });
    if (!res.ok) {
      const detail = await parseOpenAiErrorBody(res);
      return NextResponse.json({ error: `OpenAI error ${res.status}`, detail }, { status: 502 });
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 20) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    }
    return NextResponse.json({ ok: true as const, openAi: true as const, text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
