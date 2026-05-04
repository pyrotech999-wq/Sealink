"use client";

import { useCallback, useEffect, useState } from "react";
import { getLastKnownPosition, LAST_KNOWN_GEO_EVENT, type LastKnownGeo } from "@/lib/map-last-known";
import {
  localCalendarDayKey,
  patchHomeOpenAiCache,
  patchSeaSummaryTextForMergedWebSearch,
  planSeaLocalSummaryOpenAi,
  readHomeOpenAiCache,
  recordOpenAiUsageIfApplicable,
} from "@/lib/openai-home-client-cache";

type MeteoOk = {
  ok: true;
  source: "meteostat" | "open-meteo-model";
  station: { id: string; name: string | null; country: string | null; distanceM: number | null };
  reading: {
    timeIso: string | null;
    tempC: number | null;
    windKph: number | null;
    windDirDeg: number | null;
    gustKph: number | null;
    pressureHpa: number | null;
    precipMm: number | null;
  };
};
type MeteoFail = { error: string };

type TideHeightSummary = {
  nextHighM: number | null;
  nextLowM: number | null;
  nextHighT: string | null;
  nextLowT: string | null;
  rangeM: number | null;
};

type SeaTideContextOut = {
  displayLabel: string;
  detail: string;
  via: "marina" | "place";
  nearestMarina: {
    name: string;
    harbour: string;
    region: string;
    country: string;
    distanceKm: number;
  } | null;
  nominatim: { label: string; country?: string } | null;
  tideQuery?: {
    source: "user" | "marina";
    marinaName: string | null;
    offsetKm: number;
  };
};

type ApiOk = {
  ok: true;
  /** True when this response invoked OpenAI (tide web search or tide narrative). */
  openAiInThisRequest?: boolean;
  text: string;
  snapshot?: { wave_height_m: number | null; sea_surface_temp_c: number | null };
  seaTideContext?: SeaTideContextOut;
  tideDisplayTimeZone?: string;
  tideAiNarrative?: string | null;
  tide?: {
    events?: { kind: "high" | "low"; t: string; vMsl: number; vRelMean: number; vAboveLow: number; vAbsEstM: number }[];
    rangeM?: number | null;
    datum?: string;
    mslOffsetM?: number;
    heightSummary?: TideHeightSummary;
  };
  noaaTideTable?: {
    source: "noaa";
    stationId: string;
    stationName: string;
    distanceKm: number;
    datum: string;
    timeZone: "lst_ldt";
    events: { kind: "high" | "low"; t: string; heightM: number }[];
    heightSummary?: TideHeightSummary;
  } | null;
  stormglassTideTable?: {
    source: "stormglass";
    stationName: string;
    distanceKm: number | null;
    datum: string;
    events: { kind: "high" | "low"; t: string; heightM: number }[];
    heightSummary?: TideHeightSummary;
  } | null;
  tideTable?: {
    source: "worldtides";
    datum: string;
    timezone: string | null;
    atlas: string | null;
    station: string | null;
    copyright: string | null;
    events: { kind: "high" | "low"; t: string; heightM: number }[];
    heightSummary?: TideHeightSummary;
  } | null;
  tideWebSearch?: {
    source: "openai_web_search";
    regionLine: string;
    datum: string | null;
    events: { kind: "high" | "low"; t: string; heightM: number }[];
    heightSummary?: TideHeightSummary;
  } | null;
};
type ApiFail = { error: string };

