'use client';

import { useEffect, useState } from 'react';
import {
  fetchWindSlotsEvery3h,
  HourlyWindSlot,
} from '@/lib/open-meteo-hourly';

export function useWindForecast(
  lat?: number,
  lng?: number
) {
  const [forecast, setForecast] = useState<
    HourlyWindSlot[]
  >([]);

  useEffect(() => {
    if (!lat || !lng) return;

    const load = async () => {
      try {
        const data =
          await fetchWindSlotsEvery3h(
            lat,
            lng
          );

        setForecast(data.slice(0, 10));
      } catch (err) {
        console.error(err);
      }
    };

    load();
  }, [lat, lng]);

  return forecast;
}