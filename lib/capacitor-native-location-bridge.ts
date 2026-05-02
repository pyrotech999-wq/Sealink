import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { SeaLinkNativeLocation } from "@/lib/native-location-bridge";

/**
 * Registers {@link window.__SEALINK_NATIVE_LOCATION__} using Capacitor Geolocation
 * (Fused Location Provider on Android, Core Location on iOS). Call once from a client component on startup.
 */
export function installCapacitorNativeLocationBridge(): void {
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;
  const w = window as Window & { __SEALINK_NATIVE_LOCATION__?: SeaLinkNativeLocation };
  if (w.__SEALINK_NATIVE_LOCATION__?.isAvailable) return;

  const bridge: SeaLinkNativeLocation = {
    isAvailable: true,
    watchPosition(onSuccess, onError) {
      let cleared = false;
      let watchId: string | undefined;

      void (async () => {
        try {
          const perm = await Geolocation.requestPermissions({ permissions: ["location"] });
          if (perm.location !== "granted") {
            if (!cleared) onError("denied", "Location permission denied");
            return;
          }
          watchId = await Geolocation.watchPosition(
            {
              enableHighAccuracy: true,
              timeout: 50_000,
              maximumAge: 0,
              minimumUpdateInterval: 1000,
            },
            (position, err) => {
              if (cleared) return;
              if (err != null) {
                const msg =
                  typeof err === "object" && err !== null && "message" in err
                    ? String((err as { message?: string }).message)
                    : String(err);
                onError("watch", msg);
                return;
              }
              if (!position) return;
              const acc = position.coords.accuracy;
              onSuccess({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracyM: typeof acc === "number" && acc > 0 ? acc : 30,
                timestampMs: position.timestamp,
              });
            },
          );
        } catch (e) {
          if (!cleared) onError("native", e instanceof Error ? e.message : String(e));
        }
      })();

      return {
        remove() {
          cleared = true;
          if (watchId != null) void Geolocation.clearWatch({ id: watchId });
        },
      };
    },
  };

  w.__SEALINK_NATIVE_LOCATION__ = bridge;
}
