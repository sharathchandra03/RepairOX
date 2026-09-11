"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Shop → Walk-In

   A fast, structured replacement for the sales team's Excel process, fully
   connected to the Customer, Employee, Device Catalog and Ticket systems.

   Business structure (spreadsheet is the source of truth):
     DATE · ID · TYPE · SOURCE · NAME · CONTACT · MODEL · ISSUE · FINAL STATUS · ACTION

   One shared dataset drives the table AND the report. WON is defined once in
   `isWalkInWon`. Reuses existing RepairOX components throughout.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus, Download, Upload, Search, Eye, Pencil, MoreHorizontal, Trash2,
  Ticket as TicketIcon, Pin, PinOff, LayoutList, BarChart3, Filter, X, Check,
  Phone, Mail, Clock, ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { EmptyStateCharacter } from "@/components/common/empty-state-character";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { PinnedFilterBar, type PinnableFilterDef } from "@/components/tickets/pinned-filter-bar";
import { usePinnedFilters } from "@/hooks/use-pinned-filters";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import {
  WALKIN_STATUS_LABEL, WALKIN_STATUS_TONE, WALKIN_TYPE_LABEL, WALKIN_TYPE_TONE, WALKIN_TYPE_BAR,
  WALKIN_FINAL_STATUSES, type WalkIn, type WalkInStatus, isWalkInWon, hasActiveFollowUp,
  FOLLOWUP_OUTCOME_LABEL,
} from "@/lib/mock-data";
import {
  useWalkInSources, useWalkInRequireSalesPerson, nextWalkInNumber, genWalkInId, walkInDisplayId,
  isWalkInInDateRange, WALKIN_DATE_RANGES, type WalkInDateRange, followUpState, followUpPill,
} from "@/lib/walk-in-data";
import { useSession } from "@/lib/use-session";
import { cn } from "@/lib/utils";
import { WalkInFormDrawer } from "@/components/walk-in/walk-in-form-drawer";
import { WalkInImportModal } from "@/components/walk-in/walk-in-import-modal";
import { WalkInReport } from "@/components/walk-in/walk-in-report";
import { PushToTicketIcon } from "@/components/walk-in/push-to-ticket-icon";
import { WalkInFollowUpBell } from "@/components/walk-in/walk-in-followup-bell";
import { WalkInFollowUpView } from "@/components/walk-in/walk-in-followup-view";
import { WalkInFollowUpCell, WalkInFollowUpCompleteModal } from "@/components/walk-in/walk-in-followup-cell";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // 2-digit year (e.g. "8 Sept 26") to keep the Date column compact.
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

