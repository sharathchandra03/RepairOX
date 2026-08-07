"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Business Intelligence Cockpit (V2)
   ──────────────────────────────────────────────────────────────────────────
   Presentation-layer redesign only. Every number, filter, export, comparison,
   builder and saved-report action below is powered by the SAME lib/reports
   engine as before (useReportData, buildFilterOptions, applyFilters,
   rangeFromFilters, computeKpis, generateInsights, exportTablesCSV,
   printReport, saved-reports store). Nothing in that engine was touched —
   this file only reshapes how the results are presented, in the language of
   Power BI / Stripe Analytics / Looker Studio: an executive summary first,
   then business performance, collections, operations, financial health,
   inventory impact, insights, and top performers — clarity and hierarchy
   over decorative charts.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Printer, FileSpreadsheet, SlidersHorizontal, Loader2, Store, TrendingUp, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useReportData } from "@/lib/reports/use-report-data";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";

import { buildFilterOptions, applyFilters, rangeFromFilters, activeFilterCount } from "@/lib/reports/filters";
import { computeKpis, formatKpi } from "@/lib/reports/kpis";
import { generateInsights } from "@/lib/reports/insights";
import { EMPTY_FILTERS } from "@/lib/reports/types";
import { REPORT_MODULES } from "@/lib/reports/registry";
import { exportTablesCSV, printReport, type CompanyInfo } from "@/lib/reports/export";

import {
  executiveSummary, revenueTrendSeries, revenueSplit, collectionsBreakdown,
  operationsHealth, financialHealth, inventoryImpact, topPerformers,
} from "./selectors";

import { ReportFilterBar } from "./report-filter-bar";
import { ReportsNav, type ReportsTabId } from "./reports-nav";
import { DateRangeControl } from "./date-range-control";
import { ExecutiveSummary } from "./exec-summary";
import { BusinessPerformance } from "./business-performance";
import { CollectionsPanel } from "./collections-panel";
import { OperationsHealth } from "./operations-health";
import { FinancialHealth } from "./financial-health";
import { InventoryImpact } from "./inventory-impact";
import { TopPerformers } from "./top-performers";
import { InsightsPanel } from "./insights-panel";
import { ReportCategories } from "./report-categories";
import { ComparisonEngine } from "./comparison-engine";
import { CustomReportBuilder } from "./custom-report-builder";
import { SavedReportsPanel } from "./saved-reports-panel";
import { EmptyState } from "./empty-state";
import { SalesOverview } from "./sales/sales-overview";
import { FieldOverview } from "./field/field-overview";
import { useReportContext } from "@/lib/reports/report-context";

import type { ReportFilters, ReportModuleId } from "@/lib/reports/types";

const MODULE_ICON: Record<string, any> = { shop: Store, sales: TrendingUp, field: Map };
const MODULE_ROUTE: Record<string, string> = { shop: "/reports", sales: "/leads/reports", field: "/operations/reports" };

