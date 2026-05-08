import { NavigationChartsPrintClient } from "@/components/navigation-charts/NavigationChartsPrintClient";

function num(v: string | string[] | undefined, fallback: number) {
  if (v == null) return fallback;
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export default function NavigationChartsPrintPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const lat = num(searchParams?.lat, 37.5);
  const lng = num(searchParams?.lng, 14);
  const zoom = num(searchParams?.z, 5);
  return <NavigationChartsPrintClient lat={lat} lng={lng} zoom={zoom} />;
}

