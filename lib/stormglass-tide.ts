import type { TideTableEvent } from "@/lib/tide-table-types";

export type StormglassTideTable = {
  source: "stormglass";
  stationName: string;
  distanceKm: number | null;
  datum: string;
  events: TideTableEvent[];
};

/** Stormglass tide extremes (global). Requires STORMGLASS_API_KEY. */
export async function fetchStormglassTideExtremes(
  lat: number,
  lng: number,
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<StormglassTideTable | null> {
  const key = process.env.STORMGLASS_API_KEY?.trim();
  if (!key) return null;

  const fmt = (d: Date) => d.toISOString().slice(0, 13);
  const url = new URL("https://api.stormglass.io/v2/tide/extremes/point");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("start", fmt(start));
  url.searchParams.set("end", fmt(end));
  /** MLLW: heights above mean lower low water (chart-style datum). MSL gives signed deviation from average sea level. */
  url.searchParams.set("datum", "MLLW");

  try {
    const r = await fetch(url.toString(), {
      signal,
      headers: { Authorization: key },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: { height?: number; time?: string; type?: string }[];
      meta?: {
        station?: { name?: string; distance?: number };
        datum?: string;
      };
    };
    const rows = Array.isArray(j.data) ? j.data : [];
    const events: TideTableEvent[] = rows
      .map((row) => {
        const t = typeof row.time === "string" ? row.time : null;
        const hRaw = row.height;
        const h =
          typeof hRaw === "number" && Number.isFinite(hRaw)
            ? hRaw
            : typeof hRaw === "string" && Number.isFinite(Number(hRaw))
              ? Number(hRaw)
              : null;
        const typ = typeof row.type === "string" ? row.type.toLowerCase() : "";
        if (!t || h == null) return null;
        const kind: "high" | "low" | null = typ.includes("high") ? "high" : typ.includes("low") ? "low" : null;
        if (!kind) return null;
        return { kind, t, heightM: h };
      })
      .filter((x): x is TideTableEvent => Boolean(x));

    if (!events.length) return null;

    const meta = j.meta && typeof j.meta === "object" ? (j.meta as Record<string, unknown>) : {};
    const st = meta.station && typeof meta.station === "object" ? (meta.station as Record<string, unknown>) : null;
    const stationName =
      st && typeof st.name === "string" && st.name.trim() ? st.name.trim() : "Nearest station";
    const distRaw = st && typeof st.distance === "number" && Number.isFinite(st.distance) ? st.distance : null;
    /** Stormglass returns station distance in metres. */
    const distanceKm = distRaw != null ? distRaw / 1000 : null;
    const datum = typeof j.meta?.datum === "string" && j.meta.datum ? j.meta.datum : "MLLW";

    return {
      source: "stormglass",
      stationName,
      distanceKm,
      datum,
      events,
    };
  } catch {
    return null;
  }
}
