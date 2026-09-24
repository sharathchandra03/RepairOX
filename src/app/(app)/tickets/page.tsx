"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Filter, Download, Search, Clock, RefreshCw, Settings,
  Eye, EyeOff, X, ChevronDown, ChevronUp, Trash2,
  Pin, PinOff, Check, TicketCheck, FileSpreadsheet, FileText,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { toast } from "@/components/ui/toaster";
import { TableUtilityBar } from "@/components/common/table-utility-bar";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { EmptyStateCharacter } from "@/components/common/empty-state-character";
import { TicketActionsMenu, type TicketAction } from "@/components/tickets/ticket-actions-menu";
import { DueDateCell } from "@/components/tickets/due-date-cell";
import {
  TransferTicketDrawer, CommentDrawer,
  CheckoutDrawer, EmailReceiptDrawer, WhatsAppReceiptDrawer, PrintDrawer,
} from "@/components/tickets/ticket-drawers";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DeviceDetailsOverlay } from "@/components/tickets/device-details-overlay";
import { Pagination } from "@/components/ui/pagination";
import { STATUS_LABEL, STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE, TICKET_TYPE_LABEL, type TicketStatus, type Ticket, type TicketPriority, getTicketDevices, getTicketType, ticketInvoiceCoverage, type TicketInvoiceCoverage, getRecordType, isEstimate, isWarranty, ESTIMATE_STATUS_LABEL, ESTIMATE_STATUS_TONE, ESTIMATE_STATUS_OPTIONS, WARRANTY_STATUS_LABEL, WARRANTY_STATUS_TONE, WARRANTY_STATUS_OPTIONS, type RecordType, type WarrantyStatus } from "@/lib/mock-data";
import { PushToInvoiceDialog } from "@/components/tickets/push-to-invoice-dialog";
import { parseIssueString } from "@/lib/issue-library";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { ALL_COLUMNS, CONTEXT_COLUMNS, DEFAULT_ORDER, DEFAULT_VISIBLE, getColumn, type ColumnId } from "@/lib/ticket-columns";
import { useStoreContext, type StoreBranch } from "@/lib/store-context";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { rememberOrigin } from "@/lib/settings-origin";
import { formatINR, cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { usePinnedFilters } from "@/hooks/use-pinned-filters";
import { PinnedFilterBar, type PinnableFilterDef } from "@/components/tickets/pinned-filter-bar";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import { BulkDownloadDialog } from "@/components/download/bulk-download-dialog";
import { readDateFilterParams, isInListDateRange } from "@/lib/date-filter";
import { InlineStatusDropdown, StatusPillDropdown } from "@/components/tickets/inline-status-dropdown";
import { WarrantyStatusPillDropdown } from "@/components/tickets/warranty-status-dropdown";
import { exportTicketsExcel, exportTicketsCSV } from "@/lib/list-export";

/* ─── Column Definition ──────────────────────────────────────────────────
   Column catalog, ids, and defaults now live in the shared single source of
   truth at "@/lib/ticket-columns" so the Tickets table and the Column Settings
   UI (Settings → Tickets → Ticket Settings → Column Settings) stay in sync. */

/* ─── Constants ──────────────────────────────────────────────────────── */

const STATUS_FILTERS: { label: string; value: TicketStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "In Progress", value: "in_progress" },
  { label: "Repaired", value: "repaired" },
  { label: "Repaired & Collected", value: "repaired_collected" },
  { label: "Waiting for Approval", value: "waiting_approval" },
  { label: "Waiting for Parts", value: "waiting_parts" },
  { label: "Returned", value: "return" },
  { label: "Returned & Collected", value: "return_collected" },
];

const DATE_RANGES = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 Days", value: "7days" },
  { label: "1 Month", value: "1month" },
  { label: "Last Month", value: "lastmonth" },
  { label: "1 Year", value: "1year" },
  { label: "Custom", value: "custom" },
] as const;

type DateRange = (typeof DATE_RANGES)[number]["value"];

const STATUS_OPTIONS: { label: string; value: TicketStatus }[] = [
  { label: "In Progress", value: "in_progress" },
  { label: "Repaired", value: "repaired" },
  { label: "Repaired & Collected", value: "repaired_collected" },
  { label: "Waiting for Approval", value: "waiting_approval" },
  { label: "Waiting for Parts", value: "waiting_parts" },
  { label: "Returned", value: "return" },
  { label: "Returned & Collected", value: "return_collected" },
];

const PRIORITY_OPTIONS = [
  { label: "All Priorities", value: "all" },
  { label: "Critical + High", value: "critical_high" },
  { label: "Normal", value: "normal" },
  { label: "High Priority", value: "high" },
  { label: "Critical", value: "critical" },
  // Not a real priority value — a filter CONDITION that keeps only tickets whose
  // due date/time has already passed. Uses the same isOverdue() predicate that
  // drives the reddish row treatment (single source of truth). See okPriority
  // handling in the `list` useMemo below.
  { label: "Overdue Time", value: "overdue" },
];

/** Ticket intake Type filter options — mirrors the WK/PD/OS avatar Types. */
const TYPE_OPTIONS = [
  { label: "All Types", value: "all" },
  { label: TICKET_TYPE_LABEL.walkin, value: "walkin" },
  { label: TICKET_TYPE_LABEL.pickup, value: "pickup" },
  { label: TICKET_TYPE_LABEL.onsite, value: "onsite" },
];

/** Record-type filter strip — All / Ticket / Estimate / Warranty. This is the
 *  RECORD kind (Ticket vs Repair Estimate vs future Warranty), NOT the intake
 *  Type above (Walk-In/Pick-Up/On-Site). "warranty" is reserved for a future
 *  flow; it shows in the strip so the architecture is visibly extensible. */
const RECORD_TYPE_FILTERS: { label: string; value: RecordType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Ticket", value: "ticket" },
  { label: "Estimate", value: "estimate" },
  { label: "Warranty", value: "warranty" },
];

const WAITING_THRESHOLD_MINS = 40;

/** Default rows shown per page in the ticket table (user-selectable 10/20/50/100). */
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function getElapsedMins(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return 0;
  return Math.floor((Date.now() - created) / 60_000);
}

