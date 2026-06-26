"use client";

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
import {
  ArrowLeft,
  Compass,
  Upload,
  Activity,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Map,
  Check,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

const NavigationChartsMap = dynamic(() => import("@/components/navigation-charts/NavigationChartsMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[min(58dvh,520px)] min-h-[280px] w-full items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0c182c]/40"
      aria-busy="true"
    >
      <p className="text-sm font-medium text-zinc-500">Loading map…</p>
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

export function MobileNavigationCharts() {
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
  const [isPilotChartsOpen, setIsPilotChartsOpen] = useState(false);

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
        setLocError("");
        setShareStatus("Unable to get your location — use the chart to locate yourself.");
        window.open(IBOATING_MARINE_CHARTS_APP, "_blank", "noopener,noreferrer");
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
  }, [locating]);

  const phaseIndex = (p: LoadPhase) => PHASE_ORDER.indexOf(p as LoadPhaseStep);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#071426] via-[#040c18] to-[#020610] text-white safe-bottom flex flex-col overflow-x-hidden">
      {/* Immersive Header */}
      <div className="pt-[calc(env(safe-area-inset-top)+1rem)] px-4 pb-4 bg-[#0a192f]/80 border-b border-white/[0.06] backdrop-blur-md shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/weather"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] active:bg-white/[0.08] border border-white/[0.06] text-zinc-300 active:scale-95 transition-all"
            aria-label="Back to weather"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="text-left">
            <h1 className="text-sm font-extrabold tracking-tight text-slate-100 flex items-center gap-1.5">
              <Map className="size-4 text-violet-400" />
              <span>Navigation Charts</span>
            </h1>
            <p className="text-[9px] text-zinc-500">
              Voyage planning &amp; raster overlays
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 max-w-md mx-auto w-full space-y-4 pb-24 animate-fadeIn">
        {/* Map Container */}
        <div className="w-full rounded-3xl overflow-hidden border border-white/[0.08] bg-[#0c182c]/40 shadow-2xl relative flex flex-col p-1">
          <NavigationChartsMap
            chartBounds={metadata?.bounds ?? null}
            overlayUrl={rasterObjectUrl}
            showRasterOverlay={!!rasterObjectUrl}
            fitBoundsNonce={fitBoundsNonce}
            showDebugBounds={true}
          />
        </div>

        {/* Loading status step horizontal bars */}
        {status === "loading" && (
          <div className="bg-[#0c192c]/55 border border-white/[0.06] rounded-2xl p-4 space-y-3.5 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <span className="animate-spin inline-block h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full" />
                Processing KAP Chart
              </span>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">{statusDetail}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {PHASE_ORDER.map((key) => {
                const cur = phaseIndex(loadPhase);
                const idx = PHASE_ORDER.indexOf(key);
                const done = cur > idx || loadPhase === "ready";
                const active = loadPhase === key;
                return (
                  <div key={key} className="space-y-1.5">
                    <div className={`h-1.5 rounded-full transition-all duration-300 ${
                      done ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" : active ? "bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.4)]" : "bg-white/[0.08]"
                    }`} />
                    <div className="text-[9px] text-center truncate font-extrabold text-zinc-500 uppercase tracking-wide">
                      {PHASE_LABELS[key].split(" ")[0]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Load Status Banners */}
        {status === "success" && (
          <div className="flex items-center gap-3 bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-3.5 text-xs text-emerald-300 shadow-md">
            <span className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
              <Check size={16} />
            </span>
            <div className="flex-1 text-left">
              <p className="font-bold">Chart Georeferenced</p>
              <p className="text-[10px] text-emerald-400/80 mt-0.5">{statusDetail || "Loaded onto active instrument display."}</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-3 bg-red-950/30 border border-red-500/20 rounded-2xl p-3.5 text-xs text-red-300 text-left shadow-md">
            <span className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertTriangle size={16} />
            </span>
            <div className="flex-1">
              <p className="font-bold">
                {errorKind === "raster"
                  ? "Raster extraction failed"
                  : errorKind === "read"
                    ? "Could not load file"
                    : "Invalid KAP file"}
              </p>
              <p className="text-[10px] text-red-400/80 mt-0.5 leading-snug">{statusDetail}</p>
            </div>
          </div>
        )}

        {/* Chart Upload / Metadata Card */}
        <div className="rounded-3xl border border-white/[0.06] bg-[#0c192c]/45 p-4.5 shadow-lg backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-2.5">
            <div className="flex items-center gap-2">
              <Upload size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Georeferenced Chart (KAP)</span>
            </div>
            {metadata && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                KAP Parsed
              </span>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={onKapSelected}
            accept=".kap"
            className="hidden"
          />

          {!metadata ? (
            <div
              onClick={onUploadKapClick}
              className="border border-dashed border-violet-500/35 hover:border-violet-500/60 bg-violet-950/5 hover:bg-violet-950/10 rounded-2xl p-7 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all active:scale-[0.99] shadow-inner"
            >
              <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/35 flex items-center justify-center text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.15)] animate-pulse">
                <Upload size={18} />
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-slate-200 block">Upload KAP file</span>
                <span className="text-[9px] text-zinc-500 mt-1 max-w-[200px] block leading-normal">
                  Select a BSB/KAP marine chart extracted from pilot chart archives.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-slate-200 truncate">{uploadedFile?.name}</div>
                  <div className="text-[9px] text-zinc-500 font-mono mt-0.5 font-semibold">
                    {decodedImageSize ? `${decodedImageSize.width}x${decodedImageSize.height} px` : "Dimensions loading..."}
                  </div>
                </div>
                <button
                  onClick={onUploadKapClick}
                  className="text-[10px] font-extrabold text-cyan-400 hover:text-cyan-300 ml-3 shrink-0 active:scale-95 transition-all"
                >
                  Replace
                </button>
              </div>

              {(metadata.chartName || metadata.scale || metadata.projection || metadata.datum) && (
                <div className="bg-[#0c192c]/55 border border-white/[0.06] rounded-xl p-3 text-left space-y-2">
                  <span className="text-[9px] text-zinc-500 uppercase font-extrabold tracking-wider block">Chart Attributes</span>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {metadata.chartName && (
                      <div className="col-span-2 bg-white/[0.02] p-2 rounded-lg border border-white/[0.03]">
                        <span className="text-[8px] text-zinc-500 uppercase font-bold block">Chart Name</span>
                        <span className="font-extrabold text-slate-200 mt-0.5 block truncate">{metadata.chartName}</span>
                      </div>
                    )}
                    {metadata.scale && (
                      <div className="bg-white/[0.02] p-2 rounded-lg border border-white/[0.03]">
                        <span className="text-[8px] text-zinc-500 uppercase font-bold block">Scale</span>
                        <span className="font-extrabold text-slate-200 mt-0.5 block">{metadata.scale}</span>
                      </div>
                    )}
                    {(metadata.projection || metadata.datum) && (
                      <div className="bg-white/[0.02] p-2 rounded-lg border border-white/[0.03]">
                        <span className="text-[8px] text-zinc-500 uppercase font-bold block">Projection</span>
                        <span className="font-extrabold text-slate-200 mt-0.5 block truncate">
                          {[metadata.projection, metadata.datum].filter(Boolean).join(" / ")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {metadata.bounds && (
                <div className="grid grid-cols-2 gap-2 text-left">
                  <div className="bg-gradient-to-br from-[#0c192c]/70 to-[#071120]/80 border border-white/[0.05] rounded-xl p-2.5">
                    <span className="text-[8px] text-zinc-500 uppercase font-extrabold block">South-West Bound</span>
                    <span className="text-[10px] font-mono font-bold text-cyan-400 mt-1 block">
                      {metadata.bounds[0][0].toFixed(5)}°N, {metadata.bounds[0][1].toFixed(5)}°W
                    </span>
                  </div>
                  <div className="bg-gradient-to-br from-[#0c192c]/70 to-[#071120]/80 border border-white/[0.05] rounded-xl p-2.5">
                    <span className="text-[8px] text-zinc-500 uppercase font-extrabold block">North-East Bound</span>
                    <span className="text-[10px] font-mono font-bold text-cyan-400 mt-1 block">
                      {metadata.bounds[1][0].toFixed(5)}°N, {metadata.bounds[1][1].toFixed(5)}°W
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* External Navigation Apps Card */}
        <div className="rounded-3xl border border-white/[0.06] bg-[#0c192c]/45 p-4.5 shadow-lg backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-2.5">
            <div className="flex items-center gap-2">
              <Compass size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">External Nav Integration</span>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide uppercase border ${
              userLocation
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/25 text-amber-400"
            }`}>
              {userLocation ? "GPS Locked" : "Searching GPS..."}
            </span>
          </div>

          <div className="space-y-3.5">
            <button
              type="button"
              onClick={onSendToApp}
              disabled={locating}
              className={`w-full flex items-center justify-center gap-2 rounded-2xl h-12 text-sm font-bold text-white transition-all active:scale-[0.98] cursor-pointer ${
                locating
                  ? "bg-emerald-600/50 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-900/30 text-white"
              }`}
            >
              {locating ? (
                <>
                  <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  <span>Locating Vessel...</span>
                </>
              ) : (
                <>
                  <ExternalLink size={14} />
                  <span>Open Chart in iBoating</span>
                </>
              )}
            </button>

            {locError && (
              <p className="text-[10px] text-red-400 text-left bg-red-950/20 border border-red-500/10 rounded-xl px-3 py-2 leading-relaxed">
                {locError}
              </p>
            )}
            {shareStatus && (
              <p className="text-[10px] text-cyan-400 text-left bg-cyan-950/20 border border-cyan-500/10 rounded-xl px-3 py-2 leading-relaxed">
                {shareStatus}
              </p>
            )}

            {userLocation ? (
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 flex items-center justify-between">
                <div className="text-left">
                  <span className="text-[9px] text-zinc-500 uppercase font-semibold block">Vessel Position</span>
                  <span className="text-xs font-mono font-bold text-slate-200 mt-0.5 block">
                    {userLocation.lat.toFixed(5)}°N, {userLocation.lng.toFixed(5)}°W
                  </span>
                </div>
                {userLocation.accuracyM != null && (
                  <div className="text-right">
                    <span className="text-[9px] text-zinc-500 uppercase font-semibold block">Accuracy</span>
                    <span className="text-xs font-mono font-bold text-slate-300 mt-0.5 block">
                      ±{Math.round(userLocation.accuracyM)}m
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/[0.01] border border-white/[0.04] rounded-xl p-3.5 flex items-center justify-between">
                <span className="text-[9px] text-zinc-500 text-left leading-normal max-w-[70%]">No active GPS sensor stream detected for external routing.</span>
                <button
                  type="button"
                  onClick={onSetMyLocation}
                  className="text-[10px] font-extrabold text-cyan-400 shrink-0 ml-2 active:scale-95 transition-all"
                >
                  Get GPS Lock
                </button>
              </div>
            )}
          </div>
        </div>

        {/* COLREGs Link Card */}
        <Link
          href="/colregs"
          className="group block rounded-3xl border border-white/[0.06] bg-[#0c192c]/45 p-4 active:scale-[0.99] hover:border-white/10 transition-all shadow-md text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-extrabold text-slate-200 group-hover:text-emerald-400 transition-colors">COLREGs Rules</h3>
                  <span className="inline-flex items-center rounded-full bg-emerald-600/10 border border-emerald-500/25 px-1.5 py-0.5 text-[8px] font-extrabold tracking-wide text-emerald-400 uppercase">
                    Open
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug mt-0.5">
                  Collision Prevention Regulations reference guide.
                </p>
              </div>
            </div>
            <ChevronRight className="text-zinc-500 group-hover:text-white transition-colors size-4 shrink-0" />
          </div>
        </Link>

        {/* Pilot Charts Accordion */}
        <div className="rounded-3xl border border-white/[0.06] bg-[#0c192c]/45 shadow-lg backdrop-blur-md overflow-hidden">
          <button
            type="button"
            onClick={() => setIsPilotChartsOpen(!isPilotChartsOpen)}
            className="w-full flex items-center justify-between p-4.5 border-b border-white/[0.05] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-zinc-400" />
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Pilot Charts Library</span>
            </div>
            {isPilotChartsOpen ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
          </button>

          {isPilotChartsOpen && (
            <div className="p-4 bg-zinc-950/25 text-left">
              <PilotChartsDownloads />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
