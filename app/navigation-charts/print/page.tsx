"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const NavigationChartsMap = dynamic(() => import("@/components/navigation-charts/NavigationChartsMap"), {
  ssr: false,
});

function num(v: string | null, fallback: number) {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function NavigationChartsPrintPage() {
  const sp = useSearchParams();
  const [ready, setReady] = useState(false);

  const view = useMemo(() => {
    const lat = num(sp.get("lat"), 37.5);
    const lng = num(sp.get("lng"), 14);
    const zoom = num(sp.get("z"), 5);
    return { lat, lng, zoom };
  }, [sp]);

  useEffect(() => {
    // Give Leaflet a moment to paint tiles before opening the print dialog.
    const t = window.setTimeout(() => {
      setReady(true);
      window.print();
    }, 900);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-print border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <p className="font-semibold">Save as PDF</p>
        <p className="mt-0.5 text-xs text-zinc-600">
          Use your device’s print dialog and choose <span className="font-semibold">Save as PDF</span>.
        </p>
      </div>

      <div className="p-4">
        <div className="h-[calc(100dvh-5.25rem)] min-h-[520px]">
          <NavigationChartsMap
            chartBounds={null}
            overlayUrl={null}
            showRasterOverlay={false}
            showDebugBounds={false}
            initialCenter={[view.lat, view.lng]}
            initialZoom={view.zoom}
          />
        </div>

        {!ready ? (
          <p className="no-print mt-3 text-xs text-zinc-600">Preparing map for PDF…</p>
        ) : null}
      </div>
    </div>
  );
}

