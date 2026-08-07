"use client";

import { useEffect } from "react";
import { loadDeviceCategories } from "@/lib/device-categories";

/**
 * Invisible component that preloads device categories + images into memory
 * as soon as the app shell mounts. This ensures the category wheel renders
 * instantly when users click "Add New".
 */
export function CategoryPreloader() {
  useEffect(() => {
    // Fire-and-forget — loadDeviceCategories caches internally
    // and also preloads images into the browser cache.
    loadDeviceCategories();
  }, []);

  return null;
}
