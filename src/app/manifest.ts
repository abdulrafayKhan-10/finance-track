import type { MetadataRoute } from "next";

/** Served at /manifest.webmanifest (docs/06-ui-design-system.md §6.6). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finance Track",
    short_name: "Finance",
    description: "Private personal finance and investment tracker.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f7f5",
    theme_color: "#123c33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
