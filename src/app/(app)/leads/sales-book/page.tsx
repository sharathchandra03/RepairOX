"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoPermission } from "@/components/common/no-permission";
import { ActiveFilterChip } from "@/components/ui/rox-filter";
import { IntelligenceFilters } from "@/components/leads/intelligence/intelligence-filters";
import { AgentMultiSelect } from "@/components/leads/intelligence/sales-book/agent-multi-select";
import { AgentRoster } from "@/components/leads/intelligence/sales-book/agent-roster";
import { SalesBookWorkspace } from "@/components/leads/intelligence/sales-book/sales-book-workspace";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import { useStoreContext } from "@/lib/store-context";
import { useCatalog } from "@/lib/catalog-context";
import { allow, CAP } from "@/lib/capabilities";
import {
  applyLeadIntelligenceFilters, resolveIntelligencePeriod, type LeadIntelligenceFilters,
} from "@/lib/lead-intelligence";
import { buildAgentIntelligenceHref, parseIntelligenceFilters } from "@/lib/lead-intelligence-url";
import { buildLeadLedger, buildAgentRosterRow, type RevenueRefundLike } from "@/lib/lead-sales-book";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Sales Book (ONE page, permission-aware scope).

   A single operational Sales Book workspace that auto-switches its SCOPE by
   permission — never a cosmetic toggle that leaks data:

     • OWNER / manager (CAP.lead.performanceAll)  → "Agent Intelligence":
       an Agent Roster + an agent scope selector over EVERY authorized agent's
       leads (whole team), with each agent openable as an analytical subject.
     • INDIVIDUAL Sales Agent (CAP.lead.performanceOwn only) → "My Sales Book":
       the SAME workspace scoped strictly to the signed-in agent's OWN leads
       (assignedTo === session.id). No roster, no agent picker, no cross-agent
       data — the server/RLS boundary matches the UI.

   The scope math (assignedTo scoping, store scope via activeStoreId, the shared
   filters, the ONE lead-sales-book engine) is IDENTICAL to before — only the
   page shell branches on permission. Hiding UI is never the boundary; the
   own-vs-all capability + Lead RLS remain the real enforcement.
   ────────────────────────────────────────────────────────────────────────── */

