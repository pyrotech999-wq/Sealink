"use client";

import { useEffect, useState } from "react";
import { AiForecast48hBox } from "@/components/home/AiForecast48hBox";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";
import { type DailyForecastRow, fetchDailyForecast, HOME_DAILY_FORECAST_DAYS } from "@/lib/open-meteo-forecast";
import { wmoWeatherEmoji, wmoWeatherLabel } from "@/lib/wmo-weather";
import { windFromCompass16 } from "@/lib/wind-compass";
import { mphToKnots, seaStateForMaxWindMph } from "@/lib/wind-tiers";

type Props = {
  /** Live GPS fix when sharing; when null, forecast uses map default centre */
  lat: number | null;
  lng: number | null;
};

function formatDayLabel(isoDate: string): { dow: string; dayMonth: string } {
  const d = new Date(`${isoDate}T12:00:00`);
  const dow = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d);
  const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
  return { dow, dayMonth };
}

function dash<T>(v: T | null | undefined, fmt: (x: T) => string): string {
  if (v == null || (typeof v === "number" && Number.isNaN(v))) return "—";
  return fmt(v as T);
}

function fmtSunshineSec(sec: number): string {
  const h = sec / 3600;
  if (h < 0.05) return "0 h";
  return `${Math.round(h * 10) / 10} h`;
}

/**
 * Downwind arrow on a small compass disc (N fixed at top).
 * `fromDeg` is meteorological wind-from, clockwise from north; arrow points where the wind blows toward.
 */
function WindDirectionDisc({ fromDeg, title }: { fromDeg: number | null; title: string }) {
  const toward = fromDeg != null ? (((fromDeg + 180) % 360) + 360) % 360 : null;
  return (
    <div
      className="relative mx-auto mt-1 flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full border-2 border-current/25 bg-black/[0.06] shadow-inner dark:bg-white/[0.08]"
      title={title}
      role="img"
      aria-label={title}
    >
      <span className="pointer-events-none absolute top-0.5 text-[9px] font-bold leading-none opacity-55" aria-hidden>
        N
      </span>
      {toward != null ? (
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-current"
          style={{ transform: `rotate(${toward}deg)`, transformOrigin: "12px 12px" }}
          aria-hidden
        >
          {/* Full arrow: narrow shaft + smaller head; points up = downwind before rotation */}
          <path
            fill="currentColor"
            d="M12 5.5 13.35 10.25H12.55V20h-1.1v-9.75H10.65L12 5.5z"
          />
        </svg>
      ) : (
        <span className="text-sm font-medium opacity-45" aria-hidden>
          —
        </span>
      )}
    </div>
  );
}

