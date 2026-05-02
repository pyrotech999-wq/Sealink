"use client";

import { Capacitor } from "@capacitor/core";
import { useLayoutEffect } from "react";
import { installCapacitorNativeLocationBridge } from "@/lib/capacitor-native-location-bridge";

const DOC_CLASS = "capacitor-app";

/**
 * Runs inside the native Capacitor WebView: high-accuracy location bridge, root class for styling,
 * and (elsewhere) service worker is skipped so the remote Next.js app isn’t cached incorrectly.
 */
export function CapacitorAppShell() {
  useLayoutEffect(() => {
    installCapacitorNativeLocationBridge();
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add(DOC_CLASS);
    return () => {
      document.documentElement.classList.remove(DOC_CLASS);
    };
  }, []);

  return null;
}
