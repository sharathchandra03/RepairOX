"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance drill-down (Lead Management Phase 3).

   Reached from the All-Agents leaderboard's REPORT action. It immediately shows
   the SELECTED agent's month-by-month performance table (same layout as the
   Individual tab) — no generic dashboard, no re-searching.

   Access: an owner (CAP.lead.performanceAll) may open any eligible agent. A
   Sales Agent (performanceOwn only) may open ONLY their own report. Server +
   RLS remain the real enforcement; the visible lead set is already scoped.
   ────────────────────────────────────────────────────────────────────────── */

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Trophy, Users, Route as RouteIcon, IndianRupee, Ticket as TicketIcon, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { allow, CAP } from "@/lib/capabilities";
import { formatINR } from "@/lib/utils";
import {
  computeOwnerPerformance, computeSingleAgentPerformance, computeAgentMonthlyPerformance, medalFor,
} from "@/lib/agent-performance";
import { PerformanceTable } from "@/components/leads/performance-table";

function TotalCard({
  label, value, sub, icon: Icon,
}: {
  label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-4 w-4" /></span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2.5 text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AgentReportPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId: raw } = use(params);
  const agentId = decodeURIComponent(raw);

  const { can } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  const { salesAgents, leads, followUps } = useLeads();
  const { tickets, invoices } = useStore();

  const canAll = allow(can, CAP.lead.performanceAll);
  const canOwn = allow(can, CAP.lead.performanceOwn);
  const isSelf = agentId === currentUserId;

  const revenue = useMemo(() => ({ tickets, invoices }), [tickets, invoices]);

  const agent = salesAgents.find((a) => a.id === agentId)
    ?? (isSelf ? { id: currentUserId ?? "", name: currentUserName, roleLabel: "Sales Agent" } : undefined);

  const ranked = useMemo(
    () => (canAll ? computeOwnerPerformance({ agents: salesAgents, leads, followUps, revenue }) : []),
    [canAll, salesAgents, leads, followUps, revenue],
  );

  const months = useMemo(
    () => (agent ? computeAgentMonthlyPerformance(agent, leads, followUps, revenue) : []),
    [agent, leads, followUps, revenue],
  );
  const totals = useMemo(
    () => (agent ? computeSingleAgentPerformance(agent, leads, followUps, revenue) : null),
    [agent, leads, followUps, revenue],
  );

  // Permission gate: only owners may view OTHER agents.
  if (!canAll && !(canOwn && isSelf)) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Lead Management" title="Agent Performance" />
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted"><Lock className="h-5 w-5 text-muted-foreground" /></span>
          <h2 className="mt-4 text-lg font-semibold">Report restricted</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            You can only view your own performance. Ask an administrator for the
            &ldquo;View All Sales Agents&apos; Performance&rdquo; permission to compare agents.
          </p>
        </div>
      </div>
    );
  }

  if (!agent || !totals) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Lead Management" title="Agent Performance" />
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold">Agent not found</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">This Sales Agent isn&apos;t in your authorized scope.</p>
          <Link href="/leads/performance" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4361EE] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Agent Performance
          </Link>
        </div>
      </div>
    );
  }

  const rank = ranked.find((r) => r.agentId === agentId)?.rank;
  const medal = rank ? medalFor(rank) : "";

  return (
    <div className="space-y-5">
      {canAll && (
        <Link href="/leads/performance" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4361EE] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to All Agents
        </Link>
      )}
      <PageHeader
        eyebrow="Lead Management"
        title={`${agent.name} — Sales Performance`}
        subtitle={rank
          ? `Rank #${rank} ${medal} · month-by-month performance, derived from real records.`
          : "Month-by-month performance — derived from real records."}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TotalCard label="Leads" value={String(totals.leads)} sub={`${totals.qualified} qualified`} icon={Users} />
        <TotalCard label="Walk-In" value={String(totals.walkIn)} sub={`${totals.routeAssigned} assigned`} icon={RouteIcon} />
        <TotalCard label="Pickup / On-Site" value={String(totals.pickup + totals.onSite)} sub={`${totals.pickupCompleted + totals.onSiteCompleted} done`} icon={RouteIcon} />
        <TotalCard label="Revenue Won" value={formatINR(totals.revenueWon)} sub={`${totals.invoiceCount} invoices`} icon={IndianRupee} />
        <TotalCard label="Ticket Won" value={String(totals.ticketsWon)} icon={TicketIcon} />
        <TotalCard label="Follow-up" value={String(totals.pendingFollowUp)} sub={totals.overdueFollowUp > 0 ? `${totals.overdueFollowUp} overdue` : "pending"} icon={CalendarClock} />
      </div>

      <PerformanceTable
        rows={months}
        rowKind="period"
        firstColLabel="Month"
        showReport
        reportHref={() => "/leads/list"}
        emptyText="No leads captured yet for this agent."
      />

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Trophy className="h-3.5 w-3.5 text-[#4361EE]" />
        Revenue Won = finalized (paid) invoices linked via Lead → Ticket → Invoice. Projection = probability-weighted open pipeline.
      </p>
    </div>
  );
}
