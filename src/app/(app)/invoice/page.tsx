"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useSpring, useTransform, useMotionValue } from "framer-motion";
import {
  Plus, Download, Search, Eye, Pencil, MoreHorizontal,
  Trash2, Copy, Printer, Mail, FileDown, TrendingUp, Receipt,
  IndianRupee, AlertCircle, Clock, FileText, CreditCard, BarChart3,
  PieChart, Settings2, GripVertical, RefreshCw, ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStore } from "@/lib/store";
import { InvoiceFilters, type FilterState } from "@/components/filters/invoice-filters";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, INVOICE_ID_COLOR, INVOICE_TYPE_LABEL, type Invoice, type InvoiceStatus, type InvoiceType } from "@/lib/mock-data";
import { formatINR, cn } from "@/lib/utils";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import { BulkDownloadDialog } from "@/components/download/bulk-download-dialog";

/* ─── Invoice Column Definitions ─────────────────────────────────────── */

type InvColumnId = "id" | "reference" | "customer" | "date" | "status" | "category" | "paid" | "tax" | "total" | "actions";

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
  { id: "category", label: "Category" },
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
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 Days", value: "7days" },
  { label: "14 Days", value: "14days" },
  { label: "30 Days", value: "30days" },
] as const;

type DateRange = (typeof DATE_RANGES)[number]["value"] | "custom";

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function startOfDay(date: Date): Date { const d = new Date(date); d.setHours(0,0,0,0); return d; }