function isOverdue(ticket: { dueDate?: string; createdAt: string; status: string }): boolean {
  if (ticket.status === "repaired" || ticket.status === "repaired_collected" || ticket.status === "return_collected") return false;
  if (ticket.dueDate) {
    return Date.now() > new Date(ticket.dueDate).getTime();
  }
  // Fallback: if no dueDate, use default 59 min from creation
  return getElapsedMins(ticket.createdAt) >= 59;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

// Date-range boundary logic lives in the shared `date-filter.ts` module so the
// Tickets list and the Dashboard "Critical Tasks" card resolve every preset
// (Today / 1 Month / Last Month / …) to the EXACT same window. `DateRange` here
// is the same vocabulary as the shared `ListDatePreset`, so `isInListDateRange`
// is called directly with `dateRange`.

/* ─── Page Component ─────────────────────────────────────────────────── */

export default function TicketsPage() {
  const router = useRouter();
  const { tickets, invoices, bulkUpdateStatus, deleteTicket, updateTicket, updateDeviceStatus, deductPartsForTicket, pinTicket } = useStore();
  const { settings } = useStoreSettings();
  // Active-store context — the single source of truth for "am I looking at one
  // store or many?". `getStore` resolves a ticket's authoritative store row
  // (Ticket.branchId → Store) from the already-loaded store list, so rendering
  // the Store column is a pure in-memory lookup — no per-row query (no N+1).
  const { isAllShops, stores, getStore } = useStoreContext();
  // Permission gate for the estimate-only "Push to Ticket" conversion. Creating
  // a Ticket from an Estimate requires ticket-create rights — a user who can
  // only VIEW estimates must not be able to convert (spec §54/§56/§86).
  const { can } = usePermissions();
  const canPushToTicket = can("create_ticket") || can("manage_repair_jobs");
  // Bulk-action capability gates (granular OR backward-compatible coarse).
  const canBulkStatus = allow(can, CAP.ticket.changeStatus);
  const canBulkDeleteTickets = allow(can, CAP.ticket.delete);
  // Multi-store mode = the consolidated All-Shops context AND the user can
  // actually see more than one store. In single-store mode the Store column is
  // hidden because the store is already obvious (avoids redundant info).
  const multiStore = isAllShops && stores.length > 1;
  const {
    downloadTicket,
    startBulkTicketDownload,
    executeBulkDownload,
    retryFailed,
    isDownloading,
    bulkDialog,
    bulkProgress,
    canDownload,
  } = usePdfDownload();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string[]>([]); // [] = All Stores (full authorized scope)
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>("all");
  // Ticket intake Type filter (Walk-In / Pick-Up / On-Site). Reads the saved
  // ticket Type via getTicketType — the same source as the WK/PD/OS avatar.
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // Record-type filter (All / Ticket / Estimate / Warranty). Composes with all
  // existing filters and works immediately (no pinning required). Reads the
  // authoritative recordType via getRecordType — never the id prefix.
  const [recordTypeFilter, setRecordTypeFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Device-details overlay — opened from the Device / Service cell chevron.
  // Holds the ticket whose full device/issue details are being inspected.
  const [deviceDetailsTicket, setDeviceDetailsTicket] = useState<Ticket | null>(null);

  // Universal Search filter — shows only a single record when navigated from search
  const searchParams = useSearchParams();
  const [searchFilterId, setSearchFilterId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("search_id");
    if (id) {
      setSearchFilterId(id);
      // Reset other filters so the single record is visible
      setStatusFilter("all");
      setDateRange("all");
      setCustomFrom("");
      setCustomTo("");
      setPriorityFilter("all");
      setTechFilter("all");
      setCustomerTypeFilter("all");
      setTypeFilter("all");
      setRecordTypeFilter("all");
      setQ("");
      return;
    }
    // Deep-link filter context (e.g. from the Dashboard "Critical Tasks" card:
    // /tickets?priority=critical_high&dateRange=1month). Only apply params that
    // are actually present so direct visits keep their defaults.
    const priority = searchParams.get("priority");
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const tech = searchParams.get("tech");
    // The active dashboard date window, if the caller passed one. This is the
    // single source of truth for the destination's initial date filter.
    const inheritedDate = readDateFilterParams(searchParams);

    if (priority || status || type || tech || inheritedDate) {
      if (priority) setPriorityFilter(priority);
      if (status) setStatusFilter(status);
      if (type) setTypeFilter(type);
      if (tech) setTechFilter(tech);

      if (inheritedDate) {
        // Inherit the dashboard's exact date window (composition, not override).
        setDateRange(inheritedDate.preset);
        if (inheritedDate.preset === "custom") {
          setCustomFrom(inheritedDate.from ?? "");
          setCustomTo(inheritedDate.to ?? "");
        }
      } else {
        // A filter param was supplied without a date window — show the full
        // matching set regardless of when tickets were created (legacy behavior).
        setDateRange("all");
      }
    }
    // NOTE: after this initial inheritance the user can freely change the date
    // range / filters on this page; we intentionally do not re-sync on every
    // render, so their explicit choices always win.
  }, [searchParams]);

  const clearSearchFilter = useCallback(() => {
    setSearchFilterId(null);
    // Remove search_id from URL without full navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("search_id");
    window.history.replaceState({}, "", url.pathname);
  }, []);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Column config — READ-ONLY here. The single source of truth is the persisted
  // store settings (configured from Settings → Tickets → Ticket Settings →
  // Column Settings). The Tickets page no longer edits columns; it just renders
  // whatever the saved preference dictates.
  const columnOrder = useMemo<ColumnId[]>(() => {
    const order = (settings.ticketColumnOrder?.length ? settings.ticketColumnOrder : DEFAULT_ORDER) as ColumnId[];
    // Guard against catalog drift: keep only known ids, then append any known
    // ids the saved order is missing (e.g. a newly-added column) in catalog order.
    // CONTEXT_COLUMNS (e.g. `store`) are deliberately excluded here — they are
    // not user-configurable and are injected at a fixed position only when the
    // table is operating in multi-store mode (see activeColumns below).
    const known = new Set(ALL_COLUMNS.filter((c) => !CONTEXT_COLUMNS.includes(c.id)).map((c) => c.id));
    const cleaned = order.filter((id) => known.has(id));
    for (const id of DEFAULT_ORDER) if (!cleaned.includes(id)) cleaned.push(id);
    return cleaned;
  }, [settings.ticketColumnOrder]);

  const visibleColumns = useMemo<Set<ColumnId>>(() => {
    const vis = (settings.ticketVisibleColumns?.length ? settings.ticketVisibleColumns : DEFAULT_VISIBLE) as ColumnId[];
    const set = new Set<ColumnId>(vis.filter((id) => ALL_COLUMNS.some((c) => c.id === id)));
    // Structural + required columns are always visible regardless of stored
    // prefs — except CONTEXT_COLUMNS (`store`), whose visibility is driven by
    // the multi-store mode toggle, not the saved column preferences.
    for (const c of ALL_COLUMNS) if (c.locked && !CONTEXT_COLUMNS.includes(c.id)) set.add(c.id);
    set.add("ticket");
    set.add("status");
    return set;
  }, [settings.ticketVisibleColumns]);

  // Drawer state
  const [activeDrawer, setActiveDrawer] = useState<TicketAction | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);

  // Priority change
  const [priorityTarget, setPriorityTarget] = useState<Ticket | null>(null);

  // Push to Invoice confirmation
  const [pushInvoiceTarget, setPushInvoiceTarget] = useState<Ticket | null>(null);

  // Push to Ticket (Estimate → Ticket) confirmation. Holds the Estimate being
  // converted; Continue opens the prefilled Ticket flow. Guarded against
  // double-clicks via `pushingToTicket`.
  const [pushTicketTarget, setPushTicketTarget] = useState<Ticket | null>(null);
  const [pushingToTicket, setPushingToTicket] = useState(false);

  // Tick for time-based highlights
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  /* ─── Sticky frozen workspace (filters + search + table header) ──────────
     The date pills, status pills and search live in one sticky wrapper that
     pins just below the app topbar. The table header (thead) then pins right
     beneath that wrapper. Offsets are MEASURED at runtime (topbar height +
     wrapper height) so the header sits flush with no gap and no layout jump,
     whatever the banner/filter-panel state. Uses CSS position:sticky — no
     scroll listeners — so scrolling stays smooth. */
  const stickyWrapRef = useRef<HTMLDivElement>(null);
  const [stickyTop, setStickyTop] = useState(60);   // app topbar height
  const [wrapH, setWrapH] = useState(0);            // frozen wrapper height
  useEffect(() => {
    const wrap = stickyWrapRef.current;
    if (!wrap) return;
    // Topbar = first child of the nearest scroll container (see AppShell).
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
  // The thead pins flush at the wrapper's bottom edge so there is no seam for
  // rows to bleed through.
  const theadTop = stickyTop + wrapH;

  // Unique technicians for filter
  const technicians = useMemo(() => {
    const set = new Set(tickets.map((t) => t.technician));
    return Array.from(set).sort();
  }, [tickets]);

  // Pinned filters
  const { pinnedIds, togglePin, unpin, isPinned } = usePinnedFilters();

  // ── Record-type-aware STATUS filter ──
  // Ticket, Estimate and Warranty each have a DIFFERENT status vocabulary
  // (repair lifecycle vs quote outcome vs claim lifecycle). So the Status filter
  // options + label swap with the active record-type strip: filtering
  // "Estimate" offers estimate statuses, "Warranty" offers warranty statuses,
  // and Ticket / All offers the repair statuses. The predicate (okStatus below)
  // matches the corresponding field (estimateStatus / warrantyStatus / status).
  const statusFilterLabel =
    recordTypeFilter === "estimate" ? "Estimate Status"
    : recordTypeFilter === "warranty" ? "Warranty Status"
    : "Status";
  const statusFilterOptions = useMemo(() => {
    const base =
      recordTypeFilter === "estimate" ? ESTIMATE_STATUS_OPTIONS
      : recordTypeFilter === "warranty" ? WARRANTY_STATUS_OPTIONS
      : STATUS_OPTIONS;
    return [{ label: "All Statuses", value: "all" }, ...base.map((s) => ({ label: s.label, value: s.value as string }))];
  }, [recordTypeFilter]);

  // Define all pinnable advanced filters (same filters as the Advanced Filter panel)
  const pinnableFilters: PinnableFilterDef[] = useMemo(() => [
    {
      id: "priority",
      label: "Priority",
      type: "select" as const,
      value: priorityFilter,
      options: PRIORITY_OPTIONS,
      onChange: (v: string) => setPriorityFilter(v),
    },
    {
      id: "technician",
      label: "Technician",
      type: "select" as const,
      value: techFilter,
      options: [{ label: "All Technicians", value: "all" }, ...technicians.map((t) => ({ label: t, value: t }))],
      onChange: (v: string) => setTechFilter(v),
    },
    {
      id: "status",
      label: statusFilterLabel,
      type: "select" as const,
      value: statusFilter,
      options: statusFilterOptions,
      onChange: (v: string) => setStatusFilter(v),
    },
    {
      id: "dateRange",
      label: "Date Range",
      type: "select" as const,
      value: dateRange,
      options: DATE_RANGES.map((d) => ({ label: d.label, value: d.value })),
      onChange: (v: string) => setDateRange(v as DateRange),
    },
    {
      id: "customerType",
      label: "Customer Type",
      type: "select" as const,
      value: customerTypeFilter,
      options: [
        { label: "All Types", value: "all" },
        { label: "Personal / Retail", value: "personal" },
        { label: "Business / GST", value: "business" },
      ],
      onChange: (v: string) => setCustomerTypeFilter(v),
    },
    {
      id: "type",
      label: "Type",
      type: "select" as const,
      value: typeFilter,
      options: TYPE_OPTIONS,
      onChange: (v: string) => setTypeFilter(v),
    },
  ], [priorityFilter, techFilter, statusFilter, statusFilterLabel, statusFilterOptions, dateRange, customerTypeFilter, typeFilter, technicians]);

  // Set of ticket IDs that have at least one invoice generated from them.
  // Derived from the actual DB-backed invoice relationship (invoice.ticketId),
  // so it stays correct across reload, login, search, filter, edit and view.
  // Coverage is derived from the invoice-eligible DEVICES of each ticket (via
  // ticketInvoiceCoverage), not merely "does an invoice exist", so partial vs
  // full invoicing is accurate for multi-device tickets.
  const coverageFor = useCallback(
    (t: Ticket): TicketInvoiceCoverage => ticketInvoiceCoverage(t, invoices),
    [invoices],
  );

  // Filtered list — pinned records float to the top while preserving the
  // existing order within each group (pinned + normal).
  const list = useMemo(
    () => {
      // When navigated from Universal Search, show only the exact record
      if (searchFilterId) {
        return tickets.filter((t) => t.id === searchFilterId);
      }
      // "overdue" is a filter CONDITION carried on the Priority control, not a
      // real priority value. When selected we AND-in isOverdue(t) (the same
      // predicate driving the reddish rows) instead of matching t.priority.
      const overdueOnly = priorityFilter === "overdue";
      // "critical_high" is the composed Critical + High set the Dashboard's
      // Critical Tasks card represents; it matches either priority value.
      const criticalHigh = priorityFilter === "critical_high";
      const filtered = tickets.filter((t) => {
        const okStore = matchesStoreSelection(t.branchId, storeFilter);
        // Record-type-aware status match: an Estimate is filtered by its quote
        // outcome (estimateStatus), a Warranty by its claim lifecycle
        // (warrantyStatus), and a normal Ticket by the repair status. The
        // status option set the user picked from swaps with the record-type
        // strip (see statusFilterOptions), so the value always belongs to the
        // right vocabulary.
        const rt = getRecordType(t);
        const okStatus =
          statusFilter === "all" ||
          (rt === "estimate"
            ? (t.estimateStatus ?? "waiting_approval") === statusFilter
            : rt === "warranty"
              ? (t.warrantyStatus ?? "open") === statusFilter
              : t.status === statusFilter);
        const okDate = isInListDateRange(t.createdAt, dateRange, customFrom, customTo);
        const okPriority =
          priorityFilter === "all" ||
          (overdueOnly
            ? isOverdue(t)
            : criticalHigh
              ? t.priority === "critical" || t.priority === "high"
              : t.priority === priorityFilter);
        const okTech = techFilter === "all" || t.technician === techFilter;
        const okCustomerType = customerTypeFilter === "all" || (customerTypeFilter === "personal" ? (t.customerType === "personal" || !t.customerType) : t.customerType === customerTypeFilter);
        const okType = typeFilter === "all" || getTicketType(t) === typeFilter;
        // Record-type filter — resolves the AUTHORITATIVE type (getRecordType),
        // so legacy rows without a recordType always count as "ticket".
        const okRecordType = recordTypeFilter === "all" || getRecordType(t) === recordTypeFilter;
        const okQ =
          !q ||
          `${t.ticketNo ?? ""} ${t.id} ${t.customer} ${t.model} ${t.issue} ${t.phone} ${t.items?.map((i) => `${i.model} ${i.serial} ${i.issue}`).join(" ") || ""}`
            .toLowerCase()
            .includes(q.toLowerCase());
        return okStore && okStatus && okDate && okPriority && okTech && okCustomerType && okType && okRecordType && okQ;
      });
      // Overdue Time ordering: oldest-overdue-first (the ticket whose due
      // date/time was crossed longest ago comes first). Tie-break on the
      // existing table order via createdAt (older created ticket first). Only
      // applied when the Overdue Time condition is active; otherwise the normal
      // table ordering is preserved untouched.
      const ordered = overdueOnly
        ? [...filtered].sort((a, b) => {
            const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            if (da !== db) return da - db; // earlier due timestamp = overdue longer = first
            const ca = new Date(a.createdAt).getTime();
            const cb = new Date(b.createdAt).getTime();
            return ca - cb; // secondary tie-breaker: older created ticket first
          })
        : filtered;
      // Stable partition: pinned first, then normal — order within each group
      // is the original table order (createdAt-desc from the store), or the
      // oldest-overdue-first order when Overdue Time is active.
      const pinned = ordered.filter((t) => t.pinnedAt);
      const normal = ordered.filter((t) => !t.pinnedAt);
      return [...pinned, ...normal];
    },
    [tickets, storeFilter, statusFilter, dateRange, customFrom, customTo, priorityFilter, techFilter, customerTypeFilter, typeFilter, recordTypeFilter, q, searchFilterId]
  );

  // Reset to the first page whenever the filtered result set changes so
  // pagination always reflects the current filters/search.
  useEffect(() => {
    setPage(1);
  }, [storeFilter, statusFilter, dateRange, customFrom, customTo, priorityFilter, techFilter, customerTypeFilter, typeFilter, recordTypeFilter, q, searchFilterId]);

  // Pagination — pinned records already float to the top of `list`, so slicing
  // here keeps pinned rows at the top of page 1 while respecting page size.
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => list.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [list, currentPage, pageSize]
  );

  // Export the CURRENTLY FILTERED list (respects store/status/date/search) to
  // Excel (primary) or CSV. Store name is resolved from the authoritative
  // Ticket.branchId → Store relationship. Excel is mandatory alongside CSV.
  const storeNameFor = useCallback((branchId?: string | null) => getStore(branchId)?.name ?? "", [getStore]);
  const handleExportExcel = useCallback(() => {
    if (list.length === 0) { toast.info("No tickets to export."); return; }
    void exportTicketsExcel(list, storeNameFor);
    toast.success(`Exported ${list.length} ticket${list.length === 1 ? "" : "s"} to Excel.`);
  }, [list, storeNameFor]);
  const handleExportCSV = useCallback(() => {
    if (list.length === 0) { toast.info("No tickets to export."); return; }
    exportTicketsCSV(list, storeNameFor);
    toast.success(`Exported ${list.length} ticket${list.length === 1 ? "" : "s"} to CSV.`);
  }, [list, storeNameFor]);

  // Changing the page size resets to page 1 so the user starts at the top of
  // the recalculated result set.
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  // Ordered & visible columns. In multi-store mode the context-aware `store`
  // column is injected at a FIXED position — immediately after the selection
  // checkbox and before Ticket — so the structure is:
  //   [ ] | STORE | TICKET | CUSTOMER | DEVICE | STATUS | …
  // It participates in the SAME table grid (one <colgroup>/header/body), so
  // alignment, sticky header and zoom behaviour are unchanged.
  const activeColumns = useMemo(() => {
    const cols = columnOrder
      .filter((id) => visibleColumns.has(id))
      .map((id) => ALL_COLUMNS.find((c) => c.id === id)!);
    if (multiStore) {
      const storeCol = getColumn("store")!;
      const idx = cols.findIndex((c) => c.id === "checkbox");
      // Insert right after the checkbox (or at the very front if, for some
      // reason, the checkbox column is not present).
      cols.splice(idx >= 0 ? idx + 1 : 0, 0, storeCol);
    }
    return cols;
  }, [columnOrder, visibleColumns, multiStore]);

  /* Selection handlers */
  const allSelected = list.length > 0 && list.every((t) => selected.has(t.id));
  const someSelected = list.some((t) => selected.has(t.id));
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(list.map((t) => t.id)));
  }, [allSelected, list]);
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  /* Bulk status */
  const handleBulkStatusChange = useCallback((status: TicketStatus) => {
    bulkUpdateStatus(Array.from(selected), status);
    // Deduct parts for tickets changing to repaired
    if (status === "repaired") {
      Array.from(selected).forEach((id) => {
        const t = tickets.find((tk) => tk.id === id);
        if (t?.parts?.some((p) => p.status === "planned")) {
          deductPartsForTicket(id);
        }
      });
    }
    setSelected(new Set());
    setShowBulkStatus(false);
  }, [selected, bulkUpdateStatus, tickets, deductPartsForTicket]);

  /* Action handler */
  // Inline warranty CLAIM status change (Open → In Progress → Completed →
  // Rejected). Distinct from the device repair status; persists via updateTicket
  // (JSONB envelope) and reflects everywhere the record is shown.
  const handleWarrantyStatusChange = useCallback((ticketId: string, status: WarrantyStatus) => {
    updateTicket(ticketId, { warrantyStatus: status });
  }, [updateTicket]);

  const handleInlineStatusChange = useCallback((ticketId: string, status: TicketStatus) => {
    updateTicket(ticketId, { status });
    // Deduct parts when repaired
    if (status === "repaired") {
      const t = tickets.find((tk) => tk.id === ticketId);
      if (t?.parts?.some((p) => p.status === "planned")) {
        deductPartsForTicket(ticketId);
      }
    }
  }, [updateTicket, tickets, deductPartsForTicket]);

  /* Action handler */
  const handleAction = useCallback((action: TicketAction, ticket: Ticket) => {
    if (action === "view") { router.push(`/tickets/${ticket.id}`); return; }
    if (action === "edit") { router.push(`/tickets/${ticket.id}`); return; }
    if (action === "print-preview") { router.push(`/print/ticket/${encodeURIComponent(ticket.id)}?format=a4`); return; }
    if (action === "download-pdf") { downloadTicket(ticket); return; }
    if (action === "invoice" || action === "push-to-proforma") {
      // Push to Invoice (Ticket) / Push to Proforma (Estimate) — both open the
      // device-selection popup, then pushTicketToInvoice runs on confirm. For an
      // estimate it detects isEstimate and creates a PROFORMA (documentType=
      // proforma); for a ticket it creates a normal invoice.
      setPushInvoiceTarget(ticket);
      return;
    }
    if (action === "push-to-ticket") {
      // Estimate → Ticket. If ALREADY converted, never create a second Ticket —
      // jump to the existing linked Ticket instead (spec §32/§83).
      if (ticket.estimateStatus === "converted" && ticket.convertedTicketId) {
        router.push(`/tickets/${ticket.convertedTicketId}`);
        return;
      }
      // Permission gate (UI half; store/backend also enforce it).
      if (!canPushToTicket) {
        toast.error("Not allowed", { description: "You don't have permission to create tickets from estimates." });
        return;
      }
      // Show the confirmation popup; the actual conversion runs on Continue.
      setPushTicketTarget(ticket);
      return;
    }
    if (action === "delete") {
      setDeleteTarget(ticket);
      return;
    }
    if (action === "priority") {
      setPriorityTarget(ticket);
      return;
    }
    if (action === "pin") {
      pinTicket(ticket.id, !ticket.pinnedAt);
      return;
    }
    setActiveTicket(ticket);
    setActiveDrawer(action);
  }, [router, deleteTicket, downloadTicket, pinTicket, canPushToTicket]);

  // Existing Push to Invoice flow — unchanged data-preservation logic, extended
  // so it can run after the device-selection popup returns the SELECTED ticket
  // devices. Only the chosen devices are carried into the invoice; each device
  // keeps its Ticket DeviceRecord id so the invoice stays traceable to it.
  const pushTicketToInvoice = useCallback((ticket: Ticket, selectedDeviceIds?: string[]) => {
      const p = new URLSearchParams();
      p.set("fromTicket", ticket.id);
      if (ticket.ticketNo) p.set("ticketNo", ticket.ticketNo);
      // ── Estimate → Proforma ──
      // When the source is a Repair Estimate, "Push to Invoice" must create a
      // PROFORMA (a non-revenue commercial document), NOT a normal invoice. We
      // flag the document type and carry the lineage so the created proforma is
      // traceable back to the estimate (and any ticket the estimate spawned).
      if (isEstimate(ticket)) {
        p.set("documentType", "proforma");
        p.set("sourceEstimateId", ticket.id);
        if (ticket.convertedTicketId) p.set("sourceTicketId", ticket.convertedTicketId);
      } else {
        // A Ticket's Push to Invoice keeps its existing behaviour (normal
        // invoice), and records the commercial-lineage ticket + originating
        // estimate (if this ticket was created from one).
        p.set("sourceTicketId", ticket.id);
        if (ticket.convertedFromEstimateId) p.set("sourceEstimateId", ticket.convertedFromEstimateId);
      }
      p.set("customer", ticket.customer);
      p.set("phone", ticket.phone);
      if (ticket.email) p.set("email", ticket.email);
      if (ticket.address) p.set("address", ticket.address);
      if (ticket.company) p.set("company", ticket.company);
      if (ticket.customerType) p.set("customerType", ticket.customerType);
      p.set("amount", String(ticket.amount));
      if (ticket.technician) p.set("employee", ticket.technician);
      // Pass GST rate and number so invoice inherits ticket's tax config
      if (ticket.gstRate != null) p.set("gstRate", String(ticket.gstRate));
      if (ticket.gstNumber) p.set("gstNumber", ticket.gstNumber);

      // Pass full device structure for multi-device invoice support. When a
      // selection is provided, only those devices are billed (partial /
      // selective invoicing); otherwise all devices are included.
      const allDevices = getTicketDevices(ticket);
      const devices = selectedDeviceIds && selectedDeviceIds.length > 0
        ? allDevices.filter((d) => selectedDeviceIds.includes(d.id))
        : allDevices;
      const invoiceDevices = devices.map((dev) => ({
        // Durable link back to the originating ticket device — enables partial
        // invoicing, duplicate-billing prevention and coverage tracking.
        ticketDeviceId: dev.id,
        category: dev.category || (dev as any).categoryId || "",
        brand: dev.brand,
        model: dev.model,
        // Carry the durable Category → Brand → Model ids into the invoice.
        brandId: (dev as any).brandId || undefined,
        modelId: (dev as any).modelId || undefined,
        imei: dev.imei,
        imeiType: dev.imeiType,
        issue: dev.issue || dev.description,
        description: dev.description,
        jobType: dev.jobType,
        priority: dev.priority,
        warranty: dev.warranty,
        deviceColour: dev.deviceColour,
        technician: dev.assignedTo,
        notes: dev.notes,
        estimate: dev.estimate,
        status: dev.status,
        parts: (dev.parts || []).map((pt) => ({ name: pt.name, sku: pt.sku, qty: pt.qty, unitPrice: pt.unitPrice, total: pt.total })),
      }));
      p.set("devices", JSON.stringify(invoiceDevices));

      // Pass first device info for backward compat
      p.set("service", devices[0]?.issue || ticket.service || ticket.issue);
      p.set("device", devices[0]?.model || ticket.model);
      p.set("brand", devices[0]?.brand || ticket.device);
      if (devices[0]?.imei) p.set("serial", devices[0].imei);

      router.push(`/invoice/create?${p.toString()}`);
  }, [router]);

  const closeDrawer = useCallback(() => { setActiveDrawer(null); setActiveTicket(null); }, []);

  // Open Settings → Tickets → Ticket Settings, remembering Tickets as the origin
  // so the Settings "← Back to Tickets" control returns here.
  const openTicketSettings = useCallback(() => {
    rememberOrigin({ key: "tickets", label: "Tickets", returnTo: "/tickets" });
    router.push("/settings/tickets/general?from=tickets");
  }, [router]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Shop"
        title="Tickets"
        subtitle="Every repair job in one searchable, status-aware list."
        actions={
          <>
            <Button variant="outline" size="md" className="rounded-full" onClick={() => setShowFilterPanel(!showFilterPanel)}>
              <Filter className="h-4 w-4" /> Filter
              {(priorityFilter !== "all" || techFilter !== "all" || customerTypeFilter !== "all" || typeFilter !== "all") && (
                <span className="ml-1 h-2 w-2 rounded-full bg-[#4361EE]" />
              )}
            </Button>
            <Button variant="outline" size="md" className="rounded-full" onClick={openTicketSettings}>
              <Settings className="h-4 w-4" /> Settings
            </Button>
            <Can permission="export_reports">
              <Dropdown
                width="w-52"
                trigger={({ toggle }) => (
                  <Button variant="outline" size="md" className="rounded-full" onClick={toggle}>
                    <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem icon={FileSpreadsheet} onClick={() => { handleExportExcel(); close(); }}>
                      Excel (.xlsx)
                    </MenuItem>
                    <MenuItem icon={FileText} onClick={() => { handleExportCSV(); close(); }}>
                      CSV (.csv)
                    </MenuItem>
                  </>
                )}
              </Dropdown>
            </Can>
            <Can permission="manage_repair_jobs">
              <Link href="/tickets/new?start=category">
                <Button size="md" className="rounded-full">
                  <Plus className="h-4 w-4" /> Create Ticket
                </Button>
              </Link>
            </Can>
          </>
        }
      />

      {/* ── STICKY FROZEN WORKSPACE ──────────────────────────────────────
          Date pills → Custom picker → Pinned filters → Filter panel →
          Status pills + Search all pin together as one block just below the
          app topbar. Opaque page-canvas background so ticket rows never show
          through; z-30 keeps it above the rows and below opened dropdowns.
          space-y-5 preserves the exact spacing the elements had before, and
          -mt-5/pt-5 keeps the top gap consistent while giving the sticky block
          an opaque top edge. */}
      <div
        ref={stickyWrapRef}
        style={{ top: stickyTop }}
        className="sticky z-10 -mt-5 space-y-5 bg-[hsl(var(--background))] pt-5 pb-5 shadow-[-32px_0_0_0_hsl(var(--background)),32px_0_0_0_hsl(var(--background))]"
      >
      {/* Date Range — shared 8-option strip as ONE connected segmented control
          (RepairOX standard: all filter strips use the connected SegmentedTabs
          container, not detached pills). Scrolls horizontally on narrow screens.
          px-0.5 py-1 keeps the rounded border + active-pill shadow from being
          clipped by the scroll container's edges. */}
      <div className="max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedTabs
          value={dateRange}
          onChange={(v) => setDateRange(v as DateRange)}
          options={DATE_RANGES.map((dr) => ({ label: dr.label, value: dr.value }))}
          size="sm"
        />
      </div>

      {/* Custom Date Range — reuses the same Date Range picker pattern as Invoice */}
      <DateRangePicker
        open={dateRange === "custom"}
        from={customFrom}
        to={customTo}
        onFromChange={(v) => { setCustomFrom(v); setDateRange("custom"); }}
        onToChange={(v) => { setCustomTo(v); setDateRange("custom"); }}
      />

      {/* Pinned Filters Bar */}
      <PinnedFilterBar
        filters={pinnableFilters}
        pinnedIds={pinnedIds}
        onUnpin={unpin}
      />

      {/* Applied-filter chips bar intentionally removed (see docs/use-later.md).
          The pinned filter bar + filter panel remain the filter affordances. */}

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilterPanel && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.95 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.95 }}
            style={{ transformOrigin: "top" }}
            transition={{ duration: 0.15 }}
            className="rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advanced Filters</p>
              <div className="flex items-center gap-3">
                <button onClick={() => { setPriorityFilter("all"); setTechFilter("all"); setCustomerTypeFilter("all"); setTypeFilter("all"); setStatusFilter("all"); setDateRange("today"); setCustomFrom(""); setCustomTo(""); }} className="text-[13px] text-[#4361EE] font-semibold hover:underline">
                  Reset Filters
                </button>
                {/* Close the panel after applying — applied filter state persists,
                    closing only hides the panel (it does not clear selections). */}
                <button
                  onClick={() => setShowFilterPanel(false)}
                  aria-label="Close filters"
                  title="Close filters"
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Priority</label>
                  <button
                    onClick={() => togglePin("priority")}
                    className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", isPinned("priority") ? "text-[#4361EE] bg-[#EEF1FD]" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    title={isPinned("priority") ? "Unpin filter" : "Pin filter to header"}
                  >
                    {isPinned("priority") ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {isPinned("priority") ? "Unpin" : "Pin"}
                  </button>
                </div>
                <Select value={priorityFilter} onChange={(e: any) => setPriorityFilter(e.target.value)} options={PRIORITY_OPTIONS} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Technician</label>
                  <button
                    onClick={() => togglePin("technician")}
                    className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", isPinned("technician") ? "text-[#4361EE] bg-[#EEF1FD]" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    title={isPinned("technician") ? "Unpin filter" : "Pin filter to header"}
                  >
                    {isPinned("technician") ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {isPinned("technician") ? "Unpin" : "Pin"}
                  </button>
                </div>
                <Select value={techFilter} onChange={(e: any) => setTechFilter(e.target.value)} options={[{ label: "All Technicians", value: "all" }, ...technicians.map((t) => ({ label: t, value: t }))]} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">{statusFilterLabel}</label>
                  <button
                    onClick={() => togglePin("status")}
                    className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", isPinned("status") ? "text-[#4361EE] bg-[#EEF1FD]" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    title={isPinned("status") ? "Unpin filter" : "Pin filter to header"}
                  >
                    {isPinned("status") ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {isPinned("status") ? "Unpin" : "Pin"}
                  </button>
                </div>
                <Select value={statusFilter} onChange={(e: any) => setStatusFilter(e.target.value)} options={statusFilterOptions} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Date Range</label>
                  <button
                    onClick={() => togglePin("dateRange")}
                    className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", isPinned("dateRange") ? "text-[#4361EE] bg-[#EEF1FD]" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    title={isPinned("dateRange") ? "Unpin filter" : "Pin filter to header"}
                  >
                    {isPinned("dateRange") ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {isPinned("dateRange") ? "Unpin" : "Pin"}
                  </button>
                </div>
                <Select value={dateRange} onChange={(e: any) => setDateRange(e.target.value)} options={DATE_RANGES.map((d) => ({ label: d.label, value: d.value }))} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Customer Type</label>
                  <button
                    onClick={() => togglePin("customerType")}
                    className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", isPinned("customerType") ? "text-[#4361EE] bg-[#EEF1FD]" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    title={isPinned("customerType") ? "Unpin filter" : "Pin filter to header"}
                  >
                    {isPinned("customerType") ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {isPinned("customerType") ? "Unpin" : "Pin"}
                  </button>
                </div>
                <Select
                  value={customerTypeFilter}
                  onChange={(e: any) => setCustomerTypeFilter(e.target.value)}
                  options={[
                    { label: `All Types (${tickets.length})`, value: "all" },
                    { label: `Personal / Retail (${tickets.filter((t) => t.customerType === "personal" || !t.customerType).length})`, value: "personal" },
                    { label: `Business / GST (${tickets.filter((t) => t.customerType === "business").length})`, value: "business" },
                  ]}
                />
              </div>
              {/* Type (intake channel) — Walk-In / Pick-Up / On-Site. Selecting
                  "Walk-In" shows only Walk-In tickets. Reads getTicketType, the
                  same saved value as the WK/PD/OS avatar (no duplicate system). */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-muted-foreground">Type</label>
                  <button
                    onClick={() => togglePin("type")}
                    className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", isPinned("type") ? "text-[#4361EE] bg-[#EEF1FD]" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    title={isPinned("type") ? "Unpin filter" : "Pin filter to header"}
                  >
                    {isPinned("type") ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {isPinned("type") ? "Unpin" : "Pin"}
                  </button>
                </div>
                <Select
                  value={typeFilter}
                  onChange={(e: any) => setTypeFilter(e.target.value)}
                  options={[
                    { label: `All Types (${tickets.length})`, value: "all" },
                    { label: `${TICKET_TYPE_LABEL.walkin} (${tickets.filter((t) => getTicketType(t) === "walkin").length})`, value: "walkin" },
                    { label: `${TICKET_TYPE_LABEL.pickup} (${tickets.filter((t) => getTicketType(t) === "pickup").length})`, value: "pickup" },
                    { label: `${TICKET_TYPE_LABEL.onsite} (${tickets.filter((t) => getTicketType(t) === "onsite").length})`, value: "onsite" },
                  ]}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Filters (left) + Store filter & Search (right utility area).
          Uses the shared REPAIROX TABLE UTILITY BAR — the canonical Store→Search
          group. This Tickets layout is the visual/interaction reference. */}
      <TableUtilityBar
        storeValue={storeFilter}
        onStoreChange={setStoreFilter}
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Search tickets…"
        searchClassName="w-56"
        left={
          <SegmentedTabs
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS.map((f) => ({ label: f.label, value: f.value as string }))}
            size="sm"
            className="[&>button]:px-3"
          />
        }
      />

      {/* Record-Type Strip — All / Ticket / Estimate / Warranty. Sits BELOW the
          Status strip. Uses the SAME pill styling as the Date strip so it reads
          as one consistent filter language. Composes with every existing filter
          (works immediately, no pinning needed). */}
      <div className="max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedTabs
          value={recordTypeFilter}
          onChange={(v) => {
            setRecordTypeFilter(v);
            // The status vocabulary differs per record type, so a status chosen
            // for one type would be meaningless (and hide every row) under
            // another. Reset it to "All Statuses" on any switch.
            setStatusFilter("all");
          }}
          options={RECORD_TYPE_FILTERS.map((rt) => ({ label: rt.label, value: rt.value }))}
          size="sm"
        />
      </div>

      {/* Bulk selection bar — sits ABOVE the table header as its own row. */}
      {someSelected && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-xs font-semibold text-[#4361EE]">
            {selected.size} selected
          </span>
          {canDownload && (
            <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => startBulkTicketDownload(Array.from(selected))}>
              <Download className="h-3 w-3" /> Download PDFs
            </Button>
          )}
          {canBulkStatus && (
            <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkStatus(!showBulkStatus)}>
              <RefreshCw className="h-3 w-3" /> Change Status
            </Button>
          )}
          {canBulkDeleteTickets && (
            <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkDelete(true)}>
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          )}
          <button onClick={() => { setSelected(new Set()); setShowBulkStatus(false); }} className="ml-1 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </motion.div>
      )}

      {/* Bulk Status */}
      {showBulkStatus && someSelected && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <span className="text-xs font-medium text-indigo-700">Change {selected.size} ticket{selected.size > 1 ? "s" : ""} to:</span>
          {STATUS_OPTIONS.map((s) => (
            <button key={s.value} onClick={() => handleBulkStatusChange(s.value)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 ring-inset transition hover:scale-105 ${STATUS_TONE[s.value]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />{s.label}
            </button>
          ))}
          <button onClick={() => setShowBulkStatus(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </motion.div>
      )}

      {/* Search Filter Banner — shown when navigated from Universal Search */}
      {searchFilterId && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-xl border border-[#4361EE]/20 bg-[#4361EE]/5 px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[#4361EE]" />
            <span className="text-sm font-medium text-[#4361EE]">
              Showing search result: <span className="font-bold">{tickets.find((t) => t.id === searchFilterId)?.ticketNo ?? searchFilterId}</span>
            </span>
          </div>
          <button
            onClick={clearSearchFilter}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#4361EE]/10 px-3 py-1.5 text-xs font-semibold text-[#4361EE] transition hover:bg-[#4361EE]/20 active:scale-95"
          >
            <X className="h-3 w-3" />
            Show All Tickets
          </button>
        </motion.div>
      )}

      </div>{/* ── /STICKY FROZEN WORKSPACE ── */}

      {/* Desktop table */}
      {/* No overflow-hidden on the card and overflow-x:clip (not auto) on the
          inner wrapper — an overflow:auto/hidden ancestor would trap the
          sticky thead and break the freeze. table-fixed w-full means the table
          already fits its container, so clipping never hides columns. */}
      {/* Straight (square) card — flat bordered header and flat bottom, so
          nothing bleeds through corner gaps while the header is frozen. */}
      <div className="hidden -mt-5 border-2 border-zinc-300 bg-card shadow-card md:block">
        <div className="[overflow-x:clip]">
          <table className="w-full text-sm table-fixed">
            <thead style={{ top: theadTop }} className="sticky z-[5] bg-[#D6DDFB] border-b-2 border-[#4361EE]/40">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
                {activeColumns.map((col) => (
                  <th key={col.id} className={cn("px-3 py-3", col.width, col.id === "status" && "pl-1 pr-[30px] text-center", col.id === "device" && "pl-0", col.id === "amount" && "pr-6", col.id === "actions" && "pr-[14px]", col.align === "right" && "text-right", col.align === "center" && "text-center")}>
                    {col.id === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
                        aria-label="Select all tickets"
                      />
                    ) : col.id === "status" ? (
                      // Nudge ONLY the Status heading text left, without affecting
                      // the cell width or the body cells beneath it. All-Shops
                      // shifts a bit further (16px) to sit over its pills.
                      <span className={cn("inline-block", multiStore ? "-translate-x-[16px]" : "-translate-x-[11px]")}>{col.label}</span>
                    ) : col.id === "customer" && multiStore ? (
                      // All-Shops only: nudge the Customer heading text 35px right
                      // (heading only — cell width + body cells untouched).
                      <span className="inline-block translate-x-[35px]">{col.label}</span>
                    ) : col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((t, i) => {
                const elapsed = getElapsedMins(t.createdAt);
                const isWaiting = isOverdue(t);
                const isSelected = selected.has(t.id);
                const hasMultiItems = t.items && t.items.length > 1;

                return (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.015 * i }}
                    onClick={() => router.push(`/tickets/${t.id}`)}
                    className={cn(
                      // Uniform minimum row height so every row is the same size
                      // and the 3-line Device/Service content (name / issue /
                      // IMEI-Serial) has comfortable vertical room. Height only —
                      // column and table widths are untouched.
                      "group h-[76px] border-b border-zinc-500 transition-colors align-middle cursor-pointer",
                      isWaiting && "bg-red-50/80",
                      isSelected && !isWaiting && "bg-indigo-50/40",
                      !isWaiting && !isSelected && "hover:bg-[#EEF1FD]/50"
                    )}
                  >
                    {activeColumns.map((col) => (
                      <td key={col.id} className={cn(
                        // Slightly more vertical breathing room; content stays
                        // vertically centered via align-middle.
                        "px-3 py-4 align-middle",
                        col.id === "status" && "pl-1 pr-5",
                        col.id === "customer" && "pl-0",
                        col.id === "device" && "pl-0",
                        col.id === "amount" && "pr-6",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center"
                      )}>
                        {renderCell(col.id, t, isSelected, isWaiting, elapsed, hasMultiItems, () => toggleOne(t.id), handleAction, handleInlineStatusChange, settings.statusColors, coverageFor(t), setDeviceDetailsTicket, (id, section) => router.push(`/tickets/${id}?section=${section}`), updateDeviceStatus, getStore(t.branchId), t.convertedTicketId ? tickets.find((x) => x.id === t.convertedTicketId)?.ticketNo : undefined, canPushToTicket, handleWarrantyStatusChange)}
                      </td>
                    ))}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <EmptyRow />}
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((t, i) => {
          const elapsed = getElapsedMins(t.createdAt);
          const isWaiting = isOverdue(t);
          const isSelected = selected.has(t.id);
          return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
              className={cn("rounded-2xl border border-border bg-card p-4 shadow-card", isWaiting && "border-red-200/70 bg-red-50/60", isSelected && !isWaiting && "border-indigo-200 bg-indigo-50/30")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(t.id)} className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer" />
                  <div className="flex items-center gap-2">
                    <Avatar name={t.customer} size={32} ticketType={getTicketType(t) ?? "na"} />
                    <div>
                      <p className="text-sm font-semibold">{t.customer}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {t.pinnedAt && <Pin className="h-3 w-3 text-[#7C5CFC] fill-[#7C5CFC]" aria-label="Pinned" />}
                        <span>{t.ticketNo ?? t.id}</span>
                        {!isEstimate(t) && !isWarranty(t) && <InvoiceCoverageCheck coverage={coverageFor(t)} size="xs" />}
                        <span>· <span className="font-medium text-[#5B6FC0]">{t.phone}</span></span>
                      </p>
                      {/* Store context — mirrors the desktop STORE column so the
                          owner can identify a card's store in multi-store mode. */}
                      {multiStore && (
                        <div className="mt-1">
                          <StoreContextCell store={getStore(t.branchId)} mode="inline" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {isWarranty(t) ? (
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", WARRANTY_STATUS_TONE[t.warrantyStatus ?? "open"])}>
                    {WARRANTY_STATUS_LABEL[t.warrantyStatus ?? "open"]}
                  </span>
                ) : isEstimate(t) ? (
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", ESTIMATE_STATUS_TONE[t.estimateStatus ?? "waiting_approval"])}>
                    {ESTIMATE_STATUS_LABEL[t.estimateStatus ?? "waiting_approval"]}
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset"
                    style={{
                      backgroundColor: `${settings.statusColors[t.status] || "#71717A"}15`,
                      color: settings.statusColors[t.status] || "#71717A",
                      boxShadow: `inset 0 0 0 1px ${settings.statusColors[t.status] || "#71717A"}30`,
                    }}
                  >{STATUS_LABEL[t.status]}</span>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDeviceDetailsTicket(t); }}
                className="mt-3 flex w-full items-start justify-between gap-2 rounded-lg text-left transition hover:bg-indigo-50/50"
                aria-label="View device and service details"
              >
                {(() => {
                  // Mirror the table cell: first device's name / issue / IMEI-Serial
                  // + "+N more devices". Reads real saved device records.
                  const devices = getTicketDevices(t);
                  const first = devices[0];
                  const extraCount = Math.max(0, devices.length - 1);
                  // Model-first identity: show ONLY the model when present, else
                  // the brand, else "Unknown Device". Underlying brand/model data
                  // is unchanged — this is a display rule only.
                  const deviceName = first?.model || first?.brand || t.model || "Unknown Device";
                  const issueText = (first ? parseIssueString(first.issue).join(", ") : "") || first?.description || t.service || t.issue || "";
                  const idLabel = first?.imeiType === "serial" ? "Serial" : "IMEI";
                  const idValue = first?.imei || t.items?.[0]?.serial || "";
                  return (
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="text-sm font-semibold truncate">{deviceName}</p>
                      {issueText && <p className="mt-0.5 text-xs text-muted-foreground truncate">{issueText}</p>}
                      {idValue && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                          <span className="font-medium">{idLabel}:</span> <span className="font-mono">{idValue}</span>
                        </p>
                      )}
                      {extraCount > 0 && (
                        <span className="mt-1 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-[#4361EE] ring-1 ring-inset ring-indigo-200">
                          + {extraCount} more device{extraCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              </button>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-sm">{formatINR(t.amount)}</span>
                  {isWaiting && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-[#922B21] ring-1 ring-inset ring-red-200/60"><Clock className="h-2.5 w-2.5" />{elapsed}m+</span>}
                </div>
                <TicketActionsMenu ticket={t} onAction={handleAction} hasInvoice={coverageFor(t) === "full"} canPushToTicket={canPushToTicket} />
              </div>
            </motion.div>
          );
        })}
        {list.length === 0 && <EmptyRow />}
      </div>

      {/* Pagination — user-selectable page size (10/20/50/100); pinned rows stay
          at the top of page 1. LEFT: size selector + count, RIGHT: page numbers. */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={list.length}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={handlePageSizeChange}
        itemLabel="ticket"
      />

      {/* Drawers */}
      <TransferTicketDrawer open={activeDrawer === "transfer"} onClose={closeDrawer} ticket={activeTicket} />
      <CommentDrawer open={activeDrawer === "comment"} onClose={closeDrawer} ticket={activeTicket} />
      <CheckoutDrawer open={activeDrawer === "checkout"} onClose={closeDrawer} ticket={activeTicket} />
      <EmailReceiptDrawer open={activeDrawer === "email-receipt"} onClose={closeDrawer} ticket={activeTicket} />
      <WhatsAppReceiptDrawer open={activeDrawer === "whatsapp-receipt"} onClose={closeDrawer} ticket={activeTicket} />
      <PrintDrawer open={activeDrawer === "print"} onClose={closeDrawer} ticket={activeTicket} />

      {/* Push to Invoice — device-selection popup. The user picks WHICH devices
          to bill (selective / partial invoicing); already-invoiced devices are
          shown disabled to prevent duplicate billing. On Continue the selected
          Ticket DeviceRecord ids are threaded into the existing invoice flow. */}
      <PushToInvoiceDialog
        open={!!pushInvoiceTarget}
        ticket={pushInvoiceTarget}
        invoices={invoices}
        onClose={() => setPushInvoiceTarget(null)}
        onContinue={(deviceIds) => {
          if (pushInvoiceTarget) pushTicketToInvoice(pushInvoiceTarget, deviceIds);
          setPushInvoiceTarget(null);
        }}
      />

      {/* Push to Ticket (Estimate → Ticket) confirmation — small centered popup
          (spec §20/§66). Continue opens the EXISTING Ticket flow prefilled from
          the Estimate at Device Details; the Estimate is only marked Converted
          AFTER the new Ticket is finalized. Double-click protected. */}
      {pushTicketTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => { if (!pushingToTicket) setPushTicketTarget(null); }}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                <TicketCheck className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold">Create Ticket from Estimate</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will open the Ticket workflow with the information captured in{" "}
                  <span className="font-semibold text-foreground">{pushTicketTarget.ticketNo ?? pushTicketTarget.id}</span>
                  {" "}prefilled
                  {(() => {
                    const n = getTicketDevices(pushTicketTarget).length;
                    return n > 1 ? ` (${n} devices)` : "";
                  })()}. The estimate stays saved until the new ticket is finalized.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" size="md" disabled={pushingToTicket} onClick={() => setPushTicketTarget(null)}>
                Cancel
              </Button>
              <Button
                size="md"
                disabled={pushingToTicket}
                onClick={() => {
                  // Double-click protection — one Estimate must never spawn two
                  // Tickets. Guard, then navigate to the prefilled Ticket flow.
                  if (pushingToTicket) return;
                  setPushingToTicket(true);
                  const target = pushTicketTarget;
                  router.push(`/tickets/new?fromEstimate=${encodeURIComponent(target.id)}`);
                }}
              >
                {pushingToTicket ? "Opening…" : "Continue"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteTicket(deleteTarget.id);
            setSelected((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
          }
        }}
        title={`Delete ticket ${deleteTarget?.ticketNo ?? deleteTarget?.id ?? ""}?`}
        description="This action cannot be undone. The ticket and all associated data will be permanently removed."
        confirmLabel="Delete Ticket"
        cancelLabel="Cancel"
        danger
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => {
          selected.forEach((id) => deleteTicket(id));
          setSelected(new Set());
          setShowBulkDelete(false);
        }}
        title={`Delete ${selected.size} ticket${selected.size > 1 ? "s" : ""}?`}
        description="This action cannot be undone. All selected tickets will be permanently removed."
        confirmLabel={`Delete ${selected.size} Ticket${selected.size > 1 ? "s" : ""}`}
        danger
      />

      {/* Priority Change Dialog */}
      {priorityTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setPriorityTarget(null)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <p className="text-sm font-bold mb-1">Change Priority</p>
            <p className="text-[11px] text-muted-foreground mb-4">Ticket {priorityTarget.ticketNo ?? priorityTarget.id}</p>
            <div className="space-y-2">
              {(["normal", "high", "critical"] as TicketPriority[]).map((p) => (
                <button key={p} onClick={() => { updateTicket(priorityTarget.id, { priority: p }); setPriorityTarget(null); }}
                  className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition", priorityTarget.priority === p ? "border-[#4361EE] bg-indigo-50/50" : "border-border hover:border-zinc-300")}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", p === "critical" ? "bg-rose-500" : p === "high" ? "bg-amber-500" : "bg-zinc-300")} />
                  <span className="text-sm font-medium">{PRIORITY_LABEL[p]}</span>
                  {priorityTarget.priority === p && <span className="ml-auto text-[10px] font-semibold text-[#4361EE]">Current</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Bulk Download Dialog */}
      <BulkDownloadDialog
        open={bulkDialog.open}
        onClose={bulkDialog.close}
        title={bulkDialog.title}
        count={bulkDialog.count}
        onDownload={executeBulkDownload}
        progress={bulkProgress}
        onRetryFailed={retryFailed}
      />

      {/* Device / Service details overlay — opened from the Device column chevron. */}
      <DeviceDetailsOverlay
        ticket={deviceDetailsTicket}
        open={!!deviceDetailsTicket}
        onClose={() => setDeviceDetailsTicket(null)}
      />
    </div>
  );
}

/* ─── Cell Renderer ──────────────────────────────────────────────────── */

/**
 * InvoiceCoverageCheck — the small circular check next to a Ticket ID that
 * signals how much of a multi-device ticket has been invoiced:
 *   • "full"    → BLUE check   — every eligible device is invoiced.
 *   • "partial" → AMBER check  — some, but not all, eligible devices invoiced.
 *   • "none"    → nothing rendered.
 * Same check shape/size as before — only the semantic colour + tooltip change.
 */
function InvoiceCoverageCheck({ coverage, size = "sm" }: { coverage: TicketInvoiceCoverage; size?: "sm" | "xs" }) {
  if (coverage === "none") return null;
  const partial = coverage === "partial";
  const dim = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";
  const glyph = size === "xs" ? "h-2 w-2" : "h-2.5 w-2.5";
  const label = partial
    ? "Partially invoiced — some devices still pending"
    : "Fully invoiced — all devices invoiced";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full text-white", dim)}
      style={{
        background: partial
          ? "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)"
          : "linear-gradient(135deg, #4361EE 0%, #3049C6 100%)",
      }}
      title={label}
      aria-label={label}
    >
      <Check className={glyph} strokeWidth={3} />
    </span>
  );
}

function renderCell(
  colId: ColumnId,
  t: Ticket,
  isSelected: boolean,
  isWaiting: boolean,
  elapsed: number,
  hasMultiItems: boolean | undefined,
  toggleOne: () => void,
  handleAction: (action: TicketAction, ticket: Ticket) => void,
  onStatusChange: (ticketId: string, status: TicketStatus) => void,
  statusColors: Record<string, string>,
  coverage: TicketInvoiceCoverage,
  onOpenDeviceDetails: (ticket: Ticket) => void,
  navigateToSection: (ticketId: string, section: "billing") => void,
  onDeviceStatusChange: (ticketId: string, deviceId: string, status: TicketStatus) => void,
  store?: StoreBranch | null,
  /** For a converted Estimate, the human-readable number of the Ticket it
   *  produced (resolved by the caller from the ticket list). */
  convertedTicketNo?: string,
  /** Whether the user may convert an Estimate to a Ticket (gates the estimate
   *  "Push to Ticket" quick action). */
  canPushToTicket?: boolean,
  /** Change a Warranty record's claim status inline from its status pill. */
  onWarrantyStatusChange?: (ticketId: string, status: WarrantyStatus) => void,
) {
  switch (colId) {
    case "store":
      // Context-aware STORE identity — DATA-DRIVEN from Ticket.branchId → Store
      // (resolved via getStore in the caller), never from the ID prefix, the
      // current selection or the URL. Reuses the shared StoreContextCell so the
      // avatar/code + name matches the Owner Dashboard store identity exactly.
      return <StoreContextCell store={store} mode="stacked" />;
    case "checkbox":
      return (
        <input type="checkbox" checked={isSelected} onChange={toggleOne}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
          aria-label={`Select ticket ${t.ticketNo ?? t.id}`} />
      );
    case "ticket":
      return (
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Pin indicator — subtle violet dot when the ticket is pinned. */}
          {t.pinnedAt && (
            <Pin className="h-3 w-3 shrink-0 text-[#7C5CFC] fill-[#7C5CFC]" aria-label="Pinned" />
          )}
          <div className="min-w-0">
            <span className="font-semibold text-foreground whitespace-nowrap">{t.ticketNo ?? t.id}</span>
            {/* Converted-Estimate reference — subtle secondary line linking a
                converted estimate to the Ticket it produced (design §64). */}
            {isEstimate(t) && t.estimateStatus === "converted" && t.convertedTicketId && (
              <p className="text-[10px] font-medium text-emerald-700 whitespace-nowrap">
                → {convertedTicketNo ?? "Ticket"}
              </p>
            )}
            {/* Original-Ticket reference — same treatment as the converted-
                Estimate link above, linking a Warranty claim back to the
                original completed Ticket it was raised against (spec §7). */}
            {isWarranty(t) && t.parentTicketId && (
              <p className="text-[10px] font-medium text-emerald-700 whitespace-nowrap">
                → {t.parentTicketNo ?? "Ticket"}
              </p>
            )}
          </div>
          {/* Invoicing-coverage indicator — BLUE = fully invoiced, AMBER =
              partially invoiced (some devices still pending), nothing when not
              invoiced. Reserved space via shrink-0 so it never pushes the id.
              Estimates + Warranty are never invoiced directly, so the check is
              hidden. */}
          {!isEstimate(t) && !isWarranty(t) && <InvoiceCoverageCheck coverage={coverage} />}
        </div>
      );
    case "customer":
      return (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={t.customer} size={30} ticketType={getTicketType(t) ?? "na"} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight truncate">{t.customer}</p>
            <p className="text-[11px] font-medium text-[#5B6FC0] truncate">{t.phone}</p>
            {t.company && <p className="text-[11px] text-muted-foreground truncate">{t.company}</p>}
          </div>
        </div>
      );
    case "device": {
      // Reads the real saved device records (getTicketDevices) — same source
      // the overlay + status column use.
      const devices = getTicketDevices(t);
      const first = devices[0];
      // Model-first identity: show ONLY the model when present, else the brand,
      // else "Unknown Device". Display rule only — underlying data unchanged.
      const nameOf = (d: typeof first | undefined) => d?.model || d?.brand || t.model || "Unknown Device";
      const issueOf = (d: typeof first | undefined) =>
        (d ? parseIssueString(d.issue).join(", ") : "") || d?.description || "";

      // ── Multi-device: one device block PER DEVICE (name + issue), stacked
      //    with the SAME vertical rhythm as the Status column so each device
      //    lines up row-for-row with its own status pill. No more "1 device
      //    shown vs 2 statuses" mismatch. ──
      if (devices.length > 1) {
        return (
          <div
            className="group/device relative flex cursor-pointer items-start gap-1 py-0.5 pr-7"
            role="button"
            tabIndex={0}
            aria-label="View device and service details"
            onClick={(e) => { e.stopPropagation(); onOpenDeviceDetails(t); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenDeviceDetails(t); } }}
          >
            {/* Priority marker — aligned with the first device name. */}
            <div className="w-3 shrink-0 flex flex-col items-center pt-[6px]">
              {t.priority !== "normal" ? (
                <span className={cn("h-2 w-2 rounded-full shrink-0", t.priority === "critical" ? "bg-rose-500" : "bg-amber-500")} title={t.priority === "critical" ? "Critical" : "High Priority"} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              )}
            </div>
            {/* Per-device blocks — gap-2 matches the Status column so the two
                columns align device-for-device. Each block reserves a min
                height equal to the status label + pill stack. */}
            <div className="min-w-0 flex-1 flex flex-col gap-2">
              {devices.map((dev, i) => {
                const issueText = issueOf(dev);
                return (
                  <div key={dev.id} className={cn("min-w-0 flex min-h-[40px] flex-col justify-center", i < devices.length - 1 && "border-b border-zinc-300 pb-2")}>
                    <p className="truncate text-[13px] font-semibold leading-snug text-foreground">{nameOf(dev)}</p>
                    <p className="truncate text-[11px] leading-snug text-zinc-600">{issueText || "—"}</p>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              aria-label="View device and service details"
              onClick={(e) => { e.stopPropagation(); onOpenDeviceDetails(t); }}
              className="absolute right-0 top-1/2 -translate-y-1/2 grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-400 opacity-70 transition hover:bg-indigo-50 hover:text-[#4361EE] group-hover/device:opacity-100"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        );
      }

      // ── Single device: rich 3-line layout (name / issue / IMEI-Serial). ──
      const deviceName = nameOf(first);
      const issueText = issueOf(first) || t.service || t.issue || "";
      const idLabel = first?.imeiType === "serial" ? "Serial" : "IMEI";
      const idValue = first?.imei || t.items?.[0]?.serial || "";
      return (
        <div
          className="group/device relative flex items-start gap-1 py-0.5 cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="View device and service details"
          onClick={(e) => { e.stopPropagation(); onOpenDeviceDetails(t); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenDeviceDetails(t); }
          }}
        >
          {/* Fixed-width marker area — aligned with the first line's cap height so
              the dot sits neatly beside the device name. Content always starts
              after this whether or not a priority dot is present. */}
          <div className="w-3 shrink-0 flex flex-col items-center pt-[6px]">
            {t.priority !== "normal" ? (
              /* Critical (red) / High (amber) indicator — replaces the first
                 device marker dot so the Device/Service text keeps the same
                 X-position. Same size & meaning as before. */
              <span
                className={cn("h-2 w-2 rounded-full shrink-0", t.priority === "critical" ? "bg-rose-500" : "bg-amber-500")}
                title={t.priority === "critical" ? "Critical" : "High Priority"}
              />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            )}
          </div>
          {/* Content area — stacks Device Name / Issue / IMEI-Serial with clear,
              even vertical rhythm so the three lines don't feel clumsy. Reserve
              right padding (pr-7) so truncated text never runs under the
              absolutely-positioned expand chevron. Long values truncate here;
              the full value lives in the detail overlay. */}
          <div className="min-w-0 flex-1 pr-7 space-y-[3px]">
            <p className="text-[14px] font-semibold leading-snug text-foreground truncate">{deviceName}</p>
            {issueText && (
              <p className="text-[12px] leading-snug text-zinc-600 truncate">{issueText}</p>
            )}
            {idValue && (
              <p className="text-[12px] leading-snug text-zinc-700 truncate">
                <span className="font-semibold">{idLabel}:</span>{" "}
                <span className="font-mono tracking-tight">{idValue}</span>
              </p>
            )}
          </div>
          {/* Expand chevron — opens the device-details overlay. Absolutely
              positioned in the cell's right gutter so it never changes the
              row height, cell width, or pushes the existing text. */}
          <button
            type="button"
            aria-label="View device and service details"
            onClick={(e) => { e.stopPropagation(); onOpenDeviceDetails(t); }}
            className="absolute right-0 top-1/2 -translate-y-1/2 grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-400 opacity-70 transition hover:bg-indigo-50 hover:text-[#4361EE] group-hover/device:opacity-100"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      );
    }
    case "status": {
      // ── Warranty records show their OWN claim lifecycle (Open / In Progress /
      //    Completed / Rejected), NOT the device repair status. This is the
      //    operational Warranty status, distinct from eligibility (spec §24). ──
      if (isWarranty(t)) {
        const ws = t.warrantyStatus ?? "open";
        // Warranty claims get an INLINE status dropdown (Open → In Progress →
        // Completed → Rejected), nudged 15px right so it reads as a distinct
        // claim-lifecycle control, set apart from the repair-status dropdowns.
        return (
          <div className="flex flex-col items-start gap-0.5 pl-[15px]">
            <WarrantyStatusPillDropdown
              status={ws}
              onSelect={(next) => onWarrantyStatusChange?.(t.id, next)}
            />
          </div>
        );
      }
      // ── Estimate records show their OWN outcome status (Waiting for Approval
      //    / Converted Ticket / Lost Customer), NOT the device repair lifecycle.
      //    These are conceptually different (see design §12). Rendered as a
      //    restrained pill using the shared estimate tones; the converted link
      //    is surfaced subtly below when present. ──
      if (isEstimate(t)) {
        const es = t.estimateStatus ?? "waiting_approval";
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset", ESTIMATE_STATUS_TONE[es])}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {ESTIMATE_STATUS_LABEL[es]}
            </span>
          </div>
        );
      }
      const statusDevices = getTicketDevices(t);
      // Single-device tickets keep the canonical ticket-level control — no
      // extra complexity. Multi-device tickets get ONE independent status
      // control PER DEVICE, stacked in the same row, aligned one-for-one with
      // the Device column's per-device blocks so name/issue and status line up.
      if (statusDevices.length <= 1) {
        return (
          <InlineStatusDropdown ticket={t} onStatusChange={onStatusChange} statusColors={statusColors} hasInvoice={coverage !== "none"} />
        );
      }
      return (
        <div className="flex flex-col gap-2" role="group" aria-label="Per-device status">
          {statusDevices.map((dev, i) => {
            const deviceName = dev.model || dev.brand || "Device";
            return (
              <div key={dev.id} className={cn("flex min-h-[40px] items-center", i < statusDevices.length - 1 && "border-b border-transparent pb-2")}>
                <StatusPillDropdown
                  status={dev.status}
                  onSelect={(next) => onDeviceStatusChange(t.id, dev.id, next)}
                  statusColors={statusColors}
                  hasInvoice={coverage !== "none"}
                  size="sm"
                  ariaLabel={deviceName}
                />
              </div>
            );
          })}
        </div>
      );
    }
    case "dueDate":
      // Clicking the Due Date opens an inline calendar/time popover (reusing the
      // RepairOX branded calendar styling) that saves the new due date/time
      // immediately — it no longer opens Edit Ticket or navigates away.
      return <DueDateCell ticket={t} overdue={isOverdue(t)} />;
    case "created":
      return (
        <div className="text-[12px] text-muted-foreground">
          <p>{new Date(t.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
          <p className="text-[11px]">{new Date(t.createdAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}</p>
        </div>
      );
    case "amount":
      // A warranty service is ₹0 and never invoiced (spec §21/§22) — show the
      // amount plainly with no Billing navigation.
      if (isWarranty(t)) {
        return <span className="font-semibold tabular-nums whitespace-nowrap text-muted-foreground">{formatINR(t.amount)}</span>;
      }
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigateToSection(t.id, "billing"); }}
          title="Open Billing / Invoice"
          className="-mx-1 rounded-md px-1 py-0.5 font-semibold tabular-nums whitespace-nowrap transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        >
          {formatINR(t.amount)}
        </button>
      );
    case "actions":
      return <div onClick={(e) => e.stopPropagation()}><TicketActionsMenu ticket={t} onAction={handleAction} hasInvoice={coverage === "full"} canPushToTicket={canPushToTicket} /></div>;
    default:
      return null;
  }
}

function EmptyRow() {
  return (
    <div className="flex flex-col items-center gap-2 p-12 text-center">
      <EmptyStateCharacter variant="ticket" />
      <p className="font-semibold">No tickets yet today</p>
      <p className="text-sm text-muted-foreground">No repair tickets have been created today.</p>
    </div>
  );
}

/* ─── Column Settings Panel ──────────────────────────────────────────────
   The Column Settings UI has been relocated to Settings → Tickets → Ticket
   Settings → Column Settings. It now lives in the shared, reusable component at
   "@/components/tickets/column-settings-panel" and writes to the persisted
   store-settings source of truth (ticketColumnOrder / ticketVisibleColumns). */
