'use client';

import { HourlyWindSlot } from '@/lib/open-meteo-hourly';

interface Props {
  forecast: HourlyWindSlot[];
}

function getWindDirection(deg?: number) {
  if (deg == null) return '--';

  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];

  return dirs[Math.round(deg / 22.5) % 16];
}

function getStatusBadge(gustMph: number) {
  // Convert mph to knots for threshold check
  const gustKnots = Math.round(gustMph * 0.868976);

  if (gustKnots >= 25) {
    return {
      label: 'Care',
      color: 'bg-red-500',
      textColor: 'text-white',
    };
  }

  return {
    label: 'OK',
    color: 'bg-green-500',
    textColor: 'text-white',
  };
}

function getSeaState(speed: number) {
  if (speed >= 20) return 'Rough seas developing';
  if (speed >= 12) return 'Flat to slight — some waves';
  return 'Moderate swell';
}

function ForecastCard({ slot }: { slot: HourlyWindSlot }) {
  const knots = Math.round(slot.mph * 0.868976);
  const gustKnots = Math.round(slot.gustMph * 0.868976);

  const status = getStatusBadge(slot.gustMph);

  const time = new Date(slot.at).toLocaleTimeString([], {
    hour: 'numeric',
  });

  return (
    <div className="min-w-[140px] max-w-[140px] rounded-[18px] border border-white/10 bg-gradient-to-b from-white/15 to-white/5 p-3 backdrop-blur-md">
      {/* Time */}
      <p className="mb-2 text-center text-[10px] text-slate-400">{time}</p>

      {/* Compass */}
      <div className="relative mx-auto mb-3 flex h-[85px] w-[85px] items-center justify-center">
        <div className="absolute inset-0 rounded-full border-[6px] border-slate-600/50" />

        <svg className="absolute inset-0" viewBox="0 0 85 85">
          <circle
            cx="42.5"
            cy="42.5"
            r="38"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="6"
            strokeDasharray="55 240"
            transform={`rotate(${slot.dirFromDeg - 90} 42.5 42.5)`}
            strokeLinecap="round"
          />
        </svg>

        <div className="absolute top-2 text-sm font-bold text-white">
          {getWindDirection(slot.dirFromDeg)}
        </div>

        <div
          className="absolute"
          style={{
            transform: `rotate(${slot.dirFromDeg}deg)`,
          }}
        >
          <svg width="42" height="42" viewBox="0 0 100 100">
            <polygon points="50,10 60,60 50,50 40,60" fill="white" />

            <circle cx="50" cy="50" r="4" fill="white" />
          </svg>
        </div>
      </div>

      {/* Speed */}
      <p className="text-center text-[18px] font-semibold text-white">
        {knots} km , {Math.round(slot.mph)} mph
      </p>

      {/* Gust */}
      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] text-slate-400">Max Gust</p>

            <p className="text-[11px] font-medium text-white">
              {gustKnots} km, {Math.round(slot.gustMph)} mph
            </p>
          </div>

          <span
            className={`${status.color} rounded-full px-2 py-[2px] text-[9px] font-semibold text-white`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Sea State */}
      <div className="mt-2 border-t border-white/10 pt-2">
        <p className="text-[10px] leading-snug text-slate-300">
          {getSeaState(slot.mph)}
        </p>
      </div>
    </div>
  );
}

export default function LiveMarineForecast({ forecast }: Props) {
  return (
    <div className="mt-6">
      <h2 className="mb-4 text-lg font-bold text-white">
        Live Marine Forecast
      </h2>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {forecast.map((slot, index) => (
          <ForecastCard key={index} slot={slot} />
        ))}
      </div>
    </div>
  );
}
