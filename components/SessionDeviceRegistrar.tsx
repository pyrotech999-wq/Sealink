"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getDeviceName, getOrCreateDeviceId } from "@/lib/device-id";

/** Re-register this browser in account_devices whenever the signed-in user navigates (covers silent sign-in DB failures). */
export function SessionDeviceRegistrar() {
  const pathname = usePathname();

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch("/api/demo/me", { credentials: "same-origin", cache: "no-store" });
        if (!me.ok) return;
        const j = (await me.json()) as { signedIn?: boolean };
        if (!j.signedIn) return;
        const deviceId = getOrCreateDeviceId();
        if (!deviceId || deviceId === "server") return;
        await fetch("/api/demo/register-device", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ deviceId, deviceName: getDeviceName() }),
        });
      } catch {
        /* ignore */
      }
    })();
  }, [pathname]);

  return null;
}
