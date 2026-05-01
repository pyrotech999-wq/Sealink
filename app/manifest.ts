import type { MetadataRoute } from "next";

/** Canonical origin for manifest id + absolute icon URLs (Android Chrome is picky if these drift). */
function appOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (explicit && explicit.length > 0) return explicit;
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/+$/, "");
  if (vercel && vercel.length > 0) {
    return vercel.startsWith("http://") || vercel.startsWith("https://") ? vercel : `https://${vercel}`;
  }
  return "http://localhost:3000";
}

export default function manifest(): MetadataRoute.Manifest {
  const origin = appOrigin();
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
        src: `${origin}/pwa-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${origin}/pwa-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      { src: `${origin}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

