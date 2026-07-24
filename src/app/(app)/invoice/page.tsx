"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Download, Search, Eye, Pencil, MoreHorizontal,
  Trash2, Copy, Printer, Mail, FileDown, TrendingUp, Receipt,
  DollarSign, AlertCircle, Clock, FileText, CreditCard, BarChart3,
  PieChart, Settings2, GripVertical, RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStore } from "@/lib/store";
import { InvoiceFilters, type FilterState } from "@/components/filters/invoice-filters";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, INVOICE_ID_COLOR, INVOICE_TYPE_LABEL, type Invoice, type InvoiceStatus, type InvoiceType } from "@/lib/mock-data";
import { formatINR, cn } from "@/lib/utils";

/* ─── Invoice Column Definitions ─────────────────────────────────────── */

type InvColumnId = "id" | "reference" | "customer" | "date" | "status" | "paid" | "tax" | "total" | "actions";

type InvColumnDef = {
  id: InvColumnId;
  label: string;
  align?: "left" | "right";
  locked?: boolean;
};

const INV_ALL_COLUMNS: InvColumnDef[] = [
  { id: "id", label: "ID" },
  { id: "reference", label: "Reference" },
  { id: "customer", label: "Customer" },
  { id: "date", label: "Created" },
  { id: "status", label: "Status" },
  { id: "paid", label: "Paid", align: "right" },
  { id: "tax", label: "Tax", align: "right" },
  { id: "total", label: "Total", align: "right" },
  { id: "actions", label: "Actions", align: "right", locked: true },
];

const INV_DEFAULT_ORDER: InvColumnId[] = INV_ALL_COLUMNS.map((c) => c.id);
const INV_DEFAULT_VISIBLE: InvColumnId[] = INV_ALL_COLUMNS.map((c) => c.id);
const INV_REQUIRED_IDS = new Set<InvColumnId>(["id", "status"]);

/* ─── Constants ──────────────────────────────────────────────────────── */

const STATUS_FILTERS: { label: string; value: InvoiceStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Partial", value: "partial" },
  { label: "Overdue", value: "overdue" },
  { label: "Cancelled", value: "cancelled" },
];

const DATE_RANGES = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 Days", value: "7days" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "lastmonth" },
  { label: "This Year", value: "year" },
  { label: "All", value: "all" },
] as const;

