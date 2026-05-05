"use client";

import dynamic from "next/dynamic";
import { WeatherGfsCharts } from "@/components/weather/WeatherGfsCharts";

const WeatherMap = dynamic(() => import("./WeatherMap").then((m) => m.WeatherMap), { ssr: false });

export function WeatherMapClientWrapper() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <WeatherMap />
      <WeatherGfsCharts />
    </div>
  );
}

