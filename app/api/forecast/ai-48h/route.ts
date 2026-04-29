import { NextResponse } from "next/server";
import { fetch48hHourlyContext, sampleEvery3Hours } from "@/lib/open-meteo-ai-context";

type Body = { lat?: unknown; lng?: unknown };

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function openAiChatUrl(): string {
  const raw = process.env.OPENAI_BASE_URL?.trim();
  const base = raw ? raw.replace(/\/$/, "") : "https://api.openai.com/v1";
  return `${base}/chat/completions`;
}

async function parseOpenAiErrorBody(res: Response): Promise<string> {
  const errText = await res.text();
  try {
    const j = JSON.parse(errText) as { error?: { message?: string } };
    if (typeof j.error?.message === "string" && j.error.message.trim()) {
      return j.error.message.trim();
    }
  } catch {
    /* use raw */
  }
  return errText.slice(0, 500);
}

/** Lightweight: whether server has an API key (no token usage). */
export async function GET() {
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  return NextResponse.json({ configured });
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({
      configured: false as const,
      text: null,
      hint: "Add OPENAI_API_KEY to .env.local to enable the AI outlook.",
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
  if (!coords) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }

  let series: Awaited<ReturnType<typeof fetch48hHourlyContext>>;
  try {
    series = await fetch48hHourlyContext(coords.lat, coords.lng);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Weather data failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const sample = sampleEvery3Hours(series);
  const payload = {
    location: { latitude: coords.lat, longitude: coords.lng },
    hours_48_sampled_every_3h: sample.map((p) => ({
      time: p.time,
      temp_C: Math.round(p.tempC * 10) / 10,
      precip_mm: Math.round(p.rainMm * 10) / 10,
      wmo_weather_code: p.wmo,
      rh_pct: Math.round(p.rh),
      dew_C: Math.round(p.dewC * 10) / 10,
      pressure_msl_hPa: Math.round(p.hPa),
      wind_mph: Math.round(p.windMph),
      wind_dir_deg_from: Math.round(p.windDir),
    })),
  };

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const user = `Model hourly sample (3-hour steps, next ~48h) as JSON. Interpret only from this data; do not invent storms or exact times not implied. Temperatures are °C. Wind speed is mph, direction is degrees FROM which wind blows (met convention).

${JSON.stringify(payload)}

Write 2–4 short paragraphs for a small-boat / coastal reader: trends, rain risk, wind, comfort (humidity/dew point if useful), pressure tendency if visible. End with one line that this is automated model guidance, not a substitute for official shipping forecasts or your own judgement.`;

  try {
    const res = await fetch(openAiChatUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "You are a careful marine weather assistant. Only use numbers and patterns present in the user JSON. Be concise and practical. British English.",
          },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await parseOpenAiErrorBody(res);
      return NextResponse.json({ error: `OpenAI error ${res.status}`, detail }, { status: 502 });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: "Empty model response" }, { status: 502 });
    }

    return NextResponse.json({ configured: true as const, text, model });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
