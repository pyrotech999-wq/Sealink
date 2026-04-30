"use client";

import dynamic from "next/dynamic";

const WeatherSeaMap = dynamic(() => import("./WeatherSeaMap").then((m) => m.WeatherSeaMap), { ssr: false });

export function WeatherSeaClientWrapper() {
  return <WeatherSeaMap />;
}

