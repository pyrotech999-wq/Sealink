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
import { PilotChartsDownloads } from "@/components/navigation-charts/PilotChartsDownloads";
import { extractKapRaster, type KapRasterResult } from "@/lib/navigation-charts/extract-kap-raster";
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

const EncNavigationMap = dynamic(() => import("./EncNavigationMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[min(58dvh,520px)] min-h-[280px] w-full items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60"
      aria-busy="true"
    >
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading ENC map…</p>
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
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<KapMetadata | null>(null);
  const [rasterObjectUrl, setRasterObjectUrl] = useState<string | null>(null);
  const [decodedImageSize, setDecodedImageSize] = useState<{ width: number; height: number } | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [errorKind, setErrorKind] = useState<ErrorKind>("none");
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("idle");
  const [fitBoundsNonce, setFitBoundsNonce] = useState(0);

  useEffect(() => {
    return () => {
      revokeRasterUrl(rasterUrlRef.current);
      rasterUrlRef.current = null;
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
          Upload your own <strong className="font-medium text-zinc-700 dark:text-zinc-300">.kap</strong> (BSB/KAP raster)
          to preview georeference and decoded raster overlay. SeaLink does not ship chart bundles — you obtain charts under
          their licence, then open them here.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300 sm:p-5">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">How chart files work</h2>
        <p className="mt-2 text-xs sm:text-sm">
          Raster charts are usually <strong className="text-zinc-800 dark:text-zinc-200">copyrighted</strong>. We cannot
          bulk-download or redistribute them for everyone without agreements with each hydrographic office. The practical
          model is <strong className="text-zinc-800 dark:text-zinc-200">bring your own chart</strong>: you download or buy
          charts you are entitled to use, copy the <span className="font-mono text-zinc-600 dark:text-zinc-400">.kap</span>{" "}
          onto your phone or tablet, then tap <strong className="text-zinc-800 dark:text-zinc-200">Upload KAP Chart</strong>.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs sm:text-sm">
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">United States (free):</strong> NOAA publishes raster
            nautical charts (RNC) in BSB/KAP form — use the official catalog and download the cells you need, then upload
            here.{" "}
            <a
              href="https://www.nauticalcharts.noaa.gov/charts/noaa-raster-charts.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              NOAA raster charts
            </a>
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">OpenCPN pilot charts (free):</strong> the OpenCPN team
            distributes digital <strong className="text-zinc-800 dark:text-zinc-200">US Pilot Charts</strong> in BSB/KAP
            for ocean passage planning (not substitute for up-to-date ENC/RNC for pilotage). Downloads are{" "}
            <span className="font-mono text-zinc-600 dark:text-zinc-400">.7z</span> archives — extract with{" "}
            <a
              href="https://www.7-zip.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              7-Zip
            </a>{" "}
            (or e.g. Keka on Mac), then upload the <span className="font-mono text-zinc-600 dark:text-zinc-400">.kap</span>{" "}
            files here.{" "}
            <a
              href="https://opencpn.org/OpenCPN/info/pilotcharts.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              Pilot charts download page
            </a>
            .
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">Elsewhere:</strong> UKHO, Imray, NV Charts, etc. sell or
            license raster/ENC products; follow each publisher&apos;s terms (often tied to a specific app or device count).
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">Already use OpenCPN?</strong> Chart folders you maintain
            there are often the same <span className="font-mono text-zinc-600 dark:text-zinc-400">.kap</span> files — copy
            one file across and upload. See also{" "}
            <a
              href="https://opencpn.org/wiki/doku.php?id=opencpn:chart_sources"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              OpenCPN chart sources
            </a>
            .
          </li>
        </ul>
        <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          <strong className="text-amber-900 dark:text-amber-200">Product note:</strong> A future &quot;chart shop&quot;
          inside SeaLink would need contracts and payment with each publisher. Until then, uploads keep licensing clear and
          avoid us hosting copyrighted rasters without permission.
        </p>
      </section>

      <PilotChartsDownloads />

      {statusBanner}

      <NavigationChartsMap
        chartBounds={metadata?.bounds ?? null}
        overlayUrl={rasterObjectUrl}
        showRasterOverlay={Boolean(metadata && rasterObjectUrl)}
        fitBoundsNonce={fitBoundsNonce}
        showDebugBounds
      />

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            ENC map viewer (NOAA)
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-sm">
            Electronic Navigational Chart (ENC) cells from NOAA&apos;s public{" "}
            <a
              href="https://nauticalcharts.noaa.gov/data/gis-data-and-services.html"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
            >
              Chart Tools
            </a>{" "}
            service (US waters and US territories). When you load a KAP above, this map pans to the same geographic bounds
            so you can compare raster and ENC in one place. For passage planning curiosity only — not for primary
            navigation; use an approved ECDIS or paper charts for safety-of-life decisions.
          </p>
        </div>
        <EncNavigationMap chartBounds={metadata?.bounds ?? null} fitBoundsNonce={fitBoundsNonce} />
        <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          ENC cells © NOAA Office of Coast Survey —{" "}
          <a
            href="https://www.noaa.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            NOAA
          </a>
          .
        </p>
      </section>

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
          aria-label="Chart debug and metadata"
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Chart debug</h2>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
            <div className="flex flex-col gap-0.5 rounded-lg border border-rose-200/80 bg-rose-50/50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/25">
              <dt className="font-medium text-rose-800 dark:text-rose-200">Chart name</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{metadata.chartName ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-rose-200/80 bg-rose-50/50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/25">
              <dt className="font-medium text-rose-800 dark:text-rose-200">Projection</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">{metadata.projection ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-0.5 rounded-lg border border-rose-200/80 bg-rose-50/50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/25">
              <dt className="font-medium text-rose-800 dark:text-rose-200">Lat/lon bounds (S,W → N,E)</dt>
              <dd className="break-all font-mono text-[11px] text-zinc-900 dark:text-zinc-100 sm:text-xs">
                {metadata.bounds
                  ? `${metadata.bounds[0]![0].toFixed(5)}, ${metadata.bounds[0]![1].toFixed(5)} → ${metadata.bounds[1]![0].toFixed(5)}, ${metadata.bounds[1]![1].toFixed(5)}`
                  : "—"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-rose-200/80 bg-rose-50/50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/25">
              <dt className="font-medium text-rose-800 dark:text-rose-200">Image dimensions (decoded)</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                {decodedImageSize
                  ? `${decodedImageSize.width} × ${decodedImageSize.height} px`
                  : rasterObjectUrl
                    ? "—"
                    : "Not decoded yet"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-rose-200/80 bg-rose-50/50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/25">
              <dt className="font-medium text-rose-800 dark:text-rose-200">Header RA= (px)</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                {metadata.rasterWidth != null && metadata.rasterHeight != null
                  ? `${metadata.rasterWidth} × ${metadata.rasterHeight}`
                  : "—"}
              </dd>
            </div>
          </dl>

          <h3 className="mt-5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">File &amp; format</h3>
          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">File</dt>
              <dd className="truncate font-mono text-zinc-900 dark:text-zinc-100">{uploadedFile?.name ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">BSB version</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-100">{metadata.version ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Datum / scale</dt>
              <dd className="text-zinc-900 dark:text-zinc-100">
                {[metadata.datum, metadata.scale].filter(Boolean).join(" · ") || "—"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-950/60">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">Palette RGB/ lines</dt>
              <dd className="font-mono text-zinc-900 dark:text-zinc-100">{metadata.paletteEntries.length}</dd>
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
          <li>KAP/BSB indexed line tables &amp; edge-case charts</li>
          <li>GPS vessel positioning</li>
          <li>Offline chart caching</li>
          <li>Chart overlays &amp; route plotting</li>
          <li>Weather / tide overlays</li>
        </ul>
      </section>
    </div>
  );
}
