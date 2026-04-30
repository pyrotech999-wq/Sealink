import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StormAlert = {
  basin: "Atlantic" | "East Pacific";
  title: string;
  summary: string;
  link: string;
};

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFirstStorm(xml: string, basin: StormAlert["basin"]): StormAlert | null {
  // Very small "good enough" RSS parse: find first item whose title mentions tropical cyclone wording.
  const items = xml.split(/<item>/i).slice(1);
  for (const raw of items) {
    const title = (raw.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] ??
      raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ??
      "").trim();
    const link = (raw.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim();
    const desc = (raw.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] ??
      raw.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ??
      "").trim();

    const hay = `${title} ${desc}`.toLowerCase();
    const isStorm =
      hay.includes("hurricane") ||
      hay.includes("tropical storm") ||
      hay.includes("tropical depression") ||
      hay.includes("potential tropical cyclone");
    if (!isStorm) continue;

    const summary = stripHtml(desc).slice(0, 220);
    if (!title || !link) continue;
    return { basin, title: stripHtml(title), summary, link };
  }
  return null;
}

export async function GET(): Promise<Response> {
  try {
    const [at, ep] = await Promise.all([
      fetch("https://www.nhc.noaa.gov/index-at.xml", { cache: "no-store" }).then((r) => r.text()),
      fetch("https://www.nhc.noaa.gov/index-ep.xml", { cache: "no-store" }).then((r) => r.text()),
    ]);

    const alerts: StormAlert[] = [];
    const a = parseFirstStorm(at, "Atlantic");
    const e = parseFirstStorm(ep, "East Pacific");
    if (a) alerts.push(a);
    if (e) alerts.push(e);
    return NextResponse.json({ alerts });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}

