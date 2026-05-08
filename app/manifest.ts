import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolvePublicAppOrigin } from "@/lib/public-app-url";

/**
 * Resolve the same origin the user used to load the site (handles www vs apex, correct scheme).
 * Some Android Chrome builds fail to load manifest icons when `src` is path-only (`/pwa-192.png`),
 * which shows a white shortcut tile — full URLs fix that.
 */
async function manifestIconOrigin(): Promise<string> {
  try {
    const h = await headers();
    const hostRaw = h.get("x-forwarded-host") ?? h.get("host");
    if (hostRaw) {
      const host = hostRaw.split(",")[0].trim();
      const protoRaw = h.get("x-forwarded-proto");
      const proto =
        protoRaw?.split(",")[0].trim() ||
        (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
    /* e.g. static analysis */
  }
  return resolvePublicAppOrigin().replace(/\/+$/, "");
}

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const base = await manifestIconOrigin();

  return {
    id: `${base}/`,
    name: "SeaLink",
    short_name: "SeaLink",
    description: "Map, weather & sea, and anchor alerts.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: `${base}/pwa-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/pwa-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${base}/pwa-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${base}/pwa-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
