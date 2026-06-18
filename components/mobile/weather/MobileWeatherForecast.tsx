'use client';

import {
  DailyForecastRow,
  fetchDailyForecast,
} from '@/lib/open-meteo-forecast';
import { useEffect, useState } from 'react';
import {
  Compass,
  Thermometer,
  CloudRain,
  Activity,
  Droplet,
  Sun,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  Waves,
} from "lucide-react";

interface Props {
  lat: number;
  lng: number;
}

export function MobileWeatherForecast({ lat, lng }: Props) {
  const [rows, setRows] = useState<DailyForecastRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  function getWeatherIcon(wmo: number | null) {
    if (wmo === null) return '🌤️';
    if ([0].includes(wmo)) return '☀️';
    if ([1, 2].includes(wmo)) return '🌤️';
    if ([3].includes(wmo)) return '☁️';
    if ([45, 48].includes(wmo)) return '🌫️';
    if ([51, 53, 55, 61, 63, 65].includes(wmo)) return '🌧️';
    if ([71, 73, 75].includes(wmo)) return '❄️';
    if ([95, 96, 99].includes(wmo)) return '⛈️';
    return '🌤️';
  }

  function getWeatherText(wmo: number | null) {
    if (wmo === null) return 'Partly Cloudy';
    if ([0].includes(wmo)) return 'Clear Sky';
    if ([1, 2].includes(wmo)) return 'Partly Cloudy';
    if ([3].includes(wmo)) return 'Overcast';
    if ([45, 48].includes(wmo)) return 'Foggy';
    if ([51, 53, 55, 61, 63, 65].includes(wmo)) return 'Rainy';
    if ([71, 73, 75].includes(wmo)) return 'Snowy';
    if ([95, 96, 99].includes(wmo)) return 'Thunderstorm';
    return 'Partly Cloudy';
  }

  useEffect(() => {
    fetchDailyForecast(lat, lng).then(setRows).catch(console.error);
  }, [lat, lng]);

  if (!rows.length) {
    return (
      <div className="py-12 text-center text-zinc-400 animate-pulse flex flex-col items-center justify-center gap-2">
        <div className="size-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold">Retrieving marine forecast...</span>
      </div>
    );
  }

  function getWindDirection(deg?: number | null) {
    if (deg == null) return '--';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  const selectedRow = rows[selectedIdx];
  const date = new Date(selectedRow.date);
  const knots = Math.round(selectedRow.maxMph * 0.868976);
  const gustKnots = selectedRow.gustMaxMph ? Math.round(selectedRow.gustMaxMph * 0.868976) : 0;
  const maxGustMph = Math.round(selectedRow.gustMaxMph ?? 0);
  const direction = selectedRow.windDirDominantDeg ?? 0;
  const directionStr = getWindDirection(direction);

  // Sea State thresholds
  let textCondition = "Moderate swell - calm seas";
  let conditionColor = "text-cyan-400";
  if (knots >= 20) {
    textCondition = "Rough seas developing";
    conditionColor = "text-red-400";
  } else if (knots >= 12) {
    textCondition = "Flat to slight - waves in range";
    conditionColor = "text-amber-400";
  }

  // Safety rating
  let safetyLabel = "Optimal sailing conditions";
  let safetyStatus = "safe";
  if (knots >= 22) {
    safetyLabel = "Danger - gale warning";
    safetyStatus = "danger";
  } else if (knots >= 15) {
    safetyLabel = "Advisory - strong breeze";
    safetyStatus = "warning";
  }

  return (
    <div className="space-y-4">
      {/* Dynamic Date Calendar Strip */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide text-left">
        {rows.map((row, index) => {
          const rowDate = new Date(row.date);
          const isSelected = index === selectedIdx;

          return (
            <button
              key={row.date}
              type="button"
              onClick={() => setSelectedIdx(index)}
              className={`flex min-w-[64px] flex-col items-center justify-between rounded-xl py-2 px-1 text-center transition-all border outline-none active:scale-95 ${
                isSelected
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 ring-1 ring-indigo-500/20'
                  : 'bg-white/[0.02] border-white/[0.04] text-slate-400 hover:border-white/10'
              }`}
            >
              <span className={`text-[9px] font-extrabold tracking-wider ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`}>
                {rowDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </span>
              <span className="text-xs text-slate-200 font-bold my-0.5">{rowDate.getDate()}</span>
              <span className="text-base leading-none">{getWeatherIcon(row.wmo)}</span>
            </button>
          );
        })}
      </div>

      {/* Featured Cockpit Deck Card */}
      <div className="bg-[#0c192c]/65 border border-white/[0.08] rounded-3xl p-5 shadow-2xl backdrop-blur-md space-y-4 text-left">
        {/* Card Header Info */}
        <div className="flex items-start justify-between border-b border-white/[0.06] pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {selectedIdx === 0 ? "Today's Conditions" : date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
            </h3>
            <p className="text-sm font-semibold text-slate-200 mt-0.5 flex items-center gap-1.5">
              <span>{getWeatherIcon(selectedRow.wmo)}</span>
              <span>{getWeatherText(selectedRow.wmo)}</span>
            </p>
          </div>

          {/* Safety Badge */}
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${
            safetyStatus === "safe"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : safetyStatus === "warning"
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-red-500/10 border-red-500/20 text-red-400 animate-pulse"
          }`}>
            {safetyStatus === "safe" ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
            {safetyStatus === "safe" ? "Clear" : safetyStatus === "warning" ? "Caution" : "Warning"}
          </span>
        </div>

        {/* Primary Gauges Grid */}
        <div className="grid grid-cols-2 gap-4 items-center">
          {/* Compass Radar Gauge */}
          <div className="flex flex-col items-center">
            <div className="relative size-24 bg-black/45 border border-white/[0.08] rounded-full flex items-center justify-center shadow-inner">
              {/* Dial Compass Points */}
              <span className="absolute top-1 text-[8px] font-bold text-slate-500">N</span>
              <span className="absolute right-1 text-[8px] font-bold text-slate-500">E</span>
              <span className="absolute bottom-1 text-[8px] font-bold text-slate-500">S</span>
              <span className="absolute left-1 text-[8px] font-bold text-slate-500">W</span>

              {/* Rotating Arrow Indicator */}
              <div
                className="absolute transition-transform duration-500 ease-out"
                style={{ transform: `rotate(${direction}deg)` }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_0_4px_rgba(79,209,197,0.4)]">
                  <path d="M12 2L22 22L12 17L2 22L12 2Z" fill="#4fd1c5" />
                </svg>
              </div>

              {/* Central text degree */}
              <div className="absolute size-8 rounded-full bg-[#0a1424] flex flex-col items-center justify-center border border-white/[0.04]">
                <span className="text-[9px] font-extrabold text-slate-200">{direction}°</span>
              </div>
            </div>
            <span className="text-[10px] font-bold text-slate-400 mt-2 tracking-wide uppercase">
              Wind from {directionStr}
            </span>
          </div>

          {/* Speed Details Column */}
          <div className="space-y-3 pl-2">
            <div>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Wind Speed</p>
              <p className="text-2xl font-black text-slate-100 tracking-tight leading-none mt-0.5">
                {knots} <span className="text-sm font-bold text-slate-400">kn</span>
              </p>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">
                {Math.round(selectedRow.maxMph)} mph
              </p>
            </div>

            <div className="border-t border-white/[0.06] pt-2">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Max Gusts</p>
              <p className="text-base font-extrabold text-amber-400 tracking-tight leading-none mt-0.5">
                {gustKnots} <span className="text-xs font-bold text-amber-500/80">kn</span>
              </p>
              <p className="text-[9px] text-zinc-500 font-medium mt-0.5">
                {maxGustMph} mph
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Sea State Badge */}
        <div className="rounded-xl bg-slate-900/35 border border-white/[0.04] p-3 flex items-center gap-3">
          <Waves className={`size-5 ${conditionColor} shrink-0`} />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">Sea State Outlook</p>
            <p className="text-xs font-bold text-slate-200 mt-0.5 truncate">{textCondition}</p>
          </div>
        </div>

        {/* Safety Advisory Banner */}
        <div className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${
          safetyStatus === "safe"
            ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400"
            : safetyStatus === "warning"
              ? "bg-amber-500/5 border-amber-500/10 text-amber-400"
              : "bg-red-500/5 border-red-500/10 text-red-400"
        }`}>
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              safetyStatus === "safe" ? "bg-emerald-400" : safetyStatus === "warning" ? "bg-amber-400" : "bg-red-400"
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${
              safetyStatus === "safe" ? "bg-emerald-500" : safetyStatus === "warning" ? "bg-amber-500" : "bg-red-500"
            }`}></span>
          </span>
          <span>{safetyLabel}</span>
        </div>

        {/* Secondary Detailed Instrument Cockpit Tiles */}
        <div className="grid grid-cols-3 gap-2.5 pt-1 border-t border-white/[0.06]">
          {/* Temperature Tile */}
          <div className="bg-slate-900/20 rounded-xl p-2.5 border border-white/[0.02]">
            <Thermometer className="size-4 text-orange-400 mb-1" />
            <p className="text-[8px] font-bold text-zinc-500 uppercase">Temp Range</p>
            <p className="text-xs font-bold text-slate-200 truncate mt-0.5">
              {selectedRow.tempMinC !== null && selectedRow.tempMaxC !== null
                ? `${Math.round(selectedRow.tempMinC)}°–${Math.round(selectedRow.tempMaxC)}°`
                : "--"}
            </p>
          </div>

          {/* Rain Probability Tile */}
          <div className="bg-slate-900/20 rounded-xl p-2.5 border border-white/[0.02]">
            <CloudRain className="size-4 text-sky-400 mb-1" />
            <p className="text-[8px] font-bold text-zinc-500 uppercase">Precip Max</p>
            <p className="text-xs font-bold text-slate-200 truncate mt-0.5">
              {selectedRow.precipProbMax !== null ? `${selectedRow.precipProbMax}%` : "0%"}
            </p>
          </div>

          {/* Air Pressure Tile */}
          <div className="bg-slate-900/20 rounded-xl p-2.5 border border-white/[0.02]">
            <Activity className="size-4 text-indigo-400 mb-1" />
            <p className="text-[8px] font-bold text-zinc-500 uppercase">Barometer</p>
            <p className="text-xs font-bold text-slate-200 truncate mt-0.5">
              {selectedRow.pressureMslMax !== null ? `${Math.round(selectedRow.pressureMslMax)} hPa` : "1013 hPa"}
            </p>
          </div>

          {/* Humidity Tile */}
          <div className="bg-slate-900/20 rounded-xl p-2.5 border border-white/[0.02]">
            <Droplet className="size-4 text-teal-400 mb-1" />
            <p className="text-[8px] font-bold text-zinc-500 uppercase">Max Humidity</p>
            <p className="text-xs font-bold text-slate-200 truncate mt-0.5">
              {selectedRow.rhMax !== null ? `${selectedRow.rhMax}%` : "80%"}
            </p>
          </div>

          {/* Sunshine Hours Tile */}
          <div className="bg-slate-900/20 rounded-xl p-2.5 border border-white/[0.02]">
            <Sun className="size-4 text-yellow-400 mb-1" />
            <p className="text-[8px] font-bold text-zinc-500 uppercase">Sunshine</p>
            <p className="text-xs font-bold text-slate-200 truncate mt-0.5">
              {selectedRow.sunshineSec !== null ? `${Math.round(selectedRow.sunshineSec / 3600)} hrs` : "8 hrs"}
            </p>
          </div>

          {/* Wind gusts warning tile */}
          <div className="bg-slate-900/20 rounded-xl p-2.5 border border-white/[0.02]">
            <Waves className="size-4 text-emerald-400 mb-1" />
            <p className="text-[8px] font-bold text-zinc-500 uppercase">Rain Sum</p>
            <p className="text-xs font-bold text-slate-200 truncate mt-0.5">
              {selectedRow.rainMm !== null ? `${selectedRow.rainMm} mm` : "0 mm"}
            </p>
          </div>
        </div>
      </div>

      {/* Outlook Carousel Header */}
      <div className="pt-2 text-left">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">Weekly Sea State Outlook</h2>
        <p className="text-[10px] text-zinc-500 mt-0.5">Select any day below to load its full instrument telemetry.</p>
      </div>

      {/* Sea Conditions Outlook Cards Carousel */}
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide text-left">
        {rows.map((row, index) => {
          const rowKnots = Math.round(row.maxMph * 0.868976);
          const rowGustKnots = row.gustMaxMph ? Math.round(row.gustMaxMph * 0.868976) : 0;
          const rowDirection = row.windDirDominantDeg ?? 0;
          const rowDirectionStr = getWindDirection(rowDirection);
          const isSelected = index === selectedIdx;

          let cardConditionText = "Calm Swell";
          let rowConditionColor = "text-cyan-400";
          if (rowKnots >= 20) {
            cardConditionText = "Rough Seas";
            rowConditionColor = "text-red-400";
          } else if (rowKnots >= 12) {
            cardConditionText = "Slight Waves";
            rowConditionColor = "text-amber-400";
          }

          return (
            <button
              key={row.date}
              type="button"
              onClick={() => setSelectedIdx(index)}
              className={`flex flex-col justify-between min-w-[130px] max-w-[130px] h-[210px] rounded-[22px] border p-3.5 text-center shadow-md transition-all active:scale-95 outline-none ${
                isSelected
                  ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/25 text-indigo-300'
                  : 'bg-[#0f1d30]/65 border-white/[0.04] text-slate-300 hover:border-white/10'
              }`}
            >
              <div>
                <p className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase">
                  {new Date(row.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </p>
                <p className="text-[9px] text-slate-500">
                  {new Date(row.date).getDate()} {new Date(row.date).toLocaleDateString('en-US', { month: 'short' })}
                </p>

                {/* Arrow indicator */}
                <div className="my-2.5 flex justify-center">
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/35 border border-white/[0.04]"
                    style={{ transform: `rotate(${rowDirection}deg)` }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L22 22L12 17L2 22L12 2Z" fill={isSelected ? "#818cf8" : "#4fd1c5"} />
                    </svg>
                  </div>
                </div>

                <p className="text-[9px] font-bold text-slate-400 leading-none">
                  {rowDirectionStr} {rowDirection}°
                </p>

                <p className="mt-1 text-base font-black text-slate-200 leading-none">
                  {rowKnots} <span className="text-[10px] font-normal text-slate-400">kn</span>
                </p>
              </div>

              <div className="border-t border-white/[0.04] pt-2 space-y-0.5">
                <p className="text-[9px] font-extrabold text-slate-200">
                  {rowGustKnots} kn <span className="text-[9px] font-normal text-slate-500">Gust</span>
                </p>
                <p className={`text-[8.5px] font-bold uppercase tracking-wider truncate ${rowConditionColor}`}>
                  {cardConditionText}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}