export function ReportsCockpit() {
  const data = useReportData();
  const { settings } = useStoreSettings();
  const { currentUser, isDemoMode } = usePermissions();

  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [tab, setTab] = useState<ReportsTabId>("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { moduleScope, setModuleScope, meta: moduleMeta } = useReportContext();
  const router = useRouter();

  const options = useMemo(() => buildFilterOptions(data), [data]);
  const range = useMemo(() => rangeFromFilters(filters), [filters]);
  const filtered = useMemo(() => applyFilters(data, filters, range), [data, filters, range]);
  const kpis = useMemo(() => computeKpis(data, filters), [data, filters]);
  const insights = useMemo(() => generateInsights(data, filters), [data, filters]);

  // V2 section data — all derived purely from the existing engine outputs.
  const execCards = useMemo(() => executiveSummary(data, filters), [data, filters]);
  const revTrend = useMemo(() => revenueTrendSeries(data, filters), [data, filters]);
  const revSplit = useMemo(() => revenueSplit(data, filters), [data, filters]);
  const collections = useMemo(() => collectionsBreakdown(data, filters), [data, filters]);
  const opsCards = useMemo(() => operationsHealth(data, filters), [data, filters]);
  const finCards = useMemo(() => financialHealth(data, filters), [data, filters]);
  const inventory = useMemo(() => inventoryImpact(data, filters), [data, filters]);
  const performers = useMemo(() => topPerformers(data, filters), [data, filters]);

  const company: CompanyInfo = {
    name: settings.storeName,
    logo: settings.logo || undefined,
    address: settings.address,
    city: settings.city,
    state: settings.state,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    gst: settings.registrationNumber,
  };
  const generatedBy = currentUser?.name ?? "RepairOX";

  const summaryChips = kpis
    .filter((k) => ["total_revenue", "collected", "total_tickets", "invoices_generated", "expenses", "collection_rate"].includes(k.id))
    .map((k) => ({ label: k.label, value: formatKpi(k.value, k.format) }));

  const buildExportTables = () => {
    const rev = kpis.filter((k) => k.section === "revenue");
    const ops = kpis.filter((k) => k.section !== "revenue");
    const toRows = (arr: typeof kpis) => arr.map((k) => [k.label, formatKpi(k.value, k.format), k.deltaPct == null ? "—" : `${k.deltaPct >= 0 ? "+" : ""}${k.deltaPct.toFixed(0)}%`]);
    return [
      { title: "Revenue & Collections", columns: ["Metric", "Value", "Δ vs prev"], rows: toRows(rev) },
      { title: "Operations, Financial, Customers & Inventory", columns: ["Metric", "Value", "Δ vs prev"], rows: toRows(ops) },
    ];
  };

  const filtersUsed = useMemo(() => {
    const out: { label: string; value: string }[] = [{ label: "Period", value: range.label }];
    const map: [keyof ReportFilters, string][] = [
      ["branch", "Branch"], ["employee", "Employee"], ["technician", "Technician"], ["customer", "Customer"],
      ["invoiceType", "Invoice Type"], ["ticketStatus", "Ticket Status"], ["paymentStatus", "Payment Status"],
      ["paymentMode", "Payment Mode"], ["deviceCategory", "Device"], ["brand", "Brand"], ["model", "Model"],
      ["priority", "Priority"], ["serviceType", "Service Type"],
    ];
    for (const [k, label] of map) if (filters[k]) out.push({ label, value: String(filters[k]) });
    return out;
  }, [filters, range]);

  const doPrint = () =>
    printReport(company, {
      reportName: "Business Intelligence Summary",
      dateRangeLabel: range.label,
      filtersUsed,
      generatedBy,
      summary: summaryChips,
      tables: buildExportTables(),
    });

  const doCSV = () => exportTablesCSV(`repairox-report-${range.presetId}`, buildExportTables());

  const filterCount = activeFilterCount(filters);

  if (!data.hydrated) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading your business data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Business Intelligence</p>
          <h1 className="font-display mt-0.5 text-2xl font-extrabold tracking-tight md:text-[1.75rem]">{moduleMeta.reportTitle}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {moduleMeta.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium shadow-card transition",
              filtersOpen || filterCount > 0
                ? "border-[#4361EE]/50 bg-[#EEF1FD] text-[#3347D6]"
                : "border-border bg-card text-zinc-600 hover:bg-muted"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {filterCount > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-bold text-white">{filterCount}</span>
            )}
          </button>
          <DateRangeControl filters={filters} rangeLabel={range.label} onChange={setFilters} />
          <Button variant="outline" size="sm" onClick={doCSV}>
            <FileSpreadsheet className="h-4 w-4" /> Excel / CSV
          </Button>
          <Button size="sm" onClick={doPrint}>
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* ── Module scope strip — clickable switcher between Shop / Sales / Field ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Scope</span>
        {REPORT_MODULES.map((m) => {
          const Icon = MODULE_ICON[m.id] ?? Store;
          const active = moduleScope === m.id;
          return (
            <button
              key={m.id}
              onClick={() => { setModuleScope(m.id as ReportModuleId); setTab("overview"); router.push(MODULE_ROUTE[m.id] ?? "/reports"); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition",
                active ? "border-[#4361EE]/40 bg-[#EEF1FD] text-[#3347D6]" : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {m.label}

            </button>
          );
        })}
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {moduleScope === "shop" ? "Live data" : "Sample data"}
        </span>
      </div>

      {/* ── Unified cockpit for all module scopes ─────────────────────── */}
      {/* ── Collapsible filter drawer ────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ReportFilterBar filters={filters} options={options} onChange={setFilters} onReset={() => setFilters({ preset: filters.preset })} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <ReportsNav value={tab} onChange={setTab} />

      {/* ── Content ──────────────────────────────────────────────────── */}
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === "overview" && moduleScope === "shop" && (
          <div className="space-y-5">
            {/* Section 1 — Executive Summary */}
            <ExecutiveSummary cards={execCards} comparisonLabel="previous period" />

            {/* Section 2 — Business Performance */}
            <BusinessPerformance trend={revTrend} split={revSplit} rangeLabel={range.label} />

            {/* Section 3 — Collections */}
            <CollectionsPanel data={collections} />

            {/* Section 4 — Operations */}
            <OperationsHealth cards={opsCards} />

            {/* Section 5 — Financial Health */}
            <FinancialHealth cards={finCards} />

            {/* Section 6 — Inventory Impact */}
            <InventoryImpact data={inventory} />

            {/* Section 7 — Business Insights */}
            <InsightsPanel insights={insights} />

            {/* Section 8 — Top Performers */}
            <TopPerformers data={performers} />
          </div>
        )}

        {tab === "overview" && moduleScope === "sales" && <SalesOverview />}
        {tab === "overview" && moduleScope === "field" && <FieldOverview />}

        {tab === "reports" && <ReportCategories data={filtered} range={range} />}
        {tab === "comparison" && <ComparisonEngine data={data} filters={filters} options={options} />}
        {tab === "builder" && <CustomReportBuilder data={data} baseFilters={filters} />}
        {tab === "saved" && <SavedReportsPanel data={data} baseFilters={filters} company={company} generatedBy={generatedBy} filterMode="all" />}
        {tab === "recent" && <SavedReportsPanel data={data} baseFilters={filters} company={company} generatedBy={generatedBy} filterMode="recent" />}
        {tab === "pinned" && <SavedReportsPanel data={data} baseFilters={filters} company={company} generatedBy={generatedBy} filterMode="pinned" />}
        {tab === "scheduled" && (
          <div className="rounded-[20px] border border-border bg-card p-8 shadow-card">
            <EmptyState
              icon="calendar"
              title="Scheduled reports are coming soon"
              detail="Automatic daily, weekly, monthly and quarterly report delivery by email and WhatsApp will appear here once configured."
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}