export default function WalkInPage() {
  const router = useRouter();
  const { walkIns, addWalkIn, updateWalkIn, deleteWalkIn, pinWalkIn, tickets, team, issueLibrary } = useStore();
  const { can } = usePermissions();
  const { id: sessionUserId, name: sessionUserName } = useSession();
  const { sources } = useWalkInSources();
  const { requireSalesPerson } = useWalkInRequireSalesPerson();
  // Individual filter pinning (own storage key so it doesn't collide with Tickets).
  const { pinnedIds, unpin, togglePin, isPinned } = usePinnedFilters("repairox-walkin-pinned-filters");

  const [view, setView] = useState<"table" | "report" | "followup">("table");
  // Sub-view inside the Follow-Up tab: actionable queue vs. completed history.
  const [followUpSub, setFollowUpSub] = useState<"active" | "history">("active");

  // Filters
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [salesFilter, setSalesFilter] = useState<string>("all");
  // Follow-Up filters (spec §33/§47): schedule state, attempt #, outcome.
  const [followUpFilter, setFollowUpFilter] = useState<string>("all");
  const [followUpAttemptFilter, setFollowUpAttemptFilter] = useState<string>("all");
  const [followUpOutcomeFilter, setFollowUpOutcomeFilter] = useState<string>("all");
  // Issue filter (from the shared Issue Master) + conversion filter (linked ticket).
  const [issueFilter, setIssueFilter] = useState<string>("all");
  const [conversionFilter, setConversionFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<WalkInDateRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  /* ─── Sticky frozen workspace (view switch + filters + search + table header) ──
     The top block (tabs, date pills, filters, search) pins just below the app
     topbar; the table header then pins flush beneath it. Offsets are measured
     at runtime so there's no seam or layout jump — identical to Tickets/Invoice. */
  const stickyWrapRef = useRef<HTMLDivElement>(null);
  const [stickyTop, setStickyTop] = useState(60);
  const [wrapH, setWrapH] = useState(0);
  useEffect(() => {
    const wrap = stickyWrapRef.current;
    if (!wrap) return;
    let node: HTMLElement | null = wrap;
    let bar: HTMLElement | null = null;
    while (node && node.parentElement) {
      const parent: HTMLElement = node.parentElement;
      const oy = getComputedStyle(parent).overflowY;
      if (oy === "auto" || oy === "scroll") { bar = parent.firstElementChild as HTMLElement | null; break; }
      node = parent;
    }
    const measure = () => {
      setWrapH(wrap.offsetHeight);
      if (bar) setStickyTop(bar.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (bar) ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  const theadTop = stickyTop + wrapH;

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<WalkIn | null>(null);
  const [viewTarget, setViewTarget] = useState<WalkIn | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WalkIn | null>(null);
  // Target for the SAFE follow-up completion dialog (outcome + next action).
  const [completeTarget, setCompleteTarget] = useState<WalkIn | null>(null);
  // Pending inline Final-Status change awaiting user confirmation.
  const [statusChange, setStatusChange] = useState<{ walkIn: WalkIn; next: WalkInStatus } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const openedDeepLinkRef = useRef(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Deep link: /walk-in?walkIn=<id> opens that walk-in's view drawer once it
  // has loaded (used by the Lead → "Convert to Walk-In" store hand-off).
  useEffect(() => {
    if (openedDeepLinkRef.current) return;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const id = params.get("walkIn");
    if (!id) return;
    const w = walkIns.find((x) => x.id === id);
    if (w) { setViewTarget(w); openedDeepLinkRef.current = true; }
  }, [walkIns]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Reset to page 1 whenever a filter/search changes.
  useEffect(() => { setPage(1); }, [q, typeFilter, sourceFilter, statusFilter, salesFilter, followUpFilter, followUpAttemptFilter, followUpOutcomeFilter, issueFilter, conversionFilter, dateRange, customFrom, customTo]);

  /* ── The single filtered dataset (table + report share this) ── */
  const filtered = useMemo(() => {
    const rows = walkIns.filter((w) => {
      if (!isWalkInInDateRange(w.date, dateRange, customFrom, customTo)) return false;
      if (typeFilter !== "all" && (w.type ?? "direct") !== typeFilter) return false;
      if (sourceFilter !== "all" && w.source !== sourceFilter) return false;
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (salesFilter !== "all" && w.salesPersonId !== salesFilter) return false;
      if (followUpFilter !== "all") {
        const fs = followUpState(w);
        if (followUpFilter === "active" && !hasActiveFollowUp(w)) return false;
        else if (followUpFilter === "today" && fs !== "today") return false;
        else if (followUpFilter === "overdue" && fs !== "overdue") return false;
        else if (followUpFilter === "upcoming" && fs !== "upcoming") return false;
        else if (followUpFilter === "completed" && fs !== "completed") return false;
        else if (followUpFilter === "none" && fs !== "none") return false;
      }
      if (followUpAttemptFilter !== "all") {
        const n = Number(followUpAttemptFilter);
        // Matches the active attempt OR any recorded attempt in history.
        const active = w.followUpAttempt ?? ((w.followUpHistory?.length ?? 0) + (w.followUpDate ? 1 : 0));
        const inHistory = (w.followUpHistory ?? []).some((r) => r.attempt === n);
        if (active !== n && !inHistory) return false;
      }
      if (followUpOutcomeFilter !== "all") {
        const hasOutcome = (w.followUpHistory ?? []).some((r) => r.outcome === followUpOutcomeFilter);
        if (!hasOutcome) return false;
      }
      if (issueFilter !== "all") {
        // Issue is a comma-separated list of Issue-Master values; match any part.
        const parts = `${w.issue ?? ""}`.split(",").map((s) => s.trim().toLowerCase());
        if (!parts.includes(issueFilter.toLowerCase())) return false;
      }
      if (conversionFilter !== "all") {
        const converted = !!w.linkedTicketId;
        if (conversionFilter === "converted" && !converted) return false;
        if (conversionFilter === "not_converted" && converted) return false;
      }
      if (q.trim()) {
        const hay = `${walkInDisplayId(w)} ${w.customer} ${w.phone} ${w.model} ${w.issue ?? ""} ${(w.reasons || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    // Newest first, pinned floated to the top.
    const ordered = [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const pinned = ordered.filter((w) => w.pinnedAt);
    const normal = ordered.filter((w) => !w.pinnedAt);
    return [...pinned, ...normal];
  }, [walkIns, dateRange, customFrom, customTo, typeFilter, sourceFilter, statusFilter, salesFilter, followUpFilter, followUpAttemptFilter, followUpOutcomeFilter, issueFilter, conversionFilter, q]);

  /* Dataset for the Follow-Up view. It is synced with the top date strip, but
     the range applies to the FOLLOW-UP date (not the walk-in creation date) —
     a follow-up is about WHEN the customer needs contacting. Type / Source /
     Final-Status filters and the search box also apply so the list stays
     consistent with the toolbar. */
  const followUpRows = useMemo(() => {
    return walkIns.filter((w) => {
      // Only walk-ins with an ACTIVE follow-up (scheduled, not completed, not
      // converted / terminal) — the single shared definition (spec §26/§27).
      if (!hasActiveFollowUp(w)) return false;
      // The date strip applies to the FOLLOW-UP scheduled date here (spec §48),
      // NOT the walk-in creation date. "All" shows every active follow-up.
      if (!isWalkInInDateRange(w.followUpDate!, dateRange, customFrom, customTo)) return false;
      if (typeFilter !== "all" && (w.type ?? "direct") !== typeFilter) return false;
      if (sourceFilter !== "all" && w.source !== sourceFilter) return false;
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (salesFilter !== "all" && w.salesPersonId !== salesFilter) return false;
      if (q.trim()) {
        const hay = `${walkInDisplayId(w)} ${w.customer} ${w.phone} ${w.model} ${w.issue ?? ""} ${(w.reasons || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [walkIns, dateRange, customFrom, customTo, typeFilter, sourceFilter, statusFilter, salesFilter, q]);

  /* History dataset for the Follow-Up → History sub-view: walk-ins that have at
     least one COMPLETED follow-up attempt. Nothing is deleted on completion, so
     this is the permanent audit trail. The date strip applies to the most recent
     completed attempt's date; toolbar filters + search still apply. Ordered by
     most-recently-completed first. */
  const followUpHistoryRows = useMemo(() => {
    const rows = walkIns.filter((w) => {
      const hist = w.followUpHistory ?? [];
      if (hist.length === 0) return false;
      const lastDate = hist[hist.length - 1]?.scheduledDate || w.date;
      if (!isWalkInInDateRange(lastDate, dateRange, customFrom, customTo)) return false;
      if (typeFilter !== "all" && (w.type ?? "direct") !== typeFilter) return false;
      if (sourceFilter !== "all" && w.source !== sourceFilter) return false;
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (salesFilter !== "all" && w.salesPersonId !== salesFilter) return false;
      if (q.trim()) {
        const hay = `${walkInDisplayId(w)} ${w.customer} ${w.phone} ${w.model} ${w.issue ?? ""} ${(w.reasons || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      const la = a.followUpHistory?.[a.followUpHistory.length - 1]?.completedAt || "";
      const lb = b.followUpHistory?.[b.followUpHistory.length - 1]?.completedAt || "";
      return lb.localeCompare(la);
    });
  }, [walkIns, dateRange, customFrom, customTo, typeFilter, sourceFilter, statusFilter, salesFilter, q]);

  // Pagination math
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  /* Selection — select-all operates over the whole filtered set. */
  const allSelected = filtered.length > 0 && filtered.every((w) => selected.has(w.id));
  const someSelected = filtered.some((w) => selected.has(w.id));
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((w) => w.id)));
  }, [allSelected, filtered]);
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  // Drop selections that fall outside the current filter/search.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(filtered.map((w) => w.id));
      const next = new Set(Array.from(prev).filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  /* Resolve a linked ticket's human-readable number (T-###) from its stable
     internal id. Matches by primary id OR by ticketNo (older links stored the
     display number). Never exposes the internal "TK-…" primary key — if the
     ticket record can't be found and the stored value is a raw internal id,
     show a neutral "Ticket" label instead of the ugly code. */
  const ticketNoFor = useCallback((ticketId?: string) => {
    if (!ticketId) return undefined;
    const t = tickets.find((x) => x.id === ticketId || x.ticketNo === ticketId);
    if (t?.ticketNo) return t.ticketNo;
    // The stored value is already a human number (e.g. "T-057").
    if (/^T-\d+/i.test(ticketId)) return ticketId;
    // Unresolved internal id (e.g. "TK-…") — don't surface the raw code.
    return "Ticket";
  }, [tickets]);

  /* Definitions for the pinnable filters — shared by the pinned-filter bar and
     the advanced filter panel so a filter behaves identically in both places. */
  const pinnableFilters: PinnableFilterDef[] = useMemo(() => [
    {
      id: "type", label: "Type", type: "select", value: typeFilter,
      options: [{ label: "All Types", value: "all" }, { label: WALKIN_TYPE_LABEL.direct, value: "direct" }, { label: WALKIN_TYPE_LABEL.sales, value: "sales" }],
      onChange: setTypeFilter,
    },
    {
      id: "source", label: "Source", type: "select", value: sourceFilter,
      options: [{ label: "All Sources", value: "all" }, ...sources.map((s) => ({ label: s, value: s }))],
      onChange: setSourceFilter,
    },
    {
      id: "issue", label: "Issue", type: "select", value: issueFilter,
      // Sourced from the shared Issue Master so it matches the table's Issue column.
      options: [{ label: "All Issues", value: "all" }, ...[...issueLibrary].sort((a, b) => a.localeCompare(b)).map((i) => ({ label: i, value: i }))],
      onChange: setIssueFilter,
    },
    {
      id: "status", label: "Final Status", type: "select", value: statusFilter,
      options: [{ label: "All Statuses", value: "all" }, ...WALKIN_FINAL_STATUSES.map((s) => ({ label: WALKIN_STATUS_LABEL[s], value: s }))],
      onChange: setStatusFilter,
    },
    {
      id: "conversion", label: "Conversion", type: "select", value: conversionFilter,
      // Maps to the table's conversion check / linked-ticket indicator.
      options: [
        { label: "All", value: "all" },
        { label: "Converted", value: "converted" },
        { label: "Not Converted", value: "not_converted" },
      ],
      onChange: setConversionFilter,
    },
    {
      id: "followUp", label: "Follow-Up", type: "select", value: followUpFilter,
      options: [
        { label: "All", value: "all" },
        { label: "Active", value: "active" },
        { label: "Due Today", value: "today" },
        { label: "Overdue", value: "overdue" },
        { label: "Upcoming", value: "upcoming" },
        { label: "Completed", value: "completed" },
        { label: "No Follow-Up", value: "none" },
      ],
      onChange: setFollowUpFilter,
    },
    {
      id: "followUpAttempt", label: "Follow-Up Attempt", type: "select", value: followUpAttemptFilter,
      options: [
        { label: "Any Attempt", value: "all" },
        { label: "1st Attempt", value: "1" },
        { label: "2nd Attempt", value: "2" },
        { label: "3rd Attempt", value: "3" },
      ],
      onChange: setFollowUpAttemptFilter,
    },
    {
      id: "followUpOutcome", label: "Follow-Up Outcome", type: "select", value: followUpOutcomeFilter,
      options: [
        { label: "Any Outcome", value: "all" },
        ...(Object.keys(FOLLOWUP_OUTCOME_LABEL) as (keyof typeof FOLLOWUP_OUTCOME_LABEL)[])
          .map((o) => ({ label: FOLLOWUP_OUTCOME_LABEL[o], value: o })),
      ],
      onChange: setFollowUpOutcomeFilter,
    },
    {
      id: "responsible", label: "Responsible", type: "select", value: salesFilter,
      options: [
        { label: "All Staff", value: "all" },
        ...team.filter((m) => m.status === "active").map((m) => ({ label: m.name, value: m.id })),
      ],
      onChange: setSalesFilter,
    },
    {
      id: "dateRange", label: "Date Range", type: "select", value: dateRange,
      options: WALKIN_DATE_RANGES.map((d) => ({ label: d.label, value: d.value })),
      onChange: (v: string) => setDateRange(v as WalkInDateRange),
    },
  ], [typeFilter, sourceFilter, statusFilter, followUpFilter, followUpAttemptFilter, followUpOutcomeFilter, salesFilter, dateRange, sources, team, issueFilter, conversionFilter, issueLibrary]);

  /* ── Save (create or edit) ── */
  const handleSaved = useCallback(async (data: Partial<WalkIn>, editingId: string | null) => {
    if (editingId) {
      await updateWalkIn(editingId, data);
      showToast("Walk-In updated.");
    } else {
      const record: WalkIn = {
        id: genWalkInId(),
        walkInNumber: nextWalkInNumber(walkIns),
        date: data.date || new Date().toISOString().slice(0, 10),
        time: data.time || new Date().toTimeString().slice(0, 5),
        type: data.type || "direct",
        customer: data.customer || "",
        phone: data.phone || "",
        email: data.email || "",
        source: data.source || "",
        category: "",
        model: data.model || "",
        modelId: data.modelId,
        issue: data.issue || "",
        customerComments: data.customerComments || "",
        reasons: [],
        status: data.status || "visitor",
        salesPersonId: data.salesPersonId,
        salesPersonName: data.salesPersonName,
        customerId: data.customerId,
        followUpDate: data.followUpDate,
        followUpTime: data.followUpTime,
        followUpStatus: data.followUpStatus,
        followUpAttempt: data.followUpDate ? (data.followUpAttempt || 1) : undefined,
        followUpComments: data.followUpComments,
        invoiceValue: 0,
        businessValue: 0,
      };
      await addWalkIn(record);
      showToast(`Walk-In ${record.walkInNumber} created.`);
    }
    setShowCreate(false);
    setEditTarget(null);
  }, [walkIns, addWalkIn, updateWalkIn, showToast]);

  /* ── Convert Walk-In → Ticket ──
     Does NOT create a ticket directly. It opens the EXISTING ticket creation
     wizard, landing on the Device Details step, prefilled from this walk-in
     (via ?fromWalkIn=). The ticket is only created when the user completes the
     wizard, which then links the ticket back to this walk-in. Duplicate
     protection: a walk-in that already has a linked ticket opens that ticket
     instead of starting a new conversion. */
  const handleConvert = useCallback((w: WalkIn) => {
    if (w.linkedTicketId) {
      router.push(`/tickets/${w.linkedTicketId}`);
      return;
    }
    router.push(`/tickets/new?fromWalkIn=${encodeURIComponent(w.id)}&from=walk-in`);
  }, [router]);

  /* ── Inline Final Status change (from the table pill dropdown) ──
     Picking "Converted Ticket" on a walk-in that has NOT been converted yet does
     NOT silently flip the status — a ticket must actually be created first, so
     we route into the existing push-to-ticket flow (handleConvert). The status
     becomes "converted_ticket" only when that wizard completes and links a
     ticket back. Every other status change persists immediately via the store. */
  const handleStatusChange = useCallback((w: WalkIn, next: WalkInStatus) => {
    if (next === w.status) return;
    if (next === "converted_ticket" && !w.linkedTicketId) {
      handleConvert(w);
      return;
    }
    // Terminal outcomes (Lost / Closed) close any active follow-up: the pending
    // reminder is cancelled so no future notification fires, while the follow-up
    // history is preserved (spec §25/§46).
    const terminal = next === "lost" || next === "closed";
    const patch: Partial<WalkIn> = { status: next };
    if (terminal && hasActiveFollowUp(w)) {
      patch.followUpStatus = "done";
      patch.followUpDate = undefined;
      patch.followUpTime = undefined;
      patch.followUpAttempt = undefined;
      patch.followUpComments = undefined;
      patch.followUpReadAt = w.followUpReadAt || new Date().toISOString();
    }
    updateWalkIn(w.id, patch);
    showToast(`Status updated to ${WALKIN_STATUS_LABEL[next]}.`);
  }, [handleConvert, updateWalkIn, showToast]);

  /* ── Follow-up notification actions ── */
  const handleFollowUpRead = useCallback((w: WalkIn) => {
    if (w.followUpReadAt) return;
    updateWalkIn(w.id, { followUpReadAt: new Date().toISOString() });
  }, [updateWalkIn]);

  /* Persist any follow-up lifecycle change emitted by the Follow-Up cell
     (schedule / reschedule / mark contacted / complete+outcome / cancel /
     schedule-next). One place, one store write — history + active schedule
     both live on the record. */
  const handleFollowUpUpdate = useCallback((w: WalkIn, patch: Partial<WalkIn>) => {
    updateWalkIn(w.id, patch);
  }, [updateWalkIn]);

  /* Follow-up "due" indications (toast + topbar bell notification + sound) are
     handled globally by <WalkInFollowUpWatcher /> mounted in the (app) layout,
     so they fire on any page — not just here — and never double-fire. */

  const anyFilterActive = typeFilter !== "all" || sourceFilter !== "all" || statusFilter !== "all" || salesFilter !== "all" || followUpFilter !== "all" || followUpAttemptFilter !== "all" || followUpOutcomeFilter !== "all" || issueFilter !== "all" || conversionFilter !== "all";
  const canDelete = can("delete") || can("full_access") || can("manage_repair_jobs");

  // Count of walk-ins with an ACTIVE follow-up (shown on the Follow-Up tab).
  const activeFollowUpCount = useMemo(() => walkIns.filter((w) => hasActiveFollowUp(w)).length, [walkIns]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shop"
        title="Walk-In"
        subtitle="Capture, follow up and convert every customer visit."
        actions={
          <>
            <Can permission={["use_pos", "import_data", "manage_repair_jobs"]}>
              <Button variant="outline" size="md" className="rounded-full" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" /> Import
              </Button>
            </Can>
            <Can permission={["export_reports", "export_csv", "use_pos"]}>
              <Button variant="outline" size="md" className="rounded-full" onClick={() => exportWalkIns(filtered, ticketNoFor)}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </Can>
            <Can permission={["use_pos", "manage_repair_jobs", "manage_sales"]}>
              <Button size="md" className="rounded-full" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> New Walk-In
              </Button>
            </Can>
          </>
        }
      />

      {/* ── STICKY FROZEN WORKSPACE ──────────────────────────────────────
          View switch + date pills + advanced filters + search pin together as
          one block just below the app topbar (identical to Tickets/Invoice).
          The table header then pins flush beneath this wrapper. */}
      <div
        ref={stickyWrapRef}
        style={{ top: stickyTop }}
        className="sticky z-10 -mt-5 space-y-5 bg-[hsl(var(--background))] pt-5 pb-5 shadow-[-32px_0_0_0_hsl(var(--background)),32px_0_0_0_hsl(var(--background))]"
      >
      {/* View switch: Table / Report */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={view}
          onChange={(v) => setView(v as "table" | "report" | "followup")}
          options={[
            { label: "Walk-Ins", value: "table" },
            { label: <span className="pl-[2px]">Summary</span>, value: "report" },
            {
              label: (
                <span className="inline-flex items-center gap-2">
                  Follow-Up
                  {activeFollowUpCount > 0 && (
                    <span
                      className={cn(
                        "inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold leading-none tabular-nums",
                        // A crisp white pill on the active (blue) tab; brand-blue
                        // pill on the inactive (grey) tab. Fixed height + centred
                        // so a single digit reads as a clean circle, not squished.
                        view === "followup" ? "bg-white text-[#4361EE]" : "bg-[#4361EE] text-white",
                      )}
                      style={{ minWidth: 18 }}
                    >
                      {activeFollowUpCount > 99 ? "99+" : activeFollowUpCount}
                    </span>
                  )}
                </span>
              ),
              value: "followup",
            },
          ]}
          size="sm"
          className="[&>button]:px-3"
        />
        {view !== "report" && (
          <div className="flex items-center gap-2">
            <WalkInFollowUpBell
              walkIns={walkIns}
              displayId={walkInDisplayId}
              onOpenWalkIn={(w) => setViewTarget(w)}
              onMarkRead={handleFollowUpRead}
              onCompleteFollowUp={(w) => setCompleteTarget(w)}
            />
            {view === "table" && (
              <Button
                variant={showFilters || anyFilterActive ? "soft" : "outline"}
                size="sm"
                className="rounded-full"
                onClick={() => setShowFilters((s) => !s)}
              >
                <Filter className="h-3.5 w-3.5" /> Filters{anyFilterActive ? " ·" : ""}
              </Button>
            )}
            <div className="w-56 sm:w-72">
              <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Search ID, name, contact, model, issue…" iconLeft={<Search className="h-4 w-4" />} />
            </div>
          </div>
        )}
      </div>

      {/* Date-range strip (shared by table + report) — matches the Tickets/Invoice
          8-option strip exactly for visual uniformity across modules. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {WALKIN_DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-6 py-1.5 text-center text-xs font-semibold transition-all",
                dateRange === r.value
                  ? "bg-[#4361EE] text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.4)]"
                  : "bg-muted text-muted-foreground hover:bg-slate-200 hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <DateRangePicker
          open={dateRange === "custom"}
          from={customFrom}
          to={customTo}
          onFromChange={(v) => { setCustomFrom(v); setDateRange("custom"); }}
          onToChange={(v) => { setCustomTo(v); setDateRange("custom"); }}
        />
      </div>

      {/* Pinned filters bar — the filters the user chose to keep visible. */}
      {view === "table" && (
        <PinnedFilterBar filters={pinnableFilters} pinnedIds={pinnedIds} onUnpin={unpin} />
      )}

      {/* Advanced filters */}
      {view === "table" && showFilters && (
        <motion.div
          initial={{ opacity: 0, scaleY: 0.95 }}
          animate={{ opacity: 1, scaleY: 1 }}
          style={{ transformOrigin: "top" }}
          transition={{ duration: 0.15 }}
          className="rounded-2xl border border-border bg-card px-4 py-3 shadow-card"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Advanced Filters</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setTypeFilter("all"); setSourceFilter("all"); setStatusFilter("all"); setSalesFilter("all"); setFollowUpFilter("all"); setFollowUpAttemptFilter("all"); setFollowUpOutcomeFilter("all"); setIssueFilter("all"); setConversionFilter("all"); setDateRange("today"); setCustomFrom(""); setCustomTo(""); }}
                className="text-[13px] font-semibold text-[#4361EE] hover:underline"
              >
                Reset Filters
              </button>
              <button
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
                title="Close filters"
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* One compact row on desktop: Type · Source · Final Status · Date Range.
              Each select is bound DIRECTLY to its state setter, so selecting a
              value filters immediately — pinning is purely optional personalization. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pinnableFilters.map((f) => (
              <PinnableField
                key={f.id}
                label={f.label}
                pinned={isPinned(f.id)}
                onTogglePin={() => togglePin(f.id)}
              >
                <Select
                  value={f.value}
                  onChange={(e: any) => f.onChange(e.target.value)}
                  options={f.options || []}
                />
              </PinnableField>
            ))}
          </div>
        </motion.div>
      )}

      {/* Bulk selection bar — sits ABOVE the table header as its own row. */}
      {view === "table" && someSelected && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-xs font-semibold text-[#4361EE]">
            {selected.size} selected
          </span>
          {canDelete && (
            <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkDelete(true)}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-1 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </motion.div>
      )}
      </div>
      {/* ── END STICKY FROZEN WORKSPACE ── */}

      {/* ── SUMMARY (REPORT) VIEW ── */}
      {view === "report" ? (
        <WalkInReport
          rows={filtered}
          allRows={walkIns}
          dateRange={dateRange}
          customFrom={customFrom}
          customTo={customTo}
          onCustomRangeChange={(from, to) => {
            setCustomFrom(from);
            setCustomTo(to);
            setDateRange("custom");
          }}
        />
      ) : view === "followup" ? (
        /* ── FOLLOW-UP VIEW ──
           Only walk-ins with a pending follow-up, ordered overdue → today →
           upcoming. Reuses the filtered dataset so search + type/source/status
           filters still apply; rows open the existing Edit Walk-In. */
        <WalkInFollowUpView
          mode={followUpSub}
          onModeChange={setFollowUpSub}
          rows={followUpSub === "active" ? followUpRows : followUpHistoryRows}
          activeCount={followUpRows.length}
          historyCount={followUpHistoryRows.length}
          currentUserId={sessionUserId}
          currentUserName={sessionUserName}
          statusLabel={WALKIN_STATUS_LABEL}
          statusTone={WALKIN_STATUS_TONE}
          onOpen={(w) => setEditTarget(w)}
          onUpdate={handleFollowUpUpdate}
          onConvert={handleConvert}
        />
      ) : (
        /* ── TABLE VIEW ──
           Straight (square) card with a flat bordered header — identical edge
           treatment to the Tickets/Invoice tables. No overflow-hidden on the
           card; the inner wrapper below documents the responsive strategy. */
        <div className="-mt-5 border-2 border-zinc-200 bg-card shadow-card">
          {/* Same responsive architecture as the Tickets/Invoice tables:
             `table-fixed` + `w-full` makes the table lay out to EXACTLY its
             container width and honour the fixed column widths below, so as the
             viewport narrows (browser zoom, small laptop, responsive breakpoint)
             every column shrinks together in proportion instead of the table
             overflowing and the rightmost Action column being pushed off and
             clipped. The wrapper uses [overflow-x:clip] (not auto) — an
             overflow:auto/scroll ancestor would become the scroll container for
             the sticky <thead> and break the header freeze. Because table-fixed
             guarantees the table already fits the container, clipping never
             hides the Action column. Overflow stays inside this table region,
             so the app shell (min-w-0 / overflow-y-auto) never scrolls sideways. */}
          <div className="[overflow-x:clip]">
            <table className="w-full table-fixed text-[14px]">
              {/* Column widths mirror the Tickets table strategy: compact/stable
                  columns get a fixed px width so they never collapse, while the
                  free-text columns (Name / Model / Issue) use % widths and
                  absorb the shrink/growth as the viewport changes. Action is a
                  fixed width so its icons never collapse or wrap. */}
              <colgroup>
                <col className="w-9" />{/* checkbox */}
                <col className="w-[104px]" />{/* Date */}
                <col className="w-[92px]" />{/* ID */}
                <col className="w-[96px]" />{/* Type */}
                <col className="w-[104px]" />{/* Source */}
                <col className="w-[20%]" />{/* Name (+ contact underneath) — flexible */}
                <col className="w-[16%]" />{/* Model — flexible */}
                <col className="w-[19%]" />{/* Issue — flexible */}
                <col className="w-[150px]" />{/* Follow-Up — wide enough for "2nd Follow-Up · Today" */}
                <col className="w-[136px]" />{/* Final Status */}
                <col className="w-[140px]" />{/* Action — fixed so the 3 icons never collapse/wrap */}
              </colgroup>
              <thead style={{ top: theadTop }} className="sticky z-[5] bg-[#D6DDFB] border-b-2 border-[#4361EE]/25">
                <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
                  <th className="pl-5 pr-2 py-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30"
                      aria-label="Select all walk-ins"
                    />
                  </th>
                  <th className="px-2 py-4 whitespace-nowrap">Date</th>
                  <th className="py-4 whitespace-nowrap"><span className="inline-block pl-[8px]">ID</span></th>
                  <th className="py-4"><span className="inline-block pl-[17px]">Type</span></th>
                  <th className="py-4 pl-[14px]">Source</th>
                  <th className="pl-4 py-4"><span className="inline-block pl-[17px]">Name</span></th>
                  <th className="pl-4 py-4">Model</th>
                  <th className="pl-4 py-4">Issue</th>
                  <th className="pl-4 py-4">Follow-Up</th>
                  <th className="pl-[5px] py-4">Final Status</th>
                  <th className="px-4 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((w, i) => (
                  <motion.tr
                    key={w.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.015 * i, 0.2) }}
                    className={cn("group h-[68px] border-t border-border align-middle transition", selected.has(w.id) ? "bg-indigo-50/40" : w.pinnedAt ? "bg-amber-50/40" : "hover:bg-muted/40")}
                  >
                    <td className="pl-5 pr-2 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(w.id)}
                        onChange={() => toggleOne(w.id)}
                        className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30"
                        aria-label={`Select walk-in ${walkInDisplayId(w)}`}
                      />
                    </td>
                    <td className="px-2 py-4 whitespace-nowrap text-[13px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {w.pinnedAt && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                        {fmtDate(w.date)}
                      </div>
                    </td>
                    <td className="py-4 pr-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditTarget(w)}
                          title={`Edit ${walkInDisplayId(w)}`}
                          className="cursor-pointer rounded text-[14px] font-semibold text-foreground transition-colors hover:text-[#4361EE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40"
                        >
                          {walkInDisplayId(w)}
                        </button>
                        {/* Blue conversion check — only when a Ticket has actually
                            been created and persisted (linkedTicketId). Same visual
                            concept as the Ticket table's invoice indicator, in blue. */}
                        {w.linkedTicketId && (
                          <span
                            title="Converted to Ticket"
                            aria-label="Converted to Ticket"
                            className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#4361EE] text-white ring-1 ring-inset ring-[#3651d4]"
                          >
                            <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-4 pl-[2px]">
                      <span className={cn("inline-flex min-w-[76px] items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", WALKIN_TYPE_TONE[w.type ?? "direct"])}>
                        {WALKIN_TYPE_LABEL[w.type ?? "direct"]}
                      </span>
                      {w.type === "sales" && w.salesPersonName && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[120px]">{w.salesPersonName}</p>
                      )}
                    </td>
                    <td className="py-4 pr-4 pl-[19px] text-[13px]">{w.source || "—"}</td>
                    <td className="pl-4 py-4 pr-4">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {/* Thin type-coloured bar — same hue as the Type pill for uniformity. */}
                        <span className={cn("h-8 w-1 shrink-0 rounded-full", WALKIN_TYPE_BAR[w.type ?? "direct"])} />
                        <div className="min-w-0">
                          <span className="block truncate text-[14px] font-medium">{w.customer}</span>
                          {/* Contact moved under the name to save a whole column.
                              Still clickable → opens Edit, same as before. */}
                          {w.phone ? (
                            <button
                              type="button"
                              onClick={() => setEditTarget(w)}
                              title={`Edit ${walkInDisplayId(w)}`}
                              className="cursor-pointer rounded text-[12px] tabular-nums text-muted-foreground transition-colors hover:text-[#4361EE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40"
                            >
                              {w.phone}
                            </button>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="pl-4 py-4 pr-4 text-[13px] max-w-[150px]">
                      {w.model ? (
                        <button
                          type="button"
                          onClick={() => setEditTarget(w)}
                          title={`Edit ${walkInDisplayId(w)}`}
                          className="block max-w-full cursor-pointer truncate rounded text-left transition-colors hover:text-[#4361EE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40"
                        >
                          {w.model}
                        </button>
                      ) : "—"}
                    </td>
                    <td className="pl-4 py-4 pr-4 text-[13px] text-muted-foreground truncate max-w-[190px]" title={w.issue || (w.reasons || []).join(", ")}>
                      {w.issue || (w.reasons || []).join(", ") || "—"}
                    </td>
                    {/* Follow-Up — interactive compact pill managing the multi-stage
                        lifecycle. Sits immediately before Final Status. */}
                    <td className="pl-4 py-4 pr-4" onClick={(e) => e.stopPropagation()}>
                      <WalkInFollowUpCell
                        walkIn={w}
                        currentUserId={sessionUserId}
                        currentUserName={sessionUserName}
                        onUpdate={(patch) => handleFollowUpUpdate(w, patch)}
                        onConvert={handleConvert}
                      />
                    </td>
                    <td className="py-4 pr-4 pl-0 [&>*:first-child]:-ml-[4px]" onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        align="left"
                        width="w-52"
                        trigger={({ toggle }) => (
                          <button
                            onClick={toggle}
                            title="Change status"
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
                              WALKIN_STATUS_TONE[w.status],
                              w.status === "converted_ticket" && "-ml-[2px]",
                            )}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {WALKIN_STATUS_LABEL[w.status]}
                            <ChevronDown className="h-3 w-3 opacity-70" />
                          </button>
                        )}
                      >
                        {(close) => (
                          <>
                            {WALKIN_FINAL_STATUSES.map((s) => (
                              <MenuItem
                                key={s}
                                onClick={() => { if (s !== w.status) setStatusChange({ walkIn: w, next: s }); close(); }}
                              >
                                <span className="flex items-center gap-2">
                                  <span className={cn("inline-block h-2 w-2 rounded-full ring-1 ring-inset", WALKIN_STATUS_TONE[s])} />
                                  <span className={cn(s === w.status && "font-semibold text-[#4361EE]")}>{WALKIN_STATUS_LABEL[s]}</span>
                                  {s === "converted_ticket" && !w.linkedTicketId && (
                                    <span className="ml-auto text-[10px] text-muted-foreground">Push to Ticket</span>
                                  )}
                                  {s === w.status && <Check className="ml-auto h-3.5 w-3.5 text-[#4361EE]" />}
                                </span>
                              </MenuItem>
                            ))}
                          </>
                        )}
                      </Dropdown>
                      {w.linkedTicketId && (
                        <p className="mt-1 text-[12px] font-semibold text-indigo-700">→ {ticketNoFor(w.linkedTicketId)}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Push to Ticket — sibling of the ticket's "Push to Invoice"
                            quick action. Reflects a linked/converted state so no
                            duplicate ticket is created. */}
                        {w.linkedTicketId ? (
                          <button
                            onClick={() => router.push(`/tickets/${w.linkedTicketId}`)}
                            title={`View linked ticket ${ticketNoFor(w.linkedTicketId)}`}
                            aria-label={`View linked ticket ${ticketNoFor(w.linkedTicketId)}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100"
                          >
                            <PushToTicketIcon className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConvert(w)}
                            title="Convert Walk-In to Ticket"
                            aria-label="Convert Walk-In to Ticket"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4361EE] transition hover:bg-[#EEF1FD]"
                          >
                            <PushToTicketIcon className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => setViewTarget(w)} title="View" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
                          <Eye className="h-4 w-4" />
                        </button>
                        <Dropdown
                          align="right"
                          width="w-48"
                          trigger={({ toggle }) => (
                            <button onClick={toggle} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              <MenuItem icon={Eye} onClick={() => { setViewTarget(w); close(); }}>View</MenuItem>
                              <MenuItem icon={Pencil} onClick={() => { setEditTarget(w); close(); }}>Edit</MenuItem>
                              {!w.linkedTicketId && (
                                <MenuItem icon={TicketIcon} onClick={() => { handleConvert(w); close(); }}>Convert to Ticket</MenuItem>
                              )}
                              <MenuItem icon={w.pinnedAt ? PinOff : Pin} onClick={() => { pinWalkIn(w.id, !w.pinnedAt); close(); }}>
                                {w.pinnedAt ? "Unpin" : "Pin to top"}
                              </MenuItem>
                              {canDelete && (
                                <>
                                  <div className="my-1 border-t border-border" />
                                  <MenuItem icon={Trash2} danger onClick={() => { setDeleteTarget(w); close(); }}>Delete</MenuItem>
                                </>
                              )}
                            </>
                          )}
                        </Dropdown>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <EmptyStateCharacter variant="walkin" />
              <p className="font-semibold">No walk-ins found</p>
              <p className="text-sm text-muted-foreground">Adjust your filters or record a new walk-in.</p>
            </div>
          )}

          <div className="border-t border-border px-5 py-4">
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={filtered.length}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              itemLabel="walk-in"
            />
          </div>
        </div>
      )}

      {/* Create / Edit drawer */}
      <WalkInFormDrawer
        open={showCreate || !!editTarget}
        onClose={() => { setShowCreate(false); setEditTarget(null); }}
        walkIn={editTarget}
        sources={sources}
        requireSalesPerson={requireSalesPerson}
        onSaved={handleSaved}
      />

      {/* View drawer */}
      <WalkInViewDrawer walkIn={viewTarget} ticketNoFor={ticketNoFor} onClose={() => setViewTarget(null)} onEdit={(w) => { setViewTarget(null); setEditTarget(w); }} onConvert={(w) => { setViewTarget(null); handleConvert(w); }} />

      {/* Safe follow-up completion dialog — opened from the Walk-In bell. Requires
          an outcome + optional comment, then an explicit next action. Never a
          silent close. */}
      <WalkInFollowUpCompleteModal
        walkIn={completeTarget}
        displayId={walkInDisplayId}
        currentUserId={sessionUserId}
        currentUserName={sessionUserName}
        onUpdate={handleFollowUpUpdate}
        onConvert={(w) => { setCompleteTarget(null); handleConvert(w); }}
        onClose={() => setCompleteTarget(null)}
      />

      {/* Import */}
      <WalkInImportModal open={showImport} onClose={() => setShowImport(false)} onImported={(n) => showToast(`Imported ${n} walk-in${n !== 1 ? "s" : ""}.`)} />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteWalkIn(deleteTarget.id); showToast("Walk-In deleted."); }}
        title="Delete Walk-In?"
        description="This record will be removed from the list."
        confirmLabel="Delete"
        danger
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => {
          selected.forEach((id) => deleteWalkIn(id));
          const n = selected.size;
          setSelected(new Set());
          showToast(`Deleted ${n} walk-in${n !== 1 ? "s" : ""}.`);
        }}
        title={`Delete ${selected.size} walk-in${selected.size !== 1 ? "s" : ""}?`}
        description="The selected records will be removed from the list."
        confirmLabel={`Delete ${selected.size} Walk-In${selected.size !== 1 ? "s" : ""}`}
        danger
      />

      {/* Inline status-change confirm */}
      <ConfirmDialog
        open={!!statusChange}
        onClose={() => setStatusChange(null)}
        onConfirm={() => { if (statusChange) handleStatusChange(statusChange.walkIn, statusChange.next); }}
        title="Change status?"
        description={
          statusChange
            ? statusChange.next === "converted_ticket" && !statusChange.walkIn.linkedTicketId
              ? `Do you want to change ${walkInDisplayId(statusChange.walkIn)} to “${WALKIN_STATUS_LABEL[statusChange.next]}”? A ticket will be created first via Push to Ticket.`
              : `Do you want to change ${walkInDisplayId(statusChange.walkIn)} to “${WALKIN_STATUS_LABEL[statusChange.next]}”?`
            : undefined
        }
        confirmLabel="Change Status"
        danger={false}
      />

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          /* Anchored bottom-center (matching the global toaster) so it never
             collides with the floating chat button in the bottom-right corner.
             Higher z-index than the chat FAB (z-50) keeps it fully visible. */
          className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]"
        >
          <span className="text-sm font-medium">{toast}</span>
          <button onClick={() => setToast(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Filter select ──────────────────────────────────────────────────── */
/* ─── Advanced-filter field with a per-filter Pin/Unpin toggle (like Tickets) ── */
function PinnableField({
  label, pinned, onTogglePin, children,
}: {
  label: string; pinned: boolean; onTogglePin: () => void; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
        <button
          onClick={onTogglePin}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            pinned ? "bg-[#EEF1FD] text-[#4361EE]" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          title={pinned ? "Unpin filter" : "Pin filter to header"}
        >
          {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {pinned ? "Unpin" : "Pin"}
        </button>
      </div>
      {children}
    </div>
  );
}

/* ─── View drawer ────────────────────────────────────────────────────── */
function WalkInViewDrawer({
  walkIn, ticketNoFor, onClose, onEdit, onConvert,
}: {
  walkIn: WalkIn | null; ticketNoFor: (id?: string) => string | undefined;
  onClose: () => void;
  onEdit: (w: WalkIn) => void; onConvert: (w: WalkIn) => void;
}) {
  if (!walkIn) return null;
  const w = walkIn;
  return (
    <Drawer
      open={!!walkIn}
      onClose={onClose}
      title={`Walk-In ${walkInDisplayId(w)}`}
      subtitle={fmtDate(w.date)}
      icon={Eye}
      width="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          {!w.linkedTicketId && <Button variant="outline" size="sm" onClick={() => onConvert(w)}><TicketIcon className="h-3.5 w-3.5" /> Convert to Ticket</Button>}
          <Button size="sm" onClick={() => onEdit(w)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Customer contact card — everything needed to follow up at a glance ── */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-[#EEF1FD]/60 to-card p-4">
          <div className="flex items-start gap-3">
            <Avatar name={w.customer} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">{w.customer || "Unknown"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", WALKIN_TYPE_TONE[w.type ?? "direct"])}>
                  {WALKIN_TYPE_LABEL[w.type ?? "direct"]}
                </span>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", WALKIN_STATUS_TONE[w.status])}>
                  <span className="h-1 w-1 rounded-full bg-current" />
                  {WALKIN_STATUS_LABEL[w.status]}
                </span>
              </div>
            </div>
          </div>

          {/* Contact rows — tap to call / email for quick follow-up */}
          <div className="mt-3 space-y-2">
            <a
              href={w.phone ? `tel:${w.phone}` : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition",
                w.phone ? "hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/40" : "opacity-60",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200">
                <Phone className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
                <p className="truncate text-[14px] font-semibold tabular-nums">{w.phone || "—"}</p>
              </div>
            </a>
            <a
              href={w.email ? `mailto:${w.email}` : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition",
                w.email ? "hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/40" : "opacity-60",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
                <Mail className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Email</p>
                <p className="truncate text-[14px] font-medium">{w.email || "—"}</p>
              </div>
            </a>
          </div>
        </div>

        {/* ── Follow-Up highlight (only when scheduled) ── */}
        {w.followUpDate && (
          <div className={cn(
            "flex items-center gap-3 rounded-2xl border p-3.5",
            w.followUpStatus === "done"
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-indigo-200 bg-indigo-50/50",
          )}>
            <span className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
              w.followUpStatus === "done" ? "bg-emerald-100 text-emerald-600 ring-emerald-200" : "bg-indigo-100 text-indigo-700 ring-indigo-200",
            )}>
              <Clock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Follow-Up</p>
              <p className={cn("text-[13px] font-semibold", w.followUpStatus === "done" ? "text-emerald-700" : "text-indigo-700")}>
                {w.followUpAttempt ? `${w.followUpAttempt === 1 ? "1st" : w.followUpAttempt === 2 ? "2nd" : w.followUpAttempt === 3 ? "3rd" : `${w.followUpAttempt}th`} · ` : ""}
                {new Date(`${w.followUpDate}T${w.followUpTime || "09:00"}`).toLocaleString("en-IN", { dateStyle: "medium", ...(w.followUpTime ? { timeStyle: "short" } : {}) })}
                {w.followUpStatus === "done" ? " · Completed" : ""}
              </p>
            </div>
          </div>
        )}

        {/* ── Follow-Up history (audit trail across attempts) ── */}
        {w.followUpHistory && w.followUpHistory.length > 0 && (
          <div className="rounded-2xl border border-border p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Follow-Up History</p>
            <ol className="space-y-2.5">
              {w.followUpHistory.map((r) => (
                <li key={r.attempt} className="relative pl-4">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="text-[12px] font-semibold">
                    {r.attempt === 1 ? "1st" : r.attempt === 2 ? "2nd" : r.attempt === 3 ? "3rd" : `${r.attempt}th`} Follow-Up
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(`${r.scheduledDate}T${r.scheduledTime || "09:00"}`).toLocaleString("en-IN", { dateStyle: "medium", ...(r.scheduledTime ? { timeStyle: "short" } : {}) })}
                    {" · "}{FOLLOWUP_OUTCOME_LABEL[r.outcome]}
                  </p>
                  {r.comment && <p className="text-[11.5px] text-foreground/70">“{r.comment}”</p>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Walk-In details ── */}
        <div className="overflow-hidden rounded-2xl border border-border">
          <ViewRow label="Walk-In ID"><span className="font-semibold">{walkInDisplayId(w)}</span></ViewRow>
          <ViewRow label="Date">{fmtDate(w.date)}</ViewRow>
          <ViewRow label="Source">{w.source || "—"}</ViewRow>
          <ViewRow label="Model">{w.model || "—"}</ViewRow>
          <ViewRow label="Issue">{w.issue || (w.reasons || []).join(", ") || "—"}</ViewRow>
          {w.customerComments && <ViewRow label="Customer Comments">{w.customerComments}</ViewRow>}
          {w.type === "sales" && <ViewRow label="Marketing Person">{w.salesPersonName || "—"}</ViewRow>}
          {w.linkedTicketId && (
            <ViewRow label="Linked Ticket"><span className="font-semibold text-indigo-700">{ticketNoFor(w.linkedTicketId)}</span></ViewRow>
          )}
          <ViewRow label="Won">
            <span className={cn("font-semibold", isWalkInWon(w) ? "text-emerald-600" : "text-muted-foreground")}>{isWalkInWon(w) ? "Yes" : "No"}</span>
          </ViewRow>
        </div>

        {w.notes && (
          <div className="rounded-2xl border border-border p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
            <p className="text-[13px] text-foreground/80 break-words">{w.notes}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/* Padded key/value row for the View drawer. Label stays fixed-width on the
   left; the value wraps within the remaining space so long text (email, model,
   issue) never overflows the card edge. */
function ViewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="shrink-0 pt-0.5 text-[12px] font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-[13px] font-medium text-foreground">{children}</span>
    </div>
  );
}

/* ─── CSV export (spreadsheet column structure) ──────────────────────── */
function exportWalkIns(rows: WalkIn[], ticketNoFor: (id?: string) => string | undefined) {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["DATE", "ID", "TYPE", "SOURCE", "NAME", "CONTACT", "MODEL", "ISSUE", "CUSTOMER COMMENTS", "FOLLOW-UP", "FINAL STATUS", "ACTION"];
  const lines = rows.map((w) => [
    w.date,
    walkInDisplayId(w),
    WALKIN_TYPE_LABEL[w.type ?? "direct"],
    w.source,
    w.customer,
    w.phone,
    w.model,
    w.issue || (w.reasons || []).join("; "),
    w.customerComments || "",
    followUpPill(w).label,
    WALKIN_STATUS_LABEL[w.status],
    w.linkedTicketId ? `Ticket ${ticketNoFor(w.linkedTicketId)}` : "",
  ].map((c) => esc(String(c ?? ""))).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `walk-ins-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
