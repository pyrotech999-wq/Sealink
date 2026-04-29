"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MAP_CENTER } from "@/lib/map-constants";
import { fetchSevenDayMaxWindMph } from "@/lib/open-meteo-forecast";
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

export function WeatherForecast7Day({ lat, lng }: Props) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchSevenDayMaxWindMph>> | null>(null);
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
      fetchSevenDayMaxWindMph(useLat, useLng, ac.signal)
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
            7-day wind forecast
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Daily maximum wind at 10 m (above: 3-hour steps with direction + speed on the map). Sea state is a guide
            only. Data:{" "}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {loading
          ? Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
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
              const tier = seaStateForMaxWindMph(mph);
              const { dow, dayMonth } = formatDayLabel(day.date);
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
                  <p className="mt-3 text-xl font-bold tabular-nums">{Math.round(mph)} mph</p>
                  <p className="text-sm font-semibold tabular-nums opacity-90">{Math.round(kn)} kn</p>
                  <p className="mt-2 flex-1 text-[11px] font-medium leading-snug opacity-95">{tier.sea}</p>
                </article>
              );
            })
        }
      </div>
    </div>
  );
}
