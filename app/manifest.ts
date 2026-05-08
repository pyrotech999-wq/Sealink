import type { MetadataRoute } from "next";

/**
 * PWA manifest for “Add to Home screen”.
 *
 * Use same-origin relative `icons[].src` paths so Android/Chrome always resolve icons correctly
 * (absolute URLs from NEXT_PUBLIC_APP_URL can mismatch www / apex and yield a blank shortcut icon).
 * Include both `any` and `maskable` for adaptive icons on Android.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
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
        src: "/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
