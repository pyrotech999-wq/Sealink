"use client";

import { useEffect } from "react";

/** Registers the service worker on HTTPS so Chrome can offer install / standalone “app” from the manifest. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const { protocol, hostname } = window.location;
    if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") return;

    void navigator.serviceWorker.register("/sw", { scope: "/" }).catch(() => {
      /* ignore — ad blockers / private mode */
    });
  }, []);

  return null;
}
