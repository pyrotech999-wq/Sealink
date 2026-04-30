"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getLastKnownPosition } from "@/lib/map-last-known";

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

type ApiOk = {
  ok: true;
  text: string;
  snapshot?: { wave_height_m: number | null; sea_surface_temp_c: number | null };
  tide?: {
    events?: { kind: "high" | "low"; t: string; vMsl: number; vRelMean: number; vAboveLow: number }[];
    rangeM?: number | null;
    datum?: string;
  };
  noaaTideTable?: {
    source: "noaa";
    stationId: string;
    stationName: string;
    distanceKm: number;
    datum: string;
    timeZone: "lst_ldt";
    events: { kind: "high" | "low"; t: string; heightM: number }[];
  } | null;
  tideTable?: {
    source: "worldtides";
    datum: string;
    timezone: string | null;
    atlas: string | null;
    station: string | null;
    copyright: string | null;
    events: { kind: "high" | "low"; t: string; heightM: number }[];
  } | null;
};
type ApiFail = { error: string };

export function SeaStateSummaryBox() {
  const [text, setText] = useState<string | null>(null);
  const [tides, setTides] = useState<{ kind: "high" | "low"; t: string; vMsl: number; vRelMean: number; vAboveLow: number }[]>([]);
  const [tideRangeM, setTideRangeM] = useState<number | null>(null);
  const [tideTable, setTideTable] = useState<ApiOk["tideTable"]>(null);
  const [noaaTideTable, setNoaaTideTable] = useState<ApiOk["noaaTideTable"]>(null);
  const [meteo, setMeteo] = useState<MeteoOk | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bstOn, setBstOn] = useState(true);

  const loc = useMemo(() => (typeof window !== "undefined" ? getLastKnownPosition() : null), []);
  const hasLoc = Boolean(loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng));

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!loc) return;
    setLoading(true);
    setErr(null);
    try {
      const [seaR, meteoR] = await Promise.all([
        fetch(`/api/sea/local-summary?lat=${encodeURIComponent(String(loc.lat))}&lng=${encodeURIComponent(String(loc.lng))}`, {
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
        return;
      }
      const ok = d as ApiOk;
      setText(ok.text);
      setTides(Array.isArray(ok.tide?.events) ? ok.tide!.events! : []);
      setTideRangeM(typeof ok.tide?.rangeM === "number" && Number.isFinite(ok.tide.rangeM) ? ok.tide.rangeM : null);
      setTideTable(ok.tideTable ?? null);
      setNoaaTideTable(ok.noaaTideTable ?? null);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      setErr("Network error");
      setText(null);
      setTides([]);
      setTideRangeM(null);
      setTideTable(null);
      setMeteo(null);
      setNoaaTideTable(null);
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
          Waves, water temperature, and modelled tides based on your last known map position.
        </p>
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
                <div className="mt-2 overflow-hidden rounded-md border border-sky-100 bg-white/70 dark:border-sky-900/40 dark:bg-zinc-950/40">
                  <div className="grid grid-cols-3 gap-2 border-b border-sky-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-sky-900/40 dark:text-zinc-200">
                    <div>Hi/Lo</div>
                    <div>Time</div>
                    <div className="text-right">Height</div>
                  </div>
                  <div className="divide-y divide-sky-100 text-xs dark:divide-sky-900/40">
                    {noaaTideTable.events.slice(0, 8).map((e) => {
                      // NOAA times are local station time already (lst_ldt). We still let the user view as BST/UTC,
                      // but without a timezone offset in the data we can only present the raw HH:MM for readability.
                      const raw = e.t.includes("T") ? e.t.split("T")[1] ?? "" : e.t;
                      const hhmm = raw.slice(0, 5);
                      return (
                        <div key={`${e.kind}:${e.t}:${e.heightM}`} className="grid grid-cols-3 gap-2 px-2 py-1 text-zinc-700 dark:text-zinc-200">
                          <div className={`font-semibold ${e.kind === "high" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                            {e.kind === "high" ? "High" : "Low"}
                          </div>
                          <div className="tabular-nums">{hhmm || "—"}</div>
                          <div className="text-right tabular-nums">{e.heightM.toFixed(2)}m</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : tideTable?.events?.length ? (
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
                <div className="mt-2 overflow-hidden rounded-md border border-sky-100 bg-white/70 dark:border-sky-900/40 dark:bg-zinc-950/40">
                  <div className="grid grid-cols-3 gap-2 border-b border-sky-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-sky-900/40 dark:text-zinc-200">
                    <div>Hi/Lo</div>
                    <div>Time</div>
                    <div className="text-right">Height</div>
                  </div>
                  <div className="divide-y divide-sky-100 text-xs dark:divide-sky-900/40">
                    {tideTable.events.slice(0, 8).map((e) => {
                      const tz = bstOn ? "Europe/London" : "UTC";
                      const time = new Date(e.t).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: tz,
                      });
                      return (
                        <div key={`${e.kind}:${e.t}:${e.heightM}`} className="grid grid-cols-3 gap-2 px-2 py-1 text-zinc-700 dark:text-zinc-200">
                          <div className={`font-semibold ${e.kind === "high" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                            {e.kind === "high" ? "High" : "Low"}
                          </div>
                          <div className="tabular-nums">{time}</div>
                          <div className="text-right tabular-nums">{e.heightM.toFixed(2)}m</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {tideTable.copyright ? (
                  <p className="mt-1 text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">{tideTable.copyright}</p>
                ) : null}
              </div>
            ) : tides.length ? (
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
                  These are <span className="font-semibold">modelled tide levels</span> (not chart‑datum heights) shown as meters relative to the local mean (so values can be +/‑).
                  {tideRangeM != null ? ` Estimated range ~${tideRangeM.toFixed(1)}m.` : ""}
                </p>
                <div className="mt-2 overflow-hidden rounded-md border border-sky-100 bg-white/70 dark:border-sky-900/40 dark:bg-zinc-950/40">
                  <div className="grid grid-cols-3 gap-2 border-b border-sky-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-sky-900/40 dark:text-zinc-200">
                    <div>Hi/Lo</div>
                    <div>Time</div>
                    <div className="text-right">Level</div>
                  </div>
                  <div className="divide-y divide-sky-100 text-xs dark:divide-sky-900/40">
                    {tides.slice(0, 4).map((e) => {
                      const tz = bstOn ? "Europe/London" : "UTC";
                      const time = new Date(e.t).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: tz,
                      });
                      return (
                        <div key={`${e.kind}:${e.t}`} className="grid grid-cols-3 gap-2 px-2 py-1 text-zinc-700 dark:text-zinc-200">
                          <div className={`font-semibold ${e.kind === "high" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                            {e.kind === "high" ? "High" : "Low"}
                          </div>
                          <div className="tabular-nums">{time}</div>
                          <div className="text-right tabular-nums">
                            {e.vRelMean >= 0 ? "+" : ""}
                            {e.vRelMean.toFixed(2)}m
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

