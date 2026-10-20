"use client";

import { useMemo, useState } from "react";
import {
  BadgeIndianRupee, CalendarClock, Layers3, Target, Users,
} from "lucide-react";
import { Reveal } from "@/components/common/reveal";
import { DetailSection } from "@/components/common/detail-page";
import { PinnedRail } from "@/components/common/pinned-rail";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { cn, formatINR } from "@/lib/utils";
import {
  applyLeadIntelligenceFilters, resolveIntelligencePeriod, type LeadIntelligenceFilters,
} from "@/lib/lead-intelligence";
import {
  buildLeadLedger, buildStatusRail, buildNextMoves, buildOutcomeMap,
  buildFulfilmentMotions, LEDGER_VIEWS, type LeadLedgerRow, type LedgerViewKey,
  type OutcomeMilestone, type FulfilmentMotionRow, type StatusRailSegment,
} from "@/lib/lead-sales-book";
import type { Lead } from "@/lib/leads-data";
import type { RevenueRefundLike } from "@/lib/leads-data";
import { StatusRail } from "./status-rail";
import { NextMoves } from "./next-moves";
import { OutcomeMap } from "./outcome-map";
import { FulfilmentMotions } from "./fulfilment-motions";
import { LeadLedger } from "./lead-ledger";
import { LeadDossier } from "./lead-dossier";
import { ExportCenter } from "./export-center";

/** Map a status-rail segment / outcome stage into the matching ledger view so a
 *  click filters the ledger consistently (overlapping views allowed). */
const STAGE_TO_VIEW: Record<string, LedgerViewKey> = {
  all: "all", new: "active", in_progress: "active", qualified: "active",
  won: "won", lost: "all", attention: "overdue",
};
const MILESTONE_TO_VIEW: Record<OutcomeMilestone["key"], LedgerViewKey> = {
  created: "all", assigned: "all", qualified: "active", progressing: "active",
  won: "won", ticket: "ticket", invoice: "invoice",
};

