"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

import dynamic from "next/dynamic";

const NavigationChartsMap = dynamic(() => import("@/components/navigation-charts/NavigationChartsMap"), {
  ssr: false,
});

export function NavigationChartsPrintClient({
  lat,
  lng,
  zoom,
}: {
  lat: number;
  lng: number;
  zoom: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
            initialCenter={[lat, lng]}
            initialZoom={zoom}
          />
        </div>

        {!ready ? <p className="no-print mt-3 text-xs text-zinc-600">Preparing map for PDF…</p> : null}
      </div>
    </div>
  );
}