type DateRange = (typeof DATE_RANGES)[number]["value"];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function startOfDay(date: Date): Date { const d = new Date(date); d.setHours(0,0,0,0); return d; }

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
    case "month": { const ms = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); return created >= ms; }
    case "lastmonth": { const s = new Date(now.getFullYear(), now.getMonth()-1, 1).getTime(); const e = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); return created >= s && created < e; }
    case "year": { const ys = new Date(now.getFullYear(), 0, 1).getTime(); return created >= ys; }
    default: return true;
  }
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function InvoicePage() {
  const router = useRouter();
  const { invoices, deleteInvoice, addInvoice, updateInvoice } = useStore();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [q, setQ] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

  // Column settings
  const [invColumnOrder, setInvColumnOrder] = useState<InvColumnId[]>(INV_DEFAULT_ORDER);
  const [invVisibleCols, setInvVisibleCols] = useState<Set<InvColumnId>>(new Set(INV_DEFAULT_VISIBLE));
  const [showColSettings, setShowColSettings] = useState(false);

  // Selection + bulk status
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const activeInvCols = useMemo(
    () => invColumnOrder.filter((id) => invVisibleCols.has(id)).map((id) => INV_ALL_COLUMNS.find((c) => c.id === id)!),
    [invColumnOrder, invVisibleCols]
  );

  const list = useMemo(() =>
    invoices.filter((inv) => {
      const okStatus = statusFilter === "all" || inv.status === statusFilter;
      const okType = typeFilter === "all" || inv.invoiceType === typeFilter;
      const okDate = isInDateRange(inv.createdAt, dateRange);
      const okQ = !q || `${inv.id} ${inv.reference} ${inv.customer} ${inv.company || ""} ${inv.phone}`.toLowerCase().includes(q.toLowerCase());
      return okStatus && okType && okDate && okQ;
    }), [invoices, statusFilter, typeFilter, dateRange, q]);

  /* KPIs */
  const kpis = useMemo(() => {
    const totalRevenue = invoices.reduce((s, i) => s + i.total, 0);
    const paidAmount = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const pending = invoices.filter((i) => i.status === "sent" || i.status === "partial").reduce((s, i) => s + (i.total - i.paidAmount), 0);
    const overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + (i.total - i.paidAmount), 0);
    const overdueCount = invoices.filter((i) => i.status === "overdue").length;
    const draftCount = invoices.filter((i) => i.status === "draft").length;
    const taxCollected = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.tax, 0);
    const totalInvoices = invoices.length;
    return { totalRevenue, paidAmount, pending, overdue, overdueCount, draftCount, taxCollected, totalInvoices };
  }, [invoices]);

  /* Status distribution for chart */
  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    invoices.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });
    return Object.entries(counts).map(([status, count]) => ({ status: status as InvoiceStatus, count }));
  }, [invoices]);

  const handleDuplicate = useCallback((inv: Invoice) => {
    addInvoice({ ...inv, id: `INV-${Math.floor(1000 + Math.random() * 9000)}`, reference: `CORP-${Math.floor(1000 + Math.random() * 9000)}`, status: "draft", createdAt: new Date().toISOString(), paidAmount: 0 });
  }, [addInvoice]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader eyebrow="Billing" title="Invoices" subtitle="Issue, track and reconcile invoices — GST-ready."
        actions={<>
          <Can permission="export_reports"><Button variant="outline" size="md" className="rounded-full"><Download className="h-4 w-4" /> Export</Button></Can>
          <Can permission="manage_invoices"><Link href="/invoice/settings"><Button variant="outline" size="md" className="rounded-full"><Settings2 className="h-4 w-4" /> Settings</Button></Link></Can>
          <Can permission="manage_invoices"><Link href="/invoice/create"><Button size="md" className="rounded-full"><Plus className="h-4 w-4" /> Create Invoice</Button></Link></Can>
        </>}
      />

      {/* KPI Cards — Draggable */}
      <DraggableKpiGrid kpis={kpis} />

      {/* Analytics — Status Distribution + Payment Overview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Invoice Status Distribution */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-muted-foreground" />
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Status</p>
          </div>
          <div className="space-y-2.5">
            {statusDistribution.map(({ status, count }) => (
              <div key={status} className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset w-20 justify-center ${INVOICE_STATUS_TONE[status]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />{INVOICE_STATUS_LABEL[status]}
                </span>
                <div className="flex-1 h-5 rounded-full bg-muted/60 overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(count / Math.max(kpis.totalInvoices, 1)) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className={cn("h-full rounded-full", status === "paid" ? "bg-emerald-400" : status === "overdue" ? "bg-rose-400" : status === "sent" ? "bg-sky-400" : status === "partial" ? "bg-amber-400" : status === "draft" ? "bg-zinc-300" : "bg-zinc-200")}
                  />
                </div>
                <span className="w-6 text-right text-xs font-semibold tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Overview */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Overview</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Collected</p>
              <p className="mt-1 font-display text-xl font-bold text-emerald-800 tabular-nums">{formatINR(kpis.paidAmount)}</p>
              <p className="mt-1 text-[11px] text-emerald-600">{kpis.totalRevenue > 0 ? Math.round((kpis.paidAmount / kpis.totalRevenue) * 100) : 0}% of total</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <p className="text-[11px] font-medium text-rose-700 uppercase tracking-wider">Outstanding</p>
              <p className="mt-1 font-display text-xl font-bold text-rose-800 tabular-nums">{formatINR(kpis.pending + kpis.overdue)}</p>
              <p className="mt-1 text-[11px] text-rose-600">{kpis.overdueCount} overdue</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="text-[11px] font-medium text-amber-700 uppercase tracking-wider">Tax (GST)</p>
              <p className="mt-1 font-display text-xl font-bold text-amber-800 tabular-nums">{formatINR(kpis.taxCollected)}</p>
              <p className="mt-1 text-[11px] text-amber-600">on paid invoices</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <p className="text-[11px] font-medium text-indigo-700 uppercase tracking-wider">Avg Invoice</p>
              <p className="mt-1 font-display text-xl font-bold text-indigo-800 tabular-nums">{formatINR(kpis.totalInvoices > 0 ? Math.round(kpis.totalRevenue / kpis.totalInvoices) : 0)}</p>
              <p className="mt-1 text-[11px] text-indigo-600">{kpis.totalInvoices} total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise Filter System */}
      <InvoiceFilters
        onSearch={(filterState) => {
          setStatusFilter(filterState.invoiceStatus);
          setQ(filterState.customerName || filterState.invoiceId || "");
        }}
        onReset={() => { setStatusFilter("all"); setTypeFilter("all"); setDateRange("all"); setQ(""); }}
        extraActions={<>
          <Button variant="outline" size="sm" onClick={() => setShowColSettings(!showColSettings)}>
            <Settings2 className="h-3.5 w-3.5" /> Columns
          </Button>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none">
            <option value="all">All Types</option>
            <option value="retail">Retail Invoice</option>
            <option value="business">Business Invoice</option>
          </select>
        </>}
      />

      {/* Column Settings Panel */}
      <AnimatePresence>
        {showColSettings && (
          <InvColumnSettingsPanel
            columnOrder={invColumnOrder}
            visibleColumns={invVisibleCols}
            onApply={(order, visible) => { setInvColumnOrder(order); setInvVisibleCols(visible); setShowColSettings(false); }}
            onCancel={() => setShowColSettings(false)}
            onReset={() => { setInvColumnOrder(INV_DEFAULT_ORDER); setInvVisibleCols(new Set(INV_DEFAULT_VISIBLE)); }}
          />
        )}
      </AnimatePresence>

      {/* Bulk Status Change */}
      {selected.size > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <span className="text-xs font-medium text-indigo-700">{selected.size} selected —</span>
          <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkStatus(!showBulkStatus)}>
            <RefreshCw className="h-3 w-3" /> Change Status
          </Button>
          <Button variant="destructive" size="sm" className="rounded-full text-xs" onClick={() => setShowBulkDelete(true)}>
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
          {showBulkStatus && (
            <>
              {(["draft","sent","paid","partial","overdue","cancelled"] as InvoiceStatus[]).map((s) => (
                <button key={s} onClick={() => { selected.forEach((id) => updateInvoice(id, { status: s })); setSelected(new Set()); setShowBulkStatus(false); }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 ring-inset transition hover:scale-105 ${INVOICE_STATUS_TONE[s]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />{INVOICE_STATUS_LABEL[s]}
                </button>
              ))}
            </>
          )}
          <button onClick={() => { setSelected(new Set()); setShowBulkStatus(false); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </motion.div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-3 py-3">
                  <input type="checkbox"
                    checked={list.length > 0 && list.every((inv) => selected.has(inv.id))}
                    ref={(el) => { if (el) el.indeterminate = list.some((inv) => selected.has(inv.id)) && !list.every((inv) => selected.has(inv.id)); }}
                    onChange={() => { if (list.every((inv) => selected.has(inv.id))) setSelected(new Set()); else setSelected(new Set(list.map((inv) => inv.id))); }}
                    className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
                  />
                </th>
                {activeInvCols.map((col) => (
                  <th key={col.id} className={cn("py-3 px-3", col.id === "id" && "pl-5", col.id === "actions" && "pr-5", col.align === "right" && "text-right")}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((inv, i) => (
                <motion.tr key={inv.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i }}
                  onClick={() => router.push(`/invoice/${inv.id}`)}
                  className={cn("group cursor-pointer border-t border-border transition", selected.has(inv.id) ? "bg-indigo-50/40" : "hover:bg-[#EEF1FD]/50")}
                >
                  <td className="w-10 px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(inv.id)}
                      onChange={() => setSelected((prev) => { const n = new Set(prev); n.has(inv.id) ? n.delete(inv.id) : n.add(inv.id); return n; })}
                      className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer"
                    />
                  </td>
                  {activeInvCols.map((col) => (
                    <td key={col.id} className={cn("py-3.5 px-3", col.id === "id" && "pl-5", col.id === "actions" && "pr-5", col.align === "right" && "text-right")} onClick={col.id === "actions" ? (e) => e.stopPropagation() : undefined}>
                      {renderInvCell(col.id, inv, () => router.push(`/invoice/${inv.id}`), () => router.push(`/invoice/${inv.id}`), () => handleDuplicate(inv), () => setDeleteTarget(inv), () => router.push(`/print/invoice/${inv.id}?format=a4`))}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">🧾</div>
            <p className="font-semibold">No invoices found</p>
            <p className="text-sm text-muted-foreground">Try adjusting filters or create a new invoice.</p>
          </div>
        )}
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">Showing {list.length} of {invoices.length}</p>
        </div>
      </div>

      {/* Delete Confirm */}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) deleteInvoice(deleteTarget.id); }}
        title="Delete Invoice?" description="This action cannot be undone. The invoice will be permanently removed." confirmLabel="Delete Invoice" danger />

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        open={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => { selected.forEach((id) => deleteInvoice(id)); setSelected(new Set()); setShowBulkDelete(false); }}
        title={`Delete ${selected.size} invoice${selected.size > 1 ? "s" : ""}?`}
        description="This action cannot be undone. All selected invoices will be permanently removed."
        confirmLabel={`Delete ${selected.size} Invoice${selected.size > 1 ? "s" : ""}`}
        danger
      />
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, subtext, tone }: { icon: any; label: string; value: string; subtext?: string; tone: string }) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    indigo: "bg-indigo-50 text-[#4361EE] ring-indigo-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    zinc: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-200",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${toneMap[tone] || toneMap.indigo}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display text-lg font-bold tracking-tight leading-tight mt-0.5">{value}</p>
          {subtext && <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Invoice View Drawer (Polished) ─────────────────────────────────── */


/* ─── Invoice Cell Renderer ──────────────────────────────────────────── */

function renderInvCell(
  colId: InvColumnId,
  inv: Invoice,
  onView: () => void,
  onEdit: () => void,
  onDuplicate: () => void,
  onDelete: () => void,
  onPrint: () => void,
) {
  switch (colId) {
    case "id": return (
      <span className={cn("font-semibold whitespace-nowrap cursor-default", INVOICE_ID_COLOR[inv.status] || "text-foreground")} title={`Status: ${INVOICE_STATUS_LABEL[inv.status] || inv.status}`}>
        {inv.id}
      </span>
    );
    case "reference": return <span className="text-muted-foreground whitespace-nowrap text-[12px]">{inv.reference}</span>;
    case "customer": return (
      <div className="flex items-center gap-2.5">
        <Avatar name={inv.customer} size={28} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate leading-tight">{inv.customer}</p>
          {inv.company && <p className="text-[11px] text-muted-foreground truncate">{inv.company}</p>}
        </div>
      </div>
    );
    case "date": return <span className="text-[12px] text-muted-foreground whitespace-nowrap">{fmtDate(inv.createdAt)}</span>;
    case "status": return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${INVOICE_STATUS_TONE[inv.status]}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />{INVOICE_STATUS_LABEL[inv.status]}
      </span>
    );
    case "paid": return <span className="tabular-nums text-[12px] font-medium">{formatINR(inv.paidAmount)}</span>;
    case "tax": return <span className="tabular-nums text-[12px] text-muted-foreground">{formatINR(inv.tax)}</span>;
    case "total": return <span className="font-semibold tabular-nums">{formatINR(inv.total)}</span>;
    case "actions": return (
      <div className="flex items-center justify-end gap-1">
        <button onClick={onView} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]" title="View"><Eye className="h-3.5 w-3.5" /></button>
        <button onClick={onEdit} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
        <Dropdown align="right" width="w-44" trigger={({ toggle }) => (
          <button onClick={toggle} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]" title="More"><MoreHorizontal className="h-4 w-4" /></button>
        )}>
          {(close) => (<>
            <MenuItem icon={Eye} onClick={() => { onView(); close(); }}>View</MenuItem>
            <MenuItem icon={Pencil} onClick={() => { onEdit(); close(); }}>Edit</MenuItem>
            <MenuItem icon={Copy} onClick={() => { onDuplicate(); close(); }}>Duplicate</MenuItem>
            <MenuItem icon={Printer} onClick={() => { onPrint(); close(); }}>Print</MenuItem>
            <MenuItem icon={FileDown} onClick={close}>Download PDF</MenuItem>
            <MenuItem icon={Mail} onClick={close}>Email Invoice</MenuItem>
            <div className="my-1 border-t border-border" />
            <MenuItem icon={Trash2} danger onClick={() => { onDelete(); close(); }}>Delete</MenuItem>
          </>)}
        </Dropdown>
      </div>
    );
    default: return null;
  }
}

/* ─── Invoice Column Settings Panel ──────────────────────────────────── */

function InvColumnSettingsPanel({
  columnOrder, visibleColumns, onApply, onCancel, onReset,
}: {
  columnOrder: InvColumnId[];
  visibleColumns: Set<InvColumnId>;
  onApply: (order: InvColumnId[], visible: Set<InvColumnId>) => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const [localOrder, setLocalOrder] = useState<InvColumnId[]>(columnOrder);
  const [localVisible, setLocalVisible] = useState<Set<InvColumnId>>(new Set(visibleColumns));
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<InvColumnId | null>(null);

  const editableCols = INV_ALL_COLUMNS.filter((c) => !c.locked);
  const visibleList = localOrder.filter((id) => localVisible.has(id) && !INV_ALL_COLUMNS.find((c) => c.id === id)?.locked);
  const hiddenList = editableCols.filter((c) => !localVisible.has(c.id));

  const filteredVisible = search ? visibleList.filter((id) => INV_ALL_COLUMNS.find((c) => c.id === id)?.label.toLowerCase().includes(search.toLowerCase())) : visibleList;
  const filteredHidden = search ? hiddenList.filter((c) => c.label.toLowerCase().includes(search.toLowerCase())) : hiddenList;

  const toggleVis = (id: InvColumnId) => { if (INV_REQUIRED_IDS.has(id)) return; setLocalVisible((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const handleDragStart = (id: InvColumnId) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, targetId: InvColumnId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setLocalOrder((prev) => { const f = prev.indexOf(dragId); const t = prev.indexOf(targetId); if (f < 0 || t < 0) return prev; const n = [...prev]; n.splice(f, 1); n.splice(t, 0, dragId); return n; });
  };
  const handleDragEnd = () => setDragId(null);

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
      className="rounded-2xl border border-border bg-card shadow-card overflow-hidden"
    >
      <div className="px-5 pt-5 pb-3">
        <h3 className="font-display text-sm font-bold tracking-tight">Column Settings</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Customize which columns are visible in the invoice table.</p>
        <div className="mt-3 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search columns…"
            className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none transition" />
        </div>
      </div>
      <div className="px-5 pb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Visible <span className="text-foreground ml-1">{filteredVisible.length}</span></p>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {filteredVisible.map((id) => {
              const col = INV_ALL_COLUMNS.find((c) => c.id === id)!;
              const req = INV_REQUIRED_IDS.has(id);
              return (
                <div key={id} draggable={!req} onDragStart={() => handleDragStart(id)} onDragOver={(e) => handleDragOver(e, id)} onDragEnd={handleDragEnd}
                  className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all group", dragId === id ? "bg-indigo-50 ring-1 ring-indigo-200 shadow-sm scale-[1.02]" : "hover:bg-[#EEF1FD]/60")}>
                  <input type="checkbox" checked disabled={req} onChange={() => toggleVis(id)} className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" />
                  <span className="flex-1 text-xs font-medium text-foreground">{col.label}</span>
                  {req && <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200">Required</span>}
                  {!req && <span className="cursor-grab active:cursor-grabbing text-muted-foreground/50 group-hover:text-muted-foreground transition"><GripVertical className="h-3.5 w-3.5" /></span>}
                </div>
              );
            })}
            {filteredVisible.length === 0 && <p className="py-3 text-center text-[11px] text-muted-foreground">No matching columns</p>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Hidden <span className="text-foreground ml-1">{filteredHidden.length}</span></p>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {filteredHidden.map((col) => (
              <div key={col.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-[#EEF1FD]/60 transition">
                <input type="checkbox" checked={false} onChange={() => toggleVis(col.id)} className="h-3.5 w-3.5 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30 cursor-pointer" />
                <span className="flex-1 text-xs font-medium text-muted-foreground">{col.label}</span>
              </div>
            ))}
            {filteredHidden.length === 0 && <p className="py-3 text-center text-[11px] text-muted-foreground">{search ? "No matching" : "All columns visible"}</p>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <button onClick={() => { setLocalOrder(INV_DEFAULT_ORDER); setLocalVisible(new Set(INV_DEFAULT_VISIBLE)); onReset(); }} className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition">Reset Default</button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onApply(localOrder, localVisible)}>Apply</Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Draggable KPI Grid ─────────────────────────────────────────────── */

const KPI_STORAGE_KEY = "repairox-invoice-kpi-order";

type KpiDef = { id: string; icon: any; label: string; value: string; subtext?: string; tone: string };

function DraggableKpiGrid({ kpis }: { kpis: any }) {
  const allCards: KpiDef[] = [
    { id: "revenue", icon: DollarSign, label: "Total Revenue", value: formatINR(kpis.totalRevenue), tone: "indigo" },
    { id: "invoices", icon: Receipt, label: "Total Invoices", value: String(kpis.totalInvoices), tone: "violet" },
    { id: "paid", icon: CreditCard, label: "Paid Amount", value: formatINR(kpis.paidAmount), tone: "emerald" },
    { id: "pending", icon: Clock, label: "Pending", value: formatINR(kpis.pending), tone: "amber" },
    { id: "overdue", icon: AlertCircle, label: "Overdue", value: formatINR(kpis.overdue), subtext: `${kpis.overdueCount} invoice${kpis.overdueCount !== 1 ? "s" : ""}`, tone: "rose" },
    { id: "drafts", icon: FileText, label: "Drafts", value: String(kpis.draftCount), tone: "zinc" },
    { id: "tax", icon: TrendingUp, label: "Tax Collected", value: formatINR(kpis.taxCollected), tone: "teal" },
    { id: "rate", icon: BarChart3, label: "Collection Rate", value: kpis.totalRevenue > 0 ? `${Math.round((kpis.paidAmount / kpis.totalRevenue) * 100)}%` : "0%", tone: "indigo" },
  ];

  const defaultOrder = allCards.map((c) => c.id);
  const [order, setOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return defaultOrder;
    try { const s = localStorage.getItem(KPI_STORAGE_KEY); return s ? JSON.parse(s) : defaultOrder; } catch { return defaultOrder; }
  });
  const [dragId, setDragId] = useState<string | null>(null);

  const sorted = order.map((id) => allCards.find((c) => c.id === id)).filter(Boolean) as KpiDef[];

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const n = [...prev]; n.splice(from, 1); n.splice(to, 0, dragId); return n;
    });
  };

  const handleDragEnd = () => {
    setDragId(null);
    try { localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(order)); } catch {}
  };

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {sorted.map((card) => (
        <div
          key={card.id}
          draggable
          onDragStart={() => setDragId(card.id)}
          onDragOver={(e) => handleDragOver(e, card.id)}
          onDragEnd={handleDragEnd}
          className={cn("transition-all", dragId === card.id && "opacity-50 scale-95")}
        >
          <KpiCard icon={card.icon} label={card.label} value={card.value} subtext={card.subtext} tone={card.tone} />
        </div>
      ))}
    </div>
  );
}
