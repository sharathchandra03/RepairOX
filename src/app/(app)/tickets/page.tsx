"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Filter, Download, Search, Clock, RefreshCw, Settings2,
  GripVertical, Eye, EyeOff, X, ChevronDown, ChevronUp, Trash2,
  Pin, PinOff, Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { TicketActionsMenu, type TicketAction } from "@/components/tickets/ticket-actions-menu";
import {
  TransferTicketDrawer, CommentDrawer,
  CheckoutDrawer, EmailReceiptDrawer, PrintDrawer,
} from "@/components/tickets/ticket-drawers";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DeviceDetailsOverlay } from "@/components/tickets/device-details-overlay";
import { Pagination } from "@/components/ui/pagination";
import { STATUS_LABEL, STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE, type TicketStatus, type Ticket, type TicketPriority, getTicketDevices, getTicketType } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { formatINR, cn } from "@/lib/utils";
import { usePinnedFilters } from "@/hooks/use-pinned-filters";
import { PinnedFilterBar, type PinnableFilterDef } from "@/components/tickets/pinned-filter-bar";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import { BulkDownloadDialog } from "@/components/download/bulk-download-dialog";

/* ─── Column Definition ──────────────────────────────────────────────── */

type ColumnId = "checkbox" | "ticket" | "customer" | "device" | "status" | "dueDate" | "created" | "amount" | "actions";

type ColumnDef = {
  id: ColumnId;
  label: string;
  width: string; // tailwind width class
  align?: "left" | "right" | "center";
  locked?: boolean; // cannot be hidden or moved
};

const ALL_COLUMNS: ColumnDef[] = [
  { id: "checkbox", label: "", width: "w-9", locked: true },
  { id: "ticket", label: "Ticket", width: "w-[112px]" },
  { id: "customer", label: "Customer", width: "w-[33%]" },
  { id: "device", label: "Device / Service", width: "w-[33%]" },
  { id: "status", label: "Status", width: "w-[184px]", align: "left" },
  { id: "dueDate", label: "Due Date", width: "w-[100px]" },
  { id: "created", label: "Created", width: "w-[100px]" },
  { id: "amount", label: "Amount", width: "w-[92px]", align: "right" },
  { id: "actions", label: "Actions", width: "w-[108px]", align: "center", locked: true },
];

const DEFAULT_VISIBLE: ColumnId[] = ALL_COLUMNS.map((c) => c.id);
const DEFAULT_ORDER: ColumnId[] = ALL_COLUMNS.map((c) => c.id);

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
  { label: "14 Days", value: "14days" },
  { label: "30 Days", value: "30days" },
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
  { label: "Normal", value: "normal" },
  { label: "High Priority", value: "high" },
  { label: "Critical", value: "critical" },
];

const WAITING_THRESHOLD_MINS = 40;

/** Rows shown per page in the ticket table. */
const PAGE_SIZE = 20;

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

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isInDateRange(createdAt: string, range: DateRange): boolean {
  if (range === "all") return true;
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return true;
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  switch (range) {
    case "today": return created >= todayStart;
    case "yesterday": return created >= todayStart - 86_400_000 && created < todayStart;
    case "7days": return created >= todayStart - 7 * 86_400_000;
    case "14days": return created >= todayStart - 14 * 86_400_000;
    case "30days": return created >= todayStart - 30 * 86_400_000;
    default: return true;
  }
}

/* ─── Page Component ─────────────────────────────────────────────────── */

