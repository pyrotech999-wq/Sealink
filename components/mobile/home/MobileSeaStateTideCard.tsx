'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Waves, Thermometer, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { distanceMeters } from '@/lib/geo-haversine';
import { getLastKnownPosition, LAST_KNOWN_GEO_EVENT, type LastKnownGeo } from '@/lib/map-last-known';

const LOC_STATE_MIN_MOVE_M = 20;
const LOC_POLL_MS = 60_000;
const SEA_METEO_MIN_INTERVAL_MS = 5 * 60 * 1000;

type TideEvent = { kind: 'high' | 'low'; t: string; heightM: number };

type SeaData = {
  text: string;
  snapshot?: { wave_height_m: number | null; sea_surface_temp_c: number | null };
  noaaTideTable?: { events: TideEvent[]; datum: string; stationName: string; distanceKm: number } | null;
  stormglassTideTable?: { events: TideEvent[]; datum: string; stationName: string; distanceKm: number | null } | null;
  tideTable?: { events: TideEvent[]; datum: string; station: string | null } | null;
  tideWebSearch?: { events: TideEvent[]; regionLine: string } | null;
  tideDisplayTimeZone?: string;
};

export function MobileSeaStateTideCard() {
  const [seaData, setSeaData] = useState<SeaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loc, setLoc] = useState<LastKnownGeo | null>(null);

  const locRef = useRef<LastKnownGeo | null>(null);
  const lastFetchAtRef = useRef(0);
  const inFlightRef = useRef(false);

  const fetchSea = useCallback(async () => {
    const locNow = locRef.current;
    if (!locNow || !Number.isFinite(locNow.lat) || !Number.isFinite(locNow.lng)) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        lat: String(locNow.lat),
        lng: String(locNow.lng),
        skipOpenAi: '1',
      });
      const res = await fetch(`/api/sea/local-summary?${qs}`, { cache: 'no-store' });
      if (!res.ok) return;
      const d = (await res.json()) as SeaData & { error?: string };
      if (d.error) return;
      setSeaData(d);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let disposed = false;

    const pump = () => {
      if (disposed) return;
      const next = getLastKnownPosition();
      locRef.current = next;
      if (!next) return;

      setLoc(prev => {
        if (!prev) return next;
        if (distanceMeters(prev.lat, prev.lng, next.lat, next.lng) < LOC_STATE_MIN_MOVE_M) return prev;
        return next;
      });

      if (inFlightRef.current) return;
      const now = Date.now();
      if (lastFetchAtRef.current !== 0 && now - lastFetchAtRef.current < SEA_METEO_MIN_INTERVAL_MS) return;
      lastFetchAtRef.current = now;
      inFlightRef.current = true;
      void fetchSea().finally(() => { inFlightRef.current = false; });
    };

    pump();
    window.addEventListener(LAST_KNOWN_GEO_EVENT, pump as EventListener);
    const id = window.setInterval(pump, LOC_POLL_MS);
    return () => {
      disposed = true;
      window.removeEventListener(LAST_KNOWN_GEO_EVENT, pump as EventListener);
      window.clearInterval(id);
    };
  }, [fetchSea]);

  if (!loc) return null;

  // Pick best tide table
  const tideEvents: TideEvent[] = (
    seaData?.noaaTideTable?.events ??
    seaData?.stormglassTideTable?.events ??
    seaData?.tideTable?.events ??
    seaData?.tideWebSearch?.events ??
    []
  ).slice(0, 6);

  const waveHeight = seaData?.snapshot?.wave_height_m;
  const seaTemp = seaData?.snapshot?.sea_surface_temp_c;
  const tz = seaData?.tideDisplayTimeZone ?? 'UTC';

  return (
    <div className="mt-4 rounded-2xl border border-sky-500/20 bg-[#071b36]/80 shadow-lg backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-600/20 border border-sky-500/20">
            <Waves size={13} className="text-sky-400" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">Local Sea State</p>
            <p className="text-xs font-bold text-slate-200 leading-none mt-0.5">Waves & Tides</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { lastFetchAtRef.current = 0; void fetchSea(); }}
          disabled={loading}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] active:scale-90 transition-transform disabled:opacity-50"
          aria-label="Refresh sea state"
        >
          <RefreshCw size={12} className={`text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Snapshot row */}
      {(waveHeight != null || seaTemp != null) && (
        <div className="grid grid-cols-2 divide-x divide-white/[0.05] border-b border-white/[0.05]">
          {waveHeight != null && (
            <div className="flex flex-col items-center justify-center py-3 gap-0.5">
              <Waves size={14} className="text-sky-400" />
              <p className="text-base font-black text-slate-100 leading-none">{waveHeight.toFixed(1)} m</p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Wave Height</p>
            </div>
          )}
          {seaTemp != null && (
            <div className="flex flex-col items-center justify-center py-3 gap-0.5">
              <Thermometer size={14} className="text-orange-400" />
              <p className="text-base font-black text-slate-100 leading-none">{seaTemp.toFixed(1)}°C</p>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Sea Temp</p>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && !seaData && (
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="size-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin shrink-0" />
          <span className="text-xs text-zinc-500 animate-pulse">Loading sea state…</span>
        </div>
      )}

      {/* Sea text */}
      {seaData?.text && (
        <div className="px-4 pt-3 pb-2">
          <p className="text-xs leading-relaxed text-zinc-400">{seaData.text}</p>
        </div>
      )}

      {/* Tide table */}
      {tideEvents.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-2 mt-1">Tide Times</p>
          <div className="rounded-xl overflow-hidden border border-white/[0.05]">
            {tideEvents.map((e, i) => {
              const time = new Date(e.t).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: tz,
              });
              const isHigh = e.kind === 'high';
              return (
                <div
                  key={`${e.kind}:${e.t}`}
                  className={`flex items-center justify-between px-3 py-2 text-xs ${i > 0 ? 'border-t border-white/[0.04]' : ''} ${isHigh ? 'bg-emerald-950/15' : 'bg-amber-950/15'}`}
                >
                  <div className="flex items-center gap-1.5">
                    {isHigh
                      ? <ArrowUp size={11} className="text-emerald-400 shrink-0" />
                      : <ArrowDown size={11} className="text-amber-400 shrink-0" />}
                    <span className={`font-bold ${isHigh ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {isHigh ? 'High' : 'Low'}
                    </span>
                  </div>
                  <span className="text-slate-300 tabular-nums">{time}</span>
                  <span className="text-slate-400 tabular-nums font-medium">{e.heightM.toFixed(2)} m</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No data state */}
      {!loading && !seaData && (
        <div className="px-4 py-4">
          <p className="text-xs text-zinc-500">No sea data yet. Enable location on the map to load conditions.</p>
        </div>
      )}
    </div>
  );
}
