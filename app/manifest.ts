import type { MetadataRoute } from "next";
import { resolvePublicAppOrigin } from "@/lib/public-app-url";

export default function manifest(): MetadataRoute.Manifest {
  const origin = resolvePublicAppOrigin();
  const v = "418800d";
  return {
    id: `${origin}/`,
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
        src: `${origin}/pwa-192.png?v=${v}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${origin}/pwa-512.png?v=${v}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${origin}/apple-touch-icon.png?v=${v}`,
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      { src: `${origin}/icon.svg?v=${v}`, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