function ConditionsCard({ day }: { day: DailyForecastRow }) {
  const { dow, dayMonth } = formatDayLabel(day.date);
  const wmo = day.wmo;
  const label = wmo != null ? wmoWeatherLabel(wmo) : "—";
  const emoji = wmo != null ? wmoWeatherEmoji(wmo) : "";

  return (
    <article className="flex flex-col rounded-xl border border-zinc-200 bg-zinc-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">{dow}</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{dayMonth}</p>
        </div>
        {emoji ? <span className="text-lg leading-none" aria-hidden>{emoji}</span> : null}
      </div>
      <p className="mt-2 text-[11px] font-medium leading-snug text-zinc-800 dark:text-zinc-200">{label}</p>
      <dl className="mt-2 space-y-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-500">Hi / lo</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.tempMaxC, (t) => `${Math.round(t)}°`)} / {dash(day.tempMinC, (t) => `${Math.round(t)}°`)} C
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500">Rain</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.rainMm, (m) => `${Math.round(m * 10) / 10} mm`)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500">Precip</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.precipMm, (m) => `${Math.round(m * 10) / 10} mm`)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500">Rain prob</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.precipProbMax, (p) => `${Math.round(p)}%`)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500">Sun</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.sunshineSec, fmtSunshineSec)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500">Humidity</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.rhMax, (h) => `${Math.round(h)}%`)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500">Pressure</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.pressureMslMax, (p) => `${Math.round(p)} hPa`)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-zinc-500">Dew</dt>
          <dd className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {dash(day.dewMaxC, (t) => `${Math.round(t * 10) / 10}°C`)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function WeatherForecast7Day({ lat, lng }: Props) {
  const [rows, setRows] = useState<DailyForecastRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const useLat = lat ?? DEFAULT_MAP_CENTER.lat;
  const useLng = lng ?? DEFAULT_MAP_CENTER.lng;
  const atPin = lat != null && lng != null;

  useEffect(() => {
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      setErr(null);
      fetchDailyForecast(useLat, useLng, ac.signal)
        .then((data) => {
          if (ac.signal.aborted) return;
          setRows(data);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
          setErr(e instanceof Error ? e.message : "Could not load forecast");
          setRows(null);
          setLoading(false);
        });
    }, 280);

    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [useLat, useLng]);

  return (
    <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Next {HOME_DAILY_FORECAST_DAYS}-day wind forecast
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Daily maximum wind and gust at 10 m (knots primary; mph in smaller type) with dominant direction (map timeline
            uses 3-hour steps). Each card’s arrow points{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">downwind</span>. Sea state is a guide only. Data:{" "}
            <a
              href="https://open-meteo.com/"
              className="font-medium text-green-800 underline-offset-2 hover:underline dark:text-green-400"
              target="_blank"
              rel="noreferrer"
            >
              Open-Meteo
            </a>
            .
          </p>
        </div>
        <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
          {atPin ? "For your shared location" : "For map centre — turn on sharing for your position"}
        </p>
      </div>

      {err && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {loading
          ? Array.from({ length: HOME_DAILY_FORECAST_DAYS }, (_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))
          : !rows?.length
            ? (
                <p className="col-span-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  No forecast rows returned. Try again later.
                </p>
              )
            : rows.map((day) => {
              const mph = day.maxMph;
              const kn = mphToKnots(mph);
              const gustMph = day.gustMaxMph;
              const gustKn = gustMph != null ? mphToKnots(gustMph) : null;
              // Colour band reflects the highest wind parameter available (gusts can be the real risk driver).
              const tierBasisMph = Math.max(mph, gustMph ?? 0);
              const tier = seaStateForMaxWindMph(tierBasisMph);
              const { dow, dayMonth } = formatDayLabel(day.date);
              const dirDeg = day.windDirDominantDeg;
              const dirNorm = dirDeg != null ? Math.round(((dirDeg % 360) + 360) % 360) : null;
              const dirLabel = dirDeg != null ? windFromCompass16(dirDeg) : null;
              const arrowTitle =
                dirLabel != null && dirNorm != null
                  ? `Wind from ${dirLabel} (${String(dirNorm).padStart(3, "0")}°); arrow points downwind`
                  : "Wind direction";
              return (
                <article
                  key={day.date}
                  className={`flex flex-col rounded-xl border-2 p-3 shadow-sm ${tier.boxClass}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide opacity-90">{dow}</p>
                      <p className="text-[10px] opacity-80">{dayMonth}</p>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${tier.badgeClass}`}>
                      {tier.id === "calm" || tier.id === "light" ? "OK" : tier.id === "amber" ? "Care" : "Risk"}
                    </span>
                  </div>
                  <WindDirectionDisc fromDeg={dirDeg} title={arrowTitle} />
                  <p className="mt-2 text-xl font-bold tabular-nums">{Math.round(kn)} kn</p>
                  <p className="text-xs font-medium tabular-nums opacity-85">{Math.round(mph)} mph</p>
                  {gustKn != null ? (
                    <div className="mt-1.5 border-t border-current/15 pt-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Max gust</p>
                      <p className="text-base font-bold tabular-nums">{Math.round(gustKn)} kn</p>
                      <p className="text-[11px] font-medium tabular-nums opacity-85">{Math.round(gustMph!)} mph</p>
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-[11px] font-medium leading-snug opacity-95">
                    {dirLabel != null && dirNorm != null ? (
                      <>
                        Wind from{" "}
                        <span className="font-semibold text-green-950 dark:text-green-200">
                          {dirLabel} ({String(dirNorm).padStart(3, "0")}°)
                        </span>
                      </>
                    ) : (
                      <span className="opacity-80">Direction —</span>
                    )}
                  </p>
                  <p className="mt-2 flex-1 text-[11px] font-medium leading-snug opacity-95">{tier.sea}</p>
                </article>
              );
            })
        }
      </div>

      <div className="mt-8">
        <div className="mb-3">
          <h3 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Next {HOME_DAILY_FORECAST_DAYS}-day conditions
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Daily summary: dominant weather code, temperatures, rain and totals, sunshine duration, humidity, pressure,
            and dew point when the API provides them.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {loading
            ? Array.from({ length: HOME_DAILY_FORECAST_DAYS }, (_, i) => (
                <div
                  key={`c-${i}`}
                  className="h-52 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                />
              ))
            : !rows?.length
              ? null
              : rows.map((day) => <ConditionsCard key={`cond-${day.date}`} day={day} />)}
        </div>
      </div>

      <AiForecast48hBox lat={lat} lng={lng} />
    </div>
  );
}
