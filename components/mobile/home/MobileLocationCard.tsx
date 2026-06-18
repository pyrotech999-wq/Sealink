'use client';
import { HomeLocationMapLoader } from '@/components/home/HomeLocationMapLoader';
import dynamic from 'next/dynamic';

const MiniMap = dynamic(() => import('./MiniMap'), { ssr: false });

interface Props {
  lat?: number;
  lng?: number;
  windSpeed?: number;
  windDirection?: number;
}

export default function MobileLocationCard({
  lat,
  lng,
  windSpeed,
  windDirection,
}: Props) {

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

  return (
    <div className="mt-5 rounded-[28px] bg-gradient-to-br from-[#0c1a30]/80 to-[#061020]/90 border border-white/[0.08] p-5 backdrop-blur-xl shadow-2xl">
      <div className="flex flex-col sm:flex-row gap-4 items-stretch">

        {/* MAP CONTAINER */}
        <div className="relative h-[110px] w-full sm:w-[110px] overflow-hidden rounded-2xl border border-white/10 shadow-inner group">
          {lat && lng ? (
            <MiniMap lat={lat} lng={lng} windDirection={windDirection} />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#0d1c33] animate-pulse">
              <span className="text-xl">📍</span>
            </div>
          )}
          <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-bold text-cyan-400 tracking-wider uppercase flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            GPS Live
          </div>
        </div>

        {/* DETAILS SECTION */}
        <div className="flex-1 flex flex-col justify-between gap-3">

          {/* Coordinates */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">TELEMETRY DECK</span>
            <div className="mt-1 flex items-baseline gap-2">
              <h3 className="text-lg font-extrabold text-white tracking-tight">
                {lat && lng
                  ? `${lat.toFixed(5)}° N, ${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`
                  : 'Acquiring GPS fix...'}
              </h3>
            </div>
          </div>

          {/* Wind readout */}
          <div className="flex items-center gap-4 border-t border-white/[0.06] pt-3">

            {/* Rotating Needle */}
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#112440] border border-white/[0.06]">
              <svg
                className="w-5 h-5 text-cyan-400 transition-transform duration-500"
                style={{ transform: `rotate(${windDirection ?? 0}deg)` }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="22" x2="12" y2="2" />
                <polyline points="5,9 12,2 19,9" />
              </svg>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[7px] font-bold text-slate-500">N</div>
            </div>

            {/* Speeds */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">True Wind</p>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-extrabold text-cyan-400">
                  {Math.round((windSpeed ?? 0) * 0.539957)} <span className="text-xs font-semibold">kts</span>
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  ({Math.round((windSpeed ?? 0) * 0.621371)} mph)
                </span>
                <span className="ml-auto text-xs font-bold text-white bg-cyan-950/50 px-2 py-0.5 rounded-lg border border-cyan-500/20">
                  {getWindDirection(windDirection)}
                </span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

