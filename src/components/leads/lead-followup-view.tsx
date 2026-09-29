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

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarClock, History as HistoryIcon, Table as TableIcon, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, Pencil,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Pagination } from "@/components/ui/pagination";
import { SegmentedTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import {
  followUpLifecycle, followUpStateTone, openFollowUp,
  type Lead, type LeadFollowUp,
} from "@/lib/leads-data";
import { LeadFollowUpCell, LeadStatusCell } from "@/components/leads/lead-followup-cell";

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
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function LeadFollowUpView({
  leads,
  theadTop,
  onOpenLead,
}: {
  /** The already-scoped + store-filtered lead set the page is showing. */
  leads: Lead[];
  /** Runtime-measured sticky offset so the <thead> pins flush like the main table. */
  theadTop?: number;
  /** Open the lead detail (drawer) — same interaction as clicking a table row. */
  onOpenLead: (lead: Lead) => void;
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
  const visibleFollowUps = useMemo(
    () => followUps.filter((f) => leadById.has(f.leadId)),
    [followUps, leadById],
  );

  return (
    <div className="space-y-3">
      {/* Table / Calendar switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={view}
          onChange={(v) => setView(v as ViewMode)}
          options={[
            { label: <span className="inline-flex items-center gap-1.5"><TableIcon className="h-3.5 w-3.5" /> Table</span>, value: "table" },
            { label: <span className="inline-flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Calendar</span>, value: "calendar" },
          ]}
          size="sm"
        />
      </div>

      {view === "table" ? (
        <FollowUpTable
          leads={leads}
          leadById={leadById}
          followUps={visibleFollowUps}
          sub={sub}
          onSubChange={setSub}
          theadTop={theadTop}
          onOpenLead={onOpenLead}
        />
      ) : (
        <FollowUpCalendar followUps={visibleFollowUps} leadById={leadById} onOpenLead={onOpenLead} />
      )}
    </div>
  );
}

/* ── Active / History table ──────────────────────────────────────────────── */

function FollowUpTable({
  leads, leadById, followUps, sub, onSubChange, theadTop, onOpenLead,
}: {
  leads: Lead[];
  leadById: Map<string, Lead>;
  followUps: LeadFollowUp[];
  sub: SubMode;
  onSubChange: (m: SubMode) => void;
  theadTop?: number;
  onOpenLead: (lead: Lead) => void;
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
  // upcoming (nearest due first). HISTORY = leads with follow-up records but no
  // open one (latest is completed/cancelled).
  const { activeRows, historyRows } = useMemo(() => {
    const active: { lead: Lead; open: LeadFollowUp }[] = [];
    const history: { lead: Lead; last: LeadFollowUp }[] = [];
    for (const [leadId, list] of byLead) {
      const lead = leadById.get(leadId);
      if (!lead) continue;
      const open = openFollowUp(list);
      if (open) {
        active.push({ lead, open });
      } else {
        const last = [...list].sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime())[0];
        if (last) history.push({ lead, last });
      }
    }
    active.sort((a, b) => new Date(a.open.dueAt).getTime() - new Date(b.open.dueAt).getTime());
    history.sort((a, b) => new Date(b.last.completedAt || b.last.dueAt).getTime() - new Date(a.last.completedAt || a.last.dueAt).getTime());
    return { activeRows: active, historyRows: history };
  }, [byLead, leadById]);

  const rows = sub === "active" ? activeRows : historyRows;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { setPage(1); }, [sub, rows.length]);
  const paged = useMemo(() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [rows, currentPage, pageSize]);

  return (
    <div className="space-y-3">
      {/* Active / History sub-toggle — same pill group as Walk-In. */}
      <div className="flex items-center gap-1 rounded-full bg-muted p-1 w-fit">
        <SubTab label="Active" count={activeRows.length} active={sub === "active"} onClick={() => onSubChange("active")} icon={CalendarClock} />
        <SubTab label="History" count={historyRows.length} active={sub === "history"} onClick={() => onSubChange("history")} icon={HistoryIcon} />
      </div>

      {/* Canonical RepairOX table shell (matches the main Lead / Walk-In table). */}
      <div className="border-2 border-zinc-300 bg-card shadow-card">
        <div className="[overflow-x:clip]">
          <table className="w-full table-fixed text-[14px]">
            <colgroup>
              <col className="w-[92px]" />{/* Lead ID */}
              <col className="w-[16%]" />{/* Customer */}
              <col className="w-[124px]" />{/* Contact */}
              <col className="w-[18%]" />{/* Device & Issue */}
              <col className="w-[186px]" />{/* Follow-Up (interactive) */}
              <col className="w-[140px]" />{/* Agent */}
              <col className="w-[150px]" />{/* Status (interactive) */}
              <col className="w-[92px]" />{/* Action */}
            </colgroup>
            <thead style={theadTop != null ? { top: theadTop } : undefined} className="sticky z-[5] bg-[#D6DDFB] border-b-2 border-[#4361EE]/40">
              <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
                <th className="py-4"><span className="inline-block pl-5">Lead</span></th>
                <th className="pl-4 py-4">Customer</th>
                <th className="pl-4 py-4">Contact</th>
                <th className="pl-4 py-4">Device &amp; Issue</th>
                <th className="pl-4 py-4">Follow-Up</th>
                <th className="pl-4 py-4">Agent</th>
                <th className="pl-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(({ lead, ...rest }, i) => {
                const fu = sub === "active" ? (rest as { open: LeadFollowUp }).open : (rest as { last: LeadFollowUp }).last;
                return (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.015 * i, 0.2) }}
                    onClick={() => onOpenLead(lead)}
                    className="group h-[68px] cursor-pointer border-t border-zinc-500 align-middle transition hover:bg-muted/40"
                  >
                    <td className="py-4 pl-5 pr-4 whitespace-nowrap">
                      <span className="text-[14px] font-semibold text-[#4361EE] transition-colors group-hover:underline tnum">{lead.leadNo || "—"}</span>
                    </td>
                    <td className="pl-4 py-4 pr-4">
                      <span className="block truncate text-[14px] font-medium">{lead.name || "—"}</span>
                    </td>
                    <td className="pl-4 py-4 pr-4 text-[13px] whitespace-nowrap tabular-nums">{lead.number || "—"}</td>
                    <td className="pl-4 py-4 pr-4 text-[13px]">
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{lead.device || "—"}</span>
                        {lead.issue ? <span className="mt-0.5 block truncate text-[12px] text-muted-foreground" title={lead.issue}>{lead.issue}</span> : null}
                      </div>
                    </td>
                    {/* FOLLOW-UP — interactive pill + popover (mirrors Walk-In).
                        In Active it manages the open follow-up; in History it
                        shows the last outcome and still lets you view history /
                        schedule the next. */}
                    <td className="pl-4 py-4 pr-4" onClick={(e) => e.stopPropagation()}>
                      {sub === "history" ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-[12.5px] font-medium text-emerald-700">#{fu.seq} · {fu.outcome || followUpLifecycle(fu)}</span>
                          <LeadFollowUpCell lead={lead} onOpenLead={onOpenLead} />
                        </div>
                      ) : (
                        <LeadFollowUpCell lead={lead} onOpenLead={onOpenLead} />
                      )}
                    </td>
                    <td className="pl-4 py-4 pr-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar name={fu.followUpUserName || lead.assignedToName || "—"} size={22} />
                        <span className="truncate text-[13px]">{fu.followUpUserName || lead.assignedToName || "—"}</span>
                      </div>
                    </td>
                    {/* STATUS — interactive lifecycle dropdown (mirrors Final Status). */}
                    <td className="pl-4 py-4 pr-4" onClick={(e) => e.stopPropagation()}>
                      <LeadStatusCell lead={lead} />
                    </td>
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onOpenLead(lead)}
                          title="Open lead"
                          aria-label={`Open lead ${lead.leadNo}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
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
          itemLabel="lead"
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
        active ? "bg-card text-[#4361EE] shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {count > 0 && (
        <span
          className={cn(
            "inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold leading-none tabular-nums",
            active ? "bg-[#4361EE] text-white" : "bg-zinc-200 text-zinc-600",
          )}
          style={{ minWidth: 18 }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
