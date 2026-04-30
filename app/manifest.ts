import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SeaLink",
    short_name: "SeaLink",
    description: "Map, weather & sea, and anchor alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#16a34a",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

