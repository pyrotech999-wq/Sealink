import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StyleId = "colour" | "bw";

type InfoEntry = {
  storedAtMs: number;
  style: StyleId;
  issueTimeIso: string | null;
  /** Available lead hours found on the page. */
  leads: number[];
};

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, InfoEntry>();
const inflight = new Map<string, Promise<InfoEntry>>();

const LEADS_ALL = Array.from({ length: 8 }, (_, i) => i * 12); // 0..84

function clean(s: string | null): string {
  return (s ?? "").trim();
}

function parseStyle(s: string | null): StyleId | null {
  const v = clean(s).toLowerCase();
  return v === "colour" || v === "bw" ? (v as StyleId) : null;
}

async function fetchHtml(signal?: AbortSignal): Promise<string> {
  const pageUrl = "https://www.metoffice.gov.uk/weather/maps-and-charts/surface-pressure";
  const res = await fetch(pageUrl, {
    cache: "no-store",
    signal,
    headers: {
      "User-Agent": "SeaLink/1.0 (Met Office chart info)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`MetOffice page ${res.status}`);
  return await res.text();
}

function parseIssueTimeIso(html: string): string | null {
  // Example on page: "Issued at: 07:30 (UTC+1) on Wed 6 May 2026"
  const m = html.match(/Issued at:\s*([0-9]{2}:[0-9]{2}).*?on\s*([A-Za-z]{3})\s*(\d{1,2})\s*([A-Za-z]{3})\s*(\d{4})/i);
  if (!m) return null;
  const hhmm = m[1]!;
  const day = Number(m[3]);
  const monStr = m[4]!.toLowerCase();
  const year = Number(m[5]);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
  const monthMap: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const mon = monthMap[monStr.slice(0, 3)];
  if (mon == null) return null;
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  // We don’t have an explicit UTC offset in a machine-readable way.
  // Using UTC gives consistent “issue/valid” labels; the chart itself is authoritative.
  return new Date(Date.UTC(year, mon, day, hh, mm, 0)).toISOString();
}

function parseLeads(style: StyleId, html: string): number[] {
  const re =
    style === "colour"
      ? /surface-pressure\/colour\/[^\"'<>\\s]+\/FSXX00T_(\\d{2})\\.gif/gi
      : /surface-pressure\/bw\/[^\"'<>\\s]+\/[^\\s\"'<>]*FC(\\d{3})\\.gif/gi;
  const set = new Set<number>();
  for (const m of html.matchAll(re)) {
    const raw = m[1];
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (LEADS_ALL.includes(n)) set.add(n);
  }
  const out = [...set].sort((a, b) => a - b);
  return out.length ? out : LEADS_ALL;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const style = parseStyle(url.searchParams.get("style")) ?? "colour";
  const key = `style=${style}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.storedAtMs < TTL_MS) {
    return NextResponse.json({ ok: true, style, issueTimeIso: hit.issueTimeIso, leads: hit.leads, cached: true });
  }

  const existing = inflight.get(key);
  if (existing) {
    const e = await existing;
    return NextResponse.json({ ok: true, style, issueTimeIso: e.issueTimeIso, leads: e.leads, cached: true, inflight: true });
  }

  const p = (async () => {
    const html = await fetchHtml(req.signal);
    const issueTimeIso = parseIssueTimeIso(html);
    const leads = parseLeads(style, html);
    const entry: InfoEntry = { storedAtMs: Date.now(), style, issueTimeIso, leads };
    cache.set(key, entry);
    return entry;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);

  try {
    const e = await p;
    return NextResponse.json({ ok: true, style, issueTimeIso: e.issueTimeIso, leads: e.leads, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upstream unavailable";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

