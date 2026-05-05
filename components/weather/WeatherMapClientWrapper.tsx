"use client";

import { WeatherGfsCharts } from "@/components/weather/WeatherGfsCharts";

export function WeatherMapClientWrapper() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WeatherGfsCharts />
    </div>
  );
}