export default function SalesBookPage() {
  const params = useSearchParams();
  const { can } = usePermissions();
  const session = useSession();
  const { salesAgents, salesAgentsReady, leads, followUps, hydrated, loadErrors, currentUserIsSalesAgent } = useLeads();
  const store = useStore();
  const field = useField();
  const storeContext = useStoreContext();
  const catalog = useCatalog();

  const canOwn = allow(can, CAP.lead.performanceOwn);
  // A user who is THEMSELVES an eligible Sales Agent is ALWAYS own-scoped — the
  // cross-agent roster / agent picker is an OWNER/supervisor tool only. This is
  // the SAME rule the Leads context uses for its owner "view as agent" lens
  // (canViewAsAgent): an agent must never be able to scope to other agents,
  // even if their role carries a coarse performanceAll / see-all key (e.g.
  // view_sales_reports from a Leads "view" matrix tier). Resolve "is a sales
  // agent" store-independently so cross-store ambiguity can't reopen owner mode.
  const isSalesAgentSelf = currentUserIsSalesAgent();
  const canAll = !isSalesAgentSelf && allow(can, CAP.lead.performanceAll);

  const initial = useMemo(() => parseIntelligenceFilters(params), [params]);
  const [filters, setFilters] = useState<LeadIntelligenceFilters>(initial);
  // Owner-only: which agents the owner is scoped to ([] = whole team). Ignored
  // entirely in individual mode. Multi-select.
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Store scope is evaluated SEPARATELY and always applies (mirrors RLS).
  const effectiveFilters = useMemo<LeadIntelligenceFilters>(
    () => (storeContext.activeStoreId ? { ...filters, storeIds: [storeContext.activeStoreId] } : filters),
    [filters, storeContext.activeStoreId],
  );

  const refunds = useMemo<RevenueRefundLike[]>(
    () => store.invoiceRefunds.map((r) => ({ invoiceId: r.invoiceId, refundAmount: r.refundAmount, status: r.status })),
    [store.invoiceRefunds],
  );

  /* ── OWNER scope ── Eligible agents (store-scoped) + per-agent roster rows. */
  const eligibleAgents = useMemo(
    () => (canAll
      ? salesAgents.filter((agent) =>
          effectiveFilters.storeIds.length === 0 || agent.anyStore || effectiveFilters.storeIds.some((id) => agent.storeIds.includes(id)))
      : []),
    [canAll, salesAgents, effectiveFilters.storeIds],
  );

  const roster = useMemo(() => {
    if (!canAll) return [];
    const period = resolveIntelligencePeriod(effectiveFilters.dateRange, effectiveFilters.customFrom, effectiveFilters.customTo, Date.now());
    const src = { tickets: store.tickets, invoices: store.invoices, refunds, walkIns: store.walkIns, fieldJobs: field.jobs };
    return eligibleAgents.map((agent) => {
      const owned = leads.filter((l) => l.assignedTo === agent.id);
      const cohort = applyLeadIntelligenceFilters(owned, effectiveFilters, period);
      const ledger = buildLeadLedger(cohort, followUps, src);
      return buildAgentRosterRow(agent.id, ledger);
    });
  }, [canAll, eligibleAgents, leads, followUps, store.tickets, store.invoices, refunds, store.walkIns, field.jobs, effectiveFilters]);

  const eligibleIds = useMemo(() => new Set(eligibleAgents.map((a) => a.id)), [eligibleAgents]);

  // Only keep selected agents that are still eligible (store scope / directory
  // may change under the selection) — never widen beyond the authorized set.
  const activeAgentIds = useMemo(
    () => selectedAgentIds.filter((id) => eligibleIds.has(id)),
    [selectedAgentIds, eligibleIds],
  );

  // The leads this workspace works over:
  //   • individual      → the signed-in agent's own leads only.
  //   • owner + subset   → the selected agents' leads.
  //   • owner + none     → every eligible agent's leads (whole team).
  const scopedLeads = useMemo(() => {
    if (!canAll) return session.id ? leads.filter((l) => l.assignedTo === session.id) : [];
    const scopeIds = activeAgentIds.length ? new Set(activeAgentIds) : eligibleIds;
    return leads.filter((l) => l.assignedTo && scopeIds.has(l.assignedTo));
  }, [canAll, leads, session.id, activeAgentIds, eligibleIds]);

  // The lead set the filter panel's dimension options are drawn from.
  const filterLeads = canAll ? leads : scopedLeads;

  // Access: owners pass via performanceAll; a Sales Agent (or any own-perf user)
  // gets their individual book. An eligible Sales Agent is always allowed in.
  if (!canAll && !canOwn && !isSalesAgentSelf) {
    return <NoPermission title="Sales Book is restricted" subtitle="Viewing your lead performance requires the own-performance permission. Cross-agent analysis requires the all-agent permission." />;
  }

  // ONE title that matches the "Sales Book" nav item for every role — the
  // role-aware context lives in the subtitle so an owner still reads it as the
  // team view and an agent as their own book.
  const title = "Sales Book";
  const subtitle = canAll
    ? "Your sales operations, across authorized agents and stores."
    : "Every lead, every action, and every outcome in one place.";

  if (!hydrated || !store.hydrated || !catalog.hydrated || (canAll && !salesAgentsReady)) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Lead Management" title={title} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">{Array.from({ length: 7 }).map((_, n) => <div key={n} className="h-24 animate-pulse rounded-xl border border-border bg-muted/25" />)}</div>
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-muted/25" />
      </div>
    );
  }

  const criticalErrors = [...loadErrors, ...(store.loadErrors ?? [])];
  if (criticalErrors.length) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Lead Management" title={title} />
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-8 text-center text-[13px] text-muted-foreground">RepairOX will not present missing {criticalErrors.join(", ")} data as zero. Restore the data connection and refresh.</div>
      </div>
    );
  }

  const selectedAgentObjs = eligibleAgents.filter((a) => activeAgentIds.includes(a.id));
  const scopeName = (() => {
    if (!canAll) return session.name || "My leads";
    if (selectedAgentObjs.length === 0) return "All agents";
    if (selectedAgentObjs.length === 1) return selectedAgentObjs[0].name;
    return `${selectedAgentObjs.length} agents`;
  })();
  const exportSlug = (() => {
    if (!canAll) return "repairox-my-sales-book";
    if (selectedAgentObjs.length === 1) return `repairox-agent-intelligence-${selectedAgentObjs[0].name.replace(/\s+/g, "-").toLowerCase()}`;
    if (selectedAgentObjs.length > 1) return `repairox-agent-intelligence-${selectedAgentObjs.length}-agents`;
    return "repairox-agent-intelligence-team";
  })();
  const toggleAgent = (id: string) =>
    setSelectedAgentIds((cur) => {
      const set = new Set(cur);
      if (set.has(id)) set.delete(id); else set.add(id);
      const next = Array.from(set);
      return next.length === eligibleAgents.length ? [] : next;
    });

  return (
    <div className="space-y-5 pb-8">
      <PageHeader eyebrow="Lead Management" title={title} subtitle={subtitle} />

      {/* The owner's MULTI-select agent scope sits in the SAME utility row as the
          period tabs + store pill (to the LEFT of the store pill) — no separate
          full-width card. Absent entirely in individual mode. Empty = whole team. */}
      <IntelligenceFilters
        filters={effectiveFilters}
        onChange={setFilters}
        leads={filterLeads}
        categories={catalog.categories}
        brands={catalog.brands}
        lockedStoreName={storeContext.activeStoreId ? storeContext.getStore(storeContext.activeStoreId)?.name || "Current store" : undefined}
        rightLeadSlot={canAll ? (
          <AgentMultiSelect agents={eligibleAgents} value={activeAgentIds} onChange={setSelectedAgentIds} width="min-w-[220px]" />
        ) : undefined}
      />

      {/* Compact removable chips for the selected agents (only when a subset is
          chosen) — keeps the scope visible without a bulky card. */}
      {canAll && selectedAgentObjs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedAgentObjs.map((a) => (
            <ActiveFilterChip key={a.id} label="Agent" value={a.name} onClear={() => toggleAgent(a.id)} />
          ))}
          {selectedAgentObjs.length > 1 && (
            <button type="button" onClick={() => setSelectedAgentIds([])} className="text-[12px] font-medium text-[#4361EE] hover:underline">Clear all</button>
          )}
        </div>
      )}

      <SalesBookWorkspace
        mode={canAll ? "owner" : "individual"}
        filters={effectiveFilters}
        scopedLeads={scopedLeads}
        exportFilenameBase={exportSlug}
        scopeLabel={scopeName}
        rosterSlot={
          canAll ? (
            <AgentRoster
              rows={roster}
              agents={eligibleAgents}
              buildAnalysisHref={(id) => buildAgentIntelligenceHref(id, effectiveFilters)}
              onSelectAgent={toggleAgent}
              selectedAgentIds={activeAgentIds}
            />
          ) : undefined
        }
      />

      {canAll && (
        <p className="text-[10.5px] text-muted-foreground">
          Selecting an agent scopes this workspace to their leads only — your account, role, permissions and session are unchanged. Opening an agent&rsquo;s Analysis or Workspace never changes your identity.
        </p>
      )}
    </div>
  );
}