function TideHeightsSummaryBlock({
  summary,
  mslOffsetM,
  datumNote,
  modelledNote,
}: {
  summary: TideHeightSummary | undefined;
  mslOffsetM: number;
  datumNote?: string;
  /** Shown under list when modelled heights include env offset */
  modelledNote?: boolean;
}) {
  if (!summary) return null;
  const { nextHighM, nextLowM, rangeM } = summary;
  if (nextHighM == null && nextLowM == null && rangeM == null) return null;
  const ref = datumNote?.trim() || "listed datum";
  return (
    <div className="mt-2 rounded-md border border-sky-100/90 bg-white/90 px-2 py-2 text-[11px] leading-snug text-zinc-700 dark:border-sky-900/40 dark:bg-zinc-950/50 dark:text-zinc-200">
      <p className="font-semibold text-sky-950 dark:text-sky-100">At a glance (metres)</p>
      <ul className="mt-1 space-y-1">
        {nextHighM != null ? (
          <li className="flex flex-wrap items-baseline gap-x-1">
            <span className="font-medium text-emerald-800 dark:text-emerald-300">Next high</span>
            <span className="tabular-nums text-base font-semibold text-zinc-900 dark:text-zinc-50">{nextHighM.toFixed(2)} m</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">({ref})</span>
          </li>
        ) : null}
        {nextLowM != null ? (
          <li className="flex flex-wrap items-baseline gap-x-1">
            <span className="font-medium text-amber-800 dark:text-amber-300">Next low</span>
            <span className="tabular-nums text-base font-semibold text-zinc-900 dark:text-zinc-50">{nextLowM.toFixed(2)} m</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">({ref})</span>
          </li>
        ) : null}
        {rangeM != null ? (
          <li className="flex flex-wrap items-baseline gap-x-1 border-t border-sky-100/80 pt-1 dark:border-sky-900/40">
            <span className="font-medium text-sky-900 dark:text-sky-200">Tide range</span>
            <span className="tabular-nums text-base font-semibold text-zinc-900 dark:text-zinc-50">{rangeM.toFixed(2)} m</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">(highest high − lowest low in this list)</span>
          </li>
        ) : null}
      </ul>
      {modelledNote && mslOffsetM !== 0 ? (
        <p className="mt-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          Modelled “sea level” values include server offset{" "}
          <code className="rounded bg-zinc-200/80 px-0.5 dark:bg-zinc-800">TIDE_ESTIMATED_MSL_OFFSET_METERS</code>={" "}
          {mslOffsetM.toFixed(2)} m.
        </p>
      ) : null}
    </div>
  );
}

