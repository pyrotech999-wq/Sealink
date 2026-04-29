import { NextResponse } from "next/server";
import { fetchCurrentWeatherSnippet } from "@/lib/open-meteo-current-snippet";
import { openAiChatCompletionsUrl, parseOpenAiErrorBody } from "@/lib/openai-server-helpers";
import { reverseGeocodePlace } from "@/lib/reverse-geocode-nominatim";

type Body = { pinLive?: unknown; lat?: unknown; lng?: unknown; seed?: unknown };

function clampLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const STATIC_LINES = [
  "Waking on a boat is the world tilting gently into colour — kettle first, deck shoes second, and the day already tastes of salt.",
  "Your berth shifts once under you and you remember: the marina hum is just another tide, and you are already afloat in it.",
  "Coffee tastes sharper when the hull answers a wake; small rituals feel earned when the horizon is your neighbour.",
  "Some people chase alarms; you peel back a hatch and trade ceiling for sky — unfair advantage, and you know it.",
  "The best mornings do not shout; they arrive with rope-soft light on varnish and a list of jobs you will happily ignore for five minutes.",
  "A boat wake-up is proof that stillness and motion can share a watch — quiet cabin, busy water, both true at once.",
  "You learn to love the polite knock of halyards: the marina saying good morning before you have found your socks.",
  "If home is where you moor your heart, then every dawn afloat is a small reunion with something honest and blue.",
] as const;

function staticMessage(seed: number): string {
  const i = Math.abs(Math.floor(seed)) % STATIC_LINES.length;
  return STATIC_LINES[i] ?? STATIC_LINES[0];
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pinLive = body.pinLive === true;
  const seed = typeof body.seed === "number" && Number.isFinite(body.seed) ? body.seed : Date.now();

  const latRaw = pinLive ? (typeof body.lat === "number" ? body.lat : Number(body.lat)) : Number.NaN;
  const lngRaw = pinLive ? (typeof body.lng === "number" ? body.lng : Number(body.lng)) : Number.NaN;
  const coords = pinLive ? clampLatLng(latRaw, lngRaw) : null;
  if (pinLive && !coords) {
    return NextResponse.json({ error: "Invalid lat/lng for live pin" }, { status: 400 });
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({
      text: staticMessage(seed),
      source: "static" as const,
      place: null,
    });
  }

  let place: { label: string; country?: string } | null = null;
  let weather: Awaited<ReturnType<typeof fetchCurrentWeatherSnippet>> | null = null;

  if (coords) {
    try {
      const [p, w] = await Promise.all([
        reverseGeocodePlace(coords.lat, coords.lng),
        fetchCurrentWeatherSnippet(coords.lat, coords.lng),
      ]);
      place = p;
      weather = w;
    } catch {
      /* continue without context */
    }
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const context = {
    live_gps_on_map: pinLive,
    nearest_place_name: place?.label ?? null,
    current_weather: weather
      ? {
          temp_C: Math.round(weather.tempC * 10) / 10,
          wmo_weather_code: weather.wmo,
          wind_mph: Math.round(weather.windMph),
          precipitation_mm: Math.round(weather.precipMm * 100) / 100,
          mood_for_narrative: weather.mood,
        }
      : null,
  };

  const user = `You write one very short inspirational blurb for people who love boats.

Rules:
- Maximum TWO sentences, under 55 words total.
- British English; warm, sincere, not cheesy hashtags.
- Theme: the quiet joy of waking up on a boat.
- Use only the JSON context below; do not invent storms, warnings, or precise forecasts.
- If nearest_place_name is non-null, mention that place or region naturally once.
- If current_weather is non-null and mood_for_narrative is "good", lightly celebrate a pleasant morning (no numbers required). If mood is "ok" or "rough", stay gentle and honest — no fake sunshine.
- If live_gps_on_map is false, keep it general (no pretend location).

Context JSON:
${JSON.stringify(context)}`;

  try {
    const res = await fetch(openAiChatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.85,
        max_tokens: 140,
        messages: [
          {
            role: "system",
            content:
              "You are a concise literary voice for coastal living. Obey word limits strictly. No markdown, no emojis unless the user context explicitly invites it (it does not).",
          },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await parseOpenAiErrorBody(res);
      return NextResponse.json({
        text: staticMessage(seed),
        source: "fallback" as const,
        detail,
        place: place?.label ?? null,
      });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({
        text: staticMessage(seed),
        source: "fallback" as const,
        place: place?.label ?? null,
      });
    }

    return NextResponse.json({
      text,
      source: "openai" as const,
      model,
      place: place?.label ?? null,
    });
  } catch {
    return NextResponse.json({
      text: staticMessage(seed),
      source: "fallback" as const,
      place: place?.label ?? null,
    });
  }
}
