"use client";

import dynamic from "next/dynamic";

const WeatherMap = dynamic(() => import("./WeatherMap").then((m) => m.WeatherMap), { ssr: false });

export function WeatherMapClientWrapper() {
  return <WeatherMap />;
}