export default function TicketsPage() {
  const router = useRouter();
  const { tickets, invoices, bulkUpdateStatus, deleteTicket, updateTicket, deductPartsForTicket, pinTicket } = useStore();
  const { settings } = useStoreSettings();
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
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [page, setPage] = useState(1);

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
      setPriorityFilter("all");
      setTechFilter("all");
      setCustomerTypeFilter("all");
      setQ("");
    }
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

  // Column config
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_ORDER);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(new Set(DEFAULT_VISIBLE));
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Drawer state
  const [activeDrawer, setActiveDrawer] = useState<TicketAction | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);

  // Priority change
  const [priorityTarget, setPriorityTarget] = useState<Ticket | null>(null);

  // Tick for time-based highlights
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Unique technicians for filter
  const technicians = useMemo(() => {
    const set = new Set(tickets.map((t) => t.technician));
    return Array.from(set).sort();
  }, [tickets]);

  // Pinned filters
  const { pinnedIds, togglePin, unpin, isPinned } = usePinnedFilters();

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
      label: "Status",
      type: "select" as const,
      value: statusFilter,
      options: [{ label: "All Statuses", value: "all" }, ...STATUS_OPTIONS.map((s) => ({ label: s.label, value: s.value }))],
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
  ], [priorityFilter, techFilter, statusFilter, dateRange, customerTypeFilter, technicians]);

  // Set of ticket IDs that have at least one invoice generated from them.
  // Derived from the actual DB-backed invoice relationship (invoice.ticketId),
  // so it stays correct across reload, login, search, filter, edit and view.
  const ticketsWithInvoice = useMemo(
    () => new Set(invoices.map((inv) => inv.ticketId).filter(Boolean) as string[]),
    [invoices]
  );

  // Filtered list — pinned records float to the top while preserving the
  // existing order within each group (pinned + normal).
  const list = useMemo(
    () => {
      // When navigated from Universal Search, show only the exact record
      if (searchFilterId) {
        return tickets.filter((t) => t.id === searchFilterId);
      }
      const filtered = tickets.filter((t) => {
        const okStatus = statusFilter === "all" || t.status === statusFilter;
        const okDate = isInDateRange(t.createdAt, dateRange);
        const okPriority = priorityFilter === "all" || t.priority === priorityFilter;
        const okTech = techFilter === "all" || t.technician === techFilter;
        const okCustomerType = customerTypeFilter === "all" || (customerTypeFilter === "personal" ? (t.customerType === "personal" || !t.customerType) : t.customerType === customerTypeFilter);
        const okQ =
          !q ||
          `${t.ticketNo ?? ""} ${t.id} ${t.customer} ${t.model} ${t.issue} ${t.phone} ${t.items?.map((i) => `${i.model} ${i.serial} ${i.issue}`).join(" ") || ""}`
            .toLowerCase()
            .includes(q.toLowerCase());
        return okStatus && okDate && okPriority && okTech && okCustomerType && okQ;
      });
      // Stable partition: pinned first, then normal — order within each group
      // is the original table order (createdAt-desc from the store).
      const pinned = filtered.filter((t) => t.pinnedAt);
      const normal = filtered.filter((t) => !t.pinnedAt);
      return [...pinned, ...normal];
    },
    [tickets, statusFilter, dateRange, priorityFilter, techFilter, customerTypeFilter, q, searchFilterId]
  );

  // Reset to the first page whenever the filtered result set changes so
  // pagination always reflects the current filters/search.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateRange, priorityFilter, techFilter, customerTypeFilter, q, searchFilterId]);

  // Pagination — pinned records already float to the top of `list`, so slicing
  // here keeps pinned rows at the top of page 1 while respecting page size.
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [list, currentPage]
  );

  // Ordered & visible columns
  const activeColumns = useMemo(
    () => columnOrder.filter((id) => visibleColumns.has(id)).map((id) => ALL_COLUMNS.find((c) => c.id === id)!),
    [columnOrder, visibleColumns]
  );

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
    if (action === "invoice") {
      const p = new URLSearchParams();
      p.set("fromTicket", ticket.id);
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

      // Pass full device structure for multi-device invoice support
      const devices = getTicketDevices(ticket);
      const invoiceDevices = devices.map((dev) => ({
        brand: dev.brand,
        model: dev.model,
        imei: dev.imei,
        imeiType: dev.imeiType,
        issue: dev.issue || dev.description,
        description: dev.description,
        jobType: dev.jobType,
        priority: dev.priority,
        warranty: dev.warranty,
        technician: dev.assignedTo,
        notes: dev.notes,
        estimate: dev.estimate,
        parts: (dev.parts || []).map((pt) => ({ name: pt.name, sku: pt.sku, qty: pt.qty, unitPrice: pt.unitPrice, total: pt.total })),
      }));
      p.set("devices", JSON.stringify(invoiceDevices));

      // Pass first device info for backward compat
      p.set("service", devices[0]?.issue || ticket.service || ticket.issue);
      p.set("device", devices[0]?.model || ticket.model);
      p.set("brand", devices[0]?.brand || ticket.device);
      if (devices[0]?.imei) p.set("serial", devices[0].imei);

      router.push(`/invoice/create?${p.toString()}`);
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
  }, [router, deleteTicket, downloadTicket, pinTicket]);

  const closeDrawer = useCallback(() => { setActiveDrawer(null); setActiveTicket(null); }, []);

  /* Column reorder */
  const moveColumn = useCallback((id: ColumnId, dir: "up" | "down") => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }, []);

  const toggleColumn = useCallback((id: ColumnId) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const resetColumns = useCallback(() => {
    setColumnOrder(DEFAULT_ORDER);
    setVisibleColumns(new Set(DEFAULT_VISIBLE));
  }, []);

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
              {(priorityFilter !== "all" || techFilter !== "all" || customerTypeFilter !== "all") && (
                <span className="ml-1 h-2 w-2 rounded-full bg-[#4361EE]" />
              )}
            </Button>
            <Button variant="outline" size="md" className="rounded-full" onClick={() => setShowColumnConfig(!showColumnConfig)}>
              <Settings2 className="h-4 w-4" /> Columns
            </Button>
            <Can permission="export_reports">
              <Button variant="outline" size="md" className="rounded-full">
                <Download className="h-4 w-4" /> Export
              </Button>
            </Can>
            <Can permission="manage_repair_jobs">
              <Link href="/tickets/new">
                <Button size="md" className="rounded-full">
                  <Plus className="h-4 w-4" /> Create Ticket
                </Button>
              </Link>
            </Can>
          </>
        }
      />

      {/* Date Range Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {DATE_RANGES.map((dr) => (
          <button
            key={dr.value}
            onClick={() => setDateRange(dr.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
              dateRange === dr.value
                ? "bg-[#4361EE] text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.4)]"
                : "bg-muted text-muted-foreground hover:bg-slate-200 hover:text-foreground"
            )}
          >
            {dr.label}
          </button>
        ))}
      </div>

      {/* Pinned Filters Bar */}
      <PinnedFilterBar
        filters={pinnableFilters}
        pinnedIds={pinnedIds}
        onUnpin={unpin}
      />

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
              <button onClick={() => { setPriorityFilter("all"); setTechFilter("all"); setCustomerTypeFilter("all"); }} className="text-[11px] text-[#4361EE] font-medium hover:underline">
                Reset Filters
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                  <label className="text-[11px] font-medium text-muted-foreground">Status</label>
                  <button
                    onClick={() => togglePin("status")}
                    className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors", isPinned("status") ? "text-[#4361EE] bg-[#EEF1FD]" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
                    title={isPinned("status") ? "Unpin filter" : "Pin filter to header"}
                  >
                    {isPinned("status") ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {isPinned("status") ? "Unpin" : "Pin"}
                  </button>
                </div>
                <Select value={statusFilter} onChange={(e: any) => setStatusFilter(e.target.value)} options={[{ label: "All Statuses", value: "all" }, ...STATUS_OPTIONS.map((s) => ({ label: s.label, value: s.value }))]} />
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Column Config Panel */}
      <AnimatePresence>
        {showColumnConfig && (
          <ColumnSettingsPanel
            columnOrder={columnOrder}
            visibleColumns={visibleColumns}
            onApply={(order, visible) => {
              setColumnOrder(order);
              setVisibleColumns(visible);
              setShowColumnConfig(false);
            }}
            onCancel={() => setShowColumnConfig(false)}
            onReset={resetColumns}
          />
        )}
      </AnimatePresence>

      {/* Status Filters + Search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedTabs
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS.map((f) => ({ label: f.label, value: f.value as string }))}
          size="sm"
        />
        <div className="flex items-center gap-3">
          {someSelected && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{selected.size} selected</span>
              {canDownload && (
                <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => startBulkTicketDownload(Array.from(selected))}>
                  <Download className="h-3 w-3" /> Download PDFs
                </Button>
              )}
              <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkStatus(!showBulkStatus)}>
                <RefreshCw className="h-3 w-3" /> Change Status
              </Button>
              <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkDelete(true)}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          )}
          <div className="lg:w-80">
            <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Search by ID, customer, model, serial…" iconLeft={<Search className="h-4 w-4" />} />
          </div>
        </div>
      </div>

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

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border-2 border-zinc-200 bg-card shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead className="sticky top-0 z-10 bg-[#D6DDFB] border-b-2 border-[#4361EE]/25">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
                {activeColumns.map((col) => (
                  <th key={col.id} className={cn("px-3 py-3", col.width, col.id === "status" && "pl-1 pr-5", col.id === "amount" && "pr-6", col.align === "right" && "text-right", col.align === "center" && "text-center")}>
                    {col.id === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
                        aria-label="Select all tickets"
                      />
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
                      "group border-b border-zinc-200 transition-colors align-middle cursor-pointer",
                      isWaiting && "bg-red-50/80",
                      isSelected && !isWaiting && "bg-indigo-50/40",
                      !isWaiting && !isSelected && "hover:bg-[#EEF1FD]/50"
                    )}
                  >
                    {activeColumns.map((col) => (
                      <td key={col.id} className={cn(
                        "px-3 py-3 align-middle",
                        col.id === "status" && "pl-1 pr-5",
                        col.id === "customer" && "pl-0",
                        col.id === "amount" && "pr-6",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center"
                      )}>
                        {renderCell(col.id, t, isSelected, isWaiting, elapsed, hasMultiItems, () => toggleOne(t.id), handleAction, handleInlineStatusChange, settings.statusColors, ticketsWithInvoice.has(t.id), setDeviceDetailsTicket)}
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
                    <Avatar name={t.customer} size={32} ticketType={getTicketType(t)} />
                    <div>
                      <p className="text-sm font-semibold">{t.customer}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {t.pinnedAt && <Pin className="h-3 w-3 text-[#7C5CFC] fill-[#7C5CFC]" aria-label="Pinned" />}
                        <span>{t.ticketNo ?? t.id}</span>
                        {ticketsWithInvoice.has(t.id) && (
                          <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-1 ring-inset ring-emerald-200" title="Invoice generated" aria-label="Invoice generated">
                            <Check className="h-2 w-2" strokeWidth={3} />
                          </span>
                        )}
                        <span>· <span className="font-medium text-[#5B6FC0]">{t.phone}</span></span>
                      </p>
                    </div>
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset"
                  style={{
                    backgroundColor: `${settings.statusColors[t.status] || "#71717A"}15`,
                    color: settings.statusColors[t.status] || "#71717A",
                    boxShadow: `inset 0 0 0 1px ${settings.statusColors[t.status] || "#71717A"}30`,
                  }}
                >{STATUS_LABEL[t.status]}</span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setDeviceDetailsTicket(t); }}
                className="mt-3 flex w-full items-start justify-between gap-2 rounded-lg text-left transition hover:bg-indigo-50/50"
                aria-label="View device and service details"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  {t.items && t.items.length > 0 ? (
                    t.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                        <span className="font-medium">{item.model}</span>
                        {item.serial && <span className="text-muted-foreground">({item.serial})</span>}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm font-medium">{t.model}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{t.service || t.issue}</p>
                </div>
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              </button>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-sm">{formatINR(t.amount)}</span>
                  {isWaiting && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-[#922B21] ring-1 ring-inset ring-red-200/60"><Clock className="h-2.5 w-2.5" />{elapsed}m+</span>}
                </div>
                <TicketActionsMenu ticket={t} onAction={handleAction} />
              </div>
            </motion.div>
          );
        })}
        {list.length === 0 && <EmptyRow />}
      </div>

      {/* Pagination — 20 rows per page; pinned rows stay at the top of page 1 */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={list.length}
        pageSize={PAGE_SIZE}
        itemLabel="ticket"
      />

      {/* Drawers */}
      <TransferTicketDrawer open={activeDrawer === "transfer"} onClose={closeDrawer} ticket={activeTicket} />
      <CommentDrawer open={activeDrawer === "comment"} onClose={closeDrawer} ticket={activeTicket} />
      <CheckoutDrawer open={activeDrawer === "checkout"} onClose={closeDrawer} ticket={activeTicket} />
      <EmailReceiptDrawer open={activeDrawer === "email-receipt"} onClose={closeDrawer} ticket={activeTicket} />
      <PrintDrawer open={activeDrawer === "print"} onClose={closeDrawer} ticket={activeTicket} />

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

/* ─── Inline Status Dropdown ─────────────────────────────────────────── */

function InlineStatusDropdown({ ticket, onStatusChange, statusColors }: { ticket: Ticket; onStatusChange: (ticketId: string, status: TicketStatus) => void; statusColors: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < 300;
      setPos({
        top: dropUp ? rect.top : rect.bottom + 6,
        left: rect.left,
        dropUp,
      });
    }
    setOpen(!open);
  };

  const activeColor = statusColors[ticket.status] || "#71717A";

  return (
    <div className="relative flex justify-start" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap cursor-pointer transition hover:shadow-sm"
        style={{
          backgroundColor: `${activeColor}15`,
          color: activeColor,
          boxShadow: `inset 0 0 0 1px ${activeColor}30`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeColor }} />
        {STATUS_LABEL[ticket.status]}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "fixed",
                top: pos.dropUp ? undefined : pos.top,
                bottom: pos.dropUp ? (window.innerHeight - pos.top + 6) : undefined,
                left: pos.left,
              }}
              className="z-[70] w-[200px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              {STATUS_OPTIONS.map((s) => {
                const sColor = statusColors[s.value] || "#71717A";
                return (
                  <button
                    key={s.value}
                    onClick={() => { onStatusChange(ticket.id, s.value); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition",
                      ticket.status === s.value ? "bg-indigo-50 text-[#4361EE]" : "hover:bg-zinc-50 text-foreground"
                    )}
                  >
                    <span className="h-2 w-2 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: sColor }} />
                    {s.label}
                    {ticket.status === s.value && <span className="ml-auto text-[9px] font-semibold text-[#4361EE]">✓</span>}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Cell Renderer ──────────────────────────────────────────────────── */

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
  hasInvoice: boolean,
  onOpenDeviceDetails: (ticket: Ticket) => void,
) {
  switch (colId) {
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
          <span className="font-semibold text-foreground whitespace-nowrap">{t.ticketNo ?? t.id}</span>
          {/* Invoice-generated indicator — subtle green circular check.
              Reserved space via shrink-0 so it never pushes the id. */}
          {hasInvoice && (
            <span
              className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-1 ring-inset ring-emerald-200"
              title="Invoice generated"
              aria-label="Invoice generated"
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          )}
        </div>
      );
    case "customer":
      return (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={t.customer} size={30} ticketType={getTicketType(t)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight truncate">{t.customer}</p>
            <p className="text-[11px] font-medium text-[#5B6FC0] truncate">{t.phone}</p>
            {t.company && <p className="text-[11px] text-muted-foreground truncate">{t.company}</p>}
          </div>
        </div>
      );
    case "device":
      return (
        <div
          className="group/device relative flex py-0.5 cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="View device and service details"
          onClick={(e) => { e.stopPropagation(); onOpenDeviceDetails(t); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpenDeviceDetails(t); }
          }}
        >
          {/* Fixed-width marker area — content always starts after this, whether
              or not a critical/high priority dot is present. */}
          <div className="w-4 shrink-0 flex flex-col items-center pt-[7px] gap-3">
            {t.priority !== "normal" ? (
              /* Critical (red) / High (amber) indicator — replaces the first
                 device marker dot so the Device/Service text keeps the same
                 X-position. Same size & meaning as before. */
              <span
                className={cn("h-2 w-2 rounded-full shrink-0", t.priority === "critical" ? "bg-rose-500" : "bg-amber-500")}
                title={t.priority === "critical" ? "Critical" : "High Priority"}
              />
            ) : t.items && t.items.length > 0 ? (
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            )}
            {/* Remaining device markers (skip the first, which is handled above). */}
            {t.items && t.items.length > 1 &&
              t.items.slice(1).map((_, idx) => (
                <span key={idx} className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
              ))}
          </div>
          {/* Content area — always starts at same position. Reserve right
              padding (pr-7) so the truncated text never runs under the
              absolutely-positioned expand chevron. */}
          <div className="min-w-0 flex-1 space-y-1.5 pr-7">
            {t.items && t.items.length > 0 ? (
              <>
                {t.items.map((item, idx) => (
                  <div key={idx}>
                    <p className="text-[13px] font-medium leading-snug truncate">{item.model}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug truncate">
                      {item.serial && <span className="font-mono text-[10px]">{item.serial}</span>}
                      {item.serial && item.issue ? " · " : ""}
                      {item.issue}
                    </p>
                  </div>
                ))}
                {t.items.length > 1 && (
                  <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                    {t.items.length} items
                  </span>
                )}
              </>
            ) : (
              <div>
                <p className="text-[13px] font-medium leading-snug truncate">{t.model}</p>
                <p className="text-[11px] text-muted-foreground leading-snug truncate">{t.service || t.issue}</p>
              </div>
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
    case "status":
      return (
        <InlineStatusDropdown ticket={t} onStatusChange={onStatusChange} statusColors={statusColors} />
      );
    case "dueDate":
      return t.dueDate ? (
        <div className={cn("text-[12px]", isOverdue(t) ? "text-[#922B21] font-semibold" : "text-[#922B21]/70")}>
          <p>{new Date(t.dueDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
          <p className="text-[11px]">{new Date(t.dueDate).toLocaleTimeString("en-IN", { timeStyle: "short" })}</p>
        </div>
      ) : <span className="text-[12px] text-muted-foreground">—</span>;
    case "created":
      return (
        <div className="text-[12px] text-muted-foreground">
          <p>{new Date(t.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
          <p className="text-[11px]">{new Date(t.createdAt).toLocaleTimeString("en-IN", { timeStyle: "short" })}</p>
        </div>
      );
    case "amount":
      return <span className="font-semibold tabular-nums whitespace-nowrap">{formatINR(t.amount)}</span>;
    case "actions":
      return <div onClick={(e) => e.stopPropagation()}><TicketActionsMenu ticket={t} onAction={handleAction} /></div>;
    default:
      return null;
  }
}

function EmptyRow() {
  return (
    <div className="flex flex-col items-center gap-2 p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">🔍</div>
      <p className="font-semibold">No tickets match your filters</p>
      <p className="text-sm text-muted-foreground">Try a different status, date range, or clear your search.</p>
    </div>
  );
}

/* ─── Column Settings Panel ──────────────────────────────────────────── */

function ColumnSettingsPanel({
  columnOrder,
  visibleColumns,
  onApply,
  onCancel,
  onReset,
}: {
  columnOrder: ColumnId[];
  visibleColumns: Set<ColumnId>;
  onApply: (order: ColumnId[], visible: Set<ColumnId>) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [localOrder, setLocalOrder] = useState<ColumnId[]>(columnOrder);
  const [localVisible, setLocalVisible] = useState<Set<ColumnId>>(new Set(visibleColumns));
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<ColumnId | null>(null);

  const editableColumns = ALL_COLUMNS.filter((c) => !c.locked);
  const requiredIds = new Set<ColumnId>(["ticket", "status"]);

  const visibleList = localOrder.filter((id) => localVisible.has(id) && !ALL_COLUMNS.find((c) => c.id === id)?.locked);
  const hiddenList = editableColumns.filter((c) => !localVisible.has(c.id));

  const filteredVisible = search
    ? visibleList.filter((id) => ALL_COLUMNS.find((c) => c.id === id)?.label.toLowerCase().includes(search.toLowerCase()))
    : visibleList;

  const filteredHidden = search
    ? hiddenList.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
    : hiddenList;

  const toggleVisibility = (id: ColumnId) => {
    if (requiredIds.has(id)) return;
    setLocalVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Drag & drop within visible list
  const handleDragStart = (id: ColumnId) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, targetId: ColumnId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setLocalOrder((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  };
  const handleDragEnd = () => setDragId(null);

  const handleReset = () => {
    setLocalOrder(DEFAULT_ORDER);
    setLocalVisible(new Set(DEFAULT_VISIBLE));
    onReset();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-border bg-card shadow-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3 className="font-display text-sm font-bold tracking-tight">Column Settings</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Customize which columns are visible in the ticket table.</p>
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns…"
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none transition"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Visible Columns */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Visible Columns <span className="text-foreground ml-1">{filteredVisible.length}</span>
          </p>
          <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
            {filteredVisible.map((id) => {
              const col = ALL_COLUMNS.find((c) => c.id === id)!;
              const isRequired = requiredIds.has(id);
              const isDragging = dragId === id;
              return (
                <div
                  key={id}
                  draggable={!isRequired}
                  onDragStart={() => handleDragStart(id)}
                  onDragOver={(e) => handleDragOver(e, id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all group",
                    isDragging ? "bg-indigo-50 ring-1 ring-indigo-200 shadow-sm scale-[1.02]" : "hover:bg-muted/60"
                  )}
                >
                  <input
                    type="checkbox"
                    checked
                    disabled={isRequired}
                    onChange={() => toggleVisibility(id)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="flex-1 text-xs font-medium text-foreground">{col.label}</span>
                  {isRequired && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200">Required</span>
                  )}
                  {!isRequired && (
                    <span className="cursor-grab active:cursor-grabbing text-muted-foreground/50 group-hover:text-muted-foreground transition">
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              );
            })}
            {filteredVisible.length === 0 && (
              <p className="py-3 text-center text-[11px] text-muted-foreground">No matching columns</p>
            )}
          </div>
        </div>

        {/* Hidden Columns */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Hidden Columns <span className="text-foreground ml-1">{filteredHidden.length}</span>
          </p>
          <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
            {filteredHidden.map((col) => (
              <div key={col.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-muted/60 transition">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggleVisibility(col.id)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
                />
                <span className="flex-1 text-xs font-medium text-muted-foreground">{col.label}</span>
              </div>
            ))}
            {filteredHidden.length === 0 && (
              <p className="py-3 text-center text-[11px] text-muted-foreground">
                {search ? "No matching columns" : "All columns are visible"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <button onClick={handleReset} className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition">
          Reset Default
        </button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onApply(localOrder, localVisible)}>Apply</Button>
        </div>
      </div>
    </motion.div>
  );
}
