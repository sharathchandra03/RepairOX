"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Plus, User, LayoutGrid, List, Map, Flag, X, ChevronDown, CalendarClock, Pin,
  Phone, Mail, RefreshCw, Trash2, Check, SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { ActiveFilterChip } from "@/components/ui/rox-filter";
import { DateTimeDialog } from "@/components/ui/date-time-picker";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { EmptyDash } from "@/components/common/empty-dash";
import { LeadFilterPanel, type FacetDef } from "@/components/leads/lead-filter-panel";
import { FreezeColumnsMenu } from "@/components/common/freeze-columns-menu";
import { CustomizeColumnsMenu } from "@/components/common/customize-columns-menu";
import { useFrozenColumns, type GridColumn } from "@/hooks/use-frozen-columns";
import { useColumnOrder } from "@/hooks/use-column-order";
import { useWorkspaceCollapsed } from "@/hooks/use-workspace-collapsed";
import { WorkspaceCollapseBar } from "@/components/common/workspace-collapse-bar";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import {
  deriveLeadWorkflow, deriveLeadStoreBranchId, isDownstreamGated, isNotQualified,
  leadActionTone, leadResultTone,
  type LeadWorkflow, type LeadWorkflowSources,
} from "@/lib/lead-workflow";
import { Lock } from "lucide-react";
import { Can } from "@/components/common/can";
import { CAP, allow } from "@/lib/capabilities";
import { toast } from "@/components/ui/toaster";
import { cn, formatINR } from "@/lib/utils";
import { useLeads, LEAD_OPEN_EVENT } from "@/lib/leads-context";
import { useDeals } from "@/lib/lead-deals-context";
import { isDiscountedLeadValue, leadHasOpenDeal, currentDealForLead } from "@/lib/lead-deals";
import { useDealConversationSeen } from "@/hooks/use-deal-conversation-seen";
import { useQuotations } from "@/lib/quotations-context";
import { SendQuotationFlow } from "@/components/quotations/send-quotation-flow";
import { DealRequestModal } from "@/components/deals/deal-request-modal";
import { DealConversationPopover } from "@/components/deals/deal-conversation-popover";
import { useLeadStatusFieldJob } from "@/lib/use-lead-status-field-job";
import {
  followUpState, followUpTone, hasActiveLeadFilters, openFollowUpRowState, followUpLifecycle, getLeadDevices, leadDevicesTotalEstimate, leadIsExistingCustomer, statusRequiresFollowUp, followUpNounForStatus, type LeadFollowUp,
  isNotContactedStatus, isNotContactedLocked, LEAD_DATE_RANGES, EMPTY_LEAD_FILTERS,
  type Lead, type LeadFieldKey, type LeadFilterField, type LeadDateRange, type LeadFilters,
} from "@/lib/leads-data";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { LeadFollowUpView } from "@/components/leads/lead-followup-view";
import { LeadFollowUpBell } from "@/components/leads/lead-followup-bell";
import { SalesAgentsOnline } from "@/components/leads/sales-agents-online";
import { LeadCaptureFlow } from "@/components/leads/lead-capture-flow";
import { LeadActionsMenu, type LeadAction } from "@/components/leads/lead-actions-menu";
import { RouteLeadDialog } from "@/components/leads/route-lead-dialog";
import { statusTone, priorityTone, leadNatureTone, leadNatureDot, leadNatureGlyph, qualificationTone, qualificationDot } from "@/components/leads/lead-pills";
import { AnimatedTemperatureGlyph } from "@/components/leads/animated-temperature-glyph";
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
    { key: "select", label: "", width: 44, freezable: false, reorderable: false },
    { key: "date", label: "Date", width: 92, lockedLeft: true },
  ];
  if (multiStore) cols.push({ key: "store", label: "Store", width: 132, freezable: false, reorderable: false });
  cols.push(
    // Wider than a plain "L-001" so it comfortably fits a store-prefixed id
    // (e.g. KOR-L-0045) PLUS the conversion tick + pin without wrapping.
    { key: "id", label: "Lead ID", width: 132 },
    { key: "agent", label: "Agent", width: 160 },
    // MODE OF LEAD — how the lead came in (modeOfContact). Structurally separate
    // from Source (acquisition) and Capture Channel.
    { key: "mode", label: "Mode of Lead", width: 132 },
    { key: "contactInfo", label: "Contact Info", width: 230 },
    { key: "device", label: "Device & Issue", width: 210 },
    { key: "comment", label: "Comment", width: 210 },
    { key: "value", label: "Lead Value", width: 128 },
    { key: "region", label: "Region", width: 128 },
    { key: "source", label: "Source", width: 132 },
    { key: "contactStatus", label: "Contact Status", width: 160 },
    { key: "leadCategory", label: "Lead Category", width: 168 },
    // SUB CATEGORY — the TBD column is now the real Sub Category field.
    { key: "subCategory", label: "Sub Category", width: 180 },
    { key: "leadType", label: "Lead Nature", width: 148 },
    { key: "status", label: "Status", width: 176 },
    // ACTION — SYSTEM-DERIVED, read-only (never an editable dropdown).
    { key: "action", label: "Action", width: 180 },
    // STORE — derived from the actual operational record.
    { key: "storeCol", label: "Store", width: 140 },
    // RESULT — SYSTEM-DERIVED, read-only (₹value + Ticket + Invoice).
    { key: "result", label: "Result", width: 160 },
    { key: "actions", label: "Last Action", width: 128, lockedRight: true },
  );
  return cols;
}

/* Which table columns correspond to a configurable Lead field, so their header
   follows the admin's custom field TITLE (Form Edit). Composite / system-derived
   columns (Contact Info, Device & Issue, Lead Value, Action, Result, …) are not
   listed — they are not a single configurable field. */
const COLUMN_TO_FIELD: Record<string, LeadFieldKey | undefined> = {
  mode: "modeOfContact",
  region: "region",
  source: "source",
  contactStatus: "contactStatus",
  leadCategory: "qualification",
  subCategory: "subCategory",
  leadType: "leadNature",
  status: "status",
};

/* Per-column horizontal nudge (px) applied to BOTH the header and the body
   cells so the whole column (heading + content) shifts together without
   changing column widths. Negative = move left. Used to free up space for the
   "Mode of Contact" heading: Lead Value −25px, Agent −12px. */
const COLUMN_SHIFT_X: Record<string, number | undefined> = {
  value: -4,
  agent: -12,
};

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
  if (fu === "none") return <EmptyDash />;
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
 *  Walk-In follow-up tab: white pill on the active tab, tinted pill otherwise).
 *  `tone` controls the badge accent — "red" for the accountability queues
 *  (Not Contacted / Follow-Ups) so their counts read as urgency, not a neutral
 *  blue tally. */
