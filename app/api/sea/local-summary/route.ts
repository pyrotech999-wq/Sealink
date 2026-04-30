import { NextResponse } from "next/server";

export const runtime = "nodejs";

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

type MarineResp = {
  hourly?: Record<string, (number | string)[] | undefined> & { time?: string[] };
  hourly_units?: Record<string, string>;
  timezone?: string;
};

function numAt(arr: unknown, idx: number): number | null {
  if (!Array.isArray(arr)) return null;
  const v = arr[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function waveLabel(m: number): string {
  if (m < 0.3) return "glassy";
  if (m < 0.6) return "slight";
  if (m < 1.25) return "moderate";
  if (m < 2.5) return "rough";
  if (m < 4) return "very rough";
  return "phenomenal";
}

function dirText(deg: number | null): string | null {
  if (deg == null) return null;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[i] ?? null;
}

type TideEvent = { kind: "high" | "low"; t: string; v: number };

function findNextTides(times: string[], sea: number[], nowMs: number, limit = 4): TideEvent[] {
  const out: TideEvent[] = [];
  for (let i = 1; i < sea.length - 1; i++) {
    const t = times[i];
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (!Number.isFinite(ms) || ms <= nowMs) continue;
    const a = sea[i - 1]!;
    const b = sea[i]!;
    const c = sea[i + 1]!;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) continue;
    if (b >= a && b >= c) out.push({ kind: "high", t, v: b });
    else if (b <= a && b <= c) out.push({ kind: "low", t, v: b });
    if (out.length >= limit) break;
  }
  return out;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const coords = clampLatLng(lat, lng);
  if (!coords) return NextResponse.json({ error: "lat and lng required" }, { status: 400 });

  const api = new URL("https://marine-api.open-meteo.com/v1/marine");
  api.searchParams.set("latitude", String(coords.lat));
  api.searchParams.set("longitude", String(coords.lng));
  api.searchParams.set(
    "hourly",
    [
      "wave_height",
      "wave_period",
      "wave_direction",
      "sea_surface_temperature",
      "sea_level_height_msl",
    ].join(","),
  );
  api.searchParams.set("timezone", "auto");
  api.searchParams.set("forecast_days", "3");
  api.searchParams.set("length_unit", "metric");

  try {
    const r = await fetch(api.toString(), { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `Marine request failed (${r.status})` }, { status: 502 });
    const data = (await r.json()) as MarineResp;
    const h = data.hourly;
    const times = (h?.time ?? []) as string[];
    if (!times.length) return NextResponse.json({ error: "No marine data returned" }, { status: 502 });

    // Find nearest hour index.
    const now = Date.now();
    let idx = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i++) {
      const ms = new Date(times[i]!).getTime();
      const d = Math.abs(ms - now);
      if (d < best) {
        best = d;
        idx = i;
      }
    }

    const waveM = numAt(h?.wave_height, idx);
    const waveP = numAt(h?.wave_period, idx);
    const waveD = numAt(h?.wave_direction, idx);
    const sst = numAt(h?.sea_surface_temperature, idx);
    const sea = (h?.sea_level_height_msl ?? []) as number[];
    const seaTimes = times;

    const tides =
      Array.isArray(sea) && sea.length === seaTimes.length ? findNextTides(seaTimes, sea, now, 4) : [];

    const parts: string[] = [];
    if (waveM != null) {
      const lbl = waveLabel(waveM);
      const dir = dirText(waveD);
      parts.push(
        `Sea state looks ${lbl} with waves around ${waveM.toFixed(1)}m${waveP != null ? ` (period ${Math.round(waveP)}s)` : ""}${dir ? ` from ${dir}` : ""}.`,
      );
    }
    if (sst != null) parts.push(`Sea surface temperature is about ${sst.toFixed(1)}°C.`);
    if (tides.length) {
      const fmt = (iso: string) =>
        new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      const tideBits = tides
        .slice(0, 2)
        .map((e) => `${e.kind === "high" ? "High" : "Low"} tide ~${fmt(e.t)}`);
      parts.push(`${tideBits.join(" · ")} (modelled).`);
    } else {
      parts.push("Tide estimate unavailable for this area.");
    }

    const text = parts.join(" ");
    return NextResponse.json({
      ok: true,
      text,
      now: new Date(now).toISOString(),
      hourly_units: data.hourly_units ?? {},
      snapshot: {
        wave_height_m: waveM,
        wave_period_s: waveP,
        wave_direction_deg: waveD,
        sea_surface_temp_c: sst,
      },
      tide: {
        events: tides,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Network error" }, { status: 502 });
  }
}

