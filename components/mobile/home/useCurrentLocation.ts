"use client";

import { useEffect, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";

export function useCurrentLocation() {
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    const loadLocation = async () => {
      try {
        const permission = await Geolocation.requestPermissions();

        console.log("PERMISSION:", permission);

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
        });

        console.log("POSITION:", position);

        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      } catch (error) {
        console.error("LOCATION ERROR:", error);
      }
    };

    loadLocation();
  }, []);

  return location;
}