function ViewTabLabel({ text, count, active, tone = "blue" }: { text: string; count: number; active: boolean; tone?: "blue" | "red" }) {
  const idle = tone === "red" ? "bg-[#DC2626] text-white" : "bg-[#4361EE] text-white";
  const on = tone === "red" ? "bg-white text-[#DC2626]" : "bg-white text-[#4361EE]";
  return (
    <span className="inline-flex items-center gap-2">
      {text}
      {count > 0 && (
        <span
          className={cn(
            "inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold leading-none tabular-nums",
            active ? on : idle,
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
  return <span className="block w-full text-center text-[12px] font-medium text-zinc-400">N/A</span>;
}

/** Small circular conversion tick shown next to the Lead ID — mirrors the
 *  Ticket table's InvoiceCoverageCheck shape/size. Colour is SYSTEM-DERIVED
 *  from the lead's workflow (never stored):
 *    • GREEN  → a finalized Invoice exists for the lead (revenue realized).
 *    • BLUE   → a Ticket exists (customer's device booked), no invoice yet.
 *    • ORANGE → "Lead Won" only (routed / walk-in / field assigned), no
 *               ticket/invoice yet.
 *    • FW (amber) → an open Follow-up is being worked — ONLY when the lead has
 *               no ticket / invoice / lead-won (those always win the Action).
 *    • CROSS (red) → the lead is Lost / dropped — ONLY when the lead has no
 *               ticket / invoice / lead-won.
 *  The Follow-up and Lost states are mutually exclusive with a converted lead:
 *  the workflow derivation places Lost (step 7) and Follow-up (step 8) BELOW
 *  every operational record, so they can never surface for a lead that already
 *  has a ticket, invoice, or lead-won outcome.
 *  Nothing before that (plain pipeline / gated) shows no icon. */
function LeadStatusTick({ wf, lead }: { wf: LeadWorkflow; lead?: Lead }) {
  if (wf.gated) return null;
  const kind = wf.result.kind;
  // Invoice (green) wins, then ticket (blue), then lead-won (orange).
  let tone: "green" | "blue" | "orange" | null = null;
  let label = "";
  if (kind === "invoice") { tone = "green"; label = "🎉 Congratulations! You closed this deal — revenue is in the bank."; }
  else if (kind === "ticket" || wf.action === "ticket_created" || wf.action === "visited_store") { tone = "blue"; label = "Ticket created for this customer"; }
  else if (kind === "lead_won") { tone = "orange"; label = "🏆 Lead won! The customer is on board — close it out with a ticket & invoice."; }

  // No converted outcome → surface the Follow-up / Lost status icons. These are
  // only reachable when the lead has NO ticket / invoice / lead-won (guaranteed
  // by the derivation priority), so they never clash with a conversion tick.
  if (!tone) {
    // LOST — red circular cross (same shape/size as the tick, different glyph).
    if (wf.action === "lost" || kind === "lost") {
      return (
        <span
          className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)" }}
          title="Lead lost — closed without conversion"
          aria-label="Lead lost"
        >
          <X className="h-2 w-2" strokeWidth={3} />
        </span>
      );
    }
    // FOLLOW-UP — amber circular "FW" badge (same shape/size as the tick).
    // Surfaces for a due follow-up (derived Action) OR a lead whose own status
    // reads as "Follow-up" — never for a lost lead (handled above) and never
    // for a converted lead (guarded by `!tone`).
    const statusIsFollowUp = /follow/.test((lead?.status || "").toLowerCase());
    if (wf.action === "follow_up" || statusIsFollowUp) {
      return (
        // Follow-up badge, warm-rose language (replaces the old violet). A pale
        // fill washed the "FW" out, so we use a SATURATED rose gradient with
        // white letters — the same high-contrast treatment the green/blue/orange
        // conversion ticks use — plus a soft rose halo ring so it pops off the
        // white row. Slightly larger (16px) + extrabold so the tiny "FW" reads.
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[6.5px] font-extrabold uppercase text-white shadow-[0_0_0_2px_rgba(244,63,94,0.18)]"
          style={{ background: "linear-gradient(135deg, #FB5581 0%, #E11D48 100%)" }}
          title="Follow-up in progress — the lead is being actively worked"
          aria-label="Follow-up in progress"
        >
          {/* The glyph is centered with flex; a 1px top nudge + a left pad equal
              to the trailing letter-spacing optically centers "FW" in the tiny
              circle (uppercase cap-height + letter-spacing otherwise bias it
              up-left). */}
          <span className="relative top-[0.5px] pl-[0.5px] leading-none tracking-[0.04em]">FW</span>
        </span>
      );
    }
    return null;
  }

  const bg =
    tone === "green" ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
    : tone === "blue" ? "linear-gradient(135deg, #4361EE 0%, #3049C6 100%)"
    : "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)";
  return (
    <span
      className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-white"
      style={{ background: bg }}
      title={label}
      aria-label={label}
    >
      <Check className="h-2 w-2" strokeWidth={3} />
    </span>
  );
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
  if (!lead.source && !lead.captureChannel) return <EmptyDash />;
  return (
    <div className="leading-snug">
      {lead.source && <p className="truncate font-medium text-zinc-700">{lead.source}</p>}
      {lead.captureChannel && <p className="mt-0.5 truncate text-[12px] text-zinc-500">{lead.captureChannel}</p>}
    </div>
  );
}

/* ─── LeadSelectCell ─────────────────────────────────────────────────────
   Inline-editable dropdown for lead table cells (Status, Contact Status,
   Lead Nature). Matches the ticket StatusPillDropdown: colored dot/glyph,
   framer-motion menu, portal-positioned so it's never clipped by any scroll
   container. readOnly = plain pill with no chevron (locked / gated rows).

   PILL STANDARDIZATION (Lead Table pill standard):
   The pill FILLS the full width of its cell (`w-full`) with a stable internal
   layout — leading glyph (fixed) · truncating text (flex-1, full value in the
   `title` tooltip) · trailing chevron (fixed). Because the table is
   `table-fixed` with explicit `<colgroup>` widths, each pill column has one
   stable width that NEVER depends on the current row's text length. The
   dropdown menu width is independent of the pill width (it may be wider). No
   per-row width measurement — purely CSS-driven, so it stays performant with
   thousands of rows and correct under freeze / reorder / horizontal scroll. */
function LeadSelectCell({
  value,
  options,
  onChange,
  toneClass,
  dotColor,
  readOnly = false,
  placeholder = "—",
  glyphFor,
  reasonPromptFor,
  onChangeWithReason,
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
  /** Optional leading glyph (e.g. an emoji per value). When provided it
   *  replaces the plain colour dot on the pill and in each option row. */
  glyphFor?: (value: string) => React.ReactNode;
  /** Optional guard: when a chosen value needs a mandatory reason, return the
   *  reason-prompt config instead of committing. The cell then shows a compact
   *  inline reason box (textarea + Save) INSIDE the same popover — no full form.
   *  Returning null/undefined means the value commits normally via onChange. */
  reasonPromptFor?: (value: string) => { label: string; initial?: string } | null | undefined;
  /** Commit a value together with its mandatory reason (used by reasonPromptFor). */
  onChangeWithReason?: (value: string, reason: string) => void;
}) {
  // Leading glyph for a value — the custom glyph if provided, else the dot.
  // Leading glyph for a value — the custom glyph if provided, else the dot.
  // `animated` opts the PILL glyph into the one-shot change animation; option
  // rows and other callers stay static (default false).
  const leadGlyph = (v: string, dot: string, animated = false) =>
    glyphFor
      ? animated
        ? <AnimatedTemperatureGlyph glyph={glyphFor(v)} changeKey={v} />
        : <span className="shrink-0 text-[12px] leading-none">{glyphFor(v)}</span>
      : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const btnRef = useRef<HTMLButtonElement>(null);
  // When a chosen value needs a mandatory reason, we switch the popover from the
  // options list to a compact inline reason box instead of closing / opening a form.
  const [reasonStep, setReasonStep] = useState<{ value: string; label: string } | null>(null);
  const [reasonText, setReasonText] = useState("");
  // Type-to-filter the options list (useful for long lists like Sub Category).
  const [query, setQuery] = useState("");

  const closeMenu = () => { setOpen(false); setReasonStep(null); setReasonText(""); setQuery(""); };

  // Case-insensitive filtered options. The current value always remains
  // selectable (it's shown with a ✓) so an existing value can always be changed.
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  // Resolve what happens when an option is picked: either commit immediately, or
  // (when it needs a reason) switch the popover to the inline reason box.
  const pickOption = (opt: string) => {
    const prompt = reasonPromptFor?.(opt);
    if (prompt) {
      setReasonText(prompt.initial ?? "");
      setReasonStep({ value: opt, label: prompt.label });
      return;
    }
    onChange(opt);
    closeMenu();
  };

  // The menu is portalled to <body> so its `position: fixed` coords resolve
  // against the viewport (never the frozen-column sticky/overflow context).
  // Guard the portal so it only runs client-side (Next.js SSR).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Compute the menu position from the trigger rect: viewport-aware drop-up and
  // a horizontal clamp so a right-edge pill doesn't push the menu off-screen.
  const computePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const dropUp = window.innerHeight - r.bottom < 280;
    const menuWidth = reasonStep ? 260 : 220;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8));
    setPos({
      top: dropUp ? undefined : r.bottom + 6,
      bottom: dropUp ? window.innerHeight - r.top + 6 : undefined,
      left,
      dropUp,
    });
  }, [reasonStep]);

  // Keep the menu glued to its pill: recompute on scroll (capture phase, so the
  // inner grid scroll container is caught too) and on resize while open.
  useEffect(() => {
    if (!open) return;
    computePos();
    const onScroll = () => computePos();
    const onResize = () => computePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, computePos]);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open) computePos();
    if (open) closeMenu(); else setOpen(true);
  };

  if (readOnly) {
    // Read-only pill — same full-width geometry as the editable pill (minus the
    // chevron) so a view-tier / locked row's pill lines up with editable rows.
    return value
      ? <span
          title={value}
          className={cn("flex h-7 w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", toneClass)}
        >
          {leadGlyph(value, dotColor, true)}
          <span className="min-w-0 flex-1 truncate">{value}</span>
        </span>
      : <span className="flex h-7 w-full items-center px-2.5 text-[11px] text-zinc-400">{placeholder}</span>;
  }

  return (
    <div className="relative block w-full" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title={value || undefined}
        className={cn(
          "flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-left text-[11px] font-medium ring-1 ring-inset transition hover:shadow-sm",
          value ? toneClass : "bg-zinc-50 text-zinc-400 ring-zinc-200",
        )}
        style={value ? { backgroundColor: `${dotColor}15`, color: dotColor, boxShadow: `inset 0 0 0 1px ${dotColor}30` } : undefined}
      >
        {value ? leadGlyph(value, dotColor, true) : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "#a1a1aa" }} />}
        <span className="min-w-0 flex-1 truncate">{value || placeholder}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); closeMenu(); }} />
            <motion.div
              initial={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }}
              className={cn(
                "z-[70] rounded-xl border border-border bg-card shadow-xl",
                reasonStep ? "w-[260px] p-3" : "w-[220px] p-1.5",
              )}
            >
              {reasonStep ? (
                /* Inline mandatory-reason box — stays in the SAME popover, writes
                   the value + reason directly to the lead row (no full form). */
                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[11px] font-semibold text-foreground">{reasonStep.label}</p>
                  <textarea
                    autoFocus
                    rows={3}
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Add a reason (required)…"
                    className="w-full resize-none rounded-lg border border-input bg-card px-2.5 py-2 text-[12px] leading-snug text-foreground outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
                  />
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); closeMenu(); }}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!reasonText.trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        const reason = reasonText.trim();
                        if (!reason) return;
                        onChangeWithReason?.(reasonStep.value, reason);
                        closeMenu();
                      }}
                      className="rounded-lg bg-[#4361EE] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#3049C6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex max-h-[280px] flex-col" onClick={(e) => e.stopPropagation()}>
                  {/* Search box — sticky at the top so a long list stays filterable. */}
                  <div className="sticky top-0 z-10 bg-card px-1 pb-1.5">
                    <div className="flex items-center gap-1.5 rounded-lg border border-input bg-card px-2 focus-within:border-zinc-300">
                      <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search options…"
                        className="rox-search-input h-7 w-full bg-transparent text-[11px] text-foreground outline-none placeholder:text-zinc-400"
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setQuery(""); }}
                          className="shrink-0 text-zinc-400 hover:text-foreground"
                          aria-label="Clear search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Scrollable options list. */}
                  <div className="rox-rail-scroll min-h-0 flex-1 overflow-y-auto">
                    {filteredOptions.length === 0 ? (
                      <p className="px-3 py-4 text-center text-[11px] text-zinc-400">No matches</p>
                    ) : (
                      filteredOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); pickOption(opt); }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition",
                            opt === value ? "bg-indigo-50 text-[#4361EE]" : "hover:bg-zinc-50 text-foreground",
                          )}
                        >
                          {glyphFor
                            ? <span className="shrink-0 text-[13px] leading-none">{glyphFor(opt)}</span>
                            : <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                                style={{ backgroundColor: opt === value ? dotColor : "#a1a1aa" }} />}
                          <span className="min-w-0 flex-1 truncate" title={opt}>{opt}</span>
                          {opt === value && <span className="ml-auto shrink-0 text-[9px] font-bold text-[#4361EE]">✓</span>}
                        </button>
                      ))
                    )}
                  </div>
                  {value && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onChange(""); closeMenu(); }}
                      className="mt-0.5 flex w-full shrink-0 items-center gap-2 rounded-lg border-t border-border/50 px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-zinc-50"
                    >
                      <X className="h-3 w-3" /> Clear
                    </button>
                  )}
                </div>
              )}
            </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
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
  if (devices.length === 0) return <EmptyDash />;
  const first = devices[0];
  const extra = devices.length - 1;
  // Summarise all devices for the hover tooltip so the row stays compact.
  const allLabels = devices.map((d) => d.label || "Device").join(", ");
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
      aria-label="View device and issue details"
      title={extra > 0 ? allLabels : undefined}
      className="group/device flex w-full min-w-0 items-center gap-1.5 rounded-lg text-left transition hover:bg-indigo-50/50"
    >
      <div className="min-w-0 flex-1 leading-snug">
        <p className="flex min-w-0 items-center gap-1.5 font-medium text-zinc-800">
          <span className="truncate">{first.label || (first.issue ? "Device" : "—")}</span>
          {extra > 0 && (
            <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
              +{extra} more
            </span>
          )}
        </p>
        {first.issue && <p className="mt-0.5 truncate text-[12.5px] text-zinc-500" title={first.issue}>{first.issue}</p>}
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-zinc-400 opacity-70 transition group-hover/device:text-[#4361EE] group-hover/device:opacity-100" />
    </button>
  );
}

