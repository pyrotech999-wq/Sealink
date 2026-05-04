import type { TideTableEvent } from "@/lib/tide-table-types";
import { openAiResponsesUrl, parseOpenAiErrorBody } from "@/lib/openai-server-helpers";

export type TideWebSearchResult = {
  source: "openai_web_search";
  /** e.g. "London / Thames" for the heading line */
  regionLine: string;
  /** Datum label from the source when known */
  datum: string | null;
  events: TideTableEvent[];
};

function todayYmdInTimeZone(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const unwrapped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unwrapped.indexOf("{");
  const end = unwrapped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(unwrapped.slice(start, end + 1)) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (typeof o.output_text === "string" && o.output_text.trim()) return o.output_text.trim();
  const out = o.output;
  if (!Array.isArray(out)) return null;
  const chunks: string[] = [];
  for (const item of out) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.type !== "message") continue;
    const content = row.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const cr = c as Record<string, unknown>;
      if (cr.type === "output_text" && typeof cr.text === "string") chunks.push(cr.text);
    }
  }
  const joined = chunks.join("\n").trim();
  return joined || null;
}

function parseEvents(arr: unknown): TideTableEvent[] | null {
  if (!Array.isArray(arr)) return null;
  const out: TideTableEvent[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const e = row as Record<string, unknown>;
    const kindRaw = typeof e.kind === "string" ? e.kind.toLowerCase() : "";
    const kind: "high" | "low" | null =
      kindRaw === "high" || kindRaw === "h" ? "high" : kindRaw === "low" || kindRaw === "l" ? "low" : null;
    const t = typeof e.t === "string" ? e.t.trim() : "";
    const hm = typeof e.heightM === "number" ? e.heightM : typeof e.height_m === "number" ? e.height_m : NaN;
    if (!kind || !t || !Number.isFinite(hm)) continue;
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) continue;
    out.push({ kind, t: new Date(ms).toISOString(), heightM: hm });
  }
  out.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return out.length >= 2 ? out : null;
}

/**
 * Uses OpenAI Responses API + web search to find published tide tables for the place.
 * Requires OPENAI_API_KEY. Not a substitute for chart datum — user should verify critical times.
 */
export async function fetchTideScheduleFromWebSearch(args: {
  displayLabel: string;
  detail: string;
  nearestMarinaName: string | null;
  lat: number;
  lng: number;
  timeZone: string;
  signal?: AbortSignal;
}): Promise<TideWebSearchResult | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const model =
    process.env.OPENAI_TIDE_WEB_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o";

  const today = todayYmdInTimeZone(args.timeZone, new Date());
  const marinaBit = args.nearestMarinaName
    ? `Nearest named marina in our app: "${args.nearestMarinaName}".`
    : "No named marina from our catalogue — use the place label and coordinates.";

  const instruction = `You must use web search to find official or widely used tide predictions (e.g. UKHO EasyTide, PLA London, national hydrographic services, reputable harbour/marina tide pages) for this boating location.

Place label: ${args.displayLabel}
Extra context: ${args.detail}
${marinaBit}
Coordinates: ${args.lat.toFixed(5)}, ${args.lng.toFixed(5)}
Local calendar date for "today's tides": ${today} (in time zone ${args.timeZone})

Return ONLY valid JSON (no markdown fences), one object:
{
  "regionLine": "short area name for the heading, e.g. London / Thames or Portsmouth Harbour",
  "datum": "chart datum label if stated, else null",
  "events": [
    { "kind": "high", "t": "ISO-8601 instant with offset in ${args.timeZone}", "heightM": 6.72 },
    { "kind": "low", "t": "...", "heightM": 0.81 }
  ]
}

Rules:
- Include at least 4 alternating high/low events covering roughly ${today} local day and nearby hours, sorted by time.
- "t" must be parseable by JavaScript Date (include Z or ±HH:MM offset).
- Heights in metres as published vs the source's tidal/chart datum (e.g. CD, LAT, MLLW, MHWS) — absolute water level above that datum, not signed deviation from mean sea level (2 decimal places typical).
- If the web shows times in local clock time, encode them with the correct offset for ${args.timeZone}.
- Do not invent values: only numbers and times that appear in sources you found via search.`;

  const body = {
    model,
    tools: [{ type: "web_search_preview" as const }],
    tool_choice: { type: "web_search_preview" as const },
    input: instruction,
  };

  try {
    const res = await fetch(openAiResponsesUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: args.signal,
    });
    if (!res.ok) {
      console.warn("[tide-web]", await parseOpenAiErrorBody(res));
      return null;
    }
    const payload: unknown = await res.json();
    const text = extractOutputText(payload);
    if (!text) return null;
    const obj = extractJsonObject(text);
    if (!obj) return null;
    const regionLine =
      typeof obj.regionLine === "string" && obj.regionLine.trim() ? obj.regionLine.trim() : args.displayLabel;
    const datum = typeof obj.datum === "string" && obj.datum.trim() ? obj.datum.trim() : null;
    const events = parseEvents(obj.events);
    if (!events) return null;
    return { source: "openai_web_search", regionLine, datum, events };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    console.warn("[tide-web]", e instanceof Error ? e.message : e);
    return null;
  }
}
