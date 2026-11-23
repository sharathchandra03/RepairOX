"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Follow-Up view (Table + Calendar)

   The Leads counterpart of the Walk-In follow-up view. It mirrors that pattern
   exactly so the app feels uniform:
     • A Table / Calendar switch (SegmentedTabs).
     • TABLE: an Active / History sub-toggle over the canonical RepairOX table
       shell (soft 2px zinc-300 frame, zinc-500 row separators, frozen header,
       detached shared <Pagination>). Active = leads with an OPEN (scheduled)
       follow-up, ordered by urgency (overdue → due → upcoming). History =
       leads whose latest follow-up is completed/cancelled.
     • CALENDAR: a month grid of every scheduled follow-up so a user can see and
       plan MULTIPLE follow-ups across leads at a glance, and jump to a lead.

   All follow-up writes go through the leads context (scheduleFollowUp /
   completeFollowUp / cancelFollowUp) — this view never forks that logic. It is
   presentation over the structured lead_followup_history records.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock, History as HistoryIcon, Table as TableIcon, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, Eye, MessageSquare, Send, X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Pagination } from "@/components/ui/pagination";
import { SegmentedTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import {
  followUpLifecycle, followUpStateTone, openFollowUp,
  type Lead, type LeadFollowUp,
  isCallBackStatus,
} from "@/lib/leads-data";
import { LeadFollowUpCell, LeadStatusCell } from "@/components/leads/lead-followup-cell";
import { formatClock, formatHHmm } from "@/lib/time-format";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type SubMode = "active" | "history";
type ViewMode = "table" | "calendar";

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return formatClock(d);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function LeadFollowUpView({
  leads,
  theadTop,
  onOpenLead,
  highlightLeadId,
  renderActions,
  renderDevice,
}: {
  /** The already-scoped + store-filtered lead set the page is showing. */
  leads: Lead[];
  /** Runtime-measured sticky offset so the <thead> pins flush like the main table. */
  theadTop?: number;
  /** Open the FULL lead page (the Action-column View-Lead / eye action). */
  onOpenLead: (lead: Lead) => void;
  /** When set (e.g. from the follow-up bell's "Open Lead"), the matching row is
   *  scrolled into view and blinks for ~3s so the agent sees which lead. */
  highlightLeadId?: string | null;
  /** The SAME row actions as the Lead Table (pin, view, edit, route, quotation, delete…).
   *  Supplied by the page so every action runs through its one handler. */
  renderActions?: (lead: Lead) => import("react").ReactNode;
  /** The SAME boxed Device & Issue card as the Lead Table (opens the device details popup). */
  renderDevice?: (lead: Lead) => import("react").ReactNode;
}) {
  const { followUps } = useLeads();
  const [view, setView] = useState<ViewMode>("table");
  const [sub, setSub] = useState<SubMode>("active");

  const leadById = useMemo(() => {
    const m = new Map<string, Lead>();
    for (const l of leads) m.set(l.id, l);
    return m;
  }, [leads]);

  // Only follow-ups that belong to a lead the user can currently see.
  const scopedFollowUps = useMemo(
    () => followUps.filter((f) => leadById.has(f.leadId)),
    [followUps, leadById],
  );
  // Type filter: a Call Back is a kind of follow-up. The type comes from the
  // lead's current stage (isCallBackStatus), so agents can tell them apart.
  const [kind, setKind] = useState<"all" | "followup" | "callback">("all");
  // The type counts follow the tab you are on, so they always add up to what the
  // table shows: Active = leads with a scheduled follow-up; History = closed
  // follow-ups (one per follow-up).
  const kindCounts = useMemo(() => {
    let cb = 0; let fu = 0;
    const seen = new Set<string>();
    for (const f of scopedFollowUps) {
      const lead = leadById.get(f.leadId);
      if (!lead) continue;
      const isCb = isCallBackStatus(lead.status);
      if (sub === "active") {
        if (f.status !== "scheduled" || seen.has(f.leadId)) continue;
        seen.add(f.leadId);
      } else if (!(f.status === "completed" || f.status === "cancelled" || f.status === "missed")) continue;
      if (isCb) cb += 1; else fu += 1;
    }
    return { all: cb + fu, followup: fu, callback: cb };
  }, [scopedFollowUps, leadById, sub]);
  const visibleFollowUps = useMemo(
    () => kind === "all" ? scopedFollowUps : scopedFollowUps.filter((f) => {
      const lead = leadById.get(f.leadId);
      return (lead ? isCallBackStatus(lead.status) : false) === (kind === "callback");
    }),
    [scopedFollowUps, leadById, kind],
  );
  const typeSwitch = (
    <SegmentedTabs
      accent="amber"
      value={kind}
      onChange={(v) => setKind(v as typeof kind)}
      options={[
        { label: <span className="inline-flex items-center">All ({kindCounts.all})</span>, value: "all" },
        { label: <span className="inline-flex items-center">Follow-up ({kindCounts.followup})</span>, value: "followup" },
        { label: <span className="inline-flex items-center">Call Back ({kindCounts.callback})</span>, value: "callback" },
      ]}
      size="sm"
    />
  );

  const viewSwitch = (
    <SegmentedTabs
      accent="amber"
      value={view}
      onChange={(v) => setView(v as ViewMode)}
      options={[
        { label: <span className="inline-flex items-center gap-1.5"><TableIcon className="h-3.5 w-3.5" /> Table</span>, value: "table" },
        { label: <span className="inline-flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Calendar</span>, value: "calendar" },
      ]}
      size="sm"
    />
  );

  return (
    <div className={cn("space-y-3", view === "table" && "rox-lock-fill")}>
      {/* Table / Calendar switch — amber theme. In Table mode it shares ONE row
          with the Active / History toggle (rendered inside FollowUpTable). */}
      {view === "calendar" && (
        <div className="flex flex-wrap items-center gap-3">{viewSwitch}{typeSwitch}</div>
      )}

      {view === "table" ? (
        <FollowUpTable
          leads={leads}
          leadById={leadById}
          followUps={visibleFollowUps}
          sub={sub}
          onSubChange={setSub}
          leading={<>{viewSwitch}{typeSwitch}</>}
          theadTop={theadTop}
          onOpenLead={onOpenLead}
          highlightLeadId={highlightLeadId}
          renderActions={renderActions}
          renderDevice={renderDevice}
        />
      ) : (
        <FollowUpCalendar followUps={visibleFollowUps} leadById={leadById} onOpenLead={onOpenLead} />
      )}
    </div>
  );
}

/* ── Active / History table ──────────────────────────────────────────────── */

function FollowUpTable({
  leads, leadById, followUps, sub, onSubChange, leading, theadTop, onOpenLead, highlightLeadId, renderActions, renderDevice,
}: {
  /** Table / Calendar switch, rendered beside the Active / History toggle. */
  leading?: import("react").ReactNode;
  leads: Lead[];
  leadById: Map<string, Lead>;
  followUps: LeadFollowUp[];
  sub: SubMode;
  onSubChange: (m: SubMode) => void;
  theadTop?: number;
  onOpenLead: (lead: Lead) => void;
  highlightLeadId?: string | null;
  renderActions?: (lead: Lead) => import("react").ReactNode;
  /** The SAME boxed Device & Issue card as the Lead Table (opens the device details popup). */
  renderDevice?: (lead: Lead) => import("react").ReactNode;
}) {
  // Group follow-ups per lead.
  const byLead = useMemo(() => {
    const m = new Map<string, LeadFollowUp[]>();
    for (const f of followUps) {
      const arr = m.get(f.leadId) ?? [];
      arr.push(f); m.set(f.leadId, arr);
    }
    return m;
  }, [followUps]);

  // ACTIVE = leads with an open (scheduled) follow-up, ordered overdue → due →
  // upcoming (nearest due first).
  // HISTORY = EVERY follow-up that has been CLOSED (outcome recorded =
  // completed, or cancelled / missed), one row per follow-up record — so a
  // follow-up that got an outcome lands here immediately even when the lead
  // already has its next follow-up scheduled (that one stays in Active). Newest
  // CLOSED first: the follow-up whose outcome was recorded last is on top, no
  // matter how old the follow-up itself is.
  const { activeRows, historyRows } = useMemo(() => {
    const active: { lead: Lead; open: LeadFollowUp }[] = [];
    const history: { lead: Lead; last: LeadFollowUp }[] = [];
    for (const [leadId, list] of byLead) {
      const lead = leadById.get(leadId);
      if (!lead) continue;
      const open = openFollowUp(list);
      if (open) active.push({ lead, open });
      for (const f of list) {
        if (f.status === "completed" || f.status === "cancelled" || f.status === "missed") history.push({ lead, last: f });
      }
    }
    const closedAt = (f: LeadFollowUp) => {
      const t = new Date(f.completedAt || f.dueAt).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    active.sort((a, b) => new Date(a.open.dueAt).getTime() - new Date(b.open.dueAt).getTime());
    history.sort((a, b) => closedAt(b.last) - closedAt(a.last) || b.last.seq - a.last.seq);
    return { activeRows: active, historyRows: history };
  }, [byLead, leadById]);
  const rows = sub === "active" ? activeRows : historyRows;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { setPage(1); }, [sub, rows.length]);
  /* Agent column: one shared block width (avatar + the LONGEST visible name) so
     every avatar lines up in a column AND the whole block is centred under the
     heading. Approximate glyph width at 13px; capped to the column by max-w-full. */
  const agentBlockPx = useMemo(() => {
    // Measure the real rendered width (13px body font) of the longest name.
    let ctx: CanvasRenderingContext2D | null = null;
    if (typeof document !== "undefined") {
      ctx = document.createElement("canvas").getContext("2d");
      if (ctx) ctx.font = `400 13px ${getComputedStyle(document.body).fontFamily || "system-ui, sans-serif"}`;
    }
    let widest = 0;
    for (const r of rows) {
      const f = "open" in r ? r.open : r.last;
      const n = f.followUpUserName || r.lead.assignedToName || "—";
      const w = ctx ? ctx.measureText(n).width : n.length * 7;
      if (w > widest) widest = w;
    }
    return Math.ceil(22 + 8 + widest) + 2; // avatar + gap + text
  }, [rows]);
  const paged = useMemo(() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [rows, currentPage, pageSize]);

  /* ── Highlight a lead's row (from the follow-up bell's "Open Lead") ──
     A highlighted lead lives in the ACTIVE tab (it has an open follow-up), so
     switch to Active, jump to the page that contains it, scroll it into view
     and let the row blink (see the `blink` class below). */
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  useEffect(() => {
    if (!highlightLeadId) return;
    // The highlighted lead is an active (open) follow-up — make sure that tab
    // is showing.
    if (sub !== "active" && activeRows.some((r) => r.lead.id === highlightLeadId)) {
      onSubChange("active");
      return; // re-runs after the tab switch re-renders
    }
    const idx = rows.findIndex((r) => r.lead.id === highlightLeadId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / pageSize) + 1;
    if (targetPage !== currentPage) { setPage(targetPage); return; }
    // On the right page now — scroll the row into view on the next frame.
    const raf = requestAnimationFrame(() => {
      rowRefs.current.get(highlightLeadId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightLeadId, sub, activeRows, rows, pageSize, currentPage, onSubChange]);

  return (
    <div className="space-y-3 rox-lock-fill">
      {/* Active / History sub-toggle — same pill group as Walk-In. */}
      <div className="flex flex-wrap items-center gap-3">
      {leading}
      <SegmentedTabs
        accent="amber"
        value={sub}
        onChange={(v) => onSubChange(v as SubMode)}
        options={[
          { label: <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Active ({activeRows.length})</span>, value: "active" },
          { label: <span className="inline-flex items-center gap-1.5"><HistoryIcon className="h-3.5 w-3.5" /> History ({historyRows.length} {historyRows.length === 1 ? "follow-up" : "follow-ups"})</span>, value: "history" },
        ]}
        size="sm"
      />
      </div>

      {/* Canonical RepairOX table shell (matches the main Lead / Walk-In table). */}
      {/* LOCKED page: the controls above stay fixed; only this frame's body scrolls
          (sticky header at top:0 inside the scroller). Pure CSS — see .rox-lock-*. */}
      <div className="rox-lock-grow flex flex-col border-2 border-zinc-300 bg-card shadow-card">
        <div className="rox-grid-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed text-[14px]">
            {/* Width strategy: ALL columns are percentage-based and sum to
                100%, so every column scales proportionally together. This
                keeps the layout looking IDENTICAL whether the sidebar is open
                or collapsed — the extra width is shared across every column
                instead of dumping into a couple of text columns and leaving
                huge gaps around Agent / Status / Action. */}
            <colgroup>
              <col className="w-[7%]" />{/* Date (lead created) */}
              <col className="w-[6%]" />{/* Lead ID */}
              <col className="w-[15%]" />{/* Customer (name + number) */}
              <col className="w-[14%]" />{/* Device & Issue */}
              <col className="w-[14%]" />{/* Follow-Up (interactive pill, two-line) */}
              <col className="w-[11%]" />{/* Comments (combined) */}
              <col className="w-[11%]" />{/* Agent */}
              <col className="w-[12%]" />{/* Status (interactive) */}
              <col className="w-[10%]" />{/* Action */}
            </colgroup>
            <thead style={{ top: 0 }} className="sticky z-[5] bg-[#5368D4] border-b-2 border-white/35">
              <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-white">
                <th className="py-4"><span className="inline-block pl-5">Date</span></th>
                <th className="pl-[41px] py-4">Lead</th>
                <th className="pl-[75px] py-4">Customer</th>
                <th className="px-4 py-4 text-center">Device &amp; Issue</th>
                <th className="py-4 text-center"><span className="inline-block -translate-x-[15px]">Follow-Up</span></th>
                <th className="py-4 text-center">Comments</th>
                <th className="py-4 text-center">Agent</th>
                <th className="py-4 text-center">Status</th>
                <th className="py-4 pr-3 text-right">Last Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(({ lead, ...rest }, i) => {
                const fu = sub === "active" ? (rest as { open: LeadFollowUp }).open : (rest as { last: LeadFollowUp }).last;
                return (
                  <motion.tr
                    key={sub === "history" ? fu.id : lead.id}
                    ref={(el) => { if (el) rowRefs.current.set(lead.id, el as HTMLTableRowElement); else rowRefs.current.delete(lead.id); }}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.015 * i, 0.2) }}
                    onClick={() => onOpenLead(lead)}
                    className={cn(
                      "group h-[68px] cursor-pointer border-t border-zinc-500 align-middle transition hover:bg-muted/40",
                      highlightLeadId === lead.id && "rox-row-blink",
                    )}
                  >
                    {/* DATE — when the lead was created (same source as Lead Table). */}
                    <td className="py-4 pl-5 pr-3 text-[13px]">
                      <FollowUpDateCell lead={lead} />
                    </td>
                    {/* LEAD ID */}
                    <td className="pl-[41px] py-4 pr-3 whitespace-nowrap">
                      <span className="text-[14px] font-semibold text-[#4361EE] transition-colors group-hover:underline tnum">{lead.leadNo || "—"}</span>
                    </td>
                    {/* CUSTOMER — name + contact number stacked (like the Lead
                        Table). Whole column nudged right to sit under its heading. */}
                    <td className="pl-[75px] py-4 pr-1">
                      <div className="min-w-0 leading-snug">
                        <span className="block truncate text-[14px] font-medium">{lead.name || "—"}</span>
                        {lead.number ? <span className="mt-0.5 block truncate text-[12.5px] text-zinc-500 tabular-nums">{lead.number}</span> : null}
                      </div>
                    </td>
                    {/* DEVICE & ISSUE — heading + content both centered in the column. */}
                    <td className="px-1.5 py-3" onClick={(e) => e.stopPropagation()}>
                      {renderDevice ? <div className="mx-auto w-[92%] min-w-0">{renderDevice(lead)}</div> : (
                        <div className="min-w-0 text-center text-[13px]">
                          <span className="block truncate font-medium text-foreground">{lead.device || "—"}</span>
                          {lead.issue ? <span className="mt-0.5 block truncate text-[12px] text-muted-foreground" title={lead.issue}>{lead.issue}</span> : null}
                        </div>
                      )}
                    </td>
                    {/* FOLLOW-UP — interactive pill + popover (mirrors Walk-In),
                        centered in its column.
                        In Active it manages the open follow-up; in History it
                        shows the last outcome and still lets you view history /
                        schedule the next. */}
                    <td className="px-1.5 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="-translate-x-[15px]">
                      {sub === "history" ? (
                        <div className="flex flex-col items-center gap-1" title={`Follow-up #${fu.seq} · ${fu.outcome || followUpLifecycle(fu)} · closed ${fmtDateTime(fu.completedAt || fu.dueAt)}`}>
                          <span className={cn(
                            "inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                            fu.status === "completed" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-50 text-zinc-600 ring-zinc-200",
                          )}>#{fu.seq} · {fu.outcome || followUpLifecycle(fu)}</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDateTime(fu.completedAt || fu.dueAt)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <LeadFollowUpCell lead={lead} onOpenLead={onOpenLead} />
                        </div>
                      )}
                      </div>
                    </td>
                    {/* COMMENTS — combined lead + follow-up comment thread. */}
                    <td className="pl-2 py-3 pr-2" onClick={(e) => e.stopPropagation()}>
                      <FollowUpCommentCell lead={lead} />
                    </td>
                    {/* AGENT — the follow-up's responsible agent, centered under
                        its (centered) heading. */}
                    <td className="px-3 py-4">
                      <div className="mx-auto flex min-w-0 max-w-[calc(100%-19px)] items-center justify-start gap-2 translate-x-[19px]" style={{ width: agentBlockPx }}>
                        <span className="shrink-0"><Avatar name={fu.followUpUserName || lead.assignedToName || "—"} size={22} /></span>
                        <span className="line-clamp-2 min-w-0 break-words text-[13px] leading-tight" title={fu.followUpUserName || lead.assignedToName || undefined}>{fu.followUpUserName || lead.assignedToName || "—"}</span>
                      </div>
                    </td>
                    {/* STATUS — interactive lifecycle dropdown, centered under
                        its (centered) heading. */}
                    <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <LeadStatusCell lead={lead} />
                      </div>
                    </td>
                    <td className="pl-2 pr-3 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end [&>div]:gap-0">
                        {renderActions ? renderActions(lead) : (
                        <button
                          onClick={() => onOpenLead(lead)}
                          title="View lead"
                          aria-label={`View lead ${lead.leadNo}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]"><CalendarClock className="h-6 w-6" /></span>
            <p className="font-semibold">{sub === "active" ? "No open follow-ups" : "No follow-up history yet"}</p>
            <p className="text-sm text-muted-foreground">
              {sub === "active"
                ? "Leads with a scheduled follow-up appear here, ordered by what needs attention first."
                : "Completed and cancelled follow-ups appear here so you can review the full journey."}
            </p>
          </div>
        )}
      </div>

      {/* Detached pagination footer — outside the frame (Design System). */}
      {rows.length > 0 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={rows.length}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          itemLabel="follow-up"
          className="rox-lock-footer -mt-3 !py-0"
        />
      )}
    </div>
  );
}

/* ── Calendar (month grid of scheduled follow-ups) ─────────────────────────
   A simple, dependency-free month grid so a user can plan MULTIPLE follow-ups
   across leads at a glance. Each day cell shows the scheduled follow-ups due
   that day; clicking one opens the lead. Non-scheduled (completed/cancelled)
   follow-ups are not plotted — the calendar is a forward-planning surface. */

function FollowUpCalendar({
  followUps, leadById, onOpenLead,
}: {
  followUps: LeadFollowUp[];
  leadById: Map<string, Lead>;
  onOpenLead: (lead: Lead) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  const scheduled = useMemo(() => followUps.filter((f) => f.status === "scheduled" && f.dueAt), [followUps]);

  // Map yyyy-mm-dd → follow-ups due that day (within the visible month).
  const byDay = useMemo(() => {
    const m = new Map<string, LeadFollowUp[]>();
    for (const f of scheduled) {
      const d = new Date(f.dueAt);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = m.get(key) ?? [];
      arr.push(f); m.set(key, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    return m;
  }, [scheduled]);

  // Build the 6-week grid for the visible month.
  const cells = useMemo(() => {
    const first = new Date(cursor);
    const startDow = first.getDay(); // 0 = Sun
    const gridStart = new Date(first);
    gridStart.setDate(1 - startDow);
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); out.push(d); }
    return out;
  }, [cursor]);

  const today = new Date();
  const monthLabel = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth();

  return (
    <div className="rounded-2xl border-2 border-zinc-300 bg-card p-4 shadow-card">
      {/* Month header + nav */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor((c) => { const n = new Date(c); n.setMonth(c.getMonth() - 1); return n; })} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted transition" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); }} className="rounded-lg border border-border px-3 h-8 text-[12px] font-medium text-muted-foreground hover:bg-muted transition">Today</button>
          <button onClick={() => setCursor((c) => { const n = new Date(c); n.setMonth(c.getMonth() + 1); return n; })} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted transition" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {cells.map((d, i) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const items = byDay.get(key) ?? [];
          const isToday = sameDay(d, today);
          return (
            <div
              key={i}
              className={cn(
                "min-h-[92px] bg-card p-1.5 align-top",
                !inMonth(d) && "bg-muted/40 text-muted-foreground",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums", isToday ? "bg-[#4361EE] text-white" : inMonth(d) ? "text-foreground" : "text-muted-foreground")}>{d.getDate()}</span>
                {items.length > 0 && <span className="text-[10px] font-semibold text-[#4361EE]">{items.length}</span>}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((f) => {
                  const lead = leadById.get(f.leadId);
                  const life = followUpLifecycle(f);
                  return (
                    <button
                      key={f.id}
                      onClick={() => lead && onOpenLead(lead)}
                      title={`${lead?.leadNo || ""} · ${lead?.name || ""} — ${fmtDateTime(f.dueAt)}`}
                      className={cn(
                        "block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[10.5px] font-medium ring-1 ring-inset transition hover:brightness-95",
                        followUpStateTone(life),
                      )}
                    >
                      {fmtTime(f.dueAt)} · {lead?.name || lead?.leadNo || "Lead"}
                    </button>
                  );
                })}
                {items.length > 3 && <span className="block px-1.5 text-[10px] text-muted-foreground">+{items.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>

      {scheduled.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-[12px] text-muted-foreground">
          No scheduled follow-ups. Schedule follow-ups from a lead to plan them here.
        </p>
      )}
    </div>
  );
}

/* ── Sub-toggle button (mirrors the Walk-In SubTab) ────────────────────────── */

function SubTab({ label, count, active, onClick, icon: Icon }: { label: string; count: number; active: boolean; onClick: () => void; icon?: any }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition",
        active ? "bg-card text-[#F59E0C] shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {count > 0 && (
        <span
          className={cn(
            "inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold leading-none tabular-nums",
            active ? "bg-[#F59E0C] text-white" : "bg-zinc-200 text-zinc-600",
          )}
          style={{ minWidth: 18 }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/* ── Lead creation date cell (mirrors the Lead Table DateCell) ─────────────
   Shows WHEN the lead was created — date primary, time secondary — using the
   lead's own `date`/`time`, the same source the Lead Table uses. */
function FollowUpDateCell({ lead }: { lead: Lead }) {
  const d = lead.date ? new Date(lead.date + "T00:00:00") : null;
  const dateLabel = d && !isNaN(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
    : (lead.date || "—");
  return (
    <div className="leading-snug">
      <p className="whitespace-nowrap text-[13px] font-semibold text-zinc-800 tnum">{dateLabel}</p>
      {lead.time && <p className="mt-0.5 whitespace-nowrap text-[12px] text-zinc-500 tnum">{lead.time}</p>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Combined Comment cell — a single thread showing BOTH the lead's own comment
   and every follow-up comment, each with its timestamp + the agent who wrote
   it, in clear chat-style separation. Writing in the box updates the OPEN
   follow-up's comment (updateFollowUpComment) so the activity is captured on
   the current attempt and flows into the Lead Journey + real View Lead.

   Lead comment and follow-up comments are visually distinct (different tint +
   label), never merged into one blob.
   ────────────────────────────────────────────────────────────────────────── */

type CommentEntry = {
  id: string;
  kind: "lead" | "followup";
  text: string;
  who: string;
  at?: string;
  seq?: number;
  state?: string;
};

function fmtChatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function FollowUpCommentCell({ lead }: { lead: Lead }) {
  const { can } = usePermissions();
  const canFollowUp = allow(can, CAP.lead.followup);
  const { followUpsFor, updateFollowUpComment, openFollowUpsByLead } = useLeads();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const followUps = followUpsFor(lead.id);
  const openFu = openFollowUpsByLead.get(lead.id) ?? openFollowUp(followUps);

  // Build the combined, chronological thread.
  const entries = useMemo<CommentEntry[]>(() => {
    const out: CommentEntry[] = [];
    if (lead.comments && lead.comments.trim()) {
      out.push({
        id: `lead:${lead.id}`, kind: "lead", text: lead.comments.trim(),
        who: lead.assignedToName || lead.agent || "Lead", at: lead.createdAt || (lead.date ? `${lead.date}T${lead.time || "00:00"}:00` : undefined),
      });
    }
    for (const f of [...followUps].sort((a, b) => a.seq - b.seq)) {
      const parts: string[] = [];
      if (f.comments && f.comments.trim()) parts.push(f.comments.trim());
      const text = parts.join("");
      if (!text && !f.outcome) continue;
      out.push({
        id: `fu:${f.id}`, kind: "followup",
        text: text || (f.outcome ? `Outcome: ${f.outcome}` : ""),
        who: f.followUpUserName || f.createdByName || "Agent",
        at: f.completedAt || f.createdAt, seq: f.seq, state: f.outcome || followUpLifecycle(f),
      });
    }
    return out;
  }, [lead, followUps]);

  // Preview line for the collapsed cell = latest comment.
  const latest = entries[entries.length - 1];
  const previewText = latest?.text || "";

  /* Portal positioning — flip above when there isn't room below. */
  useEffect(() => {
    if (!open) return;
    const GAP = 6, MARGIN = 8, WIDTH = 340;
    const place = () => {
      const btn = btnRef.current; if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const popH = popRef.current?.offsetHeight || 380;
      const spaceBelow = vh - r.bottom - GAP - MARGIN, spaceAbove = r.top - GAP - MARGIN;
      let top: number, maxHeight: number;
      if (spaceBelow >= popH || spaceBelow >= spaceAbove) { top = r.bottom + GAP; maxHeight = Math.max(220, spaceBelow); }
      else { maxHeight = Math.max(220, spaceAbove); top = r.top - GAP - Math.min(popH, maxHeight); }
      top = Math.max(MARGIN, Math.min(top, vh - MARGIN - Math.min(popH, maxHeight)));
      const left = Math.max(MARGIN, Math.min(r.left, vw - WIDTH - MARGIN));
      setPos({ top, left, maxHeight });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  // Close on outside click / escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Scroll the thread to the bottom whenever it opens / grows.
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, entries.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !openFu) return;
    setBusy(true);
    try {
      // Append to the open follow-up's comment (keeps prior note on a new line).
      const combined = openFu.comments && openFu.comments.trim() ? `${openFu.comments.trim()}\n${text}` : text;
      await updateFollowUpComment(openFu.id, combined);
      setDraft("");
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="View & add comments"
        className="group/cmt relative mr-2 flex min-h-[48px] w-full items-center gap-2 overflow-hidden rounded-lg border border-amber-300 bg-amber-100/90 pl-3 pr-2.5 py-1.5 text-left shadow-[0_1px_2px_rgba(146,64,14,0.12)] transition hover:border-amber-400 hover:bg-amber-100"
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3.5px] bg-amber-500" />
        <div className="min-w-0 flex-1">
          {previewText ? (
            <p className="line-clamp-2 w-full break-words whitespace-pre-line text-[13px] font-medium leading-snug text-amber-950" title={previewText}>{previewText}</p>
          ) : (
            <p className="text-[12px] italic text-amber-700/80">No comments yet — click to add</p>
          )}
          {entries.length > 1 && <p className="mt-0.5 text-[10.5px] font-semibold text-amber-800">{entries.length} notes · tap to view</p>}
        </div>
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-700" />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={popRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 340, maxHeight: pos.maxHeight }}
              className="z-[9999] flex flex-col overflow-hidden rounded-2xl border border-zinc-300/80 bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-100 text-amber-700"><MessageSquare className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold leading-none">Comments</p>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{lead.leadNo} · {lead.name || "Unnamed"}</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
              </div>

              {/* Thread */}
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-muted/20 p-3">
                {entries.length === 0 ? (
                  <p className="py-6 text-center text-[12px] text-muted-foreground">No comments yet.</p>
                ) : (
                  entries.map((e) => (
                    <div key={e.id} className={cn("rounded-xl border px-3 py-2", e.kind === "lead" ? "border-sky-200 bg-sky-50/70" : "border-amber-200 bg-amber-50/70")}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                          e.kind === "lead" ? "bg-sky-100 text-sky-700 ring-sky-200" : "bg-amber-100 text-amber-700 ring-amber-200")}>
                          {e.kind === "lead" ? "Lead comment" : `Follow-up #${e.seq}`}
                        </span>
                        {e.at && <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{fmtChatTime(e.at)}</span>}
                      </div>
                      <p className="whitespace-pre-line break-words text-[12.5px] leading-snug text-foreground/90">{e.text}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Avatar name={e.who} size={16} />
                        <span className="truncate text-[10.5px] font-medium text-muted-foreground">{e.who}</span>
                        {e.kind === "followup" && e.state && <span className="ml-auto truncate text-[10px] text-emerald-700">{e.state}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Composer — writes to the OPEN follow-up's comment */}
              <div className="shrink-0 border-t border-border p-2.5">
                {!canFollowUp ? (
                  <p className="px-1 py-1.5 text-[11px] text-muted-foreground">You don&apos;t have permission to add follow-up comments.</p>
                ) : !openFu ? (
                  <p className="px-1 py-1.5 text-[11px] text-muted-foreground">No open follow-up. Schedule one from the Follow-Up cell to add a comment.</p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                      rows={2}
                      placeholder={`Add a comment to Follow-up #${openFu.seq}…`}
                      className="min-h-[38px] flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20"
                    />
                    <button
                      onClick={() => void send()}
                      disabled={!draft.trim() || busy}
                      title="Add comment (Cmd/Ctrl+Enter)"
                      className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg bg-[#4361EE] text-white transition hover:bg-[#3550d8] disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
