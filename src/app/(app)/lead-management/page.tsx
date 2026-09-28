"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Dashboard (Lead Management Phase 4).

   The daily OPERATIONAL sales workspace for a Sales Agent — distinct from the
   analytics-heavy Agent Performance page (/leads/performance):

     • Lead Dashboard  = what do I work on TODAY (KPIs, funnel, follow-ups,
                          priority workload, recent leads, quick add).
     • Agent Performance = ranked performance analysis / reporting.

   EVERYTHING here is DERIVED from real records (Lead + lead_followup_history +
   finalized invoices via Lead → Ticket → Invoice). No dummy/static values, no
   stored counters. A lead / follow-up / invoice that does not exist contributes
   nothing. Scope is the SIGNED-IN user's authorized data (their owned +
   follow-up leads); a see-all user sees their whole store scope. Every
   component reads ONE shared date filter so nothing drifts out of sync.
   ────────────────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Inbox, Target, TrendingUp, UserPlus, Megaphone, Plus, ChevronRight,
  CheckCircle2, Clock, AlertTriangle, IndianRupee, Trophy, Route as RouteIcon,
  Flame, CalendarClock, ArrowUpRight, Smartphone, BarChart3,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { formatINR, cn } from "@/lib/utils";
import { allow, CAP } from "@/lib/capabilities";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import {
  type Lead, type LeadFollowUp, followUpLifecycle,
  isQualifiedStatus, isWonStatus, isLostStatus,
  EMPTY_LEAD_FILTERS,
} from "@/lib/leads-data";
import {
  computeAgentPerformance, applyPerfFilters,
  EMPTY_PERF_FILTERS, type PerfDateRange, type PerfFilters,
} from "@/lib/agent-performance";
import { statusTone, priorityTone } from "@/components/leads/lead-pills";
import { LeadCaptureFlow } from "@/components/leads/lead-capture-flow";
import { DateRangePicker, type DateRange } from "@/components/dashboard/date-range-picker";

/* The single shared operational date filter (drives EVERY component below). */
const DATE_OPTIONS: { label: string; value: PerfDateRange }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "This Year", value: "thisYear" },
  { label: "Custom", value: "custom" },
];

/* Funnel stages we surface — each derived by classifying a lead from its
   STRUCTURED fields (status / follow-up / links), never a new status enum. */
type StageKey = "new" | "contacted" | "followUp" | "qualified" | "converted" | "lost";

