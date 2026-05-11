"use client";

/**
 * Navigation Charts — Leaflet viewer + initial KAP header parsing.
 *
 * TODO: Route plotting — GeoJSON polyline layer + waypoint markers and GPX export.
 * TODO: Offline chart cache — IndexedDB store for ArrayBuffer + parsed KapMetadata keyed by chart id.
 * TODO: OpenCPN — export bundle / deep link only (never embed OpenCPN in-app).
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { KapMetadata } from "@/lib/navigation-charts/kap-types";
import { PilotChartsDownloads } from "@/components/navigation-charts/PilotChartsDownloads";
import { extractKapRaster, type KapRasterResult } from "@/lib/navigation-charts/extract-kap-raster";
import {
  IBOATING_MARINE_CHARTS_APP,
  iBoatingMarineChartsAppUrl,
  iBoatingMarineChartsAppUrlForLatLng,
} from "@/lib/navigation-charts/iboating-charts-url";
import { parseKapFile } from "@/lib/navigation-charts/parse-kap";

const NavigationChartsMap = dynamic(() => import("./NavigationChartsMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[min(58dvh,520px)] min-h-[280px] w-full items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60"
      aria-busy="true"
    >
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading map…</p>
    </div>
  ),
});

type LoadStatus = "idle" | "loading" | "success" | "error";

type LoadPhase = "idle" | "parsing" | "extracting" | "overlay" | "rendering" | "ready";

type ErrorKind = "parse" | "raster" | "read" | "none";

const PHASE_ORDER = ["parsing", "extracting", "overlay", "rendering"] as const;

type LoadPhaseStep = (typeof PHASE_ORDER)[number];

const PHASE_LABELS: Record<LoadPhaseStep, string> = {
  parsing: "Parsing KAP",
  extracting: "Extracting raster",
  overlay: "Generating overlay",
  rendering: "Rendering chart",
};

function revokeRasterUrl(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function NavigationChartsClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rasterUrlRef = useRef<string | null>(null);
  const locWatchRef = useRef<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<KapMetadata | null>(null);
  const [rasterObjectUrl, setRasterObjectUrl] = useState<string | null>(null);
  const [decodedImageSize, setDecodedImageSize] = useState<{ width: number; height: number } | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [errorKind, setErrorKind] = useState<ErrorKind>("none");
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("idle");
  const [fitBoundsNonce, setFitBoundsNonce] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  const [locError, setLocError] = useState<string>("");
  const [shareStatus, setShareStatus] = useState<string>("");
  const [locating, setLocating] = useState(false);

  const iBoatingHref = useMemo(
    () => iBoatingMarineChartsAppUrl(metadata?.bounds ?? null),
    [metadata?.bounds],
  );

  useEffect(() => {
    return () => {
      revokeRasterUrl(rasterUrlRef.current);
      rasterUrlRef.current = null;
      if (locWatchRef.current != null) {
        navigator.geolocation?.clearWatch(locWatchRef.current);
        locWatchRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (metadata) {
      console.info("[NavigationCharts] KAP metadata", metadata);
    }
  }, [metadata]);

  const onUploadKapClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onKapSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".kap")) {
      setStatus("error");
      setErrorKind("parse");
      setStatusDetail("Please choose a .kap file.");
      setUploadedFile(null);
      setMetadata(null);
      setRasterObjectUrl(null);
      setDecodedImageSize(null);
      setLoadPhase("idle");
      revokeRasterUrl(rasterUrlRef.current);
      rasterUrlRef.current = null;
      return;
    }

    setStatus("loading");
    setErrorKind("none");
    setLoadPhase("parsing");
    setStatusDetail("Parsing KAP…");
    setUploadedFile(file);
    setMetadata(null);
    setDecodedImageSize(null);
    revokeRasterUrl(rasterUrlRef.current);
    rasterUrlRef.current = null;
    setRasterObjectUrl(null);

    const yieldPaint = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    try {
      const buf = await file.arrayBuffer();
      await yieldPaint();

      const result = parseKapFile(buf);
      if (!result.ok) {
        setStatus("error");
        setErrorKind("parse");
        setLoadPhase("idle");
        setStatusDetail(result.error);
        setMetadata(null);
        return;
      }

      setMetadata(result.metadata);
      setFitBoundsNonce((n) => n + 1);
      setLoadPhase("extracting");
      setStatusDetail("Extracting raster…");
      await yieldPaint();

      let raster: KapRasterResult;
      try {
        raster = extractKapRaster(buf, result.metadata);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setErrorKind("raster");
        setLoadPhase("idle");
        setStatusDetail(msg);
        revokeRasterUrl(rasterUrlRef.current);
        rasterUrlRef.current = null;
        setRasterObjectUrl(null);
        return;
      }

      setDecodedImageSize({ width: raster.width, height: raster.height });
      setLoadPhase("overlay");
      setStatusDetail("Generating overlay…");
      await yieldPaint();

      const blob = await (await fetch(raster.dataUrl)).blob();
      const objectUrl = URL.createObjectURL(blob);
      revokeRasterUrl(rasterUrlRef.current);
      rasterUrlRef.current = objectUrl;
      setRasterObjectUrl(objectUrl);

      setLoadPhase("rendering");
      setStatusDetail("Rendering chart…");
      await yieldPaint();

      setFitBoundsNonce((n) => n + 1);
      setLoadPhase("ready");
      setStatus("success");
      setStatusDetail("Chart loaded successfully");
    } catch (err) {
      setStatus("error");
      setErrorKind("read");
      setLoadPhase("idle");
      setStatusDetail(err instanceof Error ? err.message : "Could not read the file.");
      setMetadata(null);
      setDecodedImageSize(null);
      revokeRasterUrl(rasterUrlRef.current);
      rasterUrlRef.current = null;
      setRasterObjectUrl(null);
    }
  }, []);

  const onOpenOpenCpnClick = useCallback(() => {
    // TODO: OpenCPN — document export path or platform URL scheme; no in-app OpenCPN runtime.
  }, []);

  const onSetMyLocation = useCallback(() => {
    setLocError("");
    setShareStatus("");

    if (!("geolocation" in navigator)) {
      setLocError("Geolocation is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracyM = pos.coords.accuracy;
        setUserLocation({ lat, lng, accuracyM });
        setShareStatus("Location set.");
      },
      (err) => {
        setLocError(err.message || "Could not get your location (permission denied or unavailable).");
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 },
    );
  }, []);

  const bestShareUrl = useMemo(() => {
    if (userLocation) {
      const zoom =
        userLocation.accuracyM != null && Number.isFinite(userLocation.accuracyM)
          ? userLocation.accuracyM < 80
            ? 14
            : userLocation.accuracyM < 300
              ? 13
              : 12
          : 13;
      return iBoatingMarineChartsAppUrlForLatLng({ lat: userLocation.lat, lng: userLocation.lng, zoom });
    }
    return iBoatingHref;
  }, [iBoatingHref, userLocation]);

  const onSendToApp = useCallback(() => {
    if (locating) return;
    setLocError("");
    setLocating(true);
    setShareStatus("Getting your location…");

    if (!("geolocation" in navigator)) {
      setLocError("Geolocation is not available in this browser.");
      setShareStatus("");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracyM = pos.coords.accuracy;
        setUserLocation({ lat, lng, accuracyM });

        const zoom =
          accuracyM != null && Number.isFinite(accuracyM) ? (accuracyM < 80 ? 14 : accuracyM < 300 ? 13 : 12) : 13;
        const url = iBoatingMarineChartsAppUrlForLatLng({ lat, lng, zoom });
        window.open(url, "_blank", "noopener,noreferrer");

        setShareStatus("");
        setLocating(false);
      },
      (err) => {
        // If GPS fails/denied, fall back to the default viewer.
        setLocError("");
        setShareStatus("Unable to get your location — use the chart to locate yourself.");
        window.open(IBOATING_MARINE_CHARTS_APP, "_blank", "noopener,noreferrer");
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
  }, [locating]);

  const phaseIndex = (p: LoadPhase) => PHASE_ORDER.indexOf(p as LoadPhaseStep);

  const statusBanner =
    status === "idle" ? null : (
      <div className="space-y-2">
        <p
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-3 py-2 text-sm ${
            status === "loading"
              ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100"
              : status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
                : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          }`}
        >
          {status === "error" ? (
            <>
              <span className="font-semibold">
                {errorKind === "raster"
                  ? "Raster extraction failed"
                  : errorKind === "read"
                    ? "Could not load file"
                    : "Invalid KAP file"}
              </span>
              {statusDetail ? (
                <span className="mt-1 block text-xs font-normal leading-snug opacity-90">{statusDetail}</span>
              ) : null}
            </>
          ) : (
            <span className="font-medium">{statusDetail}</span>
          )}
        </p>
        {status === "loading" ? (
          <ol className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
            {PHASE_ORDER.map((key) => {
              const cur = phaseIndex(loadPhase);
              const idx = PHASE_ORDER.indexOf(key);
              const done = cur > idx || loadPhase === "ready";
              const active = loadPhase === key;
              return (
                <li
                  key={key}
                  className={`flex items-center gap-1.5 ${active ? "font-semibold text-sky-800 dark:text-sky-200" : ""}`}
                >
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none">
                    {done ? "✓" : active ? "…" : "○"}
                  </span>
                  {PHASE_LABELS[key]}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/weather"
          className="inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:w-auto"
        >
          ← Back to Weather
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Navigation Charts
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Open the chart viewer centred on your current location.
        </p>
      </header>
      <section className="space-y-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/90 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950/50">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Other web chart viewers</p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            Tap <strong className="text-zinc-800 dark:text-zinc-200">Open chart in app</strong>. We&apos;ll grab your GPS
            location first, then open the chart centred on you.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={onSendToApp}
              disabled={locating}
              className={`inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-base font-semibold text-white shadow-sm ${
                locating
                  ? "cursor-not-allowed bg-emerald-700/70"
                  : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
              }`}
            >
              {locating ? "Getting your location…" : "Open chart in app"}
            </button>
            {locError ? (
              <p className="text-[11px] text-red-700 dark:text-red-300" role="status" aria-live="polite">
                {locError}
              </p>
            ) : null}
            {shareStatus ? (
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400" role="status" aria-live="polite">
                {shareStatus}
              </p>
            ) : null}
            {userLocation ? (
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Location:{" "}
                <span className="font-mono">
                  {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                </span>
                {userLocation.accuracyM != null ? ` (±${Math.round(userLocation.accuracyM)}m)` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </section>

    </div>
  );
}
