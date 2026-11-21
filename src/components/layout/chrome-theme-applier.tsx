"use client";

/* Applies the organisation's saved sidebar / header colours (organization_settings.chrome_theme)
   to the document. Renders nothing. A small local cache paints the last-used colours on the
   very first frame so the app doesn't flash the default before settings load. */

import { useEffect } from "react";
import { useStoreSettings } from "@/lib/store-settings";
import { applyChrome, CHROME_CACHE_KEY, DEFAULT_CHROME, normalizeChoice } from "@/lib/chrome-themes";

export function ChromeThemeApplier() {
  const { settings, hydrated } = useStoreSettings();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHROME_CACHE_KEY);
      if (raw) applyChrome(normalizeChoice(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  // Keyed on the colours themselves so an unrelated settings echo never repaints over a live preview.
  const choice = settings.chromeTheme ?? DEFAULT_CHROME;
  const key = JSON.stringify([choice.sidebar, choice.header, choice.pill ?? null, choice.line ?? "brand"]);
  useEffect(() => {
    if (!hydrated) return;
    applyChrome(choice);
    try { localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify(choice)); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, key]);

  return null;
}
