"use client";

/**
 * Leads → Price List (standalone page)
 * ------------------------------------------------------------------
 * Renders the ONE canonical Price List page component + its live catalog data.
 * No copied catalog, no duplicated pricing, no separate device/parts/image
 * source — this is the exact same component used by Shop → Price List, just
 * presented as a clean full-screen page (see ./layout.tsx) so it opens nicely
 * in a new browser tab from the Leads sidebar.
 *
 * Any Add / Edit / Delete / Import / Export / price / image change made in
 * Settings → Price List flows here automatically, because this reads the same
 * catalog. Single source of truth is preserved.
 */

import { useEffect } from "react";
import PriceListPage from "@/app/(app)/price-list/page";

export default function LeadsPriceListStandalonePage() {
  // The tab is a self-contained Price List view — label the browser tab so the
  // Sales Person can tell it apart from their original Leads tab.
  useEffect(() => {
    const prev = document.title;
    document.title = "Price List · RepairOX";
    return () => {
      document.title = prev;
    };
  }, []);

  return <PriceListPage />;
}
