"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Field Management · Full Cockpit (UI flow only)
   ──────────────────────────────────────────────────────────────────────────
   Complete module cockpit replicating the exact same tab structure, filters,
   export, comparison, builder, and saved-reports experience as the live Shop
   Management reports. All data is static sample data — the backend team can
   wire this to a real Field data engine by following the notes in mock-data.ts.

   Tabs: Overview | Reports | Comparison | Builder | Saved | Recent | Pinned | Scheduled
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Printer, FileSpreadsheet, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ReportsNav, type ReportsTabId } from "../reports-nav";
import { ModulePreviewBanner } from "../module-preview-banner";
import { EmptyState } from "../empty-state";
import { ModuleMockComparison } from "../module-mock-comparison";
import { FieldOverview } from "./field-overview";
import { FieldReportCategories } from "./field-report-categories";
import { FieldMockBuilder } from "./field-mock-builder";
import { FieldMockSaved } from "./field-mock-saved";

import {
  fieldComparisonMetrics,
  fieldComparisonBase,
  fieldEntityDimensions,
} from "./mock-data";

export function FieldCockpit() {
  const [tab, setTab] = useState<ReportsTabId>("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Business Intelligence</p>
          <h1 className="font-display mt-0.5 text-2xl font-extrabold tracking-tight md:text-[1.75rem]">
            Field Reports
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            On-site visits, routes, van stock and technician performance — your complete field intelligence cockpit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium shadow-card transition",
              filtersOpen
                ? "border-[#4361EE]/50 bg-[#EEF1FD] text-[#3347D6]"
                : "border-border bg-card text-zinc-600 hover:bg-muted"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
          <Button variant="outline" size="sm" disabled>
            <FileSpreadsheet className="h-4 w-4" /> Excel / CSV
          </Button>
          <Button size="sm" disabled>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* ── Filter drawer placeholder ────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
              <p className="text-[12px] font-medium text-muted-foreground">
                Filters will be available here once the Field data engine is connected.
                The layout mirrors the Shop Management filter bar — date range, technician, route, zone, service type, SLA status.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <ReportsNav value={tab} onChange={setTab} />

      {/* ── Content ──────────────────────────────────────────────────── */}
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === "overview" && <FieldOverview />}

        {tab === "reports" && <FieldReportCategories />}

        {tab === "comparison" && (
          <div className="space-y-4">
            <ModulePreviewBanner moduleLabel="Field Management" />
            <ModuleMockComparison
              moduleLabel="Field Management"
              metricRows={fieldComparisonMetrics}
              baseMetrics={fieldComparisonBase}
              entityDimensions={fieldEntityDimensions}
            />
          </div>
        )}

        {tab === "builder" && <FieldMockBuilder />}

        {tab === "saved" && <FieldMockSaved filterMode="all" />}
        {tab === "recent" && <FieldMockSaved filterMode="recent" />}
        {tab === "pinned" && <FieldMockSaved filterMode="pinned" />}

        {tab === "scheduled" && (
          <div className="space-y-4">
            <ModulePreviewBanner moduleLabel="Field Management" />
            <div className="rounded-[20px] border border-border bg-card p-8 shadow-card">
              <EmptyState
                icon="calendar"
                title="Scheduled reports are coming soon"
                detail="Automatic daily, weekly, monthly and quarterly Field report delivery by email and WhatsApp will appear here once configured."
              />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
