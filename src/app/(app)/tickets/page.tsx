"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Filter, Download, Search, Clock, RefreshCw, Settings2,
  GripVertical, Eye, EyeOff, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { TicketActionsMenu, type TicketAction } from "@/components/tickets/ticket-actions-menu";
import {
  ViewTicketDrawer, TransferTicketDrawer, CommentDrawer,
  CheckoutDrawer, EmailReceiptDrawer, PrintDrawer,
} from "@/components/tickets/ticket-drawers";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { STATUS_LABEL, STATUS_TONE, type TicketStatus, type Ticket } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { formatINR, cn } from "@/lib/utils";

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
  { id: "checkbox", label: "", width: "w-11", locked: true },
  { id: "ticket", label: "Ticket", width: "w-[80px]" },
  { id: "customer", label: "Customer", width: "w-[180px]" },
  { id: "device", label: "Device / Service", width: "min-w-[200px]" },
  { id: "status", label: "Status", width: "w-[160px]" },
  { id: "dueDate", label: "Due Date", width: "w-[150px]" },
  { id: "created", label: "Created", width: "w-[150px]" },
  { id: "amount", label: "Amount", width: "w-[100px]", align: "right" },
  { id: "actions", label: "Actions", width: "w-[90px]", align: "right", locked: true },
];

const DEFAULT_VISIBLE: ColumnId[] = ALL_COLUMNS.map((c) => c.id);
const DEFAULT_ORDER: ColumnId[] = ALL_COLUMNS.map((c) => c.id);

/* ─── Constants ──────────────────────────────────────────────────────── */

const STATUS_FILTERS: { label: string; value: TicketStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Received", value: "received" },
  { label: "Diagnosis", value: "diagnosis" },
  { label: "Repairing", value: "repairing" },
  { label: "QC", value: "qc" },
  { label: "Completed", value: "completed" },
  { label: "Delivered", value: "delivered" },
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
  { label: "Received", value: "received" },
  { label: "Diagnosis", value: "diagnosis" },
  { label: "Repairing", value: "repairing" },
  { label: "Quality Check", value: "qc" },
  { label: "Completed", value: "completed" },
  { label: "Delivered", value: "delivered" },
];

