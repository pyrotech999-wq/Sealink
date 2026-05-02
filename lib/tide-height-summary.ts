import type { TideTableEvent } from "@/lib/tide-table-types";

const PAST_GRACE_MS = 25 * 60 * 1000;

function parseTideInstant(t: string): number {
  const isoish = t.includes("T") ? t : t.replace(" ", "T");
  return new Date(isoish).getTime();
}

/** First upcoming high / low after grace, plus spread (max high − min low) in the supplied extremes list. */
export function summarizeTideExtremes(
  events: TideTableEvent[],
  nowMs: number,
): {
  nextHighM: number | null;
  nextLowM: number | null;
  nextHighT: string | null;
  nextLowT: string | null;
  rangeM: number | null;
} {
  if (!events.length) {
    return { nextHighM: null, nextLowM: null, nextHighT: null, nextLowT: null, rangeM: null };
  }
  const sorted = [...events].sort((a, b) => parseTideInstant(a.t) - parseTideInstant(b.t));
  const t0 = nowMs - PAST_GRACE_MS;
  let nextHighM: number | null = null;
  let nextLowM: number | null = null;
  let nextHighT: string | null = null;
  let nextLowT: string | null = null;
  for (const e of sorted) {
    const ms = parseTideInstant(e.t);
    if (!Number.isFinite(ms) || ms < t0) continue;
    if (e.kind === "high" && nextHighM == null) {
      nextHighM = e.heightM;
      nextHighT = e.t;
    }
    if (e.kind === "low" && nextLowM == null) {
      nextLowM = e.heightM;
      nextLowT = e.t;
    }
    if (nextHighM != null && nextLowM != null) break;
  }
  const highs = events.filter((e) => e.kind === "high").map((e) => e.heightM);
  const lows = events.filter((e) => e.kind === "low").map((e) => e.heightM);
  let rangeM: number | null = null;
  if (highs.length && lows.length) {
    const maxH = Math.max(...highs);
    const minL = Math.min(...lows);
    if (Number.isFinite(maxH) && Number.isFinite(minL)) rangeM = maxH - minL;
  }
  return { nextHighM, nextLowM, nextHighT, nextLowT, rangeM };
}
