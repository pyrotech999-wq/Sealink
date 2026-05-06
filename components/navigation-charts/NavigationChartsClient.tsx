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
import { useCallback, useEffect, useRef, useState } from "react";

import type { KapMetadata } from "@/lib/navigation-charts/kap-types";
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

export function NavigationChartsClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<KapMetadata | null>(null);
  const [rasterObjectUrl, setRasterObjectUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");

  useEffect(() => {
    return () => {
      if (rasterObjectUrl) URL.revokeObjectURL(rasterObjectUrl);
    };
  }, [rasterObjectUrl]);

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
      setStatusDetail("Please choose a .kap file.");
      setUploadedFile(null);
      setMetadata(null);
      return;
    }

    setStatus("loading");
    setStatusDetail("Loading chart…");
    setUploadedFile(file);
    setMetadata(null);
    if (rasterObjectUrl) {
      URL.revokeObjectURL(rasterObjectUrl);
      setRasterObjectUrl(null);
    }

    try {
      const buf = await file.arrayBuffer();
      const result = parseKapFile(buf);
      if (!result.ok) {
        setStatus("error");
        setStatusDetail(result.error);
        setMetadata(null);
        return;
      }
      setMetadata(result.metadata);
      setStatus("success");
      setStatusDetail("Chart loaded successfully");
    } catch {
      setStatus("error");
      setStatusDetail("Could not read the file.");
      setMetadata(null);
    }
  }, [rasterObjectUrl]);

  const onOpenOpenCpnClick = useCallback(() => {
    // TODO: OpenCPN — document export path or platform URL scheme; no in-app OpenCPN runtime.
  }, []);

  const statusBanner =
    status === "idle" ? null : (
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
            <span className="font-semibold">Invalid KAP file</span>
            {statusDetail ? (
              <span className="mt-1 block text-xs font-normal leading-snug opacity-90">{statusDetail}</span>
            ) : null}
          </>
        ) : (
          <span className="font-medium">{statusDetail}</span>
        )}
      </p>
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
          Upload a BSB/KAP header to preview georeference on the map. Raster decoding and ENC support will follow.
        </p>
      </header>

      {statusBanner}

      <NavigationChartsMap
        chartBounds={metadata?.bounds ?? null}
        overlayUrl={rasterObjectUrl}
        showRasterOverlay={Boolean(metadata)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".kap,.KAP"
          className="hidden"
          tabIndex={-1}
          onChange={onKapSelected}
        />
        <button
          type="button"
          onClick={onUploadKapClick}
          aria-label="Upload KAP chart file"
          className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700 sm:flex-1 sm:min-w-[160px]"
        >
          Upload KAP Chart
        </button>
        <button
          type="button"
          onClick={onOpenOpenCpnClick}
          className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:flex-1 sm:min-w-[160px]"
        >
          Open in OpenCPN
        </button>
      </div>

      {metadata ? (
        <section
          className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 sm:p-5"
          aria-label="Chart metadata"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Chart metadata</h2>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">File</dt>
              <dd className="truncate font-mono text-zinc-900 dark:text-zinc-100">{uploadedFile?.name ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Chart name</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{metadata.chartName ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Format</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-100">{metadata.version ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Raster (px)</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                {metadata.rasterWidth != null && metadata.rasterHeight != null
                  ? `${metadata.rasterWidth} × ${metadata.rasterHeight}`
                  : "—"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Projection</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{metadata.projection ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Datum / scale</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {[metadata.datum, metadata.scale].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Bounds (S,W → N,E)</dt>
              <dd className="break-all font-mono text-[11px] text-zinc-900 dark:text-zinc-100 sm:text-xs">
                {metadata.bounds
                  ? `${metadata.bounds[0]![0].toFixed(4)}, ${metadata.bounds[0]![1].toFixed(4)} → ${metadata.bounds[1]![0].toFixed(4)}, ${metadata.bounds[1]![1].toFixed(4)}`
                  : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">REF points ({metadata.referencePoints.length})</dt>
              <dd className="max-h-32 overflow-y-auto font-mono text-[10px] leading-relaxed text-zinc-800 dark:text-zinc-200 sm:text-xs">
                {metadata.referencePoints.length
                  ? metadata.referencePoints
                      .map(
                        (r) =>
                          `#${r.index} px(${r.pixelX},${r.pixelY}) → ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`,
                      )
                      .join("\n")
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white/60 p-4 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
        <p className="font-semibold text-zinc-800 dark:text-zinc-200">Roadmap</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>KAP/BSB full binary decode &amp; true raster paint</li>
          <li>GPS vessel positioning</li>
          <li>Offline chart caching</li>
          <li>Chart overlays &amp; route plotting</li>
          <li>Weather / tide overlays</li>
        </ul>
      </section>
    </div>
  );
}