function isInDateRange(createdAt: string, range: DateRange, customFrom?: string, customTo?: string): boolean {
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
    case "custom": {
      if (!customFrom && !customTo) return true;
      const from = customFrom ? startOfDay(new Date(customFrom)).getTime() : -Infinity;
      const to = customTo ? startOfDay(new Date(customTo)).getTime() + 86_400_000 - 1 : Infinity;
      return created >= from && created <= to;
    }
    default: return true;
  }
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function InvoicePage() {
  const router = useRouter();
  const { invoices, deleteInvoice, addInvoice, updateInvoice } = useStore();
  const {
    downloadInvoice,
    startBulkInvoiceDownload,
    executeBulkDownload,
    retryFailed,
    isDownloading,
    bulkDialog,
    bulkProgress,
    canDownload,
  } = usePdfDownload();

  const [dashboardExpanded, setDashboardExpanded] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
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
      const okCategory = categoryFilter === "all" || (inv.serviceCategory || "service") === categoryFilter;
      const okDate = isInDateRange(inv.createdAt, dateRange, customFrom, customTo);
      const okQ = !q || `${inv.id} ${inv.reference} ${inv.customer} ${inv.company || ""} ${inv.phone}`.toLowerCase().includes(q.toLowerCase());
      return okStatus && okType && okCategory && okDate && okQ;
    }), [invoices, statusFilter, typeFilter, categoryFilter, dateRange, customFrom, customTo, q]);

  /* KPIs */
  const kpis = useMemo(() => {
    const totalRevenue = list.reduce((s, i) => s + i.total, 0);
    const paidAmount = list.reduce((s, i) => s + i.paidAmount, 0);
    const pending = list.filter((i) => i.status === "sent" || i.status === "partial").reduce((s, i) => s + (i.total - i.paidAmount), 0);
    const overdue = list.filter((i) => i.status === "overdue").reduce((s, i) => s + (i.total - i.paidAmount), 0);
    const overdueCount = list.filter((i) => i.status === "overdue").length;
    const draftCount = list.filter((i) => i.status === "draft").length;
    const taxCollected = list.filter((i) => i.status === "paid").reduce((s, i) => s + i.tax, 0);
    const totalInvoices = list.length;
    return { totalRevenue, paidAmount, pending, overdue, overdueCount, draftCount, taxCollected, totalInvoices };
  }, [list]);

  /* Invoice status view — presentation only, derived from filtered invoice data */
  const invoiceStatusView = useMemo(() => {
    const countOf = (s: InvoiceStatus) => list.filter((i) => i.status === s).length;
    const total = list.length;
    const paidCount = countOf("paid");
    const rows = [
      { key: "overdue", label: "Overdue", count: countOf("overdue"), color: "rose" as const },
      { key: "paid", label: "Paid", count: paidCount, color: "emerald" as const },
      { key: "sent", label: "Sent", count: countOf("sent"), color: "sky" as const },
    ];
    return { rows, total, completed: paidCount, pending: total - paidCount, denom: total || 1 };
  }, [list]);

  const handleDuplicate = useCallback((inv: Invoice) => {
    addInvoice({ ...inv, id: `INV-${Math.floor(1000 + Math.random() * 9000)}`, reference: `CORP-${Math.floor(1000 + Math.random() * 9000)}`, status: "draft", createdAt: new Date().toISOString(), paidAmount: 0 });
  }, [addInvoice]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader eyebrow="Billing" title="Invoices" subtitle="Issue, track and reconcile invoices — GST-ready."
        actions={<>
          <Can permission="export_reports"><Button variant="outline" size="md" className="rounded-[10px]"><Download className="h-4 w-4" /> Export</Button></Can>
          <Can permission="manage_invoices"><Link href="/invoice/settings"><Button variant="outline" size="md" className="rounded-[10px]"><Settings2 className="h-4 w-4" /> Settings</Button></Link></Can>
          <Can permission="manage_invoices"><Link href="/invoice/create"><Button size="md" className="rounded-[10px]"><Plus className="h-4 w-4" /> Create Invoice</Button></Link></Can>
        </>}
      />

      {/* Dashboard — Collapsible Section */}
      <div>
        {/* Dashboard Header with Toggle */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Dashboard Overview</p>
          <button
            onClick={() => setDashboardExpanded((prev) => !prev)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground shadow-sm transition-all duration-200 hover:bg-[#EEF1FD] hover:text-[#4361EE] hover:border-[#4361EE]/30 active:scale-95"
            aria-label={dashboardExpanded ? "Collapse dashboard" : "Expand dashboard"}
          >
            <motion.span
              animate={{ rotate: dashboardExpanded ? 0 : 180 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="inline-flex"
            >
              <ChevronUp className="h-4 w-4" />
            </motion.span>
          </button>
        </div>

        {/* Collapsible Content — Framer Motion for buttery smooth animation */}
        <motion.div
          initial={false}
          animate={{
            height: dashboardExpanded ? "auto" : 0,
            opacity: dashboardExpanded ? 1 : 0,
          }}
          transition={{
            height: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
            opacity: { duration: dashboardExpanded ? 0.3 : 0.15, ease: "easeInOut" },
          }}
          className="overflow-hidden"
        >
          <div className="space-y-6 pb-1">
              {/* KPI Cards — Draggable */}
              <DraggableKpiGrid kpis={kpis} />

              {/* Analytics — Invoice Status + Payment Overview */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* Invoice Status */}
                <div className="rounded-[10px] border border-border/70 bg-card p-6 shadow-card">
                  <div className="mb-5 flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-muted/70 text-muted-foreground">
                      <PieChart className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Status</p>
                  </div>

                  <div className="space-y-4">
                    {invoiceStatusView.rows.map((row) => {
                      const pct = (row.count / invoiceStatusView.denom) * 100;
                      const c = STATUS_BAR_TONES[row.color];
                      return (
                        <div key={row.key} className="flex items-center gap-4">
                          <div className="w-[68px] shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                              <span className="text-[13px] font-semibold text-foreground">{row.label}</span>
                            </div>
                            <p className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground">{row.count} invoice{row.count !== 1 ? "s" : ""}</p>
                          </div>
                          <div className="relative h-2.5 flex-1 overflow-hidden rounded-[4px] bg-muted/70 shadow-[inset_0_1px_2px_rgba(20,30,80,0.07)]">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                              className={cn("h-full rounded-[4px] shadow-[0_1px_3px_-1px_rgba(20,30,80,0.4)]", c.bar)}
                            />
                          </div>
                          <span className="w-12 text-right text-[13px] font-bold tabular-nums text-foreground">{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Statistics footer */}
                  <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-[10px] border border-border/60 bg-muted/30">
                    <StatFooterItem label="Total" value={invoiceStatusView.total} sub="Invoices" />
                    <StatFooterItem label="Completed" value={invoiceStatusView.completed} sub="Invoices" divider />
                    <StatFooterItem label="Pending" value={invoiceStatusView.pending} sub="Invoices" divider />
                  </div>
                </div>

                {/* Payment Overview */}
                <div className="rounded-[10px] border border-border/70 bg-card p-6 shadow-card">
                  <div className="mb-5 flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-muted/70 text-muted-foreground">
                      <BarChart3 className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Overview</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <PaymentCard tone="emerald" icon={CreditCard} label="Collected" value={formatINR(kpis.paidAmount)} numericValue={kpis.paidAmount}
                      sub={`${kpis.totalRevenue > 0 ? Math.round((kpis.paidAmount / kpis.totalRevenue) * 100) : 0}% of total`} />
                    <PaymentCard tone="rose" icon={AlertCircle} label="Outstanding" value={formatINR(kpis.pending + kpis.overdue)} numericValue={kpis.pending + kpis.overdue}
                      sub={`${kpis.overdueCount} overdue`} />
                    <PaymentCard tone="amber" icon={Receipt} label="Tax (GST)" value={formatINR(kpis.taxCollected)} numericValue={kpis.taxCollected}
                      sub="on paid invoices" />
                    <PaymentCard tone="brand" icon={FileText} label="Avg Invoice" value={formatINR(kpis.totalInvoices > 0 ? Math.round(kpis.totalRevenue / kpis.totalInvoices) : 0)} numericValue={kpis.totalInvoices > 0 ? Math.round(kpis.totalRevenue / kpis.totalInvoices) : 0}
                      sub={`${kpis.totalInvoices} total`} />
                  </div>
                </div>
              </div>
            </div>
        </motion.div>
      </div>

      {/* Filter System */}
      <InvoiceFilters
        onSearch={(filterState) => {
          setStatusFilter(filterState.invoiceStatus);
          setTypeFilter(filterState.invoiceType);
          setCategoryFilter(filterState.category);
          // Combine customer name and invoice ID into search query
          const searchParts = [filterState.customerName, filterState.pinnedIds?.[0] || ""].filter(Boolean);
          setQ(searchParts.join(" "));
          // filterState.invoiceId carries the quickDate value
          const qd = filterState.invoiceId as string;
          if (qd === "custom") {
            setDateRange("custom");
            setCustomFrom(filterState.dateFrom);
            setCustomTo(filterState.dateTo);
          } else if (qd && qd !== "") {
            setDateRange(qd as DateRange);
            setCustomFrom("");
            setCustomTo("");
          }
        }}
        onReset={() => { setStatusFilter("all"); setTypeFilter("all"); setCategoryFilter("all"); setDateRange("all"); setCustomFrom(""); setCustomTo(""); setQ(""); }}
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
          {canDownload && (
            <Button variant="soft" size="sm" className="rounded-full text-xs" onClick={() => startBulkInvoiceDownload(Array.from(selected))}>
              <Download className="h-3 w-3" /> Download Selected PDFs
            </Button>
          )}
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
            <thead className="sticky top-0 z-10 bg-[#D6DDFB] border-b-2 border-[#4361EE]/25">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
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
                      {renderInvCell(col.id, inv, () => router.push(`/invoice/${inv.id}`), () => router.push(`/invoice/${inv.id}`), () => handleDuplicate(inv), () => setDeleteTarget(inv), () => router.push(`/print/invoice/${inv.id}?format=a4`), () => downloadInvoice(inv))}
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
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────────── */

/* Premium tone maps — soft, slightly desaturated enterprise palette */
const KPI_TONES: Record<string, { icon: string; title: string }> = {
  indigo:  { icon: "from-brand-50 to-brand-100/70 ring-brand-200/70 text-brand-600",       title: "text-brand-600/90" },
  violet:  { icon: "from-violet-50 to-violet-100/70 ring-violet-200/70 text-violet-600",    title: "text-violet-600/90" },
  emerald: { icon: "from-emerald-50 to-emerald-100/70 ring-emerald-200/70 text-emerald-600", title: "text-emerald-700/90" },
  amber:   { icon: "from-amber-50 to-amber-100/70 ring-amber-200/70 text-amber-600",         title: "text-amber-700/90" },
  rose:    { icon: "from-rose-50 to-rose-100/70 ring-rose-200/70 text-rose-500",             title: "text-rose-500/90" },
  zinc:    { icon: "from-slate-50 to-slate-100 ring-slate-200 text-slate-500",               title: "text-slate-500" },
  teal:    { icon: "from-teal-50 to-teal-100/70 ring-teal-200/70 text-teal-600",             title: "text-teal-700/90" },
};

const STATUS_BAR_TONES: Record<string, { dot: string; bar: string }> = {
  rose:    { dot: "bg-rose-500",    bar: "bg-gradient-to-r from-rose-400 to-rose-500" },
  emerald: { dot: "bg-emerald-500", bar: "bg-gradient-to-r from-emerald-400 to-emerald-500" },
  sky:     { dot: "bg-sky-500",     bar: "bg-gradient-to-r from-sky-400 to-blue-500" },
};

const PAYMENT_TONES: Record<string, { card: string; label: string; value: string; sub: string; icon: string; spark: string }> = {
  emerald: { card: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-emerald-100/40", label: "text-emerald-700", value: "text-emerald-800", sub: "text-emerald-600/80", icon: "bg-white/70 text-emerald-600 ring-emerald-200", spark: "text-emerald-500" },
  rose:    { card: "border-rose-200/70 bg-gradient-to-br from-rose-50 to-rose-100/40",           label: "text-rose-700",    value: "text-rose-800",    sub: "text-rose-500/80",    icon: "bg-white/70 text-rose-500 ring-rose-200",       spark: "text-rose-500" },
  amber:   { card: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-amber-100/40",         label: "text-amber-700",   value: "text-amber-800",   sub: "text-amber-600/80",   icon: "bg-white/70 text-amber-600 ring-amber-200",     spark: "text-amber-500" },
  brand:   { card: "border-brand-200/70 bg-gradient-to-br from-brand-50 to-brand-100/40",         label: "text-brand-700",   value: "text-brand-700",   sub: "text-brand-600/80",   icon: "bg-white/70 text-brand-600 ring-brand-200",     spark: "text-brand-500" },
};

/* ─── Animated Number Component ──────────────────────────────────────── */

function AnimatedNumber({ value, formatFn }: { value: number; formatFn?: (n: number) => string }) {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { stiffness: 80, damping: 18, mass: 0.6 });
  const [display, setDisplay] = useState(() => (formatFn ? formatFn(value) : String(value)));
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      motionValue.set(value);
    }
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      setDisplay(formatFn ? formatFn(Math.round(latest)) : String(Math.round(latest)));
    });
    return unsubscribe;
  }, [springValue, formatFn]);

  return <span>{display}</span>;
}

function AnimatedPercentage({ value }: { value: number }) {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, { stiffness: 80, damping: 18, mass: 0.6 });
  const [display, setDisplay] = useState(`${value}%`);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      motionValue.set(value);
    }
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      setDisplay(`${Math.round(latest)}%`);
    });
    return unsubscribe;
  }, [springValue]);

  return <span>{display}</span>;
}