export function SalesBookWorkspace({
  mode,
  filters,
  /** Already-authorized, agent-scoped leads (owner: whole team; individual: self). */
  scopedLeads,
  exportFilenameBase,
  scopeLabel,
  /** Owner roster slot rendered above the ledger (owner mode only). */
  rosterSlot,
}: {
  mode: "owner" | "individual";
  filters: LeadIntelligenceFilters;
  scopedLeads: Lead[];
  exportFilenameBase: string;
  scopeLabel?: string;
  rosterSlot?: React.ReactNode;
}) {
  const { followUps, assignmentHistoryFor, conversionHistoryFor, followUpsFor } = useLeads();
  const store = useStore();
  const field = useField();
  const { stores, getStore, isAllShops } = useStoreContext();
  const { can } = usePermissions();

  const [railKey, setRailKey] = useState("all");
  const [view, setView] = useState<LedgerViewKey>("all");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const asOf = Date.now();

  // Apply the (period + dimension) filters once — the SAME cohort basis every
  // section reads from, so counts never describe different scopes.
  const cohort = useMemo(() => {
    const period = resolveIntelligencePeriod(filters.dateRange, filters.customFrom, filters.customTo, asOf);
    return applyLeadIntelligenceFilters(scopedLeads, filters, period);
  }, [scopedLeads, filters, asOf]);

  const refunds = useMemo<RevenueRefundLike[]>(
    () => store.invoiceRefunds.map((r) => ({ invoiceId: r.invoiceId, refundAmount: r.refundAmount, status: r.status })),
    [store.invoiceRefunds],
  );

  const ledger = useMemo(() => buildLeadLedger(cohort, followUps, {
    tickets: store.tickets, invoices: store.invoices, refunds,
    walkIns: store.walkIns, fieldJobs: field.jobs,
  }, asOf), [cohort, followUps, store.tickets, store.invoices, refunds, store.walkIns, field.jobs, asOf]);

  const rail = useMemo(() => buildStatusRail(ledger), [ledger]);
  const moves = useMemo(() => buildNextMoves(ledger, asOf), [ledger, asOf]);
  const outcomeMap = useMemo(() => buildOutcomeMap(ledger), [ledger]);
  const motions = useMemo(() => buildFulfilmentMotions(ledger), [ledger]);

  // The ledger rows shown = the active saved view, further narrowed by the
  // rail selection (if a stage-specific rail segment is active).
  const railSegment = rail.find((s) => s.key === railKey);
  const railLeadIds = railSegment && railSegment.key !== "all" ? new Set(railSegment.leadIds) : null;
  const ledgerRows = useMemo(
    () => (railLeadIds ? ledger.filter((r) => railLeadIds.has(r.leadId)) : ledger),
    [ledger, railLeadIds],
  );

  const storeNames = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s.name])), [stores]);

  // Headline KPIs (unique leads; net revenue; distinct from the engine's gross).
  const kpi = useMemo(() => {
    const won = ledger.filter((r) => r.won).length;
    const qualified = ledger.filter((r) => r.qualified).length;
    const invoices = ledger.filter((r) => r.hasInvoice && r.revenueGross > 0).length;
    const revenueNet = ledger.reduce((s, r) => s + r.revenueNet, 0);
    return {
      total: ledger.length,
      qualified,
      won,
      conversion: ledger.length ? won / ledger.length : 0,
      qualificationRate: ledger.length ? qualified / ledger.length : 0,
      notConverted: Math.max(0, ledger.length - won),
      revenueNet,
      invoices,
      avgInvoice: invoices ? revenueNet / invoices : 0,
      pipeline: ledger.filter((r) => !r.won && !r.lost).reduce((s, r) => s + r.expectedValue, 0),
      overdue: ledger.filter((r) => r.followUpState === "Overdue").length,
      noNextAction: ledger.filter((r) => !r.won && !r.lost && r.followUpState === "none").length,
      attention: rail.find((s) => s.key === "attention")?.count ?? 0,
    };
  }, [ledger, rail]);

  const openRow = openLeadId ? ledger.find((r) => r.leadId === openLeadId) ?? null : null;

  const selectRail = (key: string) => {
    setRailKey(key);
    const v = STAGE_TO_VIEW[key];
    if (v) setView(v);
  };
  const selectStage = (m: OutcomeMilestone) => {
    setView(MILESTONE_TO_VIEW[m.key]);
    setRailKey("all");
    document.getElementById("sales-book-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const selectMode = (m: FulfilmentMotionRow) => {
    const v: LedgerViewKey = m.mode === "ON_SITE" ? "onsite" : m.mode === "PICKUP_DROP" ? "pickup" : m.mode === "STORE_VISIT" ? "store" : "all";
    setView(v);
    setRailKey("all");
    document.getElementById("sales-book-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-5 pb-10">
      {/* KPI band — four consolidated cards (grouped, like Agent Performance). */}
      <Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Lead Performance" icon={Users} accent="blue"
            primaryValue={String(kpi.total)} primaryDescription="Total Leads"
            progress={kpi.qualificationRate}
            support={[
              { label: "Qualified", value: String(kpi.qualified) },
              { label: "Qualification Rate", value: kpi.total ? pct(kpi.qualificationRate) : "—" },
            ]}
          />
          <Kpi
            label="Conversion Performance" icon={Target} accent="indigo"
            primaryValue={String(kpi.won)} primaryDescription="Won / Converted"
            progress={kpi.conversion}
            support={[
              { label: "Conversion Rate", value: kpi.total ? pct(kpi.conversion) : "—" },
              { label: "Not Converted", value: String(kpi.notConverted) },
            ]}
          />
          <Kpi
            label="Revenue & Sales" icon={BadgeIndianRupee} accent="emerald"
            primaryValue={formatINR(kpi.revenueNet)} primaryDescription="Net Revenue Won"
            support={[
              { label: "Pipeline Value", value: formatINR(kpi.pipeline) },
              { label: "Avg / Invoice", value: kpi.invoices ? formatINR(Math.round(kpi.avgInvoice)) : "—" },
            ]}
          />
          <Kpi
            label="Follow-up Performance" icon={CalendarClock} accent="amber"
            primaryValue={String(kpi.overdue)} primaryDescription="Overdue Follow-ups"
            attention={kpi.overdue > 0}
            support={[
              { label: "Needs Attention", value: String(kpi.attention), alert: kpi.attention > 0 },
              { label: "No Next Action", value: String(kpi.noNextAction) },
            ]}
          />
        </div>
      </Reveal>

      {/* Status rail */}
      <Reveal delay={0.04}>
        <StatusRail segments={rail} active={railKey} onSelect={selectRail} />
      </Reveal>

      {/* Next Moves + Outcome Map — the Outcome Map sets the height; Next Moves
          matches it exactly (grid stretch) and scrolls internally. The flex
          chain below (Reveal h-full → DetailSection h-full flex-col → NextMoves
          flex-1 min-h-0) is pure CSS, so both cards are ALWAYS the same length. */}
      {/* The Outcome Map (stable, content-sized) DEFINES the row height. The
          Next Moves cell is `relative`; its card fills that exact height
          absolutely on desktop (lg:absolute inset-0) and scrolls internally, so
          the two are ALWAYS the same length no matter how many moves there are.
          On mobile they stack naturally (static position). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="relative lg:col-span-1">
          <div className="lg:absolute lg:inset-0">
            <DetailSection icon={Target} title="Next Moves" accent="rose" delay={0.06} fill>
              <NextMoves moves={moves} onOpenLead={setOpenLeadId} />
            </DetailSection>
          </div>
        </div>
        <div className="lg:col-span-2">
          <DetailSection icon={Layers3} title="Outcome Map" accent="indigo" delay={0.08} fill>
            <OutcomeMap milestones={outcomeMap} onSelectStage={selectStage} />
          </DetailSection>
        </div>
      </div>

      {/* Fulfilment motions */}
      <Reveal delay={0.1}>
        <DetailSection icon={Users} title="Fulfilment & Sales Motions" accent="violet">
          <FulfilmentMotions rows={motions} onSelectMode={selectMode} />
        </DetailSection>
      </Reveal>

      {/* Owner roster (above the ledger) */}
      {rosterSlot && <Reveal delay={0.12}>{rosterSlot}</Reveal>}

      {/* Lead ledger — the core */}
      <div id="sales-book-ledger" className="space-y-3 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Lead Ledger</h2>
            <p className="text-[11px] text-muted-foreground">
              {ledgerRows.length} lead{ledgerRows.length === 1 ? "" : "s"}
              {railLeadIds ? ` · filtered to "${railSegment?.label}"` : ""} · click a row to open its dossier.
            </p>
          </div>
          <ExportCenter
            currentRows={ledgerRows.filter(LEDGER_VIEWS.find((v) => v.key === view)!.predicate)}
            allRows={ledger}
            storeNames={storeNames}
            filenameBase={exportFilenameBase}
            scopeLabel={scopeLabel}
          />
        </div>
        <LeadLedger
          rows={ledgerRows}
          view={view}
          onViewChange={setView}
          multiStore={isAllShops && stores.length > 1}
          getStore={getStore}
          onOpenLead={setOpenLeadId}
        />
      </div>

      {/* Lead dossier */}
      <LeadDossier
        row={openRow}
        followUps={openRow ? followUpsFor(openRow.leadId) : []}
        assignmentEvents={openRow ? assignmentHistoryFor(openRow.leadId) : []}
        conversionEvents={openRow ? conversionHistoryFor(openRow.leadId) : []}
        storeName={openRow ? (storeNames[openRow.branchId] || "") : ""}
        can={can}
        onClose={() => setOpenLeadId(null)}
      />
    </div>
  );
}

function pct(v: number): string { return `${Math.round(v * 100)}%`; }

type KpiAccent = "blue" | "indigo" | "emerald" | "amber";
const KPI_ACCENT: Record<KpiAccent, { bar: string; chip: string; value: string; fill: string; glow: string; wash: string }> = {
  blue: { bar: "bg-[#4361EE]", chip: "bg-[#EEF1FD] text-[#4361EE]", value: "text-[#2A3BA3]", fill: "bg-[#4361EE]", glow: "hover:shadow-[0_10px_30px_-14px_rgba(67,97,238,0.4)] hover:border-[#4361EE]/50", wash: "from-[#4361EE]/[0.07]" },
  indigo: { bar: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-600", value: "text-indigo-700", fill: "bg-indigo-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(99,102,241,0.4)] hover:border-indigo-400/60", wash: "from-indigo-500/[0.07]" },
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600", value: "text-emerald-700", fill: "bg-emerald-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(16,185,129,0.4)] hover:border-emerald-400/60", wash: "from-emerald-500/[0.07]" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-600", value: "text-amber-700", fill: "bg-amber-500", glow: "hover:shadow-[0_10px_30px_-14px_rgba(245,158,11,0.4)] hover:border-amber-400/60", wash: "from-amber-500/[0.07]" },
};