/* Column 9 — LEAD VALUE (pipeline/estimate; NEVER revenue). Shows the total
   with the discount as an optional secondary breakdown when present. */
function LeadValueCell({ lead }: { lead: Lead }) {
  const devices = getLeadDevices(lead);
  const multi = devices.length > 1;
  const total = leadDevicesTotalEstimate(lead);
  if (total == null) return <EmptyDash />;
  // Multi-device → total + a compact per-device breakdown (first 2, then "+N").
  if (multi) {
    const shown = devices.slice(0, 2);
    const rest = devices.length - shown.length;
    const fullBreakdown = devices
      .map((d, i) => `${d.label || `Device ${i + 1}`}: ${d.estimate == null ? "—" : formatINR(d.estimate)}`)
      .join("\n");
    return (
      <div className="leading-snug" title={fullBreakdown}>
        <p className="font-semibold text-zinc-900 tnum">{formatINR(total)}</p>
        <div className="mt-0.5 space-y-0.5">
          {shown.map((d, i) => (
            <p key={d.id || i} className="flex items-center gap-1 text-[11.5px] text-zinc-500">
              <span className="min-w-0 max-w-[86px] truncate">{d.label || `Device ${i + 1}`}</span>
              <span className="tnum text-zinc-600">{d.estimate == null ? "—" : formatINR(d.estimate)}</span>
            </p>
          ))}
          {rest > 0 && <p className="text-[11px] text-zinc-400">+{rest} more</p>}
        </div>
      </div>
    );
  }
  const hasDiscount = lead.discount != null && lead.discount > 0;
  const breakdown = hasDiscount
    ? lead.discountType === "percent"
      ? `−${lead.discount}%`
      : `less ${formatINR(lead.discount!)}`
    : null;
  return (
    <div className="leading-snug">
      <p className="font-semibold text-zinc-900 tnum">{formatINR(total)}</p>
      {breakdown && <p className="mt-0.5 text-[12px] text-zinc-500 tnum">{breakdown}</p>}
    </div>
  );
}

/* Column 10 — COMMENT (readable preview; full text on hover via title).
   A fixed-size, vertically-centered 2-line note box with a soft distinct
   background so the free-text comment is visually differentiated from the
   surrounding columns and NEVER bleeds into the Lead Value cell. The box is a
   fixed height (always 2 lines tall) so the column reads uniformly down the
   table; longer text clamps to 2 lines with the full value in the title
   tooltip. N/A stays a plain muted dash (never a tinted box). */
