"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";

/** Registers the service worker on HTTPS so Chrome can offer install / standalone “app” from the manifest. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    /* Capacitor loads the live site in a WebView; a SW scoped to / fights remote updates and caching. */
    if (Capacitor.isNativePlatform()) return;
    const { protocol, hostname } = window.location;
    if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") return;

    void navigator.serviceWorker.register("/sw", { scope: "/" }).catch(() => {
      /* ignore — ad blockers / private mode */
    });
  }, []);

  return null;
}
