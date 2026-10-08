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
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RcTooltip, XAxis, YAxis,
} from "recharts";
import {
  Inbox, Target, TrendingUp, UserPlus, Megaphone, Plus, ChevronRight,
  CheckCircle2, Clock, AlertTriangle, IndianRupee, Trophy, Route as RouteIcon,
  Flame, CalendarClock, ArrowUpRight, Smartphone,
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
  isQualifiedLead, isWonStatus, isLostStatus,
  EMPTY_LEAD_FILTERS, LEAD_CONVERSION_EVENT_LABEL,
} from "@/lib/leads-data";
import {
  computeAgentPerformance, applyPerfFilters,
  EMPTY_PERF_FILTERS, type PerfDateRange, type PerfFilters,
} from "@/lib/agent-performance";
import { statusTone, priorityTone } from "@/components/leads/lead-pills";
import { LeadCaptureFlow } from "@/components/leads/lead-capture-flow";
import { SalesAgentsOnline } from "@/components/leads/sales-agents-online";
import { DateRangePicker, type DateRange } from "@/components/dashboard/date-range-picker";
import { NotepadWidget } from "@/components/dashboard/notepad-widget";

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
  const { leads, followUps, canSeeAllLeads, setFilters, assignmentHistory, conversionHistory } = useLeads();
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

  /* "Last activity" status shown next to the online pill. Tracks the most
     recent lead activity ACROSS every account the user is allowed to see (a
     see-all owner sees everyone; an individual agent sees their own — bounded
     by the same RLS/visibility scope, never bypassed). It merges real activity
     streams — lead created/updated, (re)assignment, and conversion/handoff
     events — picks the single most recent, and surfaces WHO did it (the saved
     account name) + WHAT + WHEN. Presentation only; never fabricated. */
  const lastActivityLabel = useMemo(() => {
    type Act = { at: number; who: string; what: string };
    const acts: Act[] = [];
    const push = (iso?: string, who?: string, what?: string) => {
      const t = new Date(iso || "").getTime();
      if (!iso || Number.isNaN(t)) return;
      acts.push({ at: t, who: (who || "").trim(), what: what || "updated a lead" });
    };

    for (const l of leads) {
      const owner = l.assignedToName || l.agent || "";
      // Created vs updated: if updatedAt is meaningfully after createdAt it's an edit.
      const created = new Date(l.createdAt || l.date || "").getTime();
      const updated = new Date(l.updatedAt || "").getTime();
      push(l.createdAt || l.date, owner, `added lead ${l.leadNo || ""}`.trim());
      if (!Number.isNaN(updated) && !Number.isNaN(created) && updated - created > 1000) {
        push(l.updatedAt, owner, `updated lead ${l.leadNo || ""}`.trim());
      }
    }
    for (const h of assignmentHistory) {
      const who = h.assignedByName || h.toUserName || "";
      const to = h.toUserName ? ` to ${h.toUserName}` : "";
      push(h.createdAt, who, `assigned a lead${to}`);
    }
    for (const e of conversionHistory) {
      const label = LEAD_CONVERSION_EVENT_LABEL[e.eventType] || "updated a lead";
      push(e.occurredAt, e.actorName, label.toLowerCase());
    }

    if (acts.length === 0) return "";
    acts.sort((a, b) => b.at - a.at);
    const top = acts[0];
    const when = formatRelativeTime(top.at);
    // Owner / full-access sees WHO did it; everyone else sees the activity
    // without the account name.
    if (canSeeAllLeads) {
      const who = top.who || "Someone";
      return `${who} ${top.what} · ${when}`;
    }
    // Capitalise the leading verb for the name-less variant.
    const what = top.what.charAt(0).toUpperCase() + top.what.slice(1);
    return `${what} · ${when}`;
  }, [leads, assignmentHistory, conversionHistory, canSeeAllLeads]);

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
      if (isQualifiedLead(l)) { buckets.qualified.push(l); continue; }
      if (openByLead.has(l.id) || l.followUpDate) { buckets.followUp.push(l); continue; }
      const cs = (l.contactStatus || "").toLowerCase();
      const contacted = (!!cs && !/not\s*contacted|^\s*$/.test(cs)) || !!l.linkedTicketId || !!l.linkedWalkInId || !!l.linkedFieldJobId;
      if (contacted) buckets.contacted.push(l);
      else buckets.new.push(l);
    }
    return buckets;
  }, [scopedLeads, scopedFollowUps]);

  const stageMeta: { key: StageKey; label: string; hex: string; statusHint: string }[] = [
    { key: "new", label: "New", hex: "#0EA5E9", statusHint: "new" },
    { key: "contacted", label: "Contacted", hex: "#8B5CF6", statusHint: "contact" },
    { key: "followUp", label: "Follow-up", hex: "#F59E0B", statusHint: "follow" },
    { key: "qualified", label: "Qualified", hex: "#4361EE", statusHint: "qualif" },
    { key: "converted", label: "Converted / Won", hex: "#10B981", statusHint: "won" },
    { key: "lost", label: "Lost", hex: "#A1A1AA", statusHint: "lost" },
  ];

  /* Stage → donut data (label + real count + colour), for the funnel donut. */
  const stageChartData = useMemo(
    () => stageMeta.map((s) => ({ key: s.key, label: s.label, value: stages[s.key].length, color: s.hex })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages],
  );

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
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <SalesAgentsOnline />
              <Can permission={CAP.lead.create}>
                <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5" /> Quick Add Lead
                </Button>
              </Can>
            </div>
            {lastActivityLabel && (
              <span className="hidden items-center gap-1.5 pr-1 text-[11px] font-medium italic text-muted-foreground md:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {lastActivityLabel}
              </span>
            )}
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
              <StageDonut
                data={stageChartData}
                total={perf.leads}
                onSlice={(key) => {
                  const meta = stageMeta.find((s) => s.key === key);
                  goToLeads({ status: firstStatusMatching(meta?.statusHint ?? "") });
                }}
              />
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Source Performance */}
            <SectionCard title="Source Performance" icon={Megaphone}>
              {perf.bySource.length === 0 ? (
                <EmptyRow text="No leads captured yet." />
              ) : (
                <SourceBarChart
                  data={perf.bySource}
                  onBar={(key) => goToLeads({ fields: { source: key } })}
                />
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
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[720px] text-[13px]">
                  {/* Fixed proportions so the Lead number never wraps and Owner
                      doesn't crowd the narrow columns. */}
                  <colgroup>
                    <col className="w-[72px]" />
                    <col className="w-[22%]" />
                    <col className="w-[18%]" />
                    <col className="w-[16%]" />
                    <col className="w-[13%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead className="bg-muted/60">
                    <tr>
                      {["Lead", "Customer", "Device", "Owner", "Value", "Status", "Follow-up"].map((h, i) => (
                        <th key={h} className={cn("whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", i === 4 ? "text-right" : "text-left")}>
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
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-[#4361EE] tabular-nums">{l.leadNo || "—"}</td>
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

          {/* Quick add prompt (IVR-fast capture) — blue-accent gradient card,
              matching the dashboard's colourful language. */}
          <Can permission={CAP.lead.create}>
            <div className="group relative overflow-hidden rounded-2xl border-[2.2px] border-[#B3BFF6]/50 bg-gradient-to-br from-[#F5F7FF] via-card to-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 hover:border-[#4361EE]/40 hover:shadow-[0_6px_20px_-6px_rgba(67,97,238,0.30),0_12px_32px_-10px_rgba(67,97,238,0.20)]">
              {/* Gradient left accent rail, same as the KPI cards. */}
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-[#4361EE] to-[#6366F1] opacity-80" />
              <div className="relative flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#4361EE] to-[#6366F1] text-white shadow-sm">
                  <UserPlus className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">Got a call?</p>
                  <p className="text-[12px] text-muted-foreground">Capture the lead in seconds.</p>
                </div>
              </div>
              <Button className="relative mt-3 w-full gap-1.5 rounded-xl" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Quick Add Lead
              </Button>
            </div>
          </Can>

          {/* Notepad — same personal sticky notes as the full Notes page,
              here as a compact rail card so a Sales Agent can jot reminders
              without leaving their daily workspace. */}
          <NotepadWidget />
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

/* ═══════════════════════════════════════════════════════════════════════
   Charts — clearer, at-a-glance visuals (recharts, the app's charting lib).
   ═══════════════════════════════════════════════════════════════════════ */

/* Leads by Stage — a donut of the funnel composition with a big center total
   and an interactive legend (count + %). Far easier to read the mix at a glance
   than six separate bars; each legend row still deep-links into the real list. */
function StageDonut({
  data, total, onSlice,
}: {
  data: { key: string; label: string; value: number; color: string }[];
  total: number;
  onSlice: (key: string) => void;
}) {
  const slices = data.filter((d) => d.value > 0);
  return (
    <div className="flex flex-col items-center gap-5 sm:grid sm:grid-cols-[168px_1fr] sm:items-center">
      {/* Donut */}
      <div className="relative h-[168px] w-[168px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.length ? slices : [{ key: "empty", label: "", value: 1, color: "#E5E7EB" }]}
              dataKey="value"
              innerRadius={58}
              outerRadius={80}
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {(slices.length ? slices : [{ color: "#E5E7EB" }]).map((d, i) => (
                <Cell key={i} fill={d.color} className={slices.length ? "cursor-pointer outline-none" : ""} />
              ))}
            </Pie>
            {slices.length > 0 && (
              <RcTooltip
                cursor={false}
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12, padding: "6px 10px", boxShadow: "0 4px 12px -4px rgba(0,0,0,0.12)" }}
                formatter={(v: number, _n, p) => [`${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, (p?.payload as { label?: string })?.label ?? ""]}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-display text-[26px] font-extrabold leading-none tracking-tight tabular-nums">{total}</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Total Leads</p>
          </div>
        </div>
      </div>

      {/* Legend — each row a real, clickable filter into the leads list. */}
      <ul className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
        {data.map((d) => {
          const share = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={d.key}>
              <button
                onClick={() => onSlice(d.key)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-zinc-50/80 px-2.5 py-1.5 text-left transition hover:bg-[#EEF1FD]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm" style={{ background: d.color }} />
                  <span className="truncate text-[12px] font-medium text-zinc-700">{d.label}</span>
                </span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-zinc-900">
                  {d.value}
                  <span className="ml-1 text-[10px] font-medium text-muted-foreground">{share}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* Source Performance — a horizontal bar chart so lengths are directly
   comparable, plus a per-source detail line (qualified + won %) under each bar
   for the analytical depth the old list carried. Bars deep-link to the list. */
function SourceBarChart({
  data, onBar,
}: {
  data: { key: string; label: string; leads: number; qualified: number; converted: number }[];
  onBar: (key: string) => void;
}) {
  const rows = data.slice(0, 7);
  const chartData = rows.map((s) => ({
    key: s.key,
    label: s.label,
    leads: s.leads,
    detail: `${s.qualified} qualified · ${s.leads > 0 ? Math.round((s.converted / s.leads) * 100) : 0}% won`,
  }));
  const height = Math.max(120, chartData.length * 46);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap={12}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={96}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fontWeight: 600, fill: "#3F3F46" }}
          />
          <RcTooltip
            cursor={{ fill: "#EEF1FD" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12, padding: "6px 10px", boxShadow: "0 4px 12px -4px rgba(0,0,0,0.12)" }}
            formatter={(v: number, _n, p) => [`${v} leads · ${(p?.payload as { detail?: string })?.detail ?? ""}`, "Source"]}
          />
          <Bar
            dataKey="leads"
            radius={[6, 6, 6, 6]}
            fill="#4361EE"
            maxBarSize={22}
            background={{ fill: "#F1F5F9", radius: 6 } as never}
            cursor="pointer"
            onClick={(d: { key?: string }) => d?.key && onBar(d.key)}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill="#4361EE" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
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

/* Human relative time for the "Last updated lead …" status (just now / N min
   ago / N hr ago / Mon DD at HH:MM for older). */
function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `on ${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} at ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

/* ── Per-tone visual system — mirrors the Shop Dashboard KpiCard so the two
   surfaces share one colourful, on-brand language: a gradient left accent rail,
   a soft tone-tinted top wash, a colour-matched icon box and hint chip. Every
   colour is drawn from the existing RepairOX palette. ── */
const KPI_TONES: Record<
  string,
  { icon: string; hint: string; from: string; to: string; wash: string }
> = {
  indigo:  { icon: "bg-[#EEF1FD] text-[#4361EE]", hint: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/50", from: "#4361EE", to: "#6366F1", wash: "from-[#4361EE]/[0.07]" },
  blue:    { icon: "bg-[#EEF1FD] text-[#4361EE]", hint: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/50", from: "#4361EE", to: "#6366F1", wash: "from-[#4361EE]/[0.07]" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", hint: "text-emerald-700 bg-emerald-50 ring-emerald-200/50", from: "#10B981", to: "#34D399", wash: "from-emerald-500/[0.07]" },
  amber:   { icon: "bg-amber-50 text-amber-600", hint: "text-amber-700 bg-amber-50 ring-amber-200/50", from: "#F59E0B", to: "#FBBF24", wash: "from-amber-500/[0.07]" },
  rose:    { icon: "bg-rose-50 text-rose-600", hint: "text-rose-700 bg-rose-50 ring-rose-200/50", from: "#F43F5E", to: "#FB7185", wash: "from-rose-500/[0.07]" },
  sky:     { icon: "bg-sky-50 text-sky-600", hint: "text-sky-700 bg-sky-50 ring-sky-200/50", from: "#0EA5E9", to: "#38BDF8", wash: "from-sky-500/[0.07]" },
  violet:  { icon: "bg-violet-50 text-violet-600", hint: "text-violet-700 bg-violet-50 ring-violet-200/50", from: "#8B5CF6", to: "#A78BFA", wash: "from-violet-500/[0.07]" },
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
  const t = KPI_TONES[tone] ?? KPI_TONES.indigo;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-4 pl-[18px] text-left shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#4361EE]/40 hover:shadow-[0_6px_20px_-6px_rgba(67,97,238,0.30),0_12px_32px_-10px_rgba(67,97,238,0.20)]",
        urgent ? "border-red-300 bg-red-50/40" : "border-[#B3BFF6]/50",
      )}
    >
      {/* Left accent rail — instantly distinguishes each metric at a glance. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(to bottom, ${t.from}, ${t.to})` }}
      />
      {/* Soft top wash — tone-tinted, fades to transparent. */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b to-transparent", t.wash)} />

      <div className="relative flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-lg", t.icon)}>
          <Icon className="h-4 w-4" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-zinc-300 transition group-hover:text-[#4361EE]" />
      </div>
      <p className={cn("relative mt-3 text-2xl font-extrabold tabular-nums", urgent ? "text-[#B42318]" : "text-foreground")}>{value}</p>
      <p className="relative text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {hint && (
        <p className={cn(
          "relative mt-1.5 inline-flex w-fit items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
          urgent ? "text-[#B42318] bg-red-50 ring-red-200/60" : t.hint,
        )}>
          {hint}
        </p>
      )}
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
    <div className="rounded-2xl border-[2.2px] border-[#B3BFF6]/50 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] sm:p-6">
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