export function SeaStateSummaryBox() {
  const [text, setText] = useState<string | null>(null);
  const [tideWebSearch, setTideWebSearch] = useState<ApiOk["tideWebSearch"]>(null);
  const [tideTable, setTideTable] = useState<ApiOk["tideTable"]>(null);
  const [noaaTideTable, setNoaaTideTable] = useState<ApiOk["noaaTideTable"]>(null);
  const [stormglassTideTable, setStormglassTideTable] = useState<ApiOk["stormglassTideTable"]>(null);
  const [seaTideContext, setSeaTideContext] = useState<SeaTideContextOut | null>(null);
  const [tideDisplayTimeZone, setTideDisplayTimeZone] = useState<string>("Europe/London");
  const [tideAiNarrative, setTideAiNarrative] = useState<string | null>(null);
  const [meteo, setMeteo] = useState<MeteoOk | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bstOn, setBstOn] = useState(true);
  const [tideMslOffsetM, setTideMslOffsetM] = useState(0);

  const [loc, setLoc] = useState<LastKnownGeo | null>(() =>
    typeof window !== "undefined" ? getLastKnownPosition() : null,
  );
  const hasLoc = Boolean(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setLoc(getLastKnownPosition());
    };
    sync();
    const onGeo = () => sync();
    window.addEventListener(LAST_KNOWN_GEO_EVENT, onGeo as EventListener);
    const id = window.setInterval(sync, 5000);
    return () => {
      window.removeEventListener(LAST_KNOWN_GEO_EVENT, onGeo as EventListener);
      window.clearInterval(id);
    };
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!loc) return;
    setLoading(true);
    setErr(null);
    try {
      const cache = readHomeOpenAiCache();
      const plan = planSeaLocalSummaryOpenAi({
        now: Date.now(),
        current: { lat: loc.lat, lng: loc.lng },
        cache,
      });
      const seaQs = new URLSearchParams({
        lat: String(loc.lat),
        lng: String(loc.lng),
      });
      if (plan.skipOpenAi) seaQs.set("skipOpenAi", "1");

      const [seaR, meteoR] = await Promise.all([
        fetch(`/api/sea/local-summary?${seaQs.toString()}`, {
          cache: "no-store",
          signal,
        }),
        fetch(`/api/meteo/nearest?lat=${encodeURIComponent(String(loc.lat))}&lng=${encodeURIComponent(String(loc.lng))}`, {
          cache: "no-store",
          signal,
        }),
      ]);

      const meteoJson = (await meteoR.json()) as MeteoOk | MeteoFail;
      if (meteoR.ok && (meteoJson as MeteoOk).ok) setMeteo(meteoJson as MeteoOk);
      else setMeteo(null);

      const d = (await seaR.json()) as ApiOk | ApiFail;
      if (!seaR.ok) {
        const f = d as ApiFail;
        setErr(f.error || "Could not load sea state");
        setText(null);
        setTideWebSearch(null);
        return;
      }
      const ok = d as ApiOk;

      const hasOfficialFromServer =
        Boolean(ok.noaaTideTable?.events?.length) ||
        Boolean(ok.stormglassTideTable?.events?.length) ||
        Boolean(ok.tideTable?.events?.length);

      let tideWebSearchOut = ok.tideWebSearch ?? null;
      let tideAiOut =
        typeof ok.tideAiNarrative === "string" && ok.tideAiNarrative.trim() ? ok.tideAiNarrative.trim() : null;
      let textOut = ok.text;

      if (plan.mergeFromCache) {
        if (!hasOfficialFromServer && !tideWebSearchOut?.events?.length && plan.mergeFromCache.tideWebSearch?.events?.length) {
          tideWebSearchOut = plan.mergeFromCache.tideWebSearch;
        }
        if (!tideAiOut && plan.mergeFromCache.tideAiNarrative?.trim()) {
          tideAiOut = plan.mergeFromCache.tideAiNarrative.trim();
        }
        if (tideWebSearchOut?.events?.length && ok.seaTideContext?.displayLabel) {
          textOut = patchSeaSummaryTextForMergedWebSearch(textOut, ok.seaTideContext.displayLabel);
        }
      }

      setText(textOut);
      setTideWebSearch(tideWebSearchOut);
      setTideTable(ok.tideTable ?? null);
      setNoaaTideTable(ok.noaaTideTable ?? null);
      setStormglassTideTable(ok.stormglassTideTable ?? null);
      setSeaTideContext(ok.seaTideContext ?? null);
      setTideDisplayTimeZone(ok.tideDisplayTimeZone?.trim() || "Europe/London");
      setTideAiNarrative(tideAiOut);
      setTideMslOffsetM(typeof ok.tide?.mslOffsetM === "number" && Number.isFinite(ok.tide.mslOffsetM) ? ok.tide.mslOffsetM : 0);

      if (!plan.mergeFromCache) {
        patchHomeOpenAiCache({
          seaOpenAi: {
            tideWebSearch: ok.tideWebSearch ?? null,
            tideAiNarrative:
              typeof ok.tideAiNarrative === "string" && ok.tideAiNarrative.trim() ? ok.tideAiNarrative.trim() : null,
            generatedAt: Date.now(),
            originLat: loc.lat,
            originLng: loc.lng,
            storedDay: localCalendarDayKey(),
          },
        });
      }
      recordOpenAiUsageIfApplicable({ seaUsedOpenAi: ok.openAiInThisRequest === true });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      setErr("Network error");
      setText(null);
      setTideWebSearch(null);
      setTideTable(null);
      setMeteo(null);
      setNoaaTideTable(null);
      setStormglassTideTable(null);
      setSeaTideContext(null);
      setTideAiNarrative(null);
      setTideMslOffsetM(0);
    } finally {
      setLoading(false);
    }
  }, [loc]);

  useEffect(() => {
    if (!hasLoc) return;
    const ac = new AbortController();
    queueMicrotask(() => void load(ac.signal));
    return () => ac.abort();
  }, [hasLoc, load]);

  if (!hasLoc) {
    return (
      <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sea state near you</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Open the map and allow location once to generate local sea conditions.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-3">
        <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sea state near you</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Waves and temperature from your last map fix (Open‑Meteo marine, no tide heights). If a listed harbour or
          marina is within about <span className="font-medium">25 miles</span>, we name that place first; otherwise tides
          follow your GPS fix.
        </p>
        {seaTideContext ? (
          <p className="mt-1 text-xs text-sky-900/90 dark:text-sky-100/90">
            Tide reference: <span className="font-semibold">{seaTideContext.displayLabel}</span>
            {seaTideContext.nearestMarina ? (
              <span className="text-zinc-600 dark:text-zinc-300">
                {" "}
                · nearest listed marina ~{seaTideContext.nearestMarina.distanceKm}km (
                {seaTideContext.nearestMarina.name})
              </span>
            ) : null}
            {seaTideContext.tideQuery?.source === "marina" ? (
              <span className="block text-[11px] text-emerald-800 dark:text-emerald-300/90">
                Tide grid anchored to catalogue harbour/marina (~{seaTideContext.tideQuery.offsetKm}km from your
                position).
              </span>
            ) : null}
            <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{seaTideContext.detail}</span>
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/30">
        {loading && !text ? <p className="text-sm text-sky-950/90 dark:text-sky-100/90">Loading sea state…</p> : null}
        {err ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </p>
        ) : null}
        {text ? (
          <div className="rounded-lg border border-sky-200/80 bg-white/90 px-4 py-3 text-sm leading-7 text-zinc-800 dark:border-sky-800/60 dark:bg-zinc-950/80 dark:text-zinc-200">
            <p>{text}</p>
            {tideAiNarrative ? (
              <p className="mt-2 rounded-md border border-sky-100/80 bg-sky-50/50 px-3 py-2 text-xs italic leading-5 text-zinc-700 dark:border-sky-900/30 dark:bg-sky-950/25 dark:text-zinc-200">
                {tideAiNarrative}
              </p>
            ) : null}
            {meteo ? (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
                <p className="text-xs font-semibold text-sky-950 dark:text-sky-100">Nearest meteo station</p>
                <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {meteo.station.name ?? "Station"}{meteo.station.country ? ` (${meteo.station.country})` : ""} ·{" "}
                  {meteo.source === "meteostat" ? "Observed" : "Modelled"}{meteo.station.distanceM != null ? ` · ~${Math.round(meteo.station.distanceM / 1000)}km away` : ""}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-700 dark:text-zinc-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Temp</span>
                    <span className="tabular-nums">{meteo.reading.tempC != null ? `${meteo.reading.tempC.toFixed(1)}°C` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Pressure</span>
                    <span className="tabular-nums">{meteo.reading.pressureHpa != null ? `${Math.round(meteo.reading.pressureHpa)} hPa` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Wind</span>
                    <span className="tabular-nums">{meteo.reading.windKph != null ? `${Math.round(meteo.reading.windKph)} km/h` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Gust</span>
                    <span className="tabular-nums">{meteo.reading.gustKph != null ? `${Math.round(meteo.reading.gustKph)} km/h` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Wind dir</span>
                    <span className="tabular-nums">{meteo.reading.windDirDeg != null ? `${Math.round(meteo.reading.windDirDeg)}°` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Rain</span>
                    <span className="tabular-nums">{meteo.reading.precipMm != null ? `${meteo.reading.precipMm.toFixed(1)} mm` : "—"}</span>
                  </div>
                </div>
              </div>
            ) : null}
            {noaaTideTable?.events?.length ? (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-sky-950 dark:text-sky-100">
                    Tide Times{bstOn ? "BST" : "UTC"}:{" "}
                    <span className="font-normal text-zinc-600 dark:text-zinc-300">
                      British Summer Time on/off
                    </span>
                  </p>
                  <label className="flex select-none items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                    <span>BST</span>
                    <input
                      type="checkbox"
                      checked={bstOn}
                      onChange={(e) => setBstOn(e.target.checked)}
                      className="h-4 w-4 accent-sky-600"
                    />
                  </label>
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Source: <span className="font-semibold">NOAA</span> · Datum:{" "}
                  <span className="font-semibold">{noaaTideTable.datum}</span> · Station:{" "}
                  <span className="font-semibold">{noaaTideTable.stationName}</span>{" "}
                  <span className="text-zinc-400">(~{Math.round(noaaTideTable.distanceKm)}km)</span>
                </p>
                <TideHeightsSummaryBlock
                  summary={noaaTideTable.heightSummary}
                  mslOffsetM={tideMslOffsetM}
                  datumNote={`${noaaTideTable.datum} — NOAA`}
                />
                <div className="mt-2 overflow-hidden rounded-md border border-sky-100 bg-white/70 dark:border-sky-900/40 dark:bg-zinc-950/40">
                  <div className="grid grid-cols-3 gap-2 border-b border-sky-100 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 dark:border-sky-900/40 dark:text-zinc-200">
                    <div>High / Low</div>
                    <div>Time (station)</div>
                    <div className="text-right">Height (m)</div>
                  </div>
                  <div className="divide-y divide-sky-100 text-xs dark:divide-sky-900/40">
                    {noaaTideTable.events.slice(0, 8).map((e) => {
                      const raw = e.t.includes("T") ? e.t.split("T")[1] ?? "" : e.t;
                      const hhmm = raw.slice(0, 5);
                      return (
                        <div key={`${e.kind}:${e.t}:${e.heightM}`} className="grid grid-cols-3 gap-2 px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                          <div className={`font-semibold ${e.kind === "high" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                            {e.kind === "high" ? "High" : "Low"}
                          </div>
                          <div className="tabular-nums">{hhmm || "—"}</div>
                          <div className="text-right tabular-nums font-medium">{e.heightM.toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Heights are official predictions in metres vs <span className="font-medium">{noaaTideTable.datum}</span>{" "}
                  for <span className="font-medium">{noaaTideTable.stationName}</span>.
                </p>
              </div>
            ) : stormglassTideTable?.events?.length ? (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-sky-950 dark:text-sky-100">
                    Tide Times{bstOn ? " (local)" : " (UTC)"}:{" "}
                    <span className="font-normal text-zinc-600 dark:text-zinc-300">
                      {bstOn ? tideDisplayTimeZone : "UTC"}
                    </span>
                  </p>
                  <label className="flex select-none items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                    <span>Local TZ</span>
                    <input
                      type="checkbox"
                      checked={bstOn}
                      onChange={(e) => setBstOn(e.target.checked)}
                      className="h-4 w-4 accent-sky-600"
                    />
                  </label>
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Source: <span className="font-semibold">Stormglass</span> · Datum:{" "}
                  <span className="font-semibold">{stormglassTideTable.datum}</span> · Station:{" "}
                  <span className="font-semibold">{stormglassTideTable.stationName}</span>
                  {stormglassTideTable.distanceKm != null ? (
                    <span className="text-zinc-400"> (~{stormglassTideTable.distanceKm.toFixed(1)}km)</span>
                  ) : null}
                </p>
                <TideHeightsSummaryBlock
                  summary={stormglassTideTable.heightSummary}
                  mslOffsetM={tideMslOffsetM}
                  datumNote={`${stormglassTideTable.datum} — Stormglass`}
                />
                <div className="mt-2 overflow-hidden rounded-md border border-sky-100 bg-white/70 dark:border-sky-900/40 dark:bg-zinc-950/40">
                  <div className="grid grid-cols-3 gap-2 border-b border-sky-100 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 dark:border-sky-900/40 dark:text-zinc-200">
                    <div>High / Low</div>
                    <div>Time</div>
                    <div className="text-right">Height (m)</div>
                  </div>
                  <div className="divide-y divide-sky-100 text-xs dark:divide-sky-900/40">
                    {stormglassTideTable.events.slice(0, 8).map((e) => {
                      const tz = bstOn ? tideDisplayTimeZone : "UTC";
                      const time = new Date(e.t).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: tz,
                      });
                      return (
                        <div key={`${e.kind}:${e.t}:${e.heightM}`} className="grid grid-cols-3 gap-2 px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                          <div className={`font-semibold ${e.kind === "high" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                            {e.kind === "high" ? "High" : "Low"}
                          </div>
                          <div className="tabular-nums">{time}</div>
                          <div className="text-right tabular-nums font-medium">{e.heightM.toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Heights in metres vs <span className="font-medium">{stormglassTideTable.datum}</span> from Stormglass
                  for <span className="font-medium">{stormglassTideTable.stationName}</span>.
                </p>
              </div>
            ) : tideTable?.events?.length ? (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-sky-950 dark:text-sky-100">
                    Tide Times{bstOn ? " (local)" : " (UTC)"}:{" "}
                    <span className="font-normal text-zinc-600 dark:text-zinc-300">
                      {bstOn ? tideDisplayTimeZone : "UTC"}
                    </span>
                  </p>
                  <label className="flex select-none items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                    <span>Local TZ</span>
                    <input
                      type="checkbox"
                      checked={bstOn}
                      onChange={(e) => setBstOn(e.target.checked)}
                      className="h-4 w-4 accent-sky-600"
                    />
                  </label>
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Source: <span className="font-semibold">WorldTides</span> · Datum:{" "}
                  <span className="font-semibold">{tideTable.datum || "CD"}</span>
                  {tideTable.station ? (
                    <>
                      {" "}
                      · Station: <span className="font-semibold">{tideTable.station}</span>
                    </>
                  ) : tideTable.atlas ? (
                    <>
                      {" "}
                      · Atlas: <span className="font-semibold">{tideTable.atlas}</span>
                    </>
                  ) : null}
                </p>
                <TideHeightsSummaryBlock
                  summary={tideTable.heightSummary}
                  mslOffsetM={tideMslOffsetM}
                  datumNote={`${tideTable.datum || "CD"} — WorldTides`}
                />
                <div className="mt-2 overflow-hidden rounded-md border border-sky-100 bg-white/70 dark:border-sky-900/40 dark:bg-zinc-950/40">
                  <div className="grid grid-cols-3 gap-2 border-b border-sky-100 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 dark:border-sky-900/40 dark:text-zinc-200">
                    <div>High / Low</div>
                    <div>Time</div>
                    <div className="text-right">Height (m)</div>
                  </div>
                  <div className="divide-y divide-sky-100 text-xs dark:divide-sky-900/40">
                    {tideTable.events.slice(0, 8).map((e) => {
                      const tz = bstOn ? tideDisplayTimeZone : "UTC";
                      const time = new Date(e.t).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: tz,
                      });
                      return (
                        <div key={`${e.kind}:${e.t}:${e.heightM}`} className="grid grid-cols-3 gap-2 px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                          <div className={`font-semibold ${e.kind === "high" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                            {e.kind === "high" ? "High" : "Low"}
                          </div>
                          <div className="tabular-nums">{time}</div>
                          <div className="text-right tabular-nums font-medium">{e.heightM.toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Heights in metres vs <span className="font-medium">{tideTable.datum || "CD"}</span> (WorldTides).
                </p>
                {tideTable.copyright ? (
                  <p className="mt-1 text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">{tideTable.copyright}</p>
                ) : null}
              </div>
            ) : tideWebSearch?.events?.length ? (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-sky-950 dark:text-sky-100">Web search tides</p>
                  <label className="flex select-none items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-200">
                    <span>Local TZ</span>
                    <input
                      type="checkbox"
                      checked={bstOn}
                      onChange={(e) => setBstOn(e.target.checked)}
                      className="h-4 w-4 accent-sky-600"
                    />
                  </label>
                </div>
                <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  <p>
                    {seaTideContext?.nearestMarina?.name ? (
                      <>
                        Nearest marina:{" "}
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">{seaTideContext.nearestMarina.name}</span>
                      </>
                    ) : (
                      <>
                        Tide reference:{" "}
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {seaTideContext?.displayLabel ?? "Your area"}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="font-medium">
                    <span aria-hidden>📅</span> Today&apos;s tides ({tideWebSearch.regionLine})
                  </p>
                  <ul className="list-none space-y-1 pl-0">
                    {tideWebSearch.events.slice(0, 8).map((e) => {
                      const tz = bstOn ? tideDisplayTimeZone : "UTC";
                      const hhmm = new Date(e.t).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                        timeZone: tz,
                      });
                      const label = e.kind === "high" ? "High tide" : "Low tide";
                      return (
                        <li key={`${e.kind}:${e.t}:${e.heightM}`} className="tabular-nums">
                          {label}: {hhmm} — {e.heightM.toFixed(2)} m
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <TideHeightsSummaryBlock
                  summary={tideWebSearch.heightSummary}
                  mslOffsetM={tideMslOffsetM}
                  datumNote={tideWebSearch.datum?.trim() || "as published on web sources"}
                />
                <p className="mt-2 text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">
                  Times from OpenAI web search ({bstOn ? tideDisplayTimeZone : "UTC"}). Verify against an official tide
                  table or almanac before navigation.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

