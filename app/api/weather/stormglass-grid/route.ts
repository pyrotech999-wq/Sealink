import { NextResponse } from "next/server";
import { fetchStormglassHourRow, pickStormglassNumeric } from "@/lib/stormglass-weather-grid-server";

export const runtime = "nodejs";

const MAX_POINTS = 48;
const CHUNK = 8;

type Body = {
  timeIso?: string;
  layer?: string;
  points?: { lat: number; lng: number }[];
};

export async function POST(req: Request): Promise<Response> {
  const key = process.env.STORMGLASS_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ ok: false, error: "STORMGLASS_API_KEY not configured" }, { status: 503 });
  }

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

  const params = layer === "wind" ? "windSpeed,windDirection" : "waveHeight";
  type Out = {
    lat: number;
    lng: number;
    windSpeed?: number;
    windDirection?: number;
    waveHeight?: number;
  };
  const out: Out[] = [];

  for (let i = 0; i < points.length; i += CHUNK) {
    const slice = points.slice(i, i + CHUNK);
    const rows = await Promise.all(
      slice.map(async (pt) => {
        const hour = await fetchStormglassHourRow(key, pt.lat, pt.lng, timeIso, params, req.signal);
        if (!hour) return { lat: pt.lat, lng: pt.lng } as Out;
        if (layer === "wind") {
          const windSpeed = pickStormglassNumeric(hour.windSpeed);
          const windDirection = pickStormglassNumeric(hour.windDirection);
          return {
            lat: pt.lat,
            lng: pt.lng,
            ...(windSpeed != null ? { windSpeed } : {}),
            ...(windDirection != null ? { windDirection } : {}),
          } as Out;
        }
        const waveHeight = pickStormglassNumeric(hour.waveHeight);
        return {
          lat: pt.lat,
          lng: pt.lng,
          ...(waveHeight != null ? { waveHeight } : {}),
        } as Out;
      }),
    );
    out.push(...rows);
  }

  return NextResponse.json({ ok: true, provider: "stormglass" as const, layer, points: out });
}
