"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Plus, User, LayoutGrid, List, Map, Flag, X, ChevronDown, CalendarClock, Pin,
  Phone, Mail, RefreshCw, Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { ActiveFilterChip } from "@/components/ui/rox-filter";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { LeadFilterPanel, type FacetDef } from "@/components/leads/lead-filter-panel";
import { FreezeColumnsMenu } from "@/components/common/freeze-columns-menu";
import { useFrozenColumns, type GridColumn } from "@/hooks/use-frozen-columns";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import {
  deriveLeadWorkflow, deriveLeadStoreBranchId, isDownstreamGated,
  leadActionTone, leadResultTone,
  type LeadWorkflow, type LeadWorkflowSources,
} from "@/lib/lead-workflow";
import { Lock } from "lucide-react";
import { Can } from "@/components/common/can";
import { CAP, allow } from "@/lib/capabilities";
import { toast } from "@/components/ui/toaster";
import { cn, formatINR } from "@/lib/utils";
import { useLeads, LEAD_OPEN_EVENT } from "@/lib/leads-context";
import { useLeadStatusFieldJob } from "@/lib/use-lead-status-field-job";
import {
  followUpState, followUpTone, hasActiveLeadFilters, openFollowUpRowState, followUpLifecycle, getLeadDevices, leadIsExistingCustomer, type LeadFollowUp,
  isNotContactedStatus, isNotContactedLocked, LEAD_DATE_RANGES, EMPTY_LEAD_FILTERS,
  type Lead, type LeadFieldKey, type LeadFilterField, type LeadDateRange, type LeadFilters,
} from "@/lib/leads-data";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { LeadFollowUpView } from "@/components/leads/lead-followup-view";
import { LeadFollowUpBell } from "@/components/leads/lead-followup-bell";
import { LeadCaptureFlow } from "@/components/leads/lead-capture-flow";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { LeadActionsMenu, type LeadAction } from "@/components/leads/lead-actions-menu";
import { RouteLeadDialog } from "@/components/leads/route-lead-dialog";
import { statusTone, priorityTone } from "@/components/leads/lead-pills";
import { AssignMenu, AssignBadge, useCanAssignLeads } from "@/components/leads/lead-assign";
import { LeadDeviceDetailsOverlay } from "@/components/leads/lead-device-details-overlay";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { resolveLeadEvidenceIds } from "@/lib/lead-intelligence-url";

/* Page-size options for the detached pagination footer (matches Tickets). */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/* ── LEAD TABLE COLUMN CONTRACT ───────────────────────────────────────────
   The columns in VISUAL ORDER with their rendered widths. Two mandatory
   structural anchors: "date" (Date) frozen LEFT, "actions" (Last Action)
   frozen RIGHT. Everything between is freezable-to-left by the user. The
   conditional multi-store "store" column is not offered in the freeze menu
   (freezable:false) since it only exists in All-Shops. Widths match the
   original <colgroup> so freeze offsets line up exactly. */
function leadGridColumns(multiStore: boolean): GridColumn[] {
  const cols: GridColumn[] = [
    // Selection anchor — permanently frozen LEFT, before Date. Not offered
    // in the freeze menu (freezable:false); it is a structural selection column
    // handled directly by frozenCellProps (not the single-anchor hook, which
    // owns the Date left anchor).
    { key: "select", label: "", width: 44, freezable: false },
    { key: "date", label: "Date", width: 92, lockedLeft: true },
  ];
  if (multiStore) cols.push({ key: "store", label: "Store", width: 132, freezable: false });
  cols.push(
    { key: "id", label: "Lead ID", width: 84 },
    { key: "region", label: "Region", width: 120 },
    // MODE OF LEAD — how the lead came in (modeOfContact). Structurally separate
    // from Source (acquisition) and Capture Channel.
    { key: "mode", label: "Mode of Lead", width: 118 },
    { key: "source", label: "Source", width: 120 },
    { key: "agent", label: "Agent", width: 150 },
    { key: "contactStatus", label: "Contact Status", width: 128 },
    { key: "contactInfo", label: "Contact Info", width: 220 },
    { key: "device", label: "Device & Issue", width: 200 },
    { key: "value", label: "Lead Value", width: 120 },
    { key: "leadCategory", label: "Lead Category", width: 120 },
    { key: "comment", label: "Comment", width: 200 },
    // SUB CATEGORY — the TBD column is now the real Sub Category field.
    { key: "subCategory", label: "Sub Category", width: 130 },
    { key: "leadType", label: "Lead Type", width: 104 },
    { key: "status", label: "Status", width: 148 },
    // ACTION — SYSTEM-DERIVED, read-only (never an editable dropdown).
    { key: "action", label: "Action", width: 132 },
    // STORE — derived from the actual operational record.
    { key: "storeCol", label: "Store", width: 132 },
    // RESULT — SYSTEM-DERIVED, read-only (₹value + Ticket + Invoice).
    { key: "result", label: "Result", width: 150 },
    { key: "actions", label: "Last Action", width: 90, lockedRight: true },
  );
  return cols;
}

/* Merge a column's frozen props (className + inline offset style) with the
   cell's own base classes. Returns a spreadable prop object for <th>/<td>. */
function mergeFrozen(
  frozen: { className: string; style?: React.CSSProperties },
  base: string,
): { className: string; style?: React.CSSProperties } {
  return { className: cn(base, frozen.className), style: frozen.style };
}

/* Toggles data-scroll-left / data-scroll-right on the scroll container so the
   frozen-edge shadow only shows when there is actually scrollable content
   underneath that edge (spec §18). rAF-throttled; no layout thrash. */
function useScrollEdges(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft < maxScroll - 1;
      el.setAttribute("data-scroll-left", String(left));
      el.setAttribute("data-scroll-right", String(right));
      // Proportional scroll position (0 = far left, 1 = far right). The frozen
      // edge shadows scale with this: the LEFT edge deepens as more content is
      // hidden to the left (fraction → 1), the RIGHT edge deepens as more
      // content remains to the right (fraction → 0).
      const fraction = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0;
      el.style.setProperty("--rox-scroll-x", fraction.toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [ref]);
}

/* ── Follow-up cell — mirrors the Ticket due-date reddish/pink treatment.
   Driven by the STRUCTURED open follow-up (lead_followup_history) so overdue is
   datetime-precise (a 6:00 PM follow-up reads Overdue at 6:01 PM), not a plain
   calendar-date compare. Falls back to the flat followUpDate if no record. ── */
