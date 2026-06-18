"use client";

import { useEffect, useState } from "react";

interface MeteoData {
  windKph: number | null;
  windDirDeg: number | null;
  gustKph: number | null;
}

export function useMeteo(
  lat?: number,
  lng?: number
) {
  const [meteo, setMeteo] =
    useState<MeteoData | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/meteo/nearest?lat=${lat}&lng=${lng}`
        );

        const data = await response.json();

        if (data?.ok) {
          setMeteo({
            windKph: data.reading?.windKph ?? null,
            windDirDeg:
              data.reading?.windDirDeg ?? null,
            gustKph:
              data.reading?.gustKph ?? null,
          });
        }
      } catch (error) {
        console.log(error);
      }
    };

    load();
  }, [lat, lng]);

  return meteo;
}