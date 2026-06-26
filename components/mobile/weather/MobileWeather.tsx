'use client';

import { useState } from 'react';
import { OpcSurfacePressureBox } from '@/components/weather/OpcSurfacePressureBox';
import { useRouter } from 'next/navigation';
import { WeatherModelChartViewer } from '@/components/weather/WeatherModelChartViewer';
import { OpcChartsBox } from '@/components/weather/OpcChartsBox';
import { MobileWeatherForecast } from './MobileWeatherForecast';
import { useCurrentLocation } from '@/components/mobile/home/useCurrentLocation';
import { AiForecast48hBox } from '@/components/home/AiForecast48hBox';
import Link from 'next/link';
import {
  ArrowLeft,
  Compass,
  LineChart,
  Map,
  Waves,
  ChevronRight,
  Activity,
} from 'lucide-react';

export default function MobileWeather() {
  const router = useRouter();
  const location = useCurrentLocation();
  const [view, setView] = useState<'home' | 'wind' | 'pressure' | 'charts'>(
    'home',
  );

  const renderHeader = (title: string) => (
    <div className="pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setView('home')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
          aria-label="Back to weather home"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-sm font-extrabold tracking-tight text-slate-100">
            {title}
          </h1>
          <p className="text-[9px] text-zinc-500">
            Weather instrument panel
          </p>
        </div>
      </div>
    </div>
  );

  if (view === 'wind') {
    return (
      <div className="min-h-screen bg-[#071120] bg-gradient-to-b from-[#0a182e] via-[#040c18] to-[#020610] text-white safe-bottom flex flex-col">
        {renderHeader('Forecast Models')}
        <div className="p-4 flex-1 overflow-y-auto pb-20 space-y-4">
          <WeatherModelChartViewer />
        </div>
      </div>
    );
  }

  if (view === 'charts') {
    return (
      <div className="min-h-screen bg-[#071120] bg-gradient-to-b from-[#0a182e] via-[#040c18] to-[#020610] text-white safe-bottom flex flex-col">
        {renderHeader('Forecast Charts')}
        <div className="p-4 flex-1 overflow-y-auto pb-20 space-y-4">
          <OpcChartsBox />
        </div>
      </div>
    );
  }

  if (view === 'pressure') {
    return (
      <div className="min-h-screen bg-[#071120] bg-gradient-to-b from-[#0a182e] via-[#040c18] to-[#020610] text-white safe-bottom flex flex-col">
        {renderHeader('Surface Pressure Maps')}
        <div className="p-4 flex-1 overflow-y-auto pb-20">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4 shadow-2xl backdrop-blur-md">
            <OpcSurfacePressureBox />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-bottom flex flex-col overflow-x-hidden">
      {/* Immersive Weather Header */}
      <div className="pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
            aria-label="Back to home"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-slate-100 flex items-center gap-1.5">
              <Waves className="size-4 text-cyan-400" />
              <span>Weather</span>
            </h1>
            {location ? (
              <p className="text-[9px] font-mono text-zinc-500">
                GPS: {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
              </p>
            ) : (
              <p className="text-[9px] text-zinc-500">
                Awaiting active GPS coordinates
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24">
        {/* Forecast Timeline & Sea Conditions Hook */}
        {location ? (
          <>
            <MobileWeatherForecast lat={location.lat} lng={location.lng} />
            <AiForecast48hBox lat={location.lat} lng={location.lng} />
          </>
        ) : (
          <div className="rounded-3xl bg-[#0c192c]/65 p-8 text-center border border-white/[0.06] shadow-xl backdrop-blur-md flex flex-col items-center justify-center gap-2.5">
            <div className="size-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
            <span className="text-xs font-semibold text-zinc-400">Locking current GPS coordinates...</span>
          </div>
        )}

        {/* Tools Section Header */}
        <div className="pt-2 text-left">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300">OPC Marine Maps</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">Ocean Prediction Center active analyses.</p>
        </div>

        {/* Interactive Weather Models Card */}
        <div
          onClick={() => setView('wind')}
          className="group flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4.5 cursor-pointer active:scale-[0.99] hover:border-white/10 transition-all shadow-md text-left"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 transition-colors">Interactive Weather Models</h3>
              <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                GFS/ECMWF global models for wind speed, gusts, rain, and sea temperature.
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-500 group-hover:text-white transition-colors ml-2" />
        </div>

        {/* Forecast Charts Card */}
        <div
          onClick={() => setView('charts')}
          className="group flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4.5 cursor-pointer active:scale-[0.99] hover:border-white/10 transition-all shadow-md text-left"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <LineChart className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">Forecast Charts</h3>
              <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                Wave, wind, and swell projection products.
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-500 group-hover:text-white transition-colors ml-2" />
        </div>

        {/* Navigation Charts Card */}
        <div
          onClick={() => router.push('/navigation-charts')}
          className="group flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#0c192c]/45 p-4.5 cursor-pointer active:scale-[0.99] hover:border-white/10 transition-all shadow-md text-left"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-violet-950/40 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Map className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-slate-200 group-hover:text-violet-400 transition-colors">Navigation Charts</h3>
              <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                Voyage planning and official raster chart overlays.
              </p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-500 group-hover:text-white transition-colors ml-2" />
        </div>
      </div>
    </div>
  );
}