function CommentCell({ text }: { text: string }) {
  if (!text?.trim()) return <EmptyDash />;
  // Match the Notepad sticky-note colour system (notepad-widget.tsx): soft
  // amber body + amber-200 border + the saturated amber-400 left accent stripe,
  // with neutral foreground text (NOT amber-900) so it reads identically.
  return (
    <div className="relative mr-2 flex min-h-[48px] w-full items-center overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/70 pl-3 pr-2.5 py-1.5">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-amber-400" />
      <p
        className="line-clamp-2 w-full break-words whitespace-pre-line text-[13px] leading-snug text-foreground/90"
        title={text}
      >
        {text}
      </p>
    </div>
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
  // Full-width read-only pill (Lead Table pill standard): leading lock (fixed) ·
  // truncating label (flex-1, full value in the title tooltip). The stable
  // Action column width comes from the <colgroup>, never the row's label length.
  return (
    <span
      title={`${label} · System-derived — ${wf.reason}`}
      aria-label={`Action: ${label} (system-derived, read-only)`}
      className={cn(
        "flex h-7 w-full min-w-0 cursor-default items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset select-none",
        tone,
      )}
    >
      <Lock className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
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
  // Ticket / Invoice id link behaviour by permission (spec: owner → full
  // detail; a Sales Agent without view access → PRINT PREVIEW + download only).
  //  • has view permission → go to the record's detail page.
  //  • no view permission  → open the /print preview (view + download), never
  //    the detail page. The print route is RLS-scoped and needs no view key.
  const ticketHref = canViewTicket
    ? `/tickets/${r.ticketId || r.ticketNo}`
    : `/print/ticket/${encodeURIComponent(r.ticketId || r.ticketNo)}?format=a4`;
  const invoiceHref = canViewInvoice
    ? `/invoice/${r.invoiceId || r.invoiceNo}`
    : `/print/invoice/${encodeURIComponent(r.invoiceId || r.invoiceNo)}?format=a4`;
  const ticketTitle = canViewTicket ? `Open ticket ${r.ticketNo}` : `Print preview — ticket ${r.ticketNo}`;
  const invoiceTitle = canViewInvoice ? `Open invoice ${r.invoiceNo}` : `Print preview — invoice ${r.invoiceNo}`;
  if (r.kind === "invoice") {
    return (
      <div className="leading-snug select-none" title="🎉 Congratulations! You closed this deal — revenue is in the bank.">
        <p className={cn("font-bold tabular-nums", leadResultTone(r.kind))}>{r.primary}</p>
        {/* Ticket no | Invoice no — SIDE BY SIDE, CENTERED, each a link, with a
            "|" separator shown only when both are present. */}
        <div className="mt-0.5 flex items-center justify-center gap-1.5 border-t border-border/70 pt-0.5">
          {r.ticketNo && (
            <Link href={ticketHref} onClick={(e) => e.stopPropagation()} className="min-w-0 truncate text-[11px] font-medium text-[#4361EE] hover:underline tabular-nums" title={ticketTitle}>{r.ticketNo}</Link>
          )}
          {r.ticketNo && r.invoiceNo && (
            <span className="shrink-0 text-[11px] text-muted-foreground" aria-hidden>|</span>
          )}
          {r.invoiceNo && (
            <Link href={invoiceHref} onClick={(e) => e.stopPropagation()} className="min-w-0 truncate text-[11px] font-medium text-[#4361EE] hover:underline tabular-nums" title={invoiceTitle}>{r.invoiceNo}</Link>
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
          <Link href={ticketHref} onClick={(e) => e.stopPropagation()} className="mt-0.5 block truncate text-[11px] font-medium text-[#4361EE] hover:underline tabular-nums" title={ticketTitle}>{r.ticketNo}</Link>
        )}
      </div>
    );
  }
  // lead_won / pipeline / lost / na — a single restrained label.
  // A friendly, human headline per outcome, with the factual system-derived
  // reason kept as a second line so nothing is lost.
  const resultHeadline =
    r.kind === "lead_won"
      ? "🏆 Lead won! The customer is on board — close it out with a ticket & invoice."
      : null;
  return (
    <span
      title={resultHeadline ?? `System-derived — ${wf.reason}`}
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
  // LEAD CATEGORY filters the qualification field (Qualified / Not Qualified).
  // There is ONE Lead Category facet now — the old business-type leadCategory
  // and the separate "Qualification" facet were merged into this.
  { key: "qualification",  label: "Lead Category",   optionField: "qualification" },
  { key: "subCategory",    label: "Sub Category",    optionField: "subCategory" },
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
  const { leads, filteredLeads, hydrated, filters, setFilters, clearFilters, optionsFor, fieldTitle, deleteLead, pinLead, changeLeadStatus, updateLead, scheduleFollowUp, salesAgents, openFollowUpsByLead,
    viewAsReadOnly } = useLeads();
  // OWNER "view as agent" (Option A — NOT impersonation): when active, the whole
  // Leads workspace is READ-ONLY. Every mutation gate ANDs in `!viewAsReadOnly`.
  const canAssign = useCanAssignLeads() && !viewAsReadOnly;
  const { currentUser, can } = usePermissions();

  /* ── Live operational records for SYSTEM-DERIVED Action / Result / Store ──
     Action and Result are NEVER stored on the lead. They are derived at read
     time from the REAL linked records — the store's tickets / invoices /
     walk-ins and the field jobs — via `deriveLeadWorkflow` (mirrors
     `field-resolve.ts`). These are already store-scoped by their providers +
     RLS, so a lead never resolves an unauthorized store's records. */
  const { tickets, invoices, walkIns } = useStore();
  const { jobs: fieldJobs } = useField();
  // Deals (discount approvals) — drive the Discounted Lead trigger + the
  // system-derived "Discount Approval" action in workflowByLead. `comments`
  // feeds the per-lead deal-conversation unread signal (shared tracker).
  const { deals, comments, dealById } = useDeals();
  // Per-user "new message" read-marker for the internal Deal conversation — the
  // ONE shared tracker (same hook the Deals queue + View Lead use). Every dot
  // reads from it; opening the conversation calls markSeen(dealId).
  const { markSeen: markDealSeen, unreadCount: dealUnreadCount, seenVersion: dealSeenVersion } = useDealConversationSeen(currentUser?.id);
  // Quotations — drive the system-derived "Quotation Created / Sent" action and
  // the Lead Table "Send Quotation" flow. Attribution comes from the lead.
  const { currentQuotationForLead } = useQuotations();
  const [quotationLead, setQuotationLead] = useState<Lead | null>(null);
  /* In-place deal-conversation chat popover (opened from the Last Action chat
     icon). It anchors to the trigger via its live bounding rect so the table's
     overflow never clips it — NO navigation to View Lead. */
  const [dealChat, setDealChat] = useState<{ dealId: string; leadNo: string; rect: DOMRect | null } | null>(null);
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
      // The lead's current Deal (if any) lets the derivation surface a pending
      // discount approval as the Action — system-derived, never stored. The
      // lead's current Quotation surfaces "Quotation Created / Sent" (below any
      // real ticket/invoice/field record), also system-derived.
      const q = currentQuotationForLead(l.id);
      m[l.id] = deriveLeadWorkflow(l, workflowSources, {
        openFollowUpDue,
        deal: currentDealForLead(deals, l.id) ?? null,
        quotation: q ? { status: q.status, sentAt: q.sentAt } : null,
      });
    }
    return m;
  }, [leads, workflowSources, openFollowUpsByLead, deals, currentQuotationForLead]);

  /* Per-lead Deal conversation signal (presentation only — never changes deal/
     approval/notification logic). For each lead with a current deal we resolve:
       • dealId     — the deal whose conversation the chat popover opens / marks seen
       • hasConvo   — the deal has at least one message (shortcut shows only then)
       • unread     — unread message COUNT for this user (newer than last-seen AND
                      authored by someone else — the shared tracker's rule).
     Recomputes when leads / deals / comments change (realtime or local), so the
     dots/badges clear reactively once markSeen updates the tracker's state. */
  const dealConvoByLead = useMemo(() => {
    // Group comments per deal (single pass over the shared comments array).
    // NOTE: `Map` is the lucide icon in this file — use a plain record.
    const byDeal: Record<string, (typeof comments)[number][]> = {};
    for (const c of comments) (byDeal[c.dealId] ??= []).push(c);
    const m: Record<string, { dealId: string; hasConvo: boolean; unread: number }> = {};
    for (const l of leads) {
      const deal = currentDealForLead(deals, l.id);
      if (!deal) continue;
      const dealComments = byDeal[deal.id] ?? [];
      const hasConvo = dealComments.length > 0;
      m[l.id] = {
        dealId: deal.id,
        hasConvo,
        unread: hasConvo ? dealUnreadCount(deal, dealComments) : 0,
      };
    }
    return m;
    // `dealSeenVersion` bumps on every markSeen (shared tracker) so the per-row
    // unread count recomputes reactively when the conversation is opened from a
    // Lead Table row — the badge clears without a refresh.
  }, [leads, deals, comments, dealUnreadCount, dealSeenVersion]);
  // Bulk-action capability gates (granular key OR coarse fallback via CAP).
  const canBulkStatus = allow(can, CAP.lead.stageChange) && !viewAsReadOnly;
  const canBulkDelete = allow(can, CAP.lead.delete) && !viewAsReadOnly;
  // Multi-store: show the shared Store Context column only in the consolidated
  // All-Shops view with >1 authorized store (Design System v2 multi-store rule)
  // AND only when Lead Management is in MULTI-STORE mode. In Single-Store mode
  // every lead shares the one Default Lead Store, so the column is pure clutter
  // and is hidden (the fixed store context lives in the header chip instead).
  const { isAllShops, stores, getStore } = useStoreContext();
  const leadMode = useLeadStoreMode();
  const multiStore = isAllShops && stores.length > 1 && leadMode.isMulti;

  /* ── Frozen columns (professional data-grid) ──────────────────────────────
     Lead ID is permanently frozen LEFT, Last Action permanently frozen RIGHT;
     the user may additionally freeze middle columns to the left. Persisted
     per-user. `frozenCellProps(key)` returns the sticky className + inline
     left/right offset for any column so the header and body cells stay in
     lockstep with the real column widths. */
  const gridColumns = useMemo(() => {
    const cols = leadGridColumns(multiStore);
    // Override the header of each column that maps to a configurable field so a
    // field-TITLE rename in Form Edit reflects here live (org-wide).
    return cols.map((c) => {
      const fk = COLUMN_TO_FIELD[c.key];
      return fk ? { ...c, label: fieldTitle(fk) } : c;
    });
  }, [multiStore, fieldTitle]);
  /* ── Personal column order (per-user) ──────────────────────────────────────
     The user can rearrange the center columns via the Customize popover; the
     order persists per-user (localStorage key, keyed by currentUser.id). It is
     a SEPARATE preference from the frozen selection above — reordering never
     changes which columns are frozen, and vice-versa. `orderedColumns` drives
     the colgroup / header / body so the rendered order always matches the saved
     preference. Structural columns (Selection, multi-store Store) and the two
     anchors (Date left, Last Action right) keep their fixed slots. */
  const columnOrder = useColumnOrder("lead_table", currentUser?.id, gridColumns);
  const orderedColumns = columnOrder.orderedColumns;
  /* Frozen selection is computed against the user's VISUAL (reordered) column
     order so the left frozen block + its sticky offsets always follow what the
     user actually sees. Freeze + order remain independent preferences, but the
     frozen offsets must honour the current order to stay in lockstep. */
  const frozen = useFrozenColumns("lead_table", currentUser?.id, orderedColumns);
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollEdges(scrollRef);

  /* ── Workspace Collapse / Expand (presentation-only, per-user) ─────────────
     MANAGEMENT MODE (expanded) ↔ WORK MODE (collapsed). Declared here beside
     the other per-user table preferences so the height-measure effect below
     can depend on it (collapsing shrinks the control area → the table top
     moves up → gridMaxH recomputes → the table grows into the released space).
     Collapsing is purely visual: it never touches filter values, table data,
     column order, or freeze selection. Default EXPANDED. */
  const workspace = useWorkspaceCollapsed("lead_table", currentUser?.id);
  const controlsCollapsed = workspace.collapsed;

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
    // Re-measure as the collapse/expand height animation plays so the table's
    // bounded height tracks the control area contracting/expanding smoothly and
    // lands correctly once the transition settles (no stale height, no jump).
    const raf = requestAnimationFrame(measure);
    const settle = setTimeout(measure, 280); // just past the ~0.22s animation
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [hydrated, controlsCollapsed]);

  // Width of the always-frozen selection column (sits before the Lead ID
  // anchor). The hook owns the Lead ID left anchor, so every hook-computed left
  // offset is shifted right by this width, and the select column itself is
  // pinned at offset 0.
  const selectColWidth = orderedColumns.find((g) => g.key === "select")?.width ?? 0;

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
          const c = orderedColumns.find((g) => g.key === frozen.leftKeys[i]);
          offset += c?.width ?? 0;
        }
        const isLast = leftIdx === frozen.leftKeys.length - 1;
        return {
          className: cn("rox-frozen rox-frozen-left", isLast && "rox-frozen-left-edge"),
          style: { ["--rox-frozen-offset" as any]: `${offset}px` },
        };
      }
      // RIGHT frozen block — the mandatory anchor PLUS any columns the user
      // froze to the right. rightKeys is left→right with the anchor LAST, so
      // the cumulative right offset = sum of widths of the frozen columns AFTER
      // this one. The leftmost frozen-right column carries the edge shadow.
      const rightIdx = frozen.rightKeys.indexOf(key);
      if (rightIdx >= 0) {
        let offset = 0;
        for (let i = rightIdx + 1; i < frozen.rightKeys.length; i++) {
          const c = orderedColumns.find((g) => g.key === frozen.rightKeys[i]);
          offset += c?.width ?? 0;
        }
        const isFirst = rightIdx === 0;
        return {
          className: cn("rox-frozen rox-frozen-right", isFirst && "rox-frozen-right-edge"),
          style: { ["--rox-frozen-offset" as any]: `${offset}px` },
        };
      }
      return { className: "" };
    },
    [frozen.leftKeys, frozen.rightKeys, orderedColumns, selectColWidth],
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

  /* Strip 3 — the SINGLE primary filter strip. It now carries BOTH the
     accountability VIEWS (Not Contacted / Follow-Ups, with their own red count
     badges) AND the lifecycle STATUS filters, behind one leading "All". The
     old separate top "view" strip is gone — these two view segments live here
     now, right after "All", ahead of the configured statuses.
       - "All"               → view=all, status=""   (the working table)
       - "__notContacted__"  → view=notContacted     (the accountability queue)
       - "__followUps__"     → view=followUps         (the follow-up table + calendar)
       - any status value    → view=all, status=<that status>
     Lifecycle statuses come from Settings (lead_options "status") so the strip
     UPDATES LIVE on rename/add/remove; any legacy status still in use is
     appended so those leads stay filterable. */
  const statusStripTabs = useMemo(() => {
    const configured = optionsFor("status").map((o) => o.value).filter(Boolean);
    const inUse = Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));
    const legacy = inUse.filter((s) => !configured.includes(s));
    const statuses = [...configured, ...legacy];
    return [
      { label: "All", value: "all" },
      { label: <ViewTabLabel text="Not Contacted" count={notContactedCount} active={view === "notContacted"} tone="red" />, value: NOT_CONTACTED_TAB },
      { label: <ViewTabLabel text="Follow-Ups" count={followUpsCount} active={view === "followUps"} tone="red" />, value: FOLLOWUPS_TAB },
      ...statuses.map((s) => ({ label: s, value: s })),
    ];
  }, [optionsFor, leads, notContactedCount, followUpsCount, view]);
  // The strip's selected value reflects either the active VIEW token or the
  // chosen lifecycle status (working view).
  const statusStripValue = view === "notContacted" ? NOT_CONTACTED_TAB
    : view === "followUps" ? FOLLOWUPS_TAB
    : (filters.status || "all");
  const onStatusStripChange = useCallback((v: string) => {
    if (v === NOT_CONTACTED_TAB) { setFilters((f) => ({ ...f, view: "notContacted" })); return; }
    if (v === FOLLOWUPS_TAB) { setFilters((f) => ({ ...f, view: "followUps" })); return; }
    // "All" or a status → the working table view.
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
  // Lead Nature (Hot / Warm / Cold) options — configured in Lead Settings
  // (lead_options "leadNature"), live-refreshed via optionsFor. Powers the
  // inline Lead Nature dropdown in the table.
  const leadNatureOptions = useMemo(() => optionsFor("leadNature").map((o) => o.value).filter(Boolean), [optionsFor]);
  // LEAD CATEGORY options — the qualification values (Qualified Lead / Not
  // Qualified Lead), configured in Lead Settings under "Lead Category" (the
  // lead_options "qualification" field). Sub Category options are separate.
  // Live-refreshed via optionsFor. Power the inline editable dropdowns.
  const leadCategoryOptions = useMemo(() => optionsFor("qualification").map((o) => o.value).filter(Boolean), [optionsFor]);
  const subCategoryOptions = useMemo(() => optionsFor("subCategory").map((o) => o.value).filter(Boolean), [optionsFor]);
  const canEditLead = allow(can, CAP.lead.edit) && !viewAsReadOnly;

  /* ── Discounted Lead → Deal approval trigger ──
     When a lead's status is set to a "Discounted Lead" value, immediately open
     the Discount Request modal (unless an open deal already exists). The Deal
     approval workflow owns the discount reason + manager review; the lead's
     status still records the Discounted Lead state. */
  const [dealLead, setDealLead] = useState<Lead | null>(null);
  const canRequestDeal = allow(can, CAP.deal.create);

  /* ── Call Back stage → inline follow-up scheduler ──
     When a lead's stage is set to a Call Back / Follow-Up value from the table,
     immediately prompt for the follow-up date & time (right there, no full
     form). Saving creates a lead_followup_history record via scheduleFollowUp.
     Gated by CAP.lead.followup. */
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const canFollowUp = allow(can, CAP.lead.followup);

  /* Apply a status change to ONE lead, then auto-create the Field Job when the
     status is a pickup/on-site routing status. Shared by the inline dropdown
     and the bulk action so both behave identically. */
  const applyLeadStatus = useCallback(async (lead: Lead, status: string) => {
    await changeLeadStatus(lead.id, status);
    await autoFieldJobForStatus(lead, status);
    // Discounted Lead → open the discount approval request (don't silently save
    // a Discounted Lead without the required Deal information).
    if (isDiscountedLeadValue(status) && canRequestDeal && !leadHasOpenDeal(deals, lead.id)) {
      setDealLead({ ...lead, status });
    }
    // Call Back / Follow-Up stage → prompt for the follow-up date & time right
    // from the table, every time the stage is chosen (gated by CAP.lead.followup).
    // If an open follow-up already exists, the picker pre-fills its time so this
    // acts as a reschedule.
    else if (statusRequiresFollowUp(status) && canFollowUp) {
      setFollowUpLead({ ...lead, status });
    }
  }, [changeLeadStatus, autoFieldJobForStatus, canRequestDeal, deals, canFollowUp]);

  /* Apply a LEAD CATEGORY (qualification) change inline from the table. Writes
     the `qualification` field so the entire qualification gate keeps working.
     A "Not Qualified" value REQUIRES a reason (finalRemarks) — the DB guard
     rejects it otherwise. We capture that reason INLINE (a compact reason box
     inside the pill popover via reasonPromptFor/onChangeWithReason) and write
     { qualification, finalRemarks } together so the row updates immediately —
     no full edit form. When an optional `reason` is supplied it is persisted
     into finalRemarks alongside the qualification. */
  const applyLeadCategory = useCallback(async (lead: Lead, value: string, reason?: string) => {
    const updates: Partial<Lead> = { qualification: value };
    if (isNotQualified(value)) {
      const r = (reason ?? lead.finalRemarks ?? "").trim();
      if (!r) return; // guarded by the inline reason box; never write a reasonless Not-Qualified
      updates.finalRemarks = r;
    }
    await updateLead(lead.id, updates);
  }, [updateLead]);

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

  const router = useRouter();
  const openEdit = (lead: Lead) => { setEditLead(lead); };
  /* View Lead is now a dedicated FULL PAGE (not a drawer). Opening a lead
     navigates to /leads/<id>; the Lead Table's own filters/scope live in its
     URL/state so returning via "Back to Leads" restores them. */
  const openLead = useCallback((lead: Lead) => { router.push(`/leads/${lead.id}`); }, [router]);

  /* ── "Open Lead" from the follow-up bell ──
     Instead of jumping straight to the View Lead page, switch to the Follow-Up
     view and briefly HIGHLIGHT (blink) the selected lead's row for 3s so the
     agent can see exactly which lead needs attention. From there the Action
     column's View-Lead (eye) opens the full lead. */
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFollowUpForLead = useCallback((lead: Lead) => {
    setFilters((f) => ({ ...f, view: "followUps" }));
    setHighlightLeadId(lead.id);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightLeadId(null), 3000);
  }, [setFilters]);
  useEffect(() => () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current); }, []);

  const handleAction = (action: LeadAction, lead: Lead, anchor?: HTMLElement) => {
    switch (action) {
      case "view": openLead(lead); break;
      case "edit": openEdit(lead); break;
      case "priority": openEdit(lead); break; // priority lives in the edit flow
      case "pin": void pinLead(lead.id, !lead.pinnedAt); break;
      case "delete": setConfirmDelete(lead); break;
      case "route": setRouteLeadTarget(lead); break;
      case "quotation": setQuotationLead(lead); break;
      case "comment": {
        // Open an IN-PLACE chat popover anchored to the icon (NO navigation to
        // View Lead) and mark it seen so the unread count/dots clear instantly.
        // Reuses the ONE shared tracker + the ONE DealConversation thread.
        const info = dealConvoByLead[lead.id];
        if (!info?.dealId) break;
        markDealSeen(info.dealId);
        setDealChat({
          dealId: info.dealId,
          leadNo: lead.leadNo || "",
          rect: anchor ? anchor.getBoundingClientRect() : null,
        });
        break;
      }
    }
  };

  /* Open the Lead Detail view when the assigned user clicks "View Lead" in the
     assignment notification. */
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const lead = leads.find((l) => l.id === id);
      if (lead) openLead(lead);
    };
    window.addEventListener(LEAD_OPEN_EVENT, handler);
    return () => window.removeEventListener(LEAD_OPEN_EVENT, handler);
  }, [leads, openLead]);

  /* Deep-link: /leads/list?lead=<id> opens that lead's detail (used by the
     assignment + follow-up-due notifications). Runs once the leads are loaded. */
  const searchParams = useSearchParams();

  /* OWNER "View as agent" scope (Option A) is owned by the Lead module LAYOUT
     (app/(app)/leads/layout.tsx): it syncs ?viewAs=, persists the scope across
     in-module navigation, renders the ONE read-only banner, and clears it when
     the owner leaves the module. This page only READS viewAsReadOnly (from
     useLeads) to lock its own controls. */
  const urlFilterKey = searchParams.toString();
  const appliedUrlFiltersRef = useRef("");
  /* Intelligence evidence links are refresh-safe and exact. URL values are
     allowlisted into the canonical structured filter model; RLS still decides
     which ids can actually render. */
  useEffect(() => {
    if (!urlFilterKey || appliedUrlFiltersRef.current === urlFilterKey) return;
    const recognized = ["evidenceIds", "evidenceToken", "assignedTo", "dateRange", "source", "modeOfContact", "qualification", "subCategory", "priority", "status", "fulfilmentRoute", "deviceCategoryId", "deviceBrandId"]
      .some((key) => searchParams.has(key));
    if (!recognized) return;
    const allowedDates = new Set<LeadDateRange>(LEAD_DATE_RANGES.map((item) => item.value));
    const requestedDate = searchParams.get("dateRange") as LeadDateRange | null;
    const resolvedEvidenceIds = resolveLeadEvidenceIds(searchParams);
    const evidenceTokenMissing = !!searchParams.get("evidenceToken") && resolvedEvidenceIds.length === 0;
    const evidenceIds = evidenceTokenMissing ? ["__evidence_unavailable__"] : resolvedEvidenceIds;
    if (evidenceTokenMissing) toast.error("Evidence cohort unavailable", { description: "This saved analytical cohort expired. Reopen the insight from Lead Intelligence." });
    const fields: LeadFilters["fields"] = {};
    for (const key of ["assignedTo", "source", "modeOfContact", "qualification", "subCategory", "priority", "fulfilmentRoute", "deviceCategoryId", "deviceBrandId"] as LeadFilterField[]) {
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
  /* The ?lead=<id> param now serves two purposes:
       • a bare ?lead=<id> (notifications) → open the full View Lead page;
       • ?lead=<id>&action=edit|quotation  → the View Lead page's header
         buttons return here to open the Edit (capture) flow or Send Quotation
         flow in-place (those are modal flows that live on the list page).
     A lead the user may not see is simply not returned by RLS — say so once. */
  const deepLinkAction = searchParams.get("action");
  const [deepLinkChecked, setDeepLinkChecked] = useState<string | null>(null);
  useEffect(() => {
    if (!deepLinkLeadId) return;
    const lead = leads.find((l) => l.id === deepLinkLeadId);
    if (lead) {
      if (deepLinkAction === "edit") setEditLead(lead);
      else if (deepLinkAction === "quotation") setQuotationLead(lead);
      else openLead(lead);
      return;
    }
    if (hydrated && deepLinkChecked !== deepLinkLeadId) {
      setDeepLinkChecked(deepLinkLeadId);
      toast.error("Lead unavailable", { description: "This lead doesn't exist or isn't assigned to you." });
    }
  }, [deepLinkLeadId, deepLinkAction, leads, hydrated, deepLinkChecked, openLead]);

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
        label: field.optionField ? fieldTitle(field.optionField) : field.label,
        value: display,
        onClear: () => setFilters((prev) => ({ ...prev, fields: { ...prev.fields, [field.key]: "" } })),
      });
    }
    return chips;
  }, [filters, salesAgents, leads, setFilters, fieldTitle]);

  /* Compact indicators shown INSIDE the collapsed-state toolbar so the user
     still knows what is active without reopening the filters. The count mirrors
     the applied-filter chips (real active filters only — default "All"
     selections are never counted). The date-range label is shown separately
     when it is not the default "All" range. */
  const collapsedFilterCount = appliedChips.length;
  const collapsedDateLabel =
    filters.dateRange !== "all"
      ? DATE_RANGES.find((d) => d.value === filters.dateRange)?.label ?? filters.dateRange
      : null;

  /* Facet definitions for the structured filter panel — reuse the SAME option
     resolution as the applied chips (configured Settings values + live data;
     people fields resolve id→name). */
  const filterFacets = useMemo<FacetDef[]>(
    () =>
      FILTER_FIELDS.map((f) => ({
        key: f.key,
        label: f.optionField ? fieldTitle(f.optionField) : f.label,
        options: optionsForFilter(f).map((o) =>
          typeof o === "string" ? { label: o, value: o } : o,
        ),
      })),
    // optionsForFilter closes over leads/salesAgents/optionsFor; recompute when
    // the dataset changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, salesAgents, fieldTitle],
  );

  /* ── Per-column body renderer ──────────────────────────────────────────────
     Maps a stable column key → its cell content for ONE lead. The table body
     iterates the user's ordered columns and calls this, so a column's content,
     gating and interaction are identical regardless of position (interaction is
     tied to the stable key, never a numeric index). `locked` = stale
     Not-Contacted lead (mask to N/A); `gated` = progressive qualification gate;
     `storeBranchId` = derived operational store. */
  const renderLeadCell = useCallback(
    (
      key: string,
      ctx: { lead: Lead; wf: LeadWorkflow; locked: boolean; gated: boolean; storeBranchId: string | null },
    ): React.ReactNode => {
      const { lead, wf, locked, gated, storeBranchId } = ctx;
      switch (key) {
        case "select":
          return (
            <Checkbox
              checked={selected.has(lead.id)}
              onChange={() => toggleOne(lead.id)}
              aria-label={`Select lead ${lead.leadNo || lead.id}`}
            />
          );
        case "date":
          return locked ? <NACell /> : <DateCell lead={lead} />;
        case "store":
          // Structural multi-store column (branch the lead belongs to).
          return <StoreContextCell store={getStore(lead.branchId || null)} mode="stacked" />;
        case "id":
          // Lead ID is LEFT-aligned with the conversion tick sitting just to its
          // RIGHT (a small, controlled gap — NOT spread to the opposite cell
          // edge). The id group grows naturally with a longer / store-prefixed
          // id (e.g. "KOR-L-0045"), so the tick follows the id rather than
          // leaving a big empty gap for short ids. The id truncates only if it
          // would overflow the column.
          return (
            <button onClick={(e) => { e.stopPropagation(); openLead(lead); }} className="flex w-full items-center gap-2 whitespace-nowrap font-semibold text-[#4361EE] hover:underline tnum">
              {/* Unread deal-conversation marker — a small red dot at the very
                  start of the row, before the pin + lead number. Clears once the
                  user reads the conversation (shared tracker). */}
              {(dealConvoByLead[lead.id]?.unread ?? 0) > 0 && (
                <span
                  aria-label="Unread deal conversation"
                  title="New message in the deal conversation"
                  className="h-2 w-2 shrink-0 rounded-full bg-rose-400 ring-2 ring-rose-100"
                />
              )}
              {lead.pinnedAt && <Pin className="h-3.5 w-3.5 shrink-0 fill-[#7C5CFC] text-[#7C5CFC]" aria-label="Pinned" />}
              <span className="min-w-0 truncate">{lead.leadNo || "—"}</span>
              <LeadStatusTick wf={wf} lead={lead} />
            </button>
          );
        case "agent":
          // Even when LOCKED this stays the reassign control (hand-off to a new owner).
          return canAssign ? <AssignMenu lead={lead} compact /> : <AssignBadge lead={lead} size={22} />;
        case "mode":
          // Short categorical value — CENTER-aligned so the value and the empty
          // dash (— / N/A, both centered) read as one tidy centered column.
          return locked ? <NACell /> : lead.modeOfContact ? <span className="block truncate text-center text-zinc-700">{lead.modeOfContact}</span> : <EmptyDash />;
        case "contactInfo":
          return locked ? <NACell /> : <ContactInfoCell lead={lead} />;
        case "device":
          return gated ? <NACell /> : <DeviceIssueCell lead={lead} onOpen={setDeviceDetailsLead} />;
        case "comment":
          // The Not-Qualified reason stays readable here (never masked to N/A).
          return locked ? <NACell /> : <CommentCell text={lead.comments || lead.finalRemarks || ""} />;
        case "value":
          return gated ? <NACell /> : <LeadValueCell lead={lead} />;
        case "region":
          return locked ? <NACell /> : lead.region ? <span className="block truncate text-center uppercase text-zinc-700">{lead.region}</span> : <EmptyDash />;
        case "source":
          return locked ? <NACell /> : <SourceCell lead={lead} />;
        case "contactStatus":
          return (
            <>
              <ContactStatusCell
                lead={lead}
                options={contactStatusOptions}
                onSave={(v) => updateLead(lead.id, { contactStatus: v })}
                locked={locked || !canEditLead}
              />
              {locked && <span className="mt-1 block text-center text-[10px] font-semibold uppercase tracking-wide text-amber-600">Locked · reassign to unlock</span>}
            </>
          );
        case "leadCategory":
          // LEAD CATEGORY = the lead's qualification (Qualified / Not Qualified).
          // Reads/writes `lead.qualification` so the gate keeps working; a
          // Not-Qualified pick routes through applyLeadCategory (mandatory
          // reason). Green = qualified, rose = not qualified.
          // NOTE: a Not-Qualified lead is itself downstream-gated, so this cell
          // must stay editable even when `gated` — otherwise the user could
          // never requalify it. We only mask it when LOCKED (stale).
          return locked ? <NACell /> : (
            <LeadSelectCell
              value={lead.qualification || ""}
              options={leadCategoryOptions}
              onChange={(v) => applyLeadCategory(lead, v)}
              // Choosing a Not-Qualified value opens a compact inline reason box
              // (textarea + Save) INSIDE the pill popover — no full form. The
              // reason prefills with any existing finalRemarks so re-marking
              // keeps the prior note.
              reasonPromptFor={(v) =>
                isNotQualified(v)
                  ? { label: "Why is this lead not qualified?", initial: lead.finalRemarks || "" }
                  : null
              }
              onChangeWithReason={(v, reason) => applyLeadCategory(lead, v, reason)}
              toneClass={lead.qualification ? qualificationTone(lead.qualification) : "bg-zinc-50 text-zinc-400 ring-zinc-200"}
              dotColor={qualificationDot(lead.qualification || "")}
              readOnly={!canEditLead}
            />
          );
        case "subCategory":
          return gated ? <NACell /> : (
            <LeadSelectCell
              value={lead.subCategory || ""}
              options={subCategoryOptions}
              onChange={(v) => updateLead(lead.id, { subCategory: v })}
              toneClass="bg-violet-50 text-violet-700 ring-violet-200"
              dotColor="#8B5CF6"
              readOnly={!canEditLead}
            />
          );
        case "leadType":
          return gated ? <NACell /> : (
            <LeadSelectCell
              value={lead.leadNature || ""}
              options={leadNatureOptions}
              onChange={(v) => updateLead(lead.id, { leadNature: v })}
              toneClass={lead.leadNature ? leadNatureTone(lead.leadNature) : "bg-zinc-50 text-zinc-400 ring-zinc-200"}
              dotColor={leadNatureDot(lead.leadNature || "")}
              glyphFor={leadNatureGlyph}
              readOnly={!canEditLead}
            />
          );
        case "status": {
          if (gated) return <NACell />;
          // Deal lineage sub-indicator (under the Lead Stage pill): once a deal
          // is APPROVED, keep the Deal origin visible as a muted "Deal → <current
          // stage>" line. The word "Deal" is CONSTANT; the text after the arrow
          // mirrors the lead's CURRENT stage (lead.status) so it follows the
          // process toward the final result. Shown ONLY for approved deals, and
          // suppressed while the stage is still a bare "Deal" status (no
          // downstream stage) to avoid a redundant "Deal → Deal".
          const statusLower = (lead.status || "").toLowerCase();
          const stageLabel = lead.status || wf.actionLabel;
          const showDealLineage =
            wf.dealLineage === "approved" && !statusLower.includes("deal");
          return (
            // The wrapper has NO reserved height, so a caption-less cell is just
            // the pill — the exact intrinsic height of the Action/Result pill
            // cells, keeping the pill at the identical Y position in both states.
            // When present, the lineage caption is absolutely positioned below
            // the pill (`top-full`), so it never changes the cell's height, never
            // shifts the pill, and never pushes neighbouring columns — all within
            // the h-[68px] row rhythm.
            <div className="relative min-w-0">
              <LeadSelectCell
                value={lead.status || ""}
                options={statusOptions}
                onChange={(v) => applyLeadStatus(lead, v)}
                toneClass={lead.status ? statusTone(lead.status) : "bg-zinc-50 text-zinc-400 ring-zinc-200"}
                dotColor={statusDotColor(lead.status || "")}
                readOnly={!canBulkStatus}
              />
              {showDealLineage && (
                <p
                  className="absolute left-0 right-0 top-full mt-0.5 w-full min-w-0 truncate px-0.5 text-[10px] font-medium text-muted-foreground"
                  title={`Deal → ${stageLabel}`}
                >
                  Deal → {stageLabel}
                </p>
              )}
            </div>
          );
        }
        case "action":
          return gated ? <NACell /> : <ActionCell wf={wf} />;
        case "storeCol":
          return gated ? <NACell /> : (storeBranchId ? <StoreContextCell store={getStore(storeBranchId)} mode="stacked" /> : <EmptyDash />);
        case "result":
          return gated ? <NACell /> : <ResultCell wf={wf} canViewTicket={canViewTicket} canViewInvoice={canViewInvoice} />;
        case "actions":
          return (
            <LeadActionsMenu
              lead={lead}
              onAction={handleAction}
              readOnly={viewAsReadOnly}
              hasDealConversation={!!dealConvoByLead[lead.id]?.hasConvo}
              dealUnreadCount={dealConvoByLead[lead.id]?.unread ?? 0}
            />
          );
        default:
          return null;
      }
    },
    [
      selected, toggleOne, getStore, canAssign, setDeviceDetailsLead,
      contactStatusOptions, updateLead, canEditLead, leadNatureOptions,
      leadCategoryOptions, subCategoryOptions, applyLeadCategory,
      statusOptions, applyLeadStatus, canBulkStatus, canViewTicket, canViewInvoice,
      viewAsReadOnly, dealConvoByLead,
    ],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        subtitle="Every enquiry in one place — capture fast, qualify when ready, follow up on time."
        actions={
          <div className="flex items-center gap-2">
            {/* Live roster of Sales Agents who are active right now (shared). */}
            <SalesAgentsOnline />
            {/* Lead follow-up bell — the current user's Due/Overdue follow-ups.
                "Open Lead" switches to the Follow-Up view and blinks the row. */}
            <LeadFollowUpBell onOpenLead={openFollowUpForLead} />
            <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm sm:flex">
              <Link href="/leads/list" className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white" title="List View"><List className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/kanban" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Kanban View"><LayoutGrid className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/map-view" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Map View"><Map className="h-3.5 w-3.5" /></Link>
            </div>
            {!viewAsReadOnly && (
              <Can permission={CAP.lead.create}>
                <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Lead
                </Button>
              </Can>
            )}
          </div>
        }
      />

      {/* ── COLLAPSIBLE CONTROL AREA ───────────────────────────────────────────
          Everything between here and the matching close tag is the
          "Lead Management control area": the date-range strip, the combined
          VIEW + New/Existing + Search + Filters + Customize/Freeze row, and the
          lifecycle Status strip. In WORK MODE (collapsed) this whole block
          contracts to height 0 (overflow-hidden, no empty containers left
          behind) so the Lead Table expands upward into the released space.
          State is PRESERVED — the children stay mounted, only their height
          animates — so every filter/search/view selection survives a collapse.
          `AnimatePresence initial={false}` keeps the first paint instant. */}
      <AnimatePresence initial={false}>
        {!controlsCollapsed && (
          <motion.div
            key="lead-controls"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5 overflow-hidden"
          >
      {/* TOP CONTROL ROW — the DATE-RANGE strip (STRIP 2) on the LEFT shares ONE
          line with Search + Filters + Customize/Freeze on the RIGHT, so the
          control area is one row shorter and the table gains that vertical
          space. The date strip is the SAME connected 8-option control used on
          Tickets, Walk-In, Field and the Dashboard (All / Today / Yesterday /
          7 Days / 1 Month / Last Month / 1 Year / Custom). The primary VIEW
          segments (Not Contacted / Follow-Ups) live in the Status strip below;
          the New/Existing customer-link filter sits next to the Collapse
          control. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs
            value={filters.dateRange}
            onChange={(v) => setFilters((f) => ({ ...f, dateRange: v as LeadDateRange }))}
            options={LEAD_DATE_RANGES.map((d) => ({ label: d.label, value: d.value }))}
            size="sm"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="w-full lg:w-72">
            <Input
              value={filters.query}
              onChange={(e: any) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search leads by ID, name, phone, email or device…"
              animatedPrefix="Search by "
              animatedWords={["lead ID", "name", "phone", "email", "device"]}
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
          {/* Table-layout controls — desktop grid only. Customize (reorder)
              and Freeze are two SEPARATE per-user preferences. */}
          <div className="hidden items-center gap-2 md:flex">
            <CustomizeColumnsMenu columns={orderedColumns} state={columnOrder} />
            <FreezeColumnsMenu columns={orderedColumns} state={frozen} />
          </div>
        </div>
      </div>

      {/* Custom date-range picker — opens only when the Custom date segment is
          selected. Full-width under the merged top row. */}
      <DateRangePicker
        open={filters.dateRange === "custom"}
        from={filters.customFrom || ""}
        to={filters.customTo || ""}
        onFromChange={(v) => setFilters((f) => ({ ...f, customFrom: v, dateRange: "custom" }))}
        onToChange={(v) => setFilters((f) => ({ ...f, customTo: v, dateRange: "custom" }))}
      />

          </motion.div>
        )}
      </AnimatePresence>

      {/* STRIP 3 ROW — the single primary filter strip on the LEFT (Not
          Contacted / Follow-Ups VIEWS + lifecycle STATUS filters, one leading
          "All"), sharing ONE line with the New/Existing customer-link filter
          and the Collapse/Expand control on the RIGHT. The strip is part of the
          control area, so it animates to height 0 when collapsed; the right-
          side controls sit OUTSIDE that animation and stay visible in both
          modes (single collapse mechanism, no duplicate). In collapsed WORK
          MODE the compact "Filters · N" + date indicators show on the left
          where the strip was. The strip stays visible for the Not-Contacted /
          Follow-Ups views too, since those segments now live inside it. */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <AnimatePresence initial={false}>
            {!controlsCollapsed && statusStripTabs.length > 1 && (
              <motion.div
                key="lead-status-strip"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <SegmentedTabs
                    value={statusStripValue}
                    onChange={onStatusStripChange}
                    options={statusStripTabs}
                    size="sm"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Compact active-state indicators (collapsed WORK MODE only) — shown
              where the status strip was, so the user still knows filters/date
              are active without reproducing the whole control area. */}
          {controlsCollapsed && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 py-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                  collapsedFilterCount > 0
                    ? "bg-[#EEF1FD] text-[#4361EE] ring-[#4361EE]/20"
                    : "bg-zinc-50 text-zinc-500 ring-zinc-200",
                )}
                title={collapsedFilterCount > 0 ? `${collapsedFilterCount} active filter${collapsedFilterCount > 1 ? "s" : ""}` : "No filters applied"}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {collapsedFilterCount > 0 ? `Filters · ${collapsedFilterCount}` : "Filters"}
              </span>
              {collapsedDateLabel && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200"
                  title={`Date range: ${collapsedDateLabel}`}
                >
                  <CalendarClock className="h-3 w-3" />
                  {collapsedDateLabel}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Right-side controls (outside the collapse animation, visible in both
            modes). Customer Master linkage — New (fresh prospect) vs Existing
            (linked) — now lives here next to the Collapse control, with its
            field name labelled so its meaning is clear. */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</span>
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
          {/* The ONE Collapse/Expand control. */}
          <WorkspaceCollapseBar
            collapsed={controlsCollapsed}
            onToggle={workspace.toggle}
          />
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

      {/* Applied-filter chips — each individually removable (Design System §3g).
          Part of the filter display, so they collapse with the control area
          (the collapsed toolbar shows a compact "Filters · N" indicator
          instead). State is untouched — expanding brings the chips right back. */}
      {!controlsCollapsed && appliedChips.length > 0 && (
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
        <LeadFollowUpView leads={filteredLeads} onOpenLead={openLead} highlightLeadId={highlightLeadId} />
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
        /* FIXED height (not max-height) so the table workspace FILLS the
           available viewport even with only a few leads — the frame grows to
           the bottom and the detached footer anchors near the viewport bottom
           (no large empty gap when zoomed out / few rows). When rows exceed the
           height the body scrolls internally with the sticky header. Measured
           from the grid's live top so it tracks the collapsed/expanded control
           area and the viewport. */
        style={gridMaxH ? { height: gridMaxH } : undefined}
      >
        {/* Explicit per-column pixel widths (deterministic with table-fixed) so
            every grouped column gets a generous width AND the frozen offsets
            line up exactly. The min-width equals their sum; the container
            scrolls horizontally on narrower viewports. */}
        <table className="w-full min-w-[2910px] table-fixed text-[14px]">
          <colgroup>
            {orderedColumns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          {/* Lead Table header uses a SOLID brand-blue fill — the same blue as
              #4261EE but with its saturation/intensity dialed down to #5368D4, so
              it reads softer and calmer on the eyes over long sessions (same hue
              and brightness, just less intense) — scoped to this table only
              (other RepairOX tables keep the shared light #D6DDFB head). White
              text + white frozen-cell fill keep it readable
              and the sticky/frozen layering intact. */}
          <thead
            className="rox-table-head sticky top-0 z-[6] [&_.rox-frozen]:!bg-[#5368D4] [&_th]:!text-white"
            style={{ background: "#5368D4", color: "#ffffff", borderBottom: "2px solid rgba(255,255,255,0.35)" }}
          >
            <tr className="text-[12px] font-bold uppercase tracking-wider">
              {orderedColumns.map((c) => {
                // HEADER alignment: most headers are CENTERED to sit symmetrically
                // over their column, EXCEPT "select" (checkbox) and "actions"
                // (right-aligned). The multi-line / rich-text columns (Contact
                // Info, Device & Issue) are LEFT-aligned so their header sits
                // over their LEFT-aligned body content. Comment is CENTERED
                // because its body is a centered note box that fills the column.
                // Long header names wrap naturally within the column width — the
                // column never expands to fit a long header.
                const LEFT_HEADERS = new Set(["contactInfo", "device"]);
                const align = c.key === "select" ? "text-left"
                  : c.key === "actions" ? "text-right"
                  : LEFT_HEADERS.has(c.key) ? "text-left"
                  : "text-center";
                // ID header is CENTERED over the column, nudged 2px to the LEFT:
                // the centred label shifts by (rightPad − leftPad)/2, so a 4px
                // gap (pl-3 = 12px, pr-4 = 16px) moves it 2px left.
                const pad = c.key === "id" ? "pl-3 pr-4 py-4" : "px-3 py-4";
                // Nudge whole columns (heading + cells together) left so the
                // "Mode of Contact" heading gets room: Lead Value −25px,
                // Agent −12px. translateX keeps column widths unchanged.
                const shift = COLUMN_SHIFT_X[c.key];
                const headProps = mergeFrozen(frozenCellProps(c.key), `${pad} ${align}`);
                if (shift) headProps.style = { ...headProps.style, transform: `translateX(${shift}px)` };
                return (
                  <th key={c.key} {...headProps}>
                    {c.key === "select" ? (
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={toggleAll}
                        aria-label="Select all leads"
                      />
                    ) : c.key === "action" || c.key === "result" ? (
                      // ACTION + RESULT are SYSTEM-DERIVED (read-only) — a small
                      // lock glyph signals they are not editable.
                      <span className="inline-flex items-center gap-1">
                        <Lock className="h-3 w-3 opacity-50" aria-hidden />
                        {c.key === "action" ? "Action" : "Result"}
                      </span>
                    ) : c.key === "id" ? (
                      "ID"
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.map((lead, i) => {
              // Whole-row urgency is now driven by the CONTACT STATUS: a
              // Not-Contacted lead reads pinkish-red for its entire row until it
              // is moved to Contacted (previously this tint came from the open
              // follow-up state — that treatment is removed).
              const notContacted = isNotContactedStatus(lead.contactStatus || "");
              const tint = notContacted ? "bg-red-100/80" : "";
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
              // Tailwind tint (bg-red-100/80). red-100 = rgb(254 226 226); use
              // the identical colour + alpha here so the frozen block and the
              // middle cells composite to one shade (no seam). Pinned mirrors
              // bg-[#7C5CFC]/[0.04].
              const rowTintVar = tint
                ? "rgb(254 226 226 / 0.8)"
                : lead.pinnedAt ? "rgb(124 92 252 / 0.04)" : undefined;
              return (
              <motion.tr
                key={lead.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.02 * i, 0.3) }}
                onClick={() => openLead(lead)}
                style={rowTintVar ? ({ ["--rox-row-tint" as any]: rowTintVar }) : undefined}
                className={cn(
                  "rox-table-row group h-[76px] cursor-pointer align-middle transition",
                  // Hover tint only for un-tinted rows — a tinted (pinned/overdue)
                  // row keeps its own colour on hover so the shade never shifts.
                  !tinted && "hover:bg-muted/40",
                  lead.pinnedAt && "bg-[#7C5CFC]/[0.04]",
                  // Whole-row urgency now reads from CONTACT STATUS: a
                  // Not-Contacted lead tints its entire row pinkish-red until it
                  // is marked Contacted.
                  tint,
                  // Tinted rows tell frozen cells to layer the SAME tint over
                  // their opaque base so the pinned/overdue tint shows through
                  // the sticky columns without ever going transparent.
                  tinted && "rox-frozen-tinted",
                )}
              >
                {/* Cells render in the USER'S saved column order (orderedColumns).
                    Each cell's content + gating + click behaviour is unchanged —
                    only its POSITION follows the personal layout. The two frozen
                    anchors (Date left, Last Action right) and the structural
                    Selection / multi-store Store columns keep their fixed slots. */}
                {orderedColumns.map((c) => {
                  // Columns whose cell owns interactive controls stop the row's
                  // open-detail click (same as the original per-cell wrappers).
                  const stops = c.key === "select" || c.key === "agent" || c.key === "device"
                    || c.key === "contactStatus" || c.key === "leadType" || c.key === "status"
                    || c.key === "actions";
                  // Body alignment mirrors the (centered) headers so each column
                  // reads as one tidy centered run. EXCEPTIONS stay as-is:
                  //  • select  → left (checkbox)
                  //  • actions → right (row menu)
                  //  • genuinely multi-line / rich-text cells (Contact Info,
                  //    Device & Issue, Comment) stay LEFT — centering wrapped
                  //    multi-line text hurts readability.
                  // Full-width pill cells (contactStatus / leadType / status /
                  // action) already fill the column, so centering the <td> is a
                  // no-op for them (the pill spans the whole width).
                  const LEFT_COLS = new Set(["select", "contactInfo", "device", "comment"]);
                  const bodyAlign = c.key === "actions" ? "text-right"
                    : LEFT_COLS.has(c.key) ? "text-left"
                    : "text-center";
                  // ID body content is pushed further RIGHT than the default 16px
                  // left padding (pl-8 = 32px) per request, keeping the normal
                  // right padding.
                  const pad = c.key === "id" ? `pl-8 pr-4 py-4 align-middle ${bodyAlign}`
                    : `px-3 py-4 align-middle ${bodyAlign}`;
                  // Match the header: shift the whole column's cell content left
                  // by the same amount (Lead Value −25px, Agent −12px).
                  const shift = COLUMN_SHIFT_X[c.key];
                  const cellProps = mergeFrozen(frozenCellProps(c.key), pad);
                  if (shift) cellProps.style = { ...cellProps.style, transform: `translateX(${shift}px)` };
                  return (
                    <td
                      key={c.key}
                      {...cellProps}
                      onClick={stops ? (e) => e.stopPropagation() : undefined}
                    >
                      {renderLeadCell(c.key, {
                        lead, wf, locked, gated, storeBranchId,
                      })}
                    </td>
                  );
                })}
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
            {leads.length === 0 && !viewAsReadOnly && <Can permission={CAP.lead.create}><Button size="sm" className="mt-2 gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> Add Lead</Button></Can>}
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading leads…</div>}
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((lead) => {
          const mLocked = isNotContactedLocked(lead);
          return (
          <div key={lead.id} onClick={() => openLead(lead)} className={cn("cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-card", selected.has(lead.id) && "border-[#4361EE] ring-1 ring-[#4361EE]/20", lead.pinnedAt && "border-[#7C5CFC]/30", isNotContactedStatus(lead.contactStatus || "") && "bg-red-100/80")}>
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
                    {/* Unread deal-conversation marker (parity with the desktop
                        Lead ID cell) — a small red dot before the pin + name. */}
                    {(dealConvoByLead[lead.id]?.unread ?? 0) > 0 && (
                      <span
                        aria-label="Unread deal conversation"
                        title="New message in the deal conversation"
                        className="h-2 w-2 shrink-0 rounded-full bg-rose-400 ring-2 ring-rose-100"
                      />
                    )}
                    {lead.pinnedAt && <Pin className="h-3 w-3 fill-[#7C5CFC] text-[#7C5CFC]" />}
                    {lead.name || "—"}
                    {!mLocked && (() => { const wf = workflowByLead[lead.id]; return wf ? <LeadStatusTick wf={wf} lead={lead} /> : null; })()}
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
              {!mLocked && (
                <LeadActionsMenu
                  lead={lead}
                  onAction={handleAction}
                  readOnly={viewAsReadOnly}
                  hasDealConversation={!!dealConvoByLead[lead.id]?.hasConvo}
                  dealUnreadCount={dealConvoByLead[lead.id]?.unread ?? 0}
                />
              )}
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

      {/* View Lead is a dedicated FULL PAGE (app/(app)/leads/[id]/page.tsx) —
          opening a lead navigates there, so there is no detail drawer here. */}

      {/* Discounted Lead → Discount approval request */}
      <DealRequestModal
        open={!!dealLead}
        onClose={() => setDealLead(null)}
        lead={dealLead}
        onDone={() => setDealLead(null)}
      />

      {/* Call Back / Follow-Up stage → inline date & time scheduler. The wording
          follows the chosen stage (Call Back vs Follow-Up). */}
      {followUpLead && (() => {
        const noun = followUpNounForStatus(followUpLead.status || "");
        return (
          <DateTimeDialog
            title={`Schedule ${noun.toLowerCase()} · ${followUpLead.leadNo}`}
            initialIso={openFollowUpsByLead.get(followUpLead.id)?.dueAt || undefined}
            onClose={() => setFollowUpLead(null)}
            onSave={async (iso) => {
              const lead = followUpLead;
              setFollowUpLead(null);
              if (!iso || !lead) return;
              const fu = await scheduleFollowUp(lead.id, { dueAt: iso });
              if (fu) toast.success(`${noun} scheduled`, { description: `${lead.leadNo} · ${new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` });
            }}
          />
        );
      })()}

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

      {/* Lead → Send Quotation (auto-mapped from the lead; review → send). */}
      <SendQuotationFlow
        lead={quotationLead}
        open={!!quotationLead}
        onClose={() => setQuotationLead(null)}
      />

      {/* Device & Issue details popup — mirrors the Ticket / Walk-In device
          overlay. One consistent popup for a single OR multiple devices. */}
      <LeadDeviceDetailsOverlay
        lead={deviceDetailsLead}
        open={!!deviceDetailsLead}
        onClose={() => setDeviceDetailsLead(null)}
      />

      {/* In-place deal-conversation chat popover (opened from the Last Action
          chat icon). Reuses the ONE shared DealConversation thread; portalled so
          it isn't clipped by the data-grid overflow. */}
      {dealChat && (() => {
        const deal = dealById(dealChat.dealId);
        if (!deal) return null;
        return (
          <DealConversationPopover
            deal={deal}
            anchorRect={dealChat.rect}
            readOnly={viewAsReadOnly}
            subtitle={`${deal.dealNo}${dealChat.leadNo ? ` · Lead ${dealChat.leadNo}` : ""}`}
            onClose={() => setDealChat(null)}
          />
        );
      })()}
    </div>
  );
}