function FollowUpCell({ lead, open }: { lead: Lead; open?: LeadFollowUp }) {
  const fu = open ? openFollowUpRowState(open) : followUpState(lead.followUpDate);
  if (fu === "none") return <span className="text-[12px] text-zinc-400">—</span>;
  const t = followUpTone(fu);
  const label = fu === "overdue" ? "Overdue" : fu === "today" ? "Due today"
    : open ? formatFollowUpDateTime(open.dueAt) : formatFollowUp(lead.followUpDate);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", t.chip)}>
      <CalendarClock className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Label for a primary-view segment with an optional count badge (matches the
 *  Walk-In follow-up tab: white pill on the active blue tab, blue pill otherwise). */
function ViewTabLabel({ text, count, active }: { text: string; count: number; active: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {text}
      {count > 0 && (
        <span
          className={cn(
            "inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold leading-none tabular-nums",
            active ? "bg-white text-[#4361EE]" : "bg-[#4361EE] text-white",
          )}
          style={{ minWidth: 18 }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}

/** Masked cell for a LOCKED Not-Contacted lead — the flow is hidden (N/A)
 *  until a senior reassigns the lead to a new owner. */
function NACell() {
  return <span className="text-[12px] font-medium text-zinc-400">N/A</span>;
}

/** Compact date+time label for an open follow-up (e.g. "27 Sep, 6:00 PM"). */
function formatFollowUpDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatFollowUp(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/* ─────────────────────────────────────────────────────────────────────────
   LEAD TABLE — grouped presentation (reference-driven).
   One lead = one row. Related fields are GROUPED inside compact cells
   (Contact Info, Device & Issue, Lead Value, Source, Date) rather than split
   into many columns. All values come from the real Lead record + derived
   workflow — no fakes. ACTION and RESULT are SYSTEM-DERIVED (read-only).
   ───────────────────────────────────────────────────────────────────────── */

/* Derives a hex dot color that matches statusTone's semantic mapping. */
function statusDotColor(status: string): string {
  const s = status.toLowerCase();
  if (/new/.test(s)) return "#0284c7";           // sky-600
  if (/won|convert|qualif/.test(s)) return "#059669";  // emerald-600
  if (/lost|drop|not interested/.test(s)) return "#71717a"; // zinc-500
  if (/follow/.test(s)) return "#ea580c";         // orange-600
  if (/contact|progress|proposal/.test(s)) return "#7c3aed"; // violet-600
  if (/interest/.test(s)) return "#4361EE";       // indigo
  return "#71717a";                               // neutral
}

/* Column 2 — DATE: date primary line, time secondary. */
function DateCell({ lead }: { lead: Lead }) {
  const d = lead.date ? new Date(lead.date + "T00:00:00") : null;
  const dateLabel = d && !isNaN(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    : (lead.date || "—");
  return (
    <div className="leading-snug">
      <p className="font-semibold text-zinc-800 tnum">{dateLabel}</p>
      {lead.time && <p className="mt-0.5 text-[12px] text-zinc-500 tnum">{lead.time}</p>}
    </div>
  );
}

/* Column 4 — SOURCE: acquisition source primary; capture channel secondary
   (kept structurally separate — never flattened into one text field). */
function SourceCell({ lead }: { lead: Lead }) {
  if (!lead.source && !lead.captureChannel) return <span className="text-zinc-400">—</span>;
  return (
    <div className="leading-snug">
      {lead.source && <p className="truncate font-medium text-zinc-700">{lead.source}</p>}
      {lead.captureChannel && <p className="mt-0.5 truncate text-[12px] text-zinc-500">{lead.captureChannel}</p>}
    </div>
  );
}

/* ─── LeadSelectCell ─────────────────────────────────────────────────────
   Inline-editable dropdown for lead table cells (Status, Contact Status).
   Matches the ticket StatusPillDropdown: colored dot, framer-motion menu,
   portal-positioned so it's never clipped by any scroll container.
   readOnly = plain pill with no chevron (locked / gated rows). */
function LeadSelectCell({
  value,
  options,
  onChange,
  toneClass,
  dotColor,
  readOnly = false,
  placeholder = "—",
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Tailwind ring+bg+text classes for the pill e.g. "bg-zinc-100 text-zinc-600 ring-zinc-200" */
  toneClass: string;
  /** Hex color for the leading dot and selected-item tick. */
  dotColor: string;
  readOnly?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const dropUp = window.innerHeight - r.bottom < 280;
      setPos({ top: dropUp ? undefined : r.bottom + 6, bottom: dropUp ? window.innerHeight - r.top + 6 : undefined, left: r.left, dropUp });
    }
    setOpen((o) => !o);
  };

  if (readOnly) {
    return value
      ? <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", toneClass)}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
          {value}
        </span>
      : <span className="text-zinc-400">{placeholder}</span>;
  }

  return (
    <div className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset transition hover:shadow-sm px-2.5 py-1 text-[11px]",
          value ? toneClass : "bg-zinc-50 text-zinc-400 ring-zinc-200",
        )}
        style={value ? { backgroundColor: `${dotColor}15`, color: dotColor, boxShadow: `inset 0 0 0 1px ${dotColor}30` } : undefined}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: value ? dotColor : "#a1a1aa" }} />
        {value || placeholder}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
            <motion.div
              initial={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }}
              className="z-[70] w-[210px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              {options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange(opt); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition",
                    opt === value ? "bg-indigo-50 text-[#4361EE]" : "hover:bg-zinc-50 text-foreground",
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                    style={{ backgroundColor: opt === value ? dotColor : "#a1a1aa" }} />
                  {opt}
                  {opt === value && <span className="ml-auto text-[9px] font-bold text-[#4361EE]">✓</span>}
                </button>
              ))}
              {value && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
                  className="mt-0.5 flex w-full items-center gap-2 rounded-lg border-t border-border/50 px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-zinc-50"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Column 6 — CONTACT STATUS (current structured state; kept separate from
   Lead Status / Result / Final Result). */
function ContactStatusCell({ lead, options, onSave, locked }: {
  lead: Lead;
  options: string[];
  onSave: (v: string) => void;
  locked: boolean;
}) {
  const s = (lead.contactStatus || "").toLowerCase();
  const toneClass = s.includes("not") ? "bg-zinc-100 text-zinc-600 ring-zinc-200"
    : s.includes("rnr") || s.includes("busy") || s.includes("switched") ? "bg-amber-50 text-amber-700 ring-amber-200"
    : lead.contactStatus ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-zinc-50 text-zinc-400 ring-zinc-200";
  const dotColor = s.includes("not") ? "#71717a"
    : s.includes("rnr") || s.includes("busy") || s.includes("switched") ? "#d97706"
    : lead.contactStatus ? "#059669" : "#a1a1aa";
  return (
    <LeadSelectCell
      value={lead.contactStatus || ""}
      options={options}
      onChange={onSave}
      toneClass={toneClass}
      dotColor={dotColor}
      readOnly={locked}
      placeholder="—"
    />
  );
}

/* Column 7 — CONTACT INFO (GROUPED: name + phone + email in one cell). */
function ContactInfoCell({ lead }: { lead: Lead }) {
  const phoneDigits = (lead.number || "").replace(/\D/g, "");
  const existing = leadIsExistingCustomer(lead);
  return (
    <div className="flex min-w-0 items-start gap-2 leading-snug" onClick={(e) => e.stopPropagation()}>
      {/* Thin colour strip in front of the name — green = existing customer
          (linked to Customer Master / converted), orange = new prospect.
          Same bar pattern as the Walk-In table's type strip for uniformity. */}
      <span
        title={existing ? "Existing customer — linked to Customer Master" : "New prospect — not yet a customer"}
        aria-label={existing ? "Existing customer" : "New prospect"}
        className={cn(
          "mt-0.5 h-8 w-1 shrink-0 rounded-full",
          existing ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      <div className="min-w-0">
      <p className="min-w-0 truncate font-semibold text-zinc-900">{lead.name || "—"}</p>
      {lead.number && (
        <a href={`tel:${phoneDigits}`} className="mt-1 flex items-center gap-1.5 text-[12.5px] text-zinc-600 hover:text-[#4361EE] tnum">
          <Phone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{lead.number}</span>
        </a>
      )}
      {lead.email && (
        <a href={`mailto:${lead.email}`} title={lead.email} className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-zinc-500 hover:text-[#4361EE]">
          <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{lead.email}</span>
        </a>
      )}
      </div>
    </div>
  );
}

/* Column 8 — DEVICE & ISSUE (GROUPED: device primary, issue secondary).
   Clicking the cell opens the shared Device & Issue details popup (mirrors the
   Ticket / Walk-In "Device N" overlay) — one consistent popup whether the lead
   has a single device or, in future, multiple. */
function DeviceIssueCell({ lead, onOpen }: { lead: Lead; onOpen: (lead: Lead) => void }) {
  const devices = getLeadDevices(lead);
  if (devices.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
      aria-label="View device and issue details"
      className="group/device flex w-full min-w-0 items-center gap-1.5 rounded-lg text-left transition hover:bg-indigo-50/50"
    >
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate font-medium text-zinc-800">
          <span className="truncate">{lead.device || (lead.issue ? "Device" : "—")}</span>
        </p>
        {lead.issue && <p className="mt-0.5 truncate text-[12.5px] text-zinc-500" title={lead.issue}>{lead.issue}</p>}
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-zinc-400 opacity-70 transition group-hover/device:text-[#4361EE] group-hover/device:opacity-100" />
    </button>
  );
}

/* Column 9 — LEAD VALUE (pipeline/estimate; NEVER revenue). Shows the total
   with the discount as an optional secondary breakdown when present. */
function LeadValueCell({ lead }: { lead: Lead }) {
  if (lead.estimate == null) return <span className="text-zinc-400">—</span>;
  const hasDiscount = lead.discount != null && lead.discount > 0;
  const breakdown = hasDiscount
    ? lead.discountType === "percent"
      ? `−${lead.discount}%`
      : `less ${formatINR(lead.discount!)}`
    : null;
  return (
    <div className="leading-snug">
      <p className="font-semibold text-zinc-900 tnum">{formatINR(lead.estimate)}</p>
      {breakdown && <p className="mt-0.5 text-[12px] text-zinc-500 tnum">{breakdown}</p>}
    </div>
  );
}

/* Column 10 — COMMENT (readable preview; full text on hover via title). */
function CommentCell({ text }: { text: string }) {
  if (!text?.trim()) return <span className="text-zinc-400">—</span>;
  return (
    <p className="line-clamp-2 whitespace-pre-line text-[13px] leading-snug text-zinc-600" title={text}>{text}</p>
  );
}

/* ── ACTION cell — SYSTEM-DERIVED, READ-ONLY ───────────────────────────────
   Action reflects the LATEST meaningful operational event, computed live from
   the linked records (Walk-In / Field / Ticket / Invoice) + follow-up. It is
   NEVER an editable dropdown — the user cannot type or choose it. A subtle lock
   glyph + a "why is this?" tooltip communicate that it is system-generated. */
function ActionCell({ wf }: { wf: LeadWorkflow }) {
  // When the Action is driven by a LIVE Field Job, mirror the Field module's
  // "Service Status" verbatim (exact label + tone) so the sales agent sees the
  // live Pickup & Drop progress. Otherwise use the derived action label/tone.
  const isFieldLive = !!wf.fieldStatus;
  const label = isFieldLive ? wf.fieldStatusLabel : wf.actionLabel;
  const tone = isFieldLive ? wf.fieldStatusTone : leadActionTone(wf.action);
  return (
    <span
      title={`${label} · System-derived — ${wf.reason}`}
      aria-label={`Action: ${label} (system-derived, read-only)`}
      className={cn(
        "inline-flex cursor-default items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset select-none",
        tone,
      )}
    >
      <Lock className="h-2.5 w-2.5 opacity-60" aria-hidden />
      {label}
    </span>
  );
}

/* ── RESULT cell — SYSTEM-DERIVED, READ-ONLY ───────────────────────────────
   Result is the highest-priority real outcome. For a finalized invoice it shows
   ₹value (primary) with the Ticket ID + Invoice ID (secondary, clickable). For
   a ticket-only lead it shows the Ticket ID; for a routed/assigned lead "Lead
   Won"; otherwise "In Pipeline" / "N/A". The money value is the ACTUAL finalized
   invoice total — never the estimate. Not manually editable. */
function ResultCell({
  wf, canViewTicket, canViewInvoice,
}: {
  wf: LeadWorkflow;
  canViewTicket: boolean;
  canViewInvoice: boolean;
}) {
  const r = wf.result;
  if (r.kind === "invoice") {
    return (
      <div className="leading-snug select-none" title={`System-derived — ${wf.reason}`}>
        <p className={cn("font-bold tabular-nums", leadResultTone(r.kind))}>{r.primary}</p>
        <div className="mt-0.5 space-y-0.5 border-t border-border/70 pt-0.5">
          {r.ticketNo && (
            canViewTicket
              ? <Link href={`/tickets/${r.ticketId || r.ticketNo}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[11px] font-medium text-[#4361EE] hover:underline tabular-nums" title={`Open ticket ${r.ticketNo}`}>{r.ticketNo}</Link>
              : <span className="block truncate text-[11px] font-medium text-zinc-500 tabular-nums">{r.ticketNo}</span>
          )}
          {r.invoiceNo && (
            canViewInvoice
              ? <Link href={`/invoice/${r.invoiceId || r.invoiceNo}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[11px] font-medium text-[#4361EE] hover:underline tabular-nums" title={`Open invoice ${r.invoiceNo}`}>{r.invoiceNo}</Link>
              : <span className="block truncate text-[11px] font-medium text-zinc-500 tabular-nums">{r.invoiceNo}</span>
          )}
        </div>
      </div>
    );
  }
  if (r.kind === "ticket") {
    return (
      <div className="leading-snug select-none" title={`System-derived — ${wf.reason}`}>
        <p className={cn("font-semibold text-[12.5px]", leadResultTone(r.kind))}>Ticket Created</p>
        {r.ticketNo && (
          canViewTicket
            ? <Link href={`/tickets/${r.ticketId || r.ticketNo}`} onClick={(e) => e.stopPropagation()} className="mt-0.5 block truncate text-[11px] font-medium text-[#4361EE] hover:underline tabular-nums" title={`Open ticket ${r.ticketNo}`}>{r.ticketNo}</Link>
            : <span className="mt-0.5 block truncate text-[11px] font-medium text-zinc-500 tabular-nums">{r.ticketNo}</span>
        )}
      </div>
    );
  }
  // lead_won / pipeline / lost / na — a single restrained label.
  return (
    <span
      title={`System-derived — ${wf.reason}`}
      className={cn("inline-flex cursor-default items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold select-none", leadResultTone(r.kind))}
    >
      {r.primary}
    </span>
  );
}

/* ── Filter option shape (values from Lead Settings + live data) ──
   Plain values, or { label, value } pairs for structured fields (e.g. Agent →
   the USER ID as value, the name as label). Consumed by the faceted
   LeadFilterPanel + the applied-chip label resolution. */
type FilterOption = string | { label: string; value: string };

/* Which lead fields become facets, and how they read their options. */
const FILTER_FIELDS: { key: LeadFilterField; label: string; optionField?: LeadFieldKey }[] = [
  { key: "region",         label: "Region",          optionField: "region" },
  { key: "source",         label: "Source",          optionField: "source" },
  { key: "modeOfContact",  label: "Mode of Lead",    optionField: "modeOfContact" },
  // People filters query the structured USER ID (owner / follow-up agent).
  { key: "assignedTo",     label: "Agent (owner)" },
  { key: "contactStatus",  label: "Contact Status",  optionField: "contactStatus" },
  { key: "leadCategory",   label: "Lead Category",   optionField: "leadCategory" },
  { key: "subCategory",    label: "Sub Category",    optionField: "subCategory" },
  { key: "qualification",  label: "Qualification",  optionField: "qualification" },
  { key: "leadNature",     label: "Lead Nature",     optionField: "leadNature" },
  { key: "result",         label: "Result",          optionField: "result" },
  { key: "priority",       label: "Priority",        optionField: "priority" },
  { key: "device",         label: "Device",          optionField: "device" },
  { key: "deviceCategoryId", label: "Device Category" },
  { key: "deviceBrandId",  label: "Device Brand" },
  { key: "fulfilmentRoute", label: "Route" },
  { key: "category",       label: "Category",        optionField: "category" },
  { key: "followUpAgentId", label: "Follow-Up Agent" },
  { key: "finalResult",    label: "Final Result",    optionField: "finalResult" },
];

// Shared 8-option date-range vocabulary (matches Tickets / Dashboard).
const DATE_RANGES = LEAD_DATE_RANGES;

const FOLLOWUP_FILTERS = [
  { value: "any", label: "Follow-up: Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "has", label: "Has follow-up" },
  { value: "none", label: "No follow-up" },
] as const;

export default function LeadsListPage() {
  const { leads, filteredLeads, hydrated, filters, setFilters, clearFilters, optionsFor, deleteLead, pinLead, changeLeadStatus, updateLead, salesAgents, openFollowUpsByLead } = useLeads();
  const canAssign = useCanAssignLeads();
  const { currentUser, can } = usePermissions();

  /* ── Live operational records for SYSTEM-DERIVED Action / Result / Store ──
     Action and Result are NEVER stored on the lead. They are derived at read
     time from the REAL linked records — the store's tickets / invoices /
     walk-ins and the field jobs — via `deriveLeadWorkflow` (mirrors
     `field-resolve.ts`). These are already store-scoped by their providers +
     RLS, so a lead never resolves an unauthorized store's records. */
  const { tickets, invoices, walkIns } = useStore();
  const { jobs: fieldJobs } = useField();
  /* When a status becomes "Pickup Assigned" / "On site Assigned", also create
     (or reuse) the matching Field Job in the Pickup & Drop workspace, carrying
     the lead's agent — reuses the single field system (never a fork). */
  const autoFieldJobForStatus = useLeadStatusFieldJob();
  const canViewTicket = allow(can, CAP.ticket.view);
  const canViewInvoice = allow(can, CAP.invoice.view);
  const workflowSources = useMemo<LeadWorkflowSources>(
    () => ({ tickets, invoices, walkIns, fieldJobs }),
    [tickets, invoices, walkIns, fieldJobs],
  );
  /* Per-lead derived workflow, recomputed when leads or any linked record set
     changes (the canonical relationships drive it — never a manual sync). */
  const workflowByLead = useMemo(() => {
    // NOTE: `Map` is the lucide icon in this file — use a plain record.
    const m: Record<string, LeadWorkflow> = {};
    for (const l of leads) {
      const openFollowUpDue = openFollowUpRowState(openFollowUpsByLead.get(l.id)) !== "none";
      m[l.id] = deriveLeadWorkflow(l, workflowSources, { openFollowUpDue });
    }
    return m;
  }, [leads, workflowSources, openFollowUpsByLead]);
  // Bulk-action capability gates (granular key OR coarse fallback via CAP).
  const canBulkStatus = allow(can, CAP.lead.stageChange);
  const canBulkDelete = allow(can, CAP.lead.delete);
  // Multi-store: show the shared Store Context column only in the consolidated
  // All-Shops view with >1 authorized store (Design System v2 multi-store rule).
  const { isAllShops, stores, getStore } = useStoreContext();
  const multiStore = isAllShops && stores.length > 1;

  /* ── Frozen columns (professional data-grid) ──────────────────────────────
     Lead ID is permanently frozen LEFT, Last Action permanently frozen RIGHT;
     the user may additionally freeze middle columns to the left. Persisted
     per-user. `frozenCellProps(key)` returns the sticky className + inline
     left/right offset for any column so the header and body cells stay in
     lockstep with the real column widths. */
  const gridColumns = useMemo(() => leadGridColumns(multiStore), [multiStore]);
  const frozen = useFrozenColumns("leads-list", currentUser?.id, gridColumns);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollEdges(scrollRef);

  /* The grid is a BOUNDED dual-axis scroll container: it scrolls both axes
     internally, with the <thead> sticky to its own top. We bound its height so
     its bottom lands near the viewport bottom (leaving room for the detached
     pagination footer). Measured from the grid's live distance to the top of
     the viewport, so it stays correct regardless of how tall the filters above
     it are, and re-measures on resize. */
  const [gridMaxH, setGridMaxH] = useState<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const FOOTER_RESERVE = 72; // space kept below the grid for the pagination row
    const measure = () => {
      const top = el.getBoundingClientRect().top; // distance from viewport top
      setGridMaxH(Math.max(240, window.innerHeight - top - FOOTER_RESERVE));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => { window.removeEventListener("resize", measure); ro.disconnect(); };
  }, [hydrated]);

  // Width of the always-frozen selection column (sits before the Lead ID
  // anchor). The hook owns the Lead ID left anchor, so every hook-computed left
  // offset is shifted right by this width, and the select column itself is
  // pinned at offset 0.
  const selectColWidth = gridColumns.find((g) => g.key === "select")?.width ?? 0;

  const frozenCellProps = useCallback(
    (key: string): { className: string; style?: React.CSSProperties } => {
      // Selection column — always frozen at the very left edge (offset 0).
      if (key === "select") {
        return {
          className: "rox-frozen rox-frozen-left",
          style: { ["--rox-frozen-offset" as any]: "0px" },
        };
      }
      // LEFT frozen block — cumulative offset = select width + sum of widths of
      // any frozen columns BEFORE this one.
      const leftIdx = frozen.leftKeys.indexOf(key);
      if (leftIdx >= 0) {
        let offset = selectColWidth;
        for (let i = 0; i < leftIdx; i++) {
          const c = gridColumns.find((g) => g.key === frozen.leftKeys[i]);
          offset += c?.width ?? 0;
        }
        const isLast = leftIdx === frozen.leftKeys.length - 1;
        return {
          className: cn("rox-frozen rox-frozen-left", isLast && "rox-frozen-left-edge"),
          style: { ["--rox-frozen-offset" as any]: `${offset}px` },
        };
      }
      // RIGHT frozen anchor (single column).
      if (key === frozen.rightKey) {
        return { className: "rox-frozen rox-frozen-right rox-frozen-right-edge", style: { ["--rox-frozen-offset" as any]: "0px" } };
      }
      return { className: "" };
    },
    [frozen.leftKeys, frozen.rightKey, gridColumns, selectColWidth],
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  // ── Multiselect (matches Tickets/Walk-In) ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [routeLeadTarget, setRouteLeadTarget] = useState<Lead | null>(null);
  // Lead whose Device & Issue details popup is open (mirrors the Ticket /
  // Walk-In device-details overlay). One popup for single OR multiple devices.
  const [deviceDetailsLead, setDeviceDetailsLead] = useState<Lead | null>(null);

  /* Merge configured Settings options with values actually present in data. */
  const distinct = (key: keyof Lead) => Array.from(new Set(leads.map((l) => String(l[key] || "")).filter(Boolean)));
  const optionsForFilter = (f: { key: LeadFilterField; optionField?: LeadFieldKey }): FilterOption[] => {
    if (f.key === "assignedTo" || f.key === "followUpAgentId") {
      // Current Sales Agents + anyone already on a visible lead (historical
      // owners stay filterable). value = user id, label = name.
      const nameKey = f.key === "assignedTo" ? "assignedToName" : "followUpAgent";
      // (plain record — `Map` is the lucide icon in this file)
      const byId: Record<string, string> = {};
      for (const a of salesAgents) byId[a.id] = a.name;
      for (const l of leads) {
        const id = String(l[f.key] || "");
        if (id && !byId[id]) byId[id] = String(l[nameKey] || "Former agent");
      }
      return Object.entries(byId)
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    const configured = f.optionField ? optionsFor(f.optionField).map((o) => o.value) : [];
    const fromData = distinct(f.key as keyof Lead);
    return Array.from(new Set([...configured, ...fromData])).sort();
  };

  /* Status tabs are derived from the data (configurable), plus "All". */
  const statusTabs = useMemo(() => {
    const set = Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));
    return [{ label: "All", value: "" }, ...set.map((s) => ({ label: s, value: s }))];
  }, [leads]);

  /* Counts for the primary view segments (Not Contacted / Follow-ups).
     Derived from the scoped `leads` + open follow-ups — never a stored counter. */
  const notContactedCount = useMemo(
    () => leads.filter((l) => isNotContactedStatus(l.contactStatus)).length,
    [leads],
  );
  const followUpsCount = useMemo(
    () => leads.filter((l) => openFollowUpRowState(openFollowUpsByLead.get(l.id)) !== "none").length,
    [leads, openFollowUpsByLead],
  );
  const view = filters.view ?? "all";

  /* ── ONE combined filter strip ────────────────────────────────────────────
     Merges the primary VIEW segments (Not Contacted / Follow-Ups) with the
     lifecycle STATUS filters into a single connected control with ONE "All".
     - "All"                → view=all, status="" (the working table, unfiltered)
     - "__notContacted__"   → view=notContacted (the accountability queue)
     - "__followUps__"      → view=followUps (the follow-up table + calendar)
     - any status value     → view=all, status=<that status>
     The special view tokens are prefixed so they never collide with a real
     configured status value. */
  const NOT_CONTACTED_TAB = "__notContacted__";
  const FOLLOWUPS_TAB = "__followUps__";
  const combinedTab = view === "notContacted" ? NOT_CONTACTED_TAB
    : view === "followUps" ? FOLLOWUPS_TAB
    : filters.status || "all";
  const combinedTabs = useMemo(() => {
    // Configured lifecycle statuses (from the data), excluding the "All" entry
    // statusTabs already prepends.
    const statusOpts = statusTabs.filter((t) => t.value !== "").map((t) => ({ label: t.label, value: t.value }));
    return [
      { label: "All", value: "all" },
      { label: <ViewTabLabel text="Not Contacted" count={notContactedCount} active={view === "notContacted"} />, value: NOT_CONTACTED_TAB },
      { label: <ViewTabLabel text="Follow-Ups" count={followUpsCount} active={view === "followUps"} />, value: FOLLOWUPS_TAB },
      ...statusOpts,
    ];
  }, [statusTabs, notContactedCount, followUpsCount, view]);
  const onCombinedTabChange = useCallback((v: string) => {
    if (v === NOT_CONTACTED_TAB) { setFilters((f) => ({ ...f, view: "notContacted" })); return; }
    if (v === FOLLOWUPS_TAB) { setFilters((f) => ({ ...f, view: "followUps" })); return; }
    // "all" or a specific status → the working view, optionally status-filtered.
    setFilters((f) => ({ ...f, view: "all", status: v === "all" ? "" : v }));
  }, [setFilters]);

  /* Reset to page 1 + scroll the grid back to the top whenever the filtered
     dataset changes (filter/search/page-size). Freeze config is untouched. */
  useEffect(() => {
    setPage(1);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // A changed filter set can hide selected rows — clear the selection so the
    // bulk bar never acts on leads the user can no longer see.
    setSelected(new Set());
    setShowBulkStatus(false);
  }, [filters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredLeads, currentPage, pageSize],
  );

  /* ── Selection handlers (select-all spans the whole filtered set, like the
     Tickets table; the header checkbox shows indeterminate for a partial set). */
  const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => selected.has(l.id));
  const someSelected = filteredLeads.some((l) => selected.has(l.id));
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(filteredLeads.map((l) => l.id)));
  }, [allSelected, filteredLeads]);
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const clearSelection = useCallback(() => { setSelected(new Set()); setShowBulkStatus(false); }, []);

  /* Bulk status — apply the chosen lifecycle status to every selected lead via
     the standard changeLeadStatus (writes status-history + terminal timestamps
     per lead; never a raw bulk write). */
  const statusOptions = useMemo(() => optionsFor("status").map((o) => o.value).filter(Boolean), [optionsFor]);
  const contactStatusOptions = useMemo(() => optionsFor("contactStatus").map((o) => o.value).filter(Boolean), [optionsFor]);
  const canEditLead = allow(can, CAP.lead.edit);
  /* Apply a status change to ONE lead, then auto-create the Field Job when the
     status is a pickup/on-site routing status. Shared by the inline dropdown
     and the bulk action so both behave identically. */
  const applyLeadStatus = useCallback(async (lead: Lead, status: string) => {
    await changeLeadStatus(lead.id, status);
    await autoFieldJobForStatus(lead, status);
  }, [changeLeadStatus, autoFieldJobForStatus]);

  const handleBulkStatusChange = useCallback(async (status: string) => {
    const ids = Array.from(selected);
    const chosen = leads.filter((l) => ids.includes(l.id));
    await Promise.all(chosen.map((l) => applyLeadStatus(l, status)));
    toast.success(`Updated ${chosen.length} lead${chosen.length === 1 ? "" : "s"} to “${status}”.`);
    setSelected(new Set());
    setShowBulkStatus(false);
  }, [selected, leads, applyLeadStatus]);

  /* Bulk delete — soft-delete each selected lead through the standard
     deleteLead (permission + RLS enforced server-side). */
  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => deleteLead(id)));
    toast.success(`Deleted ${ids.length} lead${ids.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    setShowBulkDelete(false);
  }, [selected, deleteLead]);

  const openEdit = (lead: Lead) => { setDetailLead(null); setEditLead(lead); };
  const liveDetailLead = detailLead ? leads.find((l) => l.id === detailLead.id) ?? null : null;

  const handleAction = (action: LeadAction, lead: Lead) => {
    switch (action) {
      case "view": setDetailLead(lead); break;
      case "edit": openEdit(lead); break;
      case "priority": openEdit(lead); break; // priority lives in the edit flow
      case "pin": void pinLead(lead.id, !lead.pinnedAt); break;
      case "delete": setConfirmDelete(lead); break;
      case "route": setRouteLeadTarget(lead); break;
    }
  };

  /* Open the Lead Detail view when the assigned user clicks "View Lead" in the
     assignment notification. */
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const lead = leads.find((l) => l.id === id);
      if (lead) setDetailLead(lead);
    };
    window.addEventListener(LEAD_OPEN_EVENT, handler);
    return () => window.removeEventListener(LEAD_OPEN_EVENT, handler);
  }, [leads]);

  /* Deep-link: /leads/list?lead=<id> opens that lead's detail (used by the
     assignment + follow-up-due notifications). Runs once the leads are loaded. */
  const searchParams = useSearchParams();
  const urlFilterKey = searchParams.toString();
  const appliedUrlFiltersRef = useRef("");
  /* Intelligence evidence links are refresh-safe and exact. URL values are
     allowlisted into the canonical structured filter model; RLS still decides
     which ids can actually render. */
  useEffect(() => {
    if (!urlFilterKey || appliedUrlFiltersRef.current === urlFilterKey) return;
    const recognized = ["evidenceIds", "evidenceToken", "assignedTo", "dateRange", "source", "modeOfContact", "leadCategory", "subCategory", "priority", "status", "fulfilmentRoute", "deviceCategoryId", "deviceBrandId"]
      .some((key) => searchParams.has(key));
    if (!recognized) return;
    const allowedDates = new Set<LeadDateRange>(LEAD_DATE_RANGES.map((item) => item.value));
    const requestedDate = searchParams.get("dateRange") as LeadDateRange | null;
    const resolvedEvidenceIds = resolveLeadEvidenceIds(searchParams);
    const evidenceTokenMissing = !!searchParams.get("evidenceToken") && resolvedEvidenceIds.length === 0;
    const evidenceIds = evidenceTokenMissing ? ["__evidence_unavailable__"] : resolvedEvidenceIds;
    if (evidenceTokenMissing) toast.error("Evidence cohort unavailable", { description: "This saved analytical cohort expired. Reopen the insight from Lead Intelligence." });
    const fields: LeadFilters["fields"] = {};
    for (const key of ["assignedTo", "source", "modeOfContact", "leadCategory", "subCategory", "priority", "fulfilmentRoute", "deviceCategoryId", "deviceBrandId"] as LeadFilterField[]) {
      const value = searchParams.get(key);
      if (value) fields[key] = value;
    }
    appliedUrlFiltersRef.current = urlFilterKey;
    setFilters({
      ...EMPTY_LEAD_FILTERS,
      status: searchParams.get("status") || "",
      dateRange: requestedDate && allowedDates.has(requestedDate) ? requestedDate : "all",
      customFrom: searchParams.get("from") || "",
      customTo: searchParams.get("to") || "",
      fields,
      evidenceIds,
    });
  }, [urlFilterKey, searchParams, setFilters]);
  const deepLinkLeadId = searchParams.get("lead");
  // A lead the user may not see (another agent's lead, another store) is simply
  // not returned by RLS — say so once instead of silently doing nothing.
  const [deepLinkChecked, setDeepLinkChecked] = useState<string | null>(null);
  useEffect(() => {
    if (!deepLinkLeadId) return;
    const lead = leads.find((l) => l.id === deepLinkLeadId);
    if (lead) { setDetailLead(lead); return; }
    if (hydrated && deepLinkChecked !== deepLinkLeadId) {
      setDeepLinkChecked(deepLinkLeadId);
      toast.error("Lead unavailable", { description: "This lead doesn't exist or isn't assigned to you." });
    }
  }, [deepLinkLeadId, leads, hydrated, deepLinkChecked]);

  const activeFilters = hasActiveLeadFilters(filters);

  /* Applied-filter chips — each APPLIED filter is individually removable
     (Design System v2 §3g). The panel's "Clear all" is in addition, never
     instead. Values resolve to human-readable labels; the underlying filter
     state stays structured (ids for people, raw values for fields). */
  const appliedChips = useMemo(() => {
    const chips: { label: string; value: string; onClear: () => void }[] = [];
    if (filters.evidenceIds?.length) {
      chips.push({ label: "Intelligence evidence", value: `${filters.evidenceIds.length} leads`, onClear: () => setFilters((f) => ({ ...f, evidenceIds: [] })) });
    }
    if (filters.dateRange !== "all") {
      chips.push({
        label: "Date",
        value: DATE_RANGES.find((d) => d.value === filters.dateRange)?.label ?? filters.dateRange,
        onClear: () => setFilters((f) => ({ ...f, dateRange: "all" })),
      });
    }
    if (filters.followUp !== "any") {
      const fu = FOLLOWUP_FILTERS.find((d) => d.value === filters.followUp);
      chips.push({
        label: "Follow-up",
        value: (fu?.label ?? filters.followUp).replace(/^Follow-up:\s*/i, ""),
        onClear: () => setFilters((f) => ({ ...f, followUp: "any" })),
      });
    }
    if (filters.customerLink !== "any") {
      chips.push({
        label: "Customer",
        value: filters.customerLink === "existing" ? "Existing" : "New",
        onClear: () => setFilters((f) => ({ ...f, customerLink: "any" })),
      });
    }
    for (const field of FILTER_FIELDS) {
      const v = filters.fields[field.key];
      if (!v) continue;
      // People filters store a user id → show the resolved name.
      let display = v;
      if (field.key === "assignedTo" || field.key === "followUpAgentId") {
        display = salesAgents.find((a) => a.id === v)?.name
          ?? leads.find((l) => String(l[field.key] || "") === v)?.[field.key === "assignedTo" ? "assignedToName" : "followUpAgent"]
          ?? v;
      }
      chips.push({
        label: field.label,
        value: display,
        onClear: () => setFilters((prev) => ({ ...prev, fields: { ...prev.fields, [field.key]: "" } })),
      });
    }
    return chips;
  }, [filters, salesAgents, leads, setFilters]);

  /* Facet definitions for the structured filter panel — reuse the SAME option
     resolution as the applied chips (configured Settings values + live data;
     people fields resolve id→name). */
  const filterFacets = useMemo<FacetDef[]>(
    () =>
      FILTER_FIELDS.map((f) => ({
        key: f.key,
        label: f.label,
        options: optionsForFilter(f).map((o) =>
          typeof o === "string" ? { label: o, value: o } : o,
        ),
      })),
    // optionsForFilter closes over leads/salesAgents/optionsFor; recompute when
    // the dataset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, salesAgents],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        subtitle="Every enquiry in one place — capture fast, qualify when ready, follow up on time."
        actions={
          <div className="flex items-center gap-2">
            {/* Lead follow-up bell — the current user's Due/Overdue follow-ups. */}
            <LeadFollowUpBell onOpenLead={setDetailLead} />
            <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm sm:flex">
              <Link href="/leads/list" className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white" title="List View"><List className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/kanban" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Kanban View"><LayoutGrid className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/map-view" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Map View"><Map className="h-3.5 w-3.5" /></Link>
            </div>
            <Can permission={CAP.lead.create}>
              <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Lead
              </Button>
            </Can>
          </div>
        }
      />

      {/* DATE-RANGE strip — the SAME connected 8-option control used on Tickets,
          Walk-In, Field and the Dashboard (All / Today / Yesterday / 7 Days /
          1 Month / Last Month / 1 Year / Custom). Filters by lead creation date
          via the shared boundary logic. */}
      <div className="space-y-2">
        <div className="max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs
            value={filters.dateRange}
            onChange={(v) => setFilters((f) => ({ ...f, dateRange: v as LeadDateRange }))}
            options={LEAD_DATE_RANGES.map((d) => ({ label: d.label, value: d.value }))}
            size="sm"
          />
        </div>
        <DateRangePicker
          open={filters.dateRange === "custom"}
          from={filters.customFrom || ""}
          to={filters.customTo || ""}
          onFromChange={(v) => setFilters((f) => ({ ...f, customFrom: v, dateRange: "custom" }))}
          onToChange={(v) => setFilters((f) => ({ ...f, customTo: v, dateRange: "custom" }))}
        />
      </div>

      {/* ONE connected filter strip — the primary VIEW segments (Not Contacted,
          Follow-Ups) live alongside the lifecycle STATUS filters, with a single
          leading "All". Picking Not Contacted / Follow-Ups switches the view;
          picking a status filters within the working (All) view. No stacked,
          duplicate "All" pills. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs
            value={combinedTab}
            onChange={onCombinedTabChange}
            options={combinedTabs}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Customer Master linkage — New (fresh prospect) vs Existing (linked). */}
          <div className="hidden shrink-0 sm:block">
            <SegmentedTabs
              value={filters.customerLink}
              onChange={(v) => setFilters((f) => ({ ...f, customerLink: v as LeadFilters["customerLink"] }))}
              options={[
                { label: "All", value: "any" },
                { label: "New", value: "new" },
                { label: "Existing", value: "existing" },
              ]}
              size="sm"
            />
          </div>
          <div className="w-full lg:w-72">
            <Input
              value={filters.query}
              onChange={(e: any) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search ID, name, number, email, device…"
              iconLeft={<Search className="h-4 w-4" />}
            />
          </div>
          <Button
            variant={showFilters || activeFilters ? "soft" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5 rounded-full"
            onClick={() => setShowFilters(true)}
          >
            <Filter className="h-3.5 w-3.5" /> Filters
            {appliedChips.length > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-bold text-white">
                {appliedChips.length}
              </span>
            )}
          </Button>
          {/* Freeze-columns control — desktop grid only. */}
          <div className="hidden md:block">
            <FreezeColumnsMenu columns={gridColumns} state={frozen} />
          </div>
        </div>
      </div>

      {/* Structured, faceted filter panel (slide-over) — grouped sections,
          searchable facets with live counts, and a live "Show N leads"
          preview. Replaces the flat pill wall. */}
      <LeadFilterPanel
        open={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onApply={(next) => setFilters(() => next)}
        onClearAll={clearFilters}
        leads={leads}
        openFollowUpsByLead={openFollowUpsByLead}
        facets={filterFacets}
      />

      {/* Applied-filter chips — each individually removable (Design System §3g). */}
      {appliedChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {appliedChips.map((c, i) => (
            <ActiveFilterChip key={`${c.label}-${i}`} label={c.label} value={c.value} onClear={c.onClear} />
          ))}
          <button
            onClick={clearFilters}
            className="text-[12px] font-medium text-[#4361EE] hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk selection bar — appears when one or more leads are selected.
          Mirrors the Tickets/Walk-In bulk bar (Change Status + Delete), each
          action permission-gated. */}
      {someSelected && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-xs font-semibold text-[#4361EE]">
            {selected.size} selected
          </span>
          {canBulkStatus && statusOptions.length > 0 && (
            <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkStatus((v) => !v)}>
              <RefreshCw className="h-3 w-3" /> Change Status
            </Button>
          )}
          {canBulkDelete && (
            <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkDelete(true)}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          )}
          <button onClick={clearSelection} className="ml-1 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </motion.div>
      )}

      {/* Bulk status picker — one connected row of the configured lifecycle
          statuses. Applied via changeLeadStatus per lead. */}
      {showBulkStatus && someSelected && canBulkStatus && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <span className="text-xs font-medium text-indigo-700">Change {selected.size} lead{selected.size > 1 ? "s" : ""} to:</span>
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={() => void handleBulkStatusChange(s)}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 ring-inset transition hover:scale-105", statusTone(s))}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />{s}
            </button>
          ))}
          <button onClick={() => setShowBulkStatus(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </motion.div>
      )}

      {/* FOLLOW-UPS view — the Walk-In-style follow-up table + calendar. It
          replaces the data-grid for this segment (its own Active/History table
          and month calendar), so multiple follow-ups per lead are planned and
          reviewed in one place. */}
      {view === "followUps" ? (
        <LeadFollowUpView leads={filteredLeads} onOpenLead={setDetailLead} />
      ) : (
      <>
      {/* Not-Contacted accountability banner — explains the queue + the lock. */}
      {view === "notContacted" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12.5px] text-amber-800">
          Leads still marked <span className="font-semibold">Not Contacted</span>. After 48 hours with no contact a lead is
          <span className="font-semibold"> locked</span> — its Sales Agent loses access and a manager must reassign it (all other
          columns show N/A until then). Reassigning restarts the clock and gives conversion credit to the new owner.
        </div>
      )}

      {/* Desktop Data-Grid — professional CRM/ERP table (spec).
          A single BOUNDED, DUAL-SCROLL container scrolls BOTH axes internally.
          - <thead> is `sticky top-0` relative to THIS container → frozen while
            vertically scrolling.
          - Lead ID (left) + Last Action (right) columns are `position: sticky`
            (rox-frozen) → frozen while horizontally scrolling; the user may
            freeze extra columns to the left. Header + body use the same
            frozenCellProps(key) so offsets stay in lockstep with the column
            widths. One coordinated scroll model — no duplicated tables, no JS
            scroll-sync. Sharp 2px frame + brand header preserved. */}
      <div
        ref={scrollRef}
        className="rox-table-card rox-grid-scroll shadow-card hidden md:block overflow-auto"
        style={gridMaxH ? { maxHeight: gridMaxH } : undefined}
      >
        {/* Explicit per-column pixel widths (deterministic with table-fixed) so
            every grouped column gets a generous width AND the frozen offsets
            line up exactly. The min-width equals their sum; the container
            scrolls horizontally on narrower viewports. */}
        <table className="w-full min-w-[2822px] table-fixed text-[14px]">
          <colgroup>
            {gridColumns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead className="rox-table-head sticky top-0 z-[6]">
            <tr className="text-left text-[12px] font-bold uppercase tracking-wider">
              <th {...mergeFrozen(frozenCellProps("select"), "px-3 py-4 text-left")}>
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={toggleAll}
                  aria-label="Select all leads"
                />
              </th>
              <th {...mergeFrozen(frozenCellProps("date"), "px-3 py-4 text-left")}>Date</th>
              {multiStore && <th className="px-3 py-4 text-left">Store</th>}
              <th {...mergeFrozen(frozenCellProps("id"), "px-4 py-4 text-left")}>ID</th>
              <th {...mergeFrozen(frozenCellProps("region"), "px-3 py-4 text-left")}>Region</th>
              <th {...mergeFrozen(frozenCellProps("mode"), "px-3 py-4 text-left")}>Mode of Lead</th>
              <th {...mergeFrozen(frozenCellProps("source"), "px-3 py-4 text-left")}>Source</th>
              <th {...mergeFrozen(frozenCellProps("agent"), "px-3 py-4 text-left")}>Agent</th>
              <th {...mergeFrozen(frozenCellProps("contactStatus"), "px-3 py-4 text-left")}>Contact Status</th>
              <th {...mergeFrozen(frozenCellProps("contactInfo"), "px-3 py-4 text-left")}>Contact Info</th>
              <th {...mergeFrozen(frozenCellProps("device"), "px-3 py-4 text-left")}>Device &amp; Issue</th>
              <th {...mergeFrozen(frozenCellProps("value"), "px-3 py-4 text-left")}>Lead Value</th>
              <th {...mergeFrozen(frozenCellProps("leadCategory"), "px-3 py-4 text-left")}>Lead Category</th>
              <th {...mergeFrozen(frozenCellProps("comment"), "px-3 py-4 text-left")}>Comment</th>
              <th {...mergeFrozen(frozenCellProps("subCategory"), "px-3 py-4 text-left")}>Sub Category</th>
              <th {...mergeFrozen(frozenCellProps("leadType"), "px-3 py-4 text-left")}>Lead Type</th>
              <th {...mergeFrozen(frozenCellProps("status"), "px-3 py-4 text-left")}>Status</th>
              {/* ACTION + RESULT are SYSTEM-DERIVED (read-only). A small lock
                  glyph in the header signals they are not editable. */}
              <th {...mergeFrozen(frozenCellProps("action"), "px-3 py-4 text-left")}><span className="inline-flex items-center gap-1"><Lock className="h-3 w-3 opacity-50" aria-hidden />Action</span></th>
              <th {...mergeFrozen(frozenCellProps("storeCol"), "px-3 py-4 text-left")}>Store</th>
              <th {...mergeFrozen(frozenCellProps("result"), "px-3 py-4 text-left")}><span className="inline-flex items-center gap-1"><Lock className="h-3 w-3 opacity-50" aria-hidden />Result</span></th>
              <th {...mergeFrozen(frozenCellProps("actions"), "px-3 py-4 text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((lead, i) => {
              const fuState = openFollowUpRowState(openFollowUpsByLead.get(lead.id));
              const tint = followUpTone(fuState).rowTint;
              const tinted = !!tint || !!lead.pinnedAt;
              // A LOCKED Not-Contacted lead: it only reaches the grid for a
              // senior/owner (a plain Sales Agent's scope hides it). Everything
              // but Contact Status + the reassign control is masked to N/A until
              // it's reassigned — so the flow is not visible to anyone until a
              // new owner picks it up.
              const locked = isNotContactedLocked(lead);
              // System-derived workflow (Action / Result / Store) for this lead.
              const wf = workflowByLead[lead.id] ?? deriveLeadWorkflow(lead, workflowSources);
              // Downstream (qualification-dependent) columns render N/A when the
              // lead is Not-Contacted or Not-Qualified (progressive gate) OR when
              // it's a locked stale lead. Core identity is never gated.
              const gated = locked || isDownstreamGated(lead);
              const storeBranchId = deriveLeadStoreBranchId(lead, workflowSources);
              // Resolved SOLID colour matching the row's (semi-transparent) tint,
              // handed to the frozen cells as --rox-row-tint so they can layer
              // the SAME tint over their opaque base (no bleed-through). The
              // follow-up tint (red) wins over the pinned tint (purple), matching
              // the class order above.
              // Must resolve to the SAME final colour as the scrolling cells'
              // Tailwind tint (followUpTone → bg-red-100/{90,70,60}). red-100 =
              // rgb(254 226 226); use the identical colour + alpha here so the
              // frozen block and the middle cells composite to one shade (no
              // seam). Pinned mirrors bg-[#7C5CFC]/[0.04].
              const rowTintVar = tint
                ? (fuState === "overdue" ? "rgb(254 226 226 / 0.9)"
                  : fuState === "today" ? "rgb(254 226 226 / 0.7)"
                  : "rgb(254 226 226 / 0.6)")
                : lead.pinnedAt ? "rgb(124 92 252 / 0.04)" : undefined;
              return (
              <motion.tr
                key={lead.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.02 * i, 0.3) }}
                onClick={() => setDetailLead(lead)}
                style={rowTintVar ? ({ ["--rox-row-tint" as any]: rowTintVar }) : undefined}
                className={cn(
                  "rox-table-row group h-[76px] cursor-pointer align-middle transition",
                  // Hover tint only for un-tinted rows — a tinted (pinned/overdue)
                  // row keeps its own colour on hover so the shade never shifts.
                  !tinted && "hover:bg-muted/40",
                  lead.pinnedAt && "bg-[#7C5CFC]/[0.04]",
                  // Whole-row urgency from the STRUCTURED open follow-up (overdue
                  // active follow-up → entire row reads red), mirroring the
                  // Ticket overdue row treatment. Datetime-precise.
                  tint,
                  // Tinted rows tell frozen cells to layer the SAME tint over
                  // their opaque base so the pinned/overdue tint shows through
                  // the sticky columns without ever going transparent.
                  tinted && "rox-frozen-tinted",
                )}
              >
                {/* 0 · Selection — FROZEN LEFT (before the Lead ID anchor) */}
                <td {...mergeFrozen(frozenCellProps("select"), "px-3 py-4 align-middle")} onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                    aria-label={`Select lead ${lead.leadNo || lead.id}`}
                  />
                </td>
                {/* 1 · Date + time — FROZEN LEFT anchor */}
                <td {...mergeFrozen(frozenCellProps("date"), "px-3 py-4 align-middle")}>{locked ? <NACell /> : <DateCell lead={lead} />}</td>
                {/* Store (multi-store only) */}
                {multiStore && (
                  <td className="px-3 py-4 align-middle"><StoreContextCell store={getStore(lead.branchId || null)} mode="stacked" /></td>
                )}
                {/* 2 · ID (click opens the lead) */}
                <td {...mergeFrozen(frozenCellProps("id"), "px-4 py-4 align-middle")}>
                  <button onClick={(e) => { e.stopPropagation(); setDetailLead(lead); }} className="flex items-center gap-1 text-left font-semibold text-[#4361EE] hover:underline tnum">
                    {lead.pinnedAt && <Pin className="h-3.5 w-3.5 shrink-0 fill-[#7C5CFC] text-[#7C5CFC]" aria-label="Pinned" />}
                    {lead.leadNo || "—"}
                  </button>
                </td>
                {/* 3 · Region */}
                <td {...mergeFrozen(frozenCellProps("region"), "px-3 py-4 align-middle")}>{locked ? <NACell /> : <span className="block truncate uppercase text-zinc-700">{lead.region || "—"}</span>}</td>
                {/* 4 · Mode of Lead (how it came in — modeOfContact) */}
                <td {...mergeFrozen(frozenCellProps("mode"), "px-3 py-4 align-middle")}>{locked ? <NACell /> : <span className="block truncate text-zinc-700">{lead.modeOfContact || "—"}</span>}</td>
                {/* 5 · Source + capture channel */}
                <td {...mergeFrozen(frozenCellProps("source"), "px-3 py-4 align-middle")}>{locked ? <NACell /> : <SourceCell lead={lead} />}</td>
                {/* 5 · Agent (owner — user id → name). Even when LOCKED this
                    stays the reassign control — that's how a senior hands the
                    stale lead to a new owner and unlocks the flow. */}
                <td {...mergeFrozen(frozenCellProps("agent"), "px-3 py-4 align-middle")} onClick={(e) => e.stopPropagation()}>
                  {canAssign ? <AssignMenu lead={lead} compact /> : <AssignBadge lead={lead} size={22} />}
                </td>
                {/* 6 · Contact Status — inline-editable dropdown; locked rows stay read-only */}
                <td {...mergeFrozen(frozenCellProps("contactStatus"), "px-3 py-4 align-middle")} onClick={(e) => e.stopPropagation()}>
                  <ContactStatusCell
                    lead={lead}
                    options={contactStatusOptions}
                    onSave={(v) => updateLead(lead.id, { contactStatus: v })}
                    locked={locked || !canEditLead}
                  />
                  {locked && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-600">Locked · reassign to unlock</span>}
                </td>
                {/* 7 · Contact Info (grouped) */}
                <td {...mergeFrozen(frozenCellProps("contactInfo"), "px-3 py-4 align-middle")}>{locked ? <NACell /> : <ContactInfoCell lead={lead} />}</td>
                {/* 8 · Device & Issue (grouped) — gated until contacted+qualified */}
                <td {...mergeFrozen(frozenCellProps("device"), "px-3 py-4 align-middle")} onClick={(e) => e.stopPropagation()}>{gated ? <NACell /> : <DeviceIssueCell lead={lead} onOpen={setDeviceDetailsLead} />}</td>
                {/* 9 · Lead Value (pipeline) — gated */}
                <td {...mergeFrozen(frozenCellProps("value"), "px-3 py-4 align-middle")}>{gated ? <NACell /> : <LeadValueCell lead={lead} />}</td>
                {/* 10 · Lead Category — gated */}
                <td {...mergeFrozen(frozenCellProps("leadCategory"), "px-3 py-4 align-middle")}>{gated ? <NACell /> : <span className="block truncate text-zinc-700">{lead.leadCategory || "—"}</span>}</td>
                {/* 11 · Comment — the Not-Qualified REASON stays readable here
                    (never masked to N/A) so the qualification decision is
                    preserved; a plain lead shows its comments. */}
                <td {...mergeFrozen(frozenCellProps("comment"), "px-3 py-4 align-middle")}>{locked ? <NACell /> : <CommentCell text={lead.comments || lead.finalRemarks || ""} />}</td>
                {/* 12 · Sub Category — gated */}
                <td {...mergeFrozen(frozenCellProps("subCategory"), "px-3 py-4 align-middle")}>{gated ? <NACell /> : <span className="block truncate text-zinc-600">{lead.subCategory || "—"}</span>}</td>
                {/* 13 · Lead Type (= Priority: Hot/Warm/Cold) — gated */}
                <td {...mergeFrozen(frozenCellProps("leadType"), "px-3 py-4 align-middle")}>{gated ? <NACell /> : lead.priority ? <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold", priorityTone(lead.priority))}><Flag className="h-3.5 w-3.5" fill="currentColor" /> {lead.priority}</span> : <span className="text-zinc-400">—</span>}</td>
                {/* 14 · Status (+ fulfilment route) — inline-editable dropdown (gated on canBulkStatus) */}
                <td {...mergeFrozen(frozenCellProps("status"), "px-3 py-4 align-middle")} onClick={(e) => e.stopPropagation()}>
                  {gated ? <NACell /> : (<>
                  <LeadSelectCell
                    value={lead.status || ""}
                    options={statusOptions}
                    onChange={(v) => applyLeadStatus(lead, v)}
                    toneClass={lead.status ? statusTone(lead.status) : "bg-zinc-50 text-zinc-400 ring-zinc-200"}
                    dotColor={statusDotColor(lead.status || "")}
                    readOnly={!canBulkStatus}
                  />
                  </>)}
                </td>
                {/* 15 · ACTION — SYSTEM-DERIVED, read-only */}
                <td {...mergeFrozen(frozenCellProps("action"), "px-3 py-4 align-middle")}>{gated ? <NACell /> : <ActionCell wf={wf} />}</td>
                {/* 16 · STORE — derived from the actual operational record */}
                <td {...mergeFrozen(frozenCellProps("storeCol"), "px-3 py-4 align-middle")}>{gated ? <NACell /> : (storeBranchId ? <StoreContextCell store={getStore(storeBranchId)} mode="stacked" /> : <span className="text-zinc-400">—</span>)}</td>
                {/* 17 · RESULT — SYSTEM-DERIVED, read-only (₹value + TKT + INV) */}
                <td {...mergeFrozen(frozenCellProps("result"), "px-3 py-4 align-middle")}>{gated ? <NACell /> : <ResultCell wf={wf} canViewTicket={canViewTicket} canViewInvoice={canViewInvoice} />}</td>
                {/* Last Action — FROZEN RIGHT anchor */}
                <td {...mergeFrozen(frozenCellProps("actions"), "px-3 py-4 text-right align-middle")} onClick={(e) => e.stopPropagation()}>
                  <LeadActionsMenu lead={lead} onAction={handleAction} />
                </td>
              </motion.tr>
              );
            })}
          </tbody>
        </table>
        {hydrated && filteredLeads.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><User className="h-6 w-6" /></div>
            <p className="font-semibold">{leads.length === 0 ? "No leads yet" : "No leads match your filters"}</p>
            <p className="text-sm text-muted-foreground">{leads.length === 0 ? "Capture your first lead in seconds." : "Try a different status, filter, or search."}</p>
            {leads.length === 0 && <Can permission={CAP.lead.create}><Button size="sm" className="mt-2 gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> Add Lead</Button></Can>}
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading leads…</div>}
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((lead) => {
          const mLocked = isNotContactedLocked(lead);
          return (
          <div key={lead.id} onClick={() => setDetailLead(lead)} className={cn("cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-card", selected.has(lead.id) && "border-[#4361EE] ring-1 ring-[#4361EE]/20", lead.pinnedAt && "border-[#7C5CFC]/30", followUpTone(openFollowUpRowState(openFollowUpsByLead.get(lead.id))).rowTint)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Checkbox
                  checked={selected.has(lead.id)}
                  onChange={() => toggleOne(lead.id)}
                  aria-label={`Select lead ${lead.leadNo || lead.id}`}
                />
                <Avatar name={lead.name || lead.leadNo} size={36} />
                <div>
                  <p className="flex items-center gap-1 font-semibold">
                    {lead.pinnedAt && <Pin className="h-3 w-3 fill-[#7C5CFC] text-[#7C5CFC]" />}
                    {lead.name || "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{lead.leadNo}{mLocked ? "" : ` · ${lead.source || "—"}`}</p>
                </div>
              </div>
              {mLocked
                ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">Not Contacted · Locked</span>
                : lead.status && <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span>}
            </div>
            {mLocked ? (
              <div className="mt-3 border-t border-border pt-3 text-[12px] text-muted-foreground">
                Locked after 48h with no contact — a manager must reassign to unlock the flow.
              </div>
            ) : (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px]">
              {getLeadDevices(lead).length > 0 ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); setDeviceDetailsLead(lead); }} className="inline-flex items-center gap-1 text-zinc-600 hover:text-[#4361EE]">
                  {lead.device || "Device"}
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" />
                </button>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
              {lead.priority && <span className={cn("flex items-center gap-1 font-semibold", priorityTone(lead.priority))}><Flag className="h-3 w-3" fill="currentColor" /> {lead.priority}</span>}
              <FollowUpCell lead={lead} open={openFollowUpsByLead.get(lead.id)} />
            </div>
            )}
            <div className="mt-2 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
              {canAssign ? <AssignMenu lead={lead} compact /> : <AssignBadge lead={lead} size={20} />}
              {!mLocked && <LeadActionsMenu lead={lead} onAction={handleAction} />}
            </div>
          </div>
          );
        })}
        {hydrated && filteredLeads.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {leads.length === 0 ? "No leads yet." : "No leads match your filters."}
          </div>
        )}
      </div>

      {/* Pagination — DETACHED footer (bare sibling below the table frame, per
          the Design System table standard). Page sizes 10/20/50/100. */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredLeads.length}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        itemLabel="lead"
      />
      </>
      )}

      {/* Create / Edit flow */}
      <LeadCaptureFlow open={showCreate} onClose={() => setShowCreate(false)} />
      <LeadCaptureFlow open={!!editLead} onClose={() => setEditLead(null)} editLead={editLead} />

      {/* Detail drawer — always renders the LIVE lead (so inline saves, a
          reassignment or a follow-up change show immediately); if the lead
          leaves the user's scope (e.g. handed to another agent) it closes. */}
      <LeadDetailDrawer
        lead={liveDetailLead}
        open={!!liveDetailLead}
        onClose={() => setDetailLead(null)}
        onEdit={openEdit}
        onDelete={(l) => { setDetailLead(null); setConfirmDelete(l); }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { if (confirmDelete) void deleteLead(confirmDelete.id); }}
        title="Delete lead?"
        description={confirmDelete ? `${confirmDelete.leadNo} · ${confirmDelete.name || "Unnamed"} will be removed. This can't be undone.` : ""}
        confirmLabel="Delete"
        danger
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => void handleBulkDelete()}
        title={`Delete ${selected.size} lead${selected.size > 1 ? "s" : ""}?`}
        description="This action cannot be undone. All selected leads will be removed."
        confirmLabel={`Delete ${selected.size} Lead${selected.size > 1 ? "s" : ""}`}
        danger
      />

      {/* Route / Assign fulfilment dialog */}
      <RouteLeadDialog
        lead={routeLeadTarget}
        open={!!routeLeadTarget}
        onClose={() => setRouteLeadTarget(null)}
      />

      {/* Device & Issue details popup — mirrors the Ticket / Walk-In device
          overlay. One consistent popup for a single OR multiple devices. */}
      <LeadDeviceDetailsOverlay
        lead={deviceDetailsLead}
        open={!!deviceDetailsLead}
        onClose={() => setDeviceDetailsLead(null)}
      />
    </div>
  );
}
