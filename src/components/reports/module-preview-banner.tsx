"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Module preview banner
   ──────────────────────────────────────────────────────────────────────────
   Shown at the top of Sales Management / Field Management reports. The full
   UI/UX flow for these modules is built and ready — every section, filter,
   comparison, builder and saved-report screen — but the data underneath is
   static sample data, not a live calculation. This banner is the one honest
   signal to the shop owner (and the backend team) that wiring is pending.

   Presentation only. Remove this banner once a module's data source is
   connected to a real lib/reports engine (see registry.ts to register it).
   ────────────────────────────────────────────────────────────────────────── */

import { FlaskConical } from "lucide-react";

export function ModulePreviewBanner({ moduleLabel }: { moduleLabel: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-[#B3BFF6]/70 bg-[#EEF1FD]/50 px-4 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-[#4361EE] shadow-card">
        <FlaskConical className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-[#3347D6]">
          {moduleLabel} — preview with sample data
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          This is the complete UI/UX flow for {moduleLabel}, populated with placeholder numbers so the layout, filters,
          comparisons, builder and saved reports can be reviewed end to end. No live calculations run here yet — once
          this module&apos;s data sources are connected, every card, chart and table will switch to real figures automatically.
        </p>
      </div>
    </div>
  );
}