/* Consolidated KPI card — one card groups a primary metric with two related
   supporting figures + a thin progress indicator, matching the Agent
   Performance KPI pattern. A clearly visible 2px border on every card. */
function Kpi({ label, icon: Icon, accent = "blue", primaryValue, primaryDescription, support, progress, attention = false }: {
  label: string; icon: React.ComponentType<{ className?: string }>; accent?: KpiAccent;
  primaryValue: string; primaryDescription: string;
  support: { label: string; value: string; alert?: boolean }[];
  progress?: number; attention?: boolean;
}) {
  const a = KPI_ACCENT[attention ? "amber" : accent];
  const showProgress = typeof progress === "number";
  const clamped = showProgress ? Math.max(0, Math.min(1, progress)) : 0;
  return (
    <div className={cn("relative flex min-h-[140px] flex-col overflow-hidden rounded-2xl border-2 bg-card p-4 pl-5 shadow-card transition duration-200 hover:-translate-y-0.5", attention ? "border-red-200 hover:border-red-300" : "border-zinc-200", a.glow)}>
      <span className={cn("absolute inset-y-0 left-0 w-1", attention ? "bg-[#D96A82]" : a.bar)} aria-hidden />
      {/* Soft tone-tinted top wash — the colour-shade matching the Lead Dashboard KPI cards. */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent", attention ? "from-rose-500/[0.07]" : a.wash)} />
      <div className="relative flex items-center gap-2">
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", attention ? "bg-red-50 text-rose-600" : a.chip)}><Icon className="h-3.5 w-3.5" /></span>
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p className={cn("relative mt-2.5 font-display text-[26px] font-extrabold leading-none tracking-tight tabular-nums", attention ? "text-[#C4506B]" : a.value)}>{primaryValue}</p>
      <p className="relative mt-1 text-[11px] font-medium text-muted-foreground">{primaryDescription}</p>
      <div className="relative mt-auto space-y-1.5 pt-3">
        {showProgress && <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden><div className={cn("h-full rounded-full transition-all duration-500", a.fill)} style={{ width: `${clamped > 0 ? Math.max(clamped * 100, 2) : 0}%` }} /></div>}
        <div className="space-y-1">
          {support.map((sup) => (
            <div key={sup.label} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-muted-foreground">{sup.label}</span>
              <span className={cn("shrink-0 font-bold tabular-nums", sup.alert ? "text-[#B42318]" : "text-foreground")}>{sup.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