const PRIORITY_OPTIONS = [
  { label: "All Priorities", value: "all" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "med" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const WAITING_THRESHOLD_MINS = 40;

/* ─── Helpers ────────────────────────────────────────────────────────── */

function getElapsedMins(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  if (isNaN(created)) return 0;
  return Math.floor((Date.now() - created) / 60_000);
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
  const { tickets, bulkUpdateStatus, deleteTicket } = useStore();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [techFilter, setTechFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);

  // Column config
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>(DEFAULT_ORDER);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(new Set(DEFAULT_VISIBLE));
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Drawer state
  const [activeDrawer, setActiveDrawer] = useState<TicketAction | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);

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

  // Filtered list
  const list = useMemo(
    () =>
      tickets.filter((t) => {
        const okStatus = statusFilter === "all" || t.status === statusFilter;
        const okDate = isInDateRange(t.createdAt, dateRange);
        const okPriority = priorityFilter === "all" || t.priority === priorityFilter;
        const okTech = techFilter === "all" || t.technician === techFilter;
        const okQ =
          !q ||
          `${t.id} ${t.customer} ${t.model} ${t.issue} ${t.phone} ${t.items?.map((i) => `${i.model} ${i.serial} ${i.issue}`).join(" ") || ""}`
            .toLowerCase()
            .includes(q.toLowerCase());
        return okStatus && okDate && okPriority && okTech && okQ;
      }),
    [tickets, statusFilter, dateRange, priorityFilter, techFilter, q]
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
    setSelected(new Set());
    setShowBulkStatus(false);
  }, [selected, bulkUpdateStatus]);

  /* Action handler */
  const handleAction = useCallback((action: TicketAction, ticket: Ticket) => {
    if (action === "edit") { router.push(`/tickets/new?edit=${ticket.id}`); return; }
    if (action === "delete") {
      setDeleteTarget(ticket);
      return;
    }
    setActiveTicket(ticket);
    setActiveDrawer(action);
  }, [router, deleteTicket]);

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
              {(priorityFilter !== "all" || techFilter !== "all") && (
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

      {/* Filter Panel */}
      <AnimatePresence>
        {showFilterPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advanced Filters</p>
              <button onClick={() => { setPriorityFilter("all"); setTechFilter("all"); }} className="text-[11px] text-[#4361EE] font-medium hover:underline">
                Reset Filters
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Priority</label>
                <Select value={priorityFilter} onChange={(e: any) => setPriorityFilter(e.target.value)} options={PRIORITY_OPTIONS} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Technician</label>
                <Select value={techFilter} onChange={(e: any) => setTechFilter(e.target.value)} options={[{ label: "All Technicians", value: "all" }, ...technicians.map((t) => ({ label: t, value: t }))]} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Status</label>
                <Select value={statusFilter} onChange={(e: any) => setStatusFilter(e.target.value)} options={[{ label: "All Statuses", value: "all" }, ...STATUS_OPTIONS.map((s) => ({ label: s.label, value: s.value }))]} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Date Range</label>
                <Select value={dateRange} onChange={(e: any) => setDateRange(e.target.value)} options={DATE_RANGES.map((d) => ({ label: d.label, value: d.value }))} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Column Config Panel */}
      <AnimatePresence>
        {showColumnConfig && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Column Settings</p>
              <div className="flex items-center gap-2">
                <button onClick={resetColumns} className="text-[11px] text-[#4361EE] font-medium hover:underline">Reset</button>
                <button onClick={() => setShowColumnConfig(false)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {columnOrder.filter((id) => !ALL_COLUMNS.find((c) => c.id === id)?.locked).map((id) => {
                const col = ALL_COLUMNS.find((c) => c.id === id)!;
                const visible = visibleColumns.has(id);
                const idx = columnOrder.indexOf(id);
                return (
                  <div key={id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 transition", visible ? "border-indigo-200 bg-indigo-50/40" : "border-border bg-muted/30")}>
                    <button onClick={() => toggleColumn(id)} className="shrink-0">
                      {visible ? <Eye className="h-3.5 w-3.5 text-[#4361EE]" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    <span className={cn("flex-1 text-xs font-medium", visible ? "text-foreground" : "text-muted-foreground")}>{col.label}</span>
                    <div className="flex flex-col">
                      <button onClick={() => moveColumn(id, "up")} disabled={idx <= 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                      <button onClick={() => moveColumn(id, "down")} disabled={idx >= columnOrder.length - 2} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
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
              <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkStatus(!showBulkStatus)}>
                <RefreshCw className="h-3 w-3" /> Change Status
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

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {activeColumns.map((col) => (
                  <th key={col.id} className={cn("px-3 py-3", col.width, col.align === "right" && "text-right")}>
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
              {list.map((t, i) => {
                const elapsed = getElapsedMins(t.createdAt);
                const isWaiting = elapsed >= WAITING_THRESHOLD_MINS && t.status !== "completed" && t.status !== "delivered";
                const isSelected = selected.has(t.id);
                const hasMultiItems = t.items && t.items.length > 1;

                return (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.015 * i }}
                    className={cn(
                      "group border-t border-border transition-colors align-top",
                      isWaiting && "bg-sky-50/70",
                      isSelected && !isWaiting && "bg-indigo-50/40",
                      !isWaiting && !isSelected && "hover:bg-muted/40"
                    )}
                  >
                    {activeColumns.map((col) => (
                      <td key={col.id} className={cn("px-3 py-3", col.align === "right" && "text-right")}>
                        {renderCell(col.id, t, isSelected, isWaiting, elapsed, hasMultiItems, () => toggleOne(t.id), handleAction)}
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
        {list.map((t, i) => {
          const elapsed = getElapsedMins(t.createdAt);
          const isWaiting = elapsed >= WAITING_THRESHOLD_MINS && t.status !== "completed" && t.status !== "delivered";
          const isSelected = selected.has(t.id);
          return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
              className={cn("rounded-2xl border border-border bg-card p-4 shadow-card", isWaiting && "border-sky-200 bg-sky-50/50", isSelected && !isWaiting && "border-indigo-200 bg-indigo-50/30")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(t.id)} className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer" />
                  <div className="flex items-center gap-2">
                    <Avatar name={t.customer} size={32} />
                    <div>
                      <p className="text-sm font-semibold">{t.customer}</p>
                      <p className="text-[11px] text-muted-foreground">{t.id} · {t.phone}</p>
                    </div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
              </div>
              <div className="mt-3 space-y-1">
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
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-sm">{formatINR(t.amount)}</span>
                  {isWaiting && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200"><Clock className="h-2.5 w-2.5" />{elapsed}m+</span>}
                </div>
                <TicketActionsMenu ticket={t} onAction={handleAction} />
              </div>
            </motion.div>
          );
        })}
        {list.length === 0 && <EmptyRow />}
      </div>

      {/* Pagination info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {list.length} of {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Drawers */}
      <ViewTicketDrawer open={activeDrawer === "view"} onClose={closeDrawer} ticket={activeTicket} />
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
        title={`Delete ticket ${deleteTarget?.id || ""}?`}
        description="This action cannot be undone. The ticket and all associated data will be permanently removed."
        confirmLabel="Delete Ticket"
        cancelLabel="Cancel"
        danger
      />
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
) {
  switch (colId) {
    case "checkbox":
      return (
        <input type="checkbox" checked={isSelected} onChange={toggleOne}
          className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
          aria-label={`Select ticket ${t.id}`} />
      );
    case "ticket":
      return <span className="font-semibold text-foreground whitespace-nowrap">{t.id}</span>;
    case "customer":
      return (
        <div className="flex items-center gap-2.5">
          <Avatar name={t.customer} size={30} />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{t.customer}</p>
            <p className="text-[11px] text-muted-foreground truncate">{t.phone}</p>
            {t.company && <p className="text-[11px] text-muted-foreground truncate">{t.company}</p>}
          </div>
        </div>
      );
    case "device":
      return (
        <div className="space-y-1">
          {t.items && t.items.length > 0 ? (
            <>
              {t.items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{item.model}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {item.serial && <span className="font-mono">{item.serial}</span>}
                      {item.serial && " · "}{item.issue}
                    </p>
                  </div>
                </div>
              ))}
              {t.items.length > 1 && (
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
                  {t.items.length} items
                </span>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium leading-tight">{t.model}</p>
              <p className="text-[11px] text-muted-foreground">{t.service || t.issue}</p>
            </>
          )}
        </div>
      );
    case "status":
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${STATUS_TONE[t.status]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABEL[t.status]}
          </span>
          {isWaiting && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200 whitespace-nowrap">
              <Clock className="h-2.5 w-2.5" />{elapsed}m+
            </span>
          )}
        </div>
      );
    case "dueDate":
      return <span className="text-[12px] text-muted-foreground whitespace-nowrap">{t.dueDate ? fmtDate(t.dueDate) : "—"}</span>;
    case "created":
      return <span className="text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(t.createdAt)}</span>;
    case "amount":
      return <span className="font-semibold tabular-nums whitespace-nowrap">{formatINR(t.amount)}</span>;
    case "actions":
      return <TicketActionsMenu ticket={t} onAction={handleAction} />;
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