function KpiCard({ icon: Icon, label, value, numericValue, isCurrency, isPercent, subtext, tone }: { icon: any; label: string; value: string; numericValue?: number; isCurrency?: boolean; isPercent?: boolean; subtext?: string; tone: string }) {
  const t = KPI_TONES[tone] || KPI_TONES.indigo;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="group flex h-full min-h-[118px] flex-col justify-between rounded-[10px] border border-border/70 bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
    >
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-gradient-to-br ring-1 ring-inset transition-transform duration-200 group-hover:scale-105", t.icon)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <p className={cn("text-[10.5px] font-semibold uppercase tracking-wider", t.title)}>{label}</p>
      </div>
      <div className="mt-3">
        <p className="font-display text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground">
          {numericValue !== undefined ? (
            isPercent ? <AnimatedPercentage value={numericValue} /> : <AnimatedNumber value={numericValue} formatFn={isCurrency ? formatINR : undefined} />
          ) : value}
        </p>
        {subtext && <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">{subtext}</p>}
      </div>
    </motion.div>
  );
}

/* ─── Invoice Status footer stat ─────────────────────────────────────── */

function StatFooterItem({ label, value, sub, divider }: { label: string; value: number; sub: string; divider?: boolean }) {
  return (
    <div className={cn("px-4 py-3.5", divider && "border-l border-border/60")}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold leading-none tabular-nums text-foreground">
        <AnimatedNumber value={value} />
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

/* ─── Payment Overview card ──────────────────────────────────────────── */

function PaymentCard({ tone, icon: Icon, label, value, numericValue, sub }: { tone: string; icon: any; label: string; value: string; numericValue?: number; sub: string }) {
  const t = PAYMENT_TONES[tone] || PAYMENT_TONES.brand;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={cn("relative min-h-[108px] overflow-hidden rounded-[10px] border p-4 transition-shadow duration-200 hover:shadow-card", t.card)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-[11px] font-semibold uppercase tracking-wider", t.label)}>{label}</p>
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ring-1 ring-inset", t.icon)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className={cn("mt-2 font-display text-2xl font-bold leading-none tabular-nums", t.value)}>
        {numericValue !== undefined ? <AnimatedNumber value={numericValue} formatFn={formatINR} /> : value}
      </p>
      <p className={cn("mt-1 text-[11px] font-medium", t.sub)}>{sub}</p>
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-8", t.spark)}>
        <svg viewBox="0 0 120 32" preserveAspectRatio="none" className="h-full w-full">
          <path d="M0 26 C 15 12, 25 28, 40 20 C 55 12, 65 24, 80 15 C 95 7, 108 22, 120 13 L120 32 L0 32 Z" fill="currentColor" fillOpacity="0.12" />
          <path d="M0 26 C 15 12, 25 28, 40 20 C 55 12, 65 24, 80 15 C 95 7, 108 22, 120 13" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
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
  onDownloadPdf: () => void,
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
    case "category": return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${
        (inv.serviceCategory || "service") === "accessories"
          ? "bg-violet-50 text-violet-700 ring-violet-200"
          : "bg-sky-50 text-sky-700 ring-sky-200"
      }`}>
        {(inv.serviceCategory || "service") === "accessories" ? "Accessories" : "Service"}
      </span>
    );
    case "paid": return <span className="tabular-nums text-[12px] font-medium">{formatINR(inv.paidAmount)}</span>;
    case "tax": return <span className="tabular-nums text-[12px] text-muted-foreground">{formatINR(inv.tax)}</span>;
    case "total": return <span className="font-semibold tabular-nums">{formatINR(inv.total)}</span>;
    case "actions": return (
      <div className="flex items-center justify-end gap-1">
        <button onClick={onPrint} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]" title="Preview"><Eye className="h-3.5 w-3.5" /></button>
        <button onClick={onEdit} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
        <Dropdown align="right" width="w-44" trigger={({ toggle }) => (
          <button onClick={toggle} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]" title="More"><MoreHorizontal className="h-4 w-4" /></button>
        )}>
          {(close) => (<>
            <MenuItem icon={Eye} onClick={() => { onView(); close(); }}>View</MenuItem>
            <MenuItem icon={Pencil} onClick={() => { onEdit(); close(); }}>Edit</MenuItem>
            <MenuItem icon={Copy} onClick={() => { onDuplicate(); close(); }}>Duplicate</MenuItem>
            <MenuItem icon={Printer} onClick={() => { onPrint(); close(); }}>Print</MenuItem>
            <MenuItem icon={FileDown} onClick={() => { onDownloadPdf(); close(); }}>Download PDF</MenuItem>
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

type KpiDef = { id: string; icon: any; label: string; value: string; numericValue: number; isCurrency?: boolean; isPercent?: boolean; subtext?: string; tone: string };

function DraggableKpiGrid({ kpis }: { kpis: any }) {
  const rate = kpis.totalRevenue > 0 ? Math.round((kpis.paidAmount / kpis.totalRevenue) * 100) : 0;
  const allCards: KpiDef[] = [
    { id: "revenue", icon: IndianRupee, label: "Total Revenue", value: formatINR(kpis.totalRevenue), numericValue: kpis.totalRevenue, isCurrency: true, subtext: `Across ${kpis.totalInvoices} invoice${kpis.totalInvoices !== 1 ? "s" : ""}`, tone: "indigo" },
    { id: "invoices", icon: Receipt, label: "Total Invoices", value: String(kpis.totalInvoices), numericValue: kpis.totalInvoices, subtext: `${kpis.draftCount} in draft`, tone: "violet" },
    { id: "paid", icon: CreditCard, label: "Paid Amount", value: formatINR(kpis.paidAmount), numericValue: kpis.paidAmount, isCurrency: true, subtext: `${rate}% of revenue`, tone: "emerald" },
    { id: "pending", icon: Clock, label: "Pending", value: formatINR(kpis.pending), numericValue: kpis.pending, isCurrency: true, subtext: "Awaiting collection", tone: "amber" },
    { id: "overdue", icon: AlertCircle, label: "Overdue", value: formatINR(kpis.overdue), numericValue: kpis.overdue, isCurrency: true, subtext: `${kpis.overdueCount} invoice${kpis.overdueCount !== 1 ? "s" : ""} overdue`, tone: "rose" },
    { id: "drafts", icon: FileText, label: "Drafts", value: String(kpis.draftCount), numericValue: kpis.draftCount, subtext: kpis.draftCount === 0 ? "No draft invoices" : "Awaiting action", tone: "zinc" },
    { id: "tax", icon: TrendingUp, label: "Tax Collected", value: formatINR(kpis.taxCollected), numericValue: kpis.taxCollected, isCurrency: true, subtext: "On paid invoices", tone: "teal" },
    { id: "rate", icon: BarChart3, label: "Collection Rate", value: `${rate}%`, numericValue: rate, isPercent: true, subtext: `${formatINR(kpis.paidAmount)} collected`, tone: "indigo" },
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
    <div className="grid grid-cols-2 items-stretch gap-4 lg:grid-cols-4">
      {sorted.map((card) => (
        <div
          key={card.id}
          draggable
          onDragStart={() => setDragId(card.id)}
          onDragOver={(e) => handleDragOver(e, card.id)}
          onDragEnd={handleDragEnd}
          className={cn("h-full transition-all", dragId === card.id && "opacity-50 scale-95")}
        >
          <KpiCard icon={card.icon} label={card.label} value={card.value} numericValue={card.numericValue} isCurrency={card.isCurrency} isPercent={card.isPercent} subtext={card.subtext} tone={card.tone} />
        </div>
      ))}
    </div>
  );
}
