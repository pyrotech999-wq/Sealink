'use client';
import { HourlyWindSlot } from '@/lib/open-meteo-hourly';

interface Props {
  forecast: HourlyWindSlot[];
}

function getWindDirection(deg?: number) {
  if (deg == null) return '--';
  const dirs = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW'
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

function getStatusBadge(gustMph: number) {
  const gustKnots = Math.round(gustMph * 0.868976);
  if (gustKnots >= 22) {
    return {
      label: 'Caution',
      color: 'bg-amber-500/20 border border-amber-500/30 text-amber-300',
    };
  } else if (gustKnots >= 28) {
    return {
      label: 'Warning',
      color: 'bg-red-500/20 border border-red-500/30 text-red-300',
    };
  }
  return {
    label: 'Safe',
    color: 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300',
  };
}

function getSeaState(speed: number) {
  const speedKnots = Math.round(speed * 0.868976);
  if (speedKnots >= 22) return 'Rough waves';
  if (speedKnots >= 12) return 'Slight chop';
  return 'Smooth sea';
}

function ForecastCard({ slot }: { slot: HourlyWindSlot }) {
  const knots = Math.round(slot.mph * 0.868976);
  const gustKnots = Math.round(slot.gustMph * 0.868976);
  const status = getStatusBadge(slot.gustMph);
  const time = new Date(slot.at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });

  return (
    <div className="min-w-[145px] max-w-[145px] rounded-[24px] border border-white/[0.06] bg-gradient-to-b from-[#112139] to-[#071120] p-4 shadow-xl backdrop-blur-md flex flex-col justify-between gap-3">
      {/* Time */}
      <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{time}</p>

      {/* Compass */}
      <div className="relative mx-auto flex h-[80px] w-[80px] items-center justify-center">
        <div className="absolute inset-0 rounded-full border-[5px] border-slate-700/30" />
        <svg className="absolute inset-0" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke="#06b6d4"
            strokeWidth="4"
            strokeDasharray="45 220"
            transform={`rotate(${slot.dirFromDeg - 90} 40 40)`}
            strokeLinecap="round"
          />
        </svg>

        <div className="absolute top-1 text-[11px] font-extrabold text-slate-300">
          {getWindDirection(slot.dirFromDeg)}
        </div>

        <div
          className="absolute transition-transform duration-500"
          style={{ transform: `rotate(${slot.dirFromDeg}deg)` }}
        >
          <svg width="36" height="36" viewBox="0 0 100 100">
            <polygon points="50,12 58,58 50,50 42,58" fill="#ffffff" />
            <circle cx="50" cy="50" r="4.5" fill="#06b6d4" />
          </svg>
        </div>
      </div>

      {/* Speed info */}
      <div className="text-center">
        <span className="text-[17px] font-extrabold text-white">{knots}</span>
        <span className="text-xs font-bold text-slate-400"> kts</span>
        <p className="text-[10px] font-medium text-slate-500">({Math.round(slot.mph)} mph)</p>
      </div>

      {/* Gusts */}
      <div className="border-t border-white/[0.06] pt-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-slate-400">Gust:</span>
          <span className="font-extrabold text-white">{gustKnots} kts</span>
        </div>
        <div className="flex justify-center">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase ${status.color}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Sea State */}
      <div className="border-t border-white/[0.06] pt-2 text-center">
        <span className="text-[10px] font-semibold text-cyan-400 block truncate">
          {getSeaState(slot.mph)}
        </span>
      </div>
    </div>
  );
}

export default function LiveMarineForecast({ forecast }: Props) {
  if (!forecast || forecast.length === 0) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-3 text-[17px] font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
        <span>📊</span> Live Marine Forecast
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide">
        {forecast.map((slot, index) => (
          <ForecastCard key={index} slot={slot} />
        ))}
      </div>
    </div>
  );
}

