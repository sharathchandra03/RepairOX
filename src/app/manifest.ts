import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RepairOX Ninja",
    short_name: "Ninja",
    description: "RepairOX field operations for Ninjas: jobs, navigation, proof and handover.",
    start_url: "/ninja",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F6FB",
    theme_color: "#4361EE",
    icons: [{ src: "/favicon.png", sizes: "any", type: "image/png", purpose: "any" }],
  };
}