export default function LeadDashboardPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const { id: currentUserId, name: currentUserName } = useSession();
  const { leads, followUps, canSeeAllLeads, setFilters } = useLeads();
  const { tickets, invoices } = useStore();

  const [dateRange, setDateRange] = useState<PerfDateRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const canView = allow(can, CAP.lead.view);

  /* ── ONE shared date filter object every component derives from ── */
  const perfFilters: PerfFilters = useMemo(
    () => ({ ...EMPTY_PERF_FILTERS, dateRange, customFrom, customTo }),
    [dateRange, customFrom, customTo],
  );

  /* ── Visibility scope: the SIGNED-IN agent's own leads (owned + created +
     follow-up responsibilities), or — for a see-all user — every lead in their
     authorized store scope. Mirrors the RLS/scopedLeads rule exactly. ── */
  const myLeadsAllTime = useMemo(() => {
    const me = currentUserId || "";
    if (canSeeAllLeads) return leads;
    if (!me) return [];
    const followUpLeadIds = new Set(
      followUps.filter((f) => f.followUpUserId === me && f.status !== "cancelled").map((f) => f.leadId),
    );
    return leads.filter((l) =>
      l.createdBy === me || l.assignedTo === me || l.followUpAgentId === me || followUpLeadIds.has(l.id),
    );
  }, [leads, followUps, canSeeAllLeads, currentUserId]);

  /* Apply the shared date filter → the dataset EVERY card/chart uses. */
  const scopedLeads = useMemo(
    () => applyPerfFilters(myLeadsAllTime, perfFilters),
    [myLeadsAllTime, perfFilters],
  );

  /* Follow-ups belonging to a scoped lead (so the follow-up panel + metrics
     stay within the same visibility + date scope as everything else). Follow-up
     records are dated by their parent lead's creation for the date filter, so
     the panel reflects the same window; overdue/today/upcoming remain
     datetime-precise off dueAt. */
  const scopedLeadIds = useMemo(() => new Set(scopedLeads.map((l) => l.id)), [scopedLeads]);
  const scopedFollowUps = useMemo(
    () => followUps.filter((f) => scopedLeadIds.has(f.leadId)),
    [followUps, scopedLeadIds],
  );

  const revenue = useMemo(() => ({ tickets, invoices }), [tickets, invoices]);

  /* Resolve a KPI/stage keyword → the matching admin-configurable status value
     (so a click lands on the right filter without hardcoding a status enum). */
  const firstStatusMatching = useMemo(() => {
    return (needle: string): string => {
      const re = new RegExp(needle, "i");
      const hit = myLeadsAllTime.find((l) => l.status && re.test(l.status));
      return hit?.status ?? "";
    };
  }, [myLeadsAllTime]);

  /* ── The one source of truth for all headline numbers — the SAME engine the
     Agent Performance page uses, so the two surfaces can never disagree. ── */
  const perf = useMemo(
    () => computeAgentPerformance(
      { id: currentUserId ?? "", name: currentUserName, roleLabel: "Sales Agent" },
      // The already visibility- + date-scoped set: an agent's own leads, or a
      // see-all user's whole store scope. computeAgentPerformance derives every
      // metric from exactly these records (no widening).
      scopedLeads,
      scopedFollowUps,
      revenue,
    ),
    [currentUserId, currentUserName, scopedLeads, scopedFollowUps, revenue],
  );

  /* ── Follow-up panel: split real structured follow-ups into Overdue / Today /
     Upcoming (datetime-precise via followUpLifecycle). ── */
  const followUpBuckets = useMemo(() => {
    const asOf = Date.now();
    const open = scopedFollowUps.filter((f) => f.status === "scheduled" || f.status === "missed");
    const overdue: LeadFollowUp[] = [];
    const today: LeadFollowUp[] = [];
    const upcoming: LeadFollowUp[] = [];
    for (const f of open) {
      const life = followUpLifecycle(f, asOf);
      if (life === "Overdue") overdue.push(f);
      else if (life === "Due") today.push(f);
      else if (life === "Pending") upcoming.push(f);
    }
    const byDue = (a: LeadFollowUp, b: LeadFollowUp) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    return {
      overdue: overdue.sort(byDue),
      today: today.sort(byDue),
      upcoming: upcoming.sort(byDue),
    };
  }, [scopedFollowUps]);

  /* ── Leads by Stage (real funnel over structured status/relationships) ── */
  const stages = useMemo(() => {
    const openByLead = new Set(
      scopedFollowUps.filter((f) => f.status === "scheduled" || f.status === "missed").map((f) => f.leadId),
    );
    const buckets: Record<StageKey, Lead[]> = { new: [], contacted: [], followUp: [], qualified: [], converted: [], lost: [] };
    for (const l of scopedLeads) {
      if (isWonStatus(l.status, l.finalResult)) { buckets.converted.push(l); continue; }
      if (isLostStatus(l.status, l.finalResult)) { buckets.lost.push(l); continue; }
      if (isQualifiedStatus(l.status)) { buckets.qualified.push(l); continue; }
      if (openByLead.has(l.id) || l.followUpDate) { buckets.followUp.push(l); continue; }
      const cs = (l.contactStatus || "").toLowerCase();
      const contacted = (!!cs && !/not\s*contacted|^\s*$/.test(cs)) || !!l.linkedTicketId || !!l.linkedWalkInId || !!l.linkedFieldJobId;
      if (contacted) buckets.contacted.push(l);
      else buckets.new.push(l);
    }
    return buckets;
  }, [scopedLeads, scopedFollowUps]);

  const stageMeta: { key: StageKey; label: string; dot: string; bar: string; statusHint: string }[] = [
    { key: "new", label: "New", dot: "bg-sky-500", bar: "bg-sky-500", statusHint: "new" },
    { key: "contacted", label: "Contacted", dot: "bg-violet-500", bar: "bg-violet-500", statusHint: "contact" },
    { key: "followUp", label: "Follow-up", dot: "bg-amber-500", bar: "bg-amber-500", statusHint: "follow" },
    { key: "qualified", label: "Qualified", dot: "bg-indigo-500", bar: "bg-indigo-500", statusHint: "qualif" },
    { key: "converted", label: "Converted / Won", dot: "bg-emerald-500", bar: "bg-emerald-500", statusHint: "won" },
    { key: "lost", label: "Lost", dot: "bg-zinc-400", bar: "bg-zinc-400", statusHint: "lost" },
  ];

  /* ── Recent leads (newest first, real fields only) ── */
  const recentLeads = useMemo(
    () => [...scopedLeads]
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime())
      .slice(0, 8),
    [scopedLeads],
  );

  /* ── Interaction: KPIs / charts deep-link into the shared, real /leads/list.
     The list reads the SAME useLeads().filters we set here — no fake targets. ── */
  const goToLeads = (patch: Partial<typeof EMPTY_LEAD_FILTERS> & { fields?: Record<string, string> } = {}) => {
    setFilters((f) => ({
      ...EMPTY_LEAD_FILTERS,
      // keep the current query so a searching user isn't surprised
      query: f.query,
      ...patch,
      fields: { ...(patch.fields ?? {}) },
    }));
    router.push("/leads/list");
  };
  const openLead = (leadId: string) => router.push(`/leads/list?lead=${encodeURIComponent(leadId)}`);

  /* ── Permission wall — a user who can't view leads gets a clear message ── */
  if (!canView) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Sales" title="Lead Dashboard" />
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Lead access is restricted</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Your role doesn&apos;t have permission to view leads. Ask an administrator to grant it.
          </p>
        </div>
      </div>
    );
  }

  const dateLabel = DATE_OPTIONS.find((d) => d.value === dateRange)?.label ?? "All";
  const scopeSubtitle = canSeeAllLeads
    ? "Your store's sales workspace — every card, chart and follow-up reflects the same date filter."
    : "Your personal sales workspace — only your leads and follow-ups, all reflecting the same date filter.";

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        eyebrow="Sales"
        title="Lead Dashboard"
        subtitle={scopeSubtitle}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/leads/performance"
              className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-zinc-600 transition hover:bg-muted sm:inline-flex"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Performance
            </Link>
            <Can permission={CAP.lead.create}>
              <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" /> Quick Add Lead
              </Button>
            </Can>
          </div>
        }
      />

      {/* ── Shared date filter (drives EVERY component) ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs
            size="sm"
            options={DATE_OPTIONS}
            value={dateRange}
            onChange={(v) => {
              const next = v as PerfDateRange;
              if (next === "custom") {
                // Selecting Custom always opens the calendar to pick a range.
                setShowCalendar(true);
                setDateRange("custom");
              } else {
                setDateRange(next);
              }
            }}
          />
        </div>
        {dateRange === "custom" && (customFrom || customTo) && (
          <button
            onClick={() => setShowCalendar(true)}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-xl border border-input bg-card px-3 text-[13px] font-medium text-foreground transition hover:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
          >
            <CalendarClock className="h-3.5 w-3.5 text-[#4361EE]" />
            {formatRangeLabel(customFrom, customTo)}
          </button>
        )}
      </div>

      {/* Custom-range calendar (matches the app date-range picker). */}
      <DateRangePicker
        open={showCalendar}
        onClose={() => {
          setShowCalendar(false);
          // If the user cancels without a committed range, fall back to Today.
          if (!customFrom && !customTo) setDateRange("today");
        }}
        onApply={(range: DateRange) => {
          setCustomFrom(toISODate(range.start));
          setCustomTo(toISODate(range.end));
          setDateRange("custom");
        }}
        initialRange={{ start: fromISODate(customFrom), end: fromISODate(customTo) }}
      />

      {/* ── TOP KPI CARDS (all derived; each clickable to a real filtered view) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <KpiCard
          label="Total Leads" value={String(perf.leads)} icon={Inbox} tone="indigo"
          hint={dateLabel} onClick={() => goToLeads()}
        />
        <KpiCard
          label="Qualified" value={String(perf.qualified)} icon={CheckCircle2} tone="sky"
          hint={`${pct(perf.leads > 0 ? perf.qualified / perf.leads : 0)} of leads`}
          onClick={() => goToLeads({ status: firstStatusMatching("qualif") })}
        />
        <KpiCard
          label="Pending Follow-ups" value={String(perf.followUps.pending + perf.followUps.dueToday)} icon={Clock} tone="amber"
          hint={`${perf.followUps.dueToday} due today`}
          onClick={() => goToLeads({ followUp: "upcoming" })}
        />
        <KpiCard
          label="Overdue Follow-ups" value={String(perf.followUps.overdue)} icon={AlertTriangle} tone="rose"
          hint={perf.followUps.overdue > 0 ? "Needs attention" : "All clear"}
          urgent={perf.followUps.overdue > 0}
          onClick={() => goToLeads({ followUp: "overdue" })}
        />
        <KpiCard
          label="Converted / Won" value={String(perf.converted)} icon={Trophy} tone="emerald"
          hint={`${pct(perf.conversionRate)} conversion`}
          onClick={() => goToLeads({ status: firstStatusMatching("won") })}
        />
        <KpiCard
          label="Pipeline Value" value={formatINR(perf.pipelineValue)} icon={Target} tone="violet"
          hint="Open leads (est.)"
          onClick={() => goToLeads()}
        />
        <KpiCard
          label="Revenue Won" value={formatINR(perf.revenueWon)} icon={IndianRupee} tone="emerald"
          hint="Finalized invoices"
          onClick={() => goToLeads({ status: firstStatusMatching("won") })}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* LEFT (2/3): funnel + source + priority + route + recent */}
        <div className="space-y-5 xl:col-span-2">
          {/* Leads by Stage */}
          <SectionCard
            title="Leads by Stage" icon={TrendingUp}
            action={
              <Link href="/leads/kanban" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
                Kanban <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {perf.leads === 0 ? (
              <EmptyRow text="No leads in this period yet." />
            ) : (
              <div className="space-y-3">
                {stageMeta.map((s) => {
                  const count = stages[s.key].length;
                  const width = perf.leads > 0 ? Math.max(count > 0 ? 4 : 0, Math.round((count / perf.leads) * 100)) : 0;
                  return (
                    <button
                      key={s.key}
                      onClick={() => goToLeads({ status: firstStatusMatching(s.statusHint) })}
                      className="group block w-full text-left"
                    >
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                          {s.label}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {count}
                          {perf.leads > 0 && <span className="ml-1 text-[11px]">({Math.round((count / perf.leads) * 100)}%)</span>}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full transition-all group-hover:opacity-80", s.bar)} style={{ width: `${width}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Source Performance */}
            <SectionCard title="Source Performance" icon={Megaphone}>
              {perf.bySource.length === 0 ? (
                <EmptyRow text="No leads captured yet." />
              ) : (
                <ul className="space-y-3">
                  {perf.bySource.slice(0, 7).map((s) => {
                    const conv = s.leads > 0 ? Math.round((s.converted / s.leads) * 100) : 0;
                    const width = perf.leads > 0 ? Math.max(4, Math.round((s.leads / perf.leads) * 100)) : 0;
                    return (
                      <li key={s.key}>
                        <div className="mb-1 flex items-center justify-between text-[12px]">
                          <span className="truncate font-medium text-foreground">{s.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {s.leads} · {s.qualified} qual · {conv}% won
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-[#4361EE]" style={{ width: `${width}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            {/* Priority workload */}
            <SectionCard title="Priority Workload" icon={Flame}>
              {perf.byPriority.length === 0 ? (
                <EmptyRow text="No leads to prioritise." />
              ) : (
                <div className="space-y-2.5">
                  {perf.byPriority.slice(0, 6).map((p) => (
                    <button
                      key={p.key}
                      onClick={() => goToLeads({ fields: { priority: p.key } })}
                      className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left transition hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2">
                        <Flame className={cn("h-4 w-4", priorityTone(p.label))} />
                        <span className="text-[13px] font-medium text-foreground">{p.label}</span>
                      </span>
                      <span className="flex items-center gap-3 text-[12px] tabular-nums text-muted-foreground">
                        <span>{p.leads} leads</span>
                        <span className="font-semibold text-emerald-600">{p.converted} won</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Route / Service type */}
          <SectionCard title="Route / Service Type" icon={RouteIcon}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {perf.byRoute.map((r) => (
                <button
                  key={r.route}
                  onClick={() => goToLeads()}
                  className="rounded-xl border border-border bg-muted/20 p-3 text-left transition hover:bg-muted/40"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{r.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{r.leads}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.conversions} converted · {formatINR(r.revenueWon)}
                  </p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              A route conversion needs a real linked operational record — the route alone is never revenue.
            </p>
          </SectionCard>

          {/* Recent leads */}
          <SectionCard
            title="Recent Leads" icon={Inbox}
            action={
              <button onClick={() => goToLeads()} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
                Open list <ChevronRight className="h-3.5 w-3.5" />
              </button>
            }
          >
            {recentLeads.length === 0 ? (
              <EmptyRow text="No recent leads in this period." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/60">
                    <tr>
                      {["Lead", "Customer", "Device", "Owner", "Value", "Status", "Follow-up"].map((h, i) => (
                        <th key={h} className={cn("px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", i >= 4 && i <= 4 ? "text-right" : "text-left")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentLeads.map((l) => (
                      <tr
                        key={l.id}
                        onClick={() => openLead(l.id)}
                        className="cursor-pointer border-t border-border transition hover:bg-muted/40"
                      >
                        <td className="px-3 py-2.5 font-semibold text-[#4361EE] tabular-nums">{l.leadNo || "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar name={l.name || l.leadNo} size={24} />
                            <span className="truncate font-medium text-foreground">{l.name || "—"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            {l.device && <Smartphone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                            <span className="truncate">{l.device || "—"}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{l.assignedToName || l.agent || "Unassigned"}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{l.estimate != null ? formatINR(l.estimate) : "—"}</td>
                        <td className="px-3 py-2.5">
                          {l.status ? (
                            <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", statusTone(l.status))}>
                              {l.status}
                            </span>
                          ) : <span className="text-zinc-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5"><RecentFollowUpCell lead={l} followUps={scopedFollowUps} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* RIGHT (1/3): follow-up command panel */}
        <div className="space-y-5">
          <SectionCard title="Follow-up Panel" icon={CalendarClock}>
            <div className="space-y-4">
              <FollowUpGroup
                heading="Overdue" tone="overdue" items={followUpBuckets.overdue}
                leads={leads} onOpen={openLead}
                onViewAll={() => goToLeads({ followUp: "overdue" })}
              />
              <FollowUpGroup
                heading="Today" tone="today" items={followUpBuckets.today}
                leads={leads} onOpen={openLead}
                onViewAll={() => goToLeads({ followUp: "today" })}
              />
              <FollowUpGroup
                heading="Upcoming" tone="upcoming" items={followUpBuckets.upcoming}
                leads={leads} onOpen={openLead}
                onViewAll={() => goToLeads({ followUp: "upcoming" })}
              />
            </div>
            <Link
              href="/leads/list"
              className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-muted py-2 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-border transition hover:bg-muted/70"
            >
              View all in Leads <ChevronRight className="h-3 w-3" />
            </Link>
          </SectionCard>

          {/* Quick add prompt (IVR-fast capture) */}
          <Can permission={CAP.lead.create}>
            <div className="rounded-2xl border border-[#B3BFF6] bg-[#FAFBFF] p-5 shadow-card">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                  <UserPlus className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">Got a call?</p>
                  <p className="text-[12px] text-muted-foreground">Capture the lead in seconds.</p>
                </div>
              </div>
              <Button className="mt-3 w-full gap-1.5 rounded-xl" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Quick Add Lead
              </Button>
            </div>
          </Can>
        </div>
      </div>

      {/* Quick Add — the REAL capture flow (same as the Leads list), gated. */}
      <Can permission={CAP.lead.create}>
        <LeadCaptureFlow open={showCreate} onClose={() => setShowCreate(false)} />
      </Can>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Presentational sub-components (reuse the design-system frame + tones)
   ═══════════════════════════════════════════════════════════════════════ */

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/* Local-date <-> YYYY-MM-DD helpers for the custom range calendar (kept local
   so we never shift the day by a timezone conversion). */
function toISODate(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromISODate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
function formatRangeLabel(from: string, to: string): string {
  const fmt = (s: string) => {
    const d = fromISODate(s);
    return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  };
  return `${fmt(from)} — ${fmt(to)}`;
}

const KPI_TONES: Record<string, string> = {
  indigo: "bg-[#EEF1FD] text-[#4361EE]",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
};

function KpiCard({
  label, value, hint, icon: Icon, tone = "indigo", onClick, urgent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: keyof typeof KPI_TONES | string;
  onClick?: () => void;
  urgent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-2xl border bg-card p-4 text-left shadow-card transition hover:border-[#4361EE]/40 hover:shadow-md",
        urgent ? "border-red-300 bg-red-50/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-lg", KPI_TONES[tone] ?? KPI_TONES.indigo)}>
          <Icon className="h-4 w-4" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-zinc-300 transition group-hover:text-[#4361EE]" />
      </div>
      <p className={cn("mt-3 text-2xl font-extrabold tabular-nums", urgent ? "text-[#B42318]" : "text-foreground")}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </button>
  );
}

function SectionCard({
  title, icon: Icon, children, action,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-2.5 border-b border-border/70 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-[13px] text-muted-foreground">{text}</p>;
}

/* One follow-up group (Overdue / Today / Upcoming) in the panel. Clicking a
   row opens the associated Lead; overdue uses the shared red urgency treatment. */
function FollowUpGroup({
  heading, tone, items, leads, onOpen, onViewAll,
}: {
  heading: string;
  tone: "overdue" | "today" | "upcoming";
  items: LeadFollowUp[];
  leads: Lead[];
  onOpen: (leadId: string) => void;
  onViewAll: () => void;
}) {
  const toneCfg = {
    overdue: { dot: "bg-[#B42318]", label: "text-[#B42318]", chip: "bg-red-100 text-[#B42318] ring-red-300" },
    today: { dot: "bg-[#C0392B]", label: "text-[#C0392B]", chip: "bg-red-50 text-[#C0392B] ring-red-200" },
    upcoming: { dot: "bg-sky-500", label: "text-sky-700", chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  }[tone];
  const shown = items.slice(0, 4);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
          <span className={cn("h-2 w-2 rounded-full", toneCfg.dot)} />
          <span className={toneCfg.label}>{heading}</span>
          <span className="text-muted-foreground">({items.length})</span>
        </span>
        {items.length > 0 && (
          <button onClick={onViewAll} className="text-[11px] font-medium text-[#4361EE] hover:underline">View</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-[12px] text-muted-foreground">
          Nothing {heading.toLowerCase()}.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((f) => {
            const lead = leads.find((l) => l.id === f.leadId);
            return (
              <li key={f.id}>
                <button
                  onClick={() => onOpen(f.leadId)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left transition hover:bg-muted/50"
                >
                  <Avatar name={lead?.name || lead?.leadNo || "?"} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {lead?.name || lead?.leadNo || "Lead"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {(lead?.leadNo ? `${lead.leadNo} · ` : "")}{lead?.device || "—"}
                      {f.followUpUserName ? ` · ${f.followUpUserName}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", toneCfg.chip)}>
                    {formatDueAt(f.dueAt)}
                  </span>
                </button>
              </li>
            );
          })}
          {items.length > shown.length && (
            <li>
              <button onClick={onViewAll} className="w-full py-1 text-center text-[11px] font-medium text-muted-foreground hover:text-[#4361EE]">
                +{items.length - shown.length} more
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* Compact follow-up cell for the Recent Leads table (structured, datetime-precise). */
function RecentFollowUpCell({ lead, followUps }: { lead: Lead; followUps: LeadFollowUp[] }) {
  const open = followUps
    .filter((f) => f.leadId === lead.id && (f.status === "scheduled" || f.status === "missed"))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];
  if (!open) return <span className="text-[12px] text-zinc-400">—</span>;
  const life = followUpLifecycle(open);
  const chip =
    life === "Overdue" ? "bg-red-100 text-[#B42318] ring-red-300"
      : life === "Due" ? "bg-red-50 text-[#C0392B] ring-red-200"
        : "bg-sky-50 text-sky-700 ring-sky-200";
  const label = life === "Overdue" ? "Overdue" : life === "Due" ? "Due today" : formatDueAt(open.dueAt);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", chip)}>
      <CalendarClock className="h-3 w-3" /> {label}
    </span>
  );
}

function formatDueAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
