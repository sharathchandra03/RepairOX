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
import { motion } from "framer-motion";
import {
  Plus, Download, Upload, Search, Eye, Pencil, MoreHorizontal, Trash2,
  Ticket as TicketIcon, Pin, PinOff, LayoutList, BarChart3, Filter, X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { EmptyStateCharacter } from "@/components/common/empty-state-character";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { PinnedFilterBar, type PinnableFilterDef } from "@/components/tickets/pinned-filter-bar";
import { usePinnedFilters } from "@/hooks/use-pinned-filters";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import {
  WALKIN_STATUS_LABEL, WALKIN_STATUS_TONE, WALKIN_TYPE_LABEL, WALKIN_TYPE_TONE,
  WALKIN_FINAL_STATUSES, type WalkIn, type Ticket, isWalkInWon,
} from "@/lib/mock-data";
import {
  useWalkInSources, useWalkInRequireSalesPerson, nextWalkInNumber, genWalkInId, walkInDisplayId,
  isWalkInInDateRange, WALKIN_DATE_RANGES, type WalkInDateRange,
} from "@/lib/walk-in-data";
import { cn } from "@/lib/utils";
import { WalkInFormDrawer } from "@/components/walk-in/walk-in-form-drawer";
import { WalkInImportModal } from "@/components/walk-in/walk-in-import-modal";
import { WalkInReport } from "@/components/walk-in/walk-in-report";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export default function WalkInPage() {
  const { walkIns, addWalkIn, updateWalkIn, deleteWalkIn, pinWalkIn, addTicket, tickets, team } = useStore();
  const { can } = usePermissions();
  const { sources } = useWalkInSources();
  const { requireSalesPerson } = useWalkInRequireSalesPerson();
  // Individual filter pinning (own storage key so it doesn't collide with Tickets).
  const { pinnedIds, unpin, togglePin, isPinned } = usePinnedFilters("repairox-walkin-pinned-filters");

  const [view, setView] = useState<"table" | "report">("table");

  // Filters
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [salesFilter, setSalesFilter] = useState<string>("all");
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
  const [convertTarget, setConvertTarget] = useState<WalkIn | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Reset to page 1 whenever a filter/search changes.
  useEffect(() => { setPage(1); }, [q, typeFilter, sourceFilter, statusFilter, salesFilter, dateRange, customFrom, customTo]);

  /* ── The single filtered dataset (table + report share this) ── */
  const filtered = useMemo(() => {
    const rows = walkIns.filter((w) => {
      if (!isWalkInInDateRange(w.date, dateRange, customFrom, customTo)) return false;
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
    // Newest first, pinned floated to the top.
    const ordered = [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const pinned = ordered.filter((w) => w.pinnedAt);
    const normal = ordered.filter((w) => !w.pinnedAt);
    return [...pinned, ...normal];
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

  const activeStaff = useMemo(() => team.filter((m) => m.status === "active"), [team]);

  /* Resolve a linked ticket's human-readable number (T-###) from its stable
     internal id. Falls back to the id only if the ticket can't be found. */
  const ticketNoFor = useCallback((ticketId?: string) => {
    if (!ticketId) return undefined;
    const t = tickets.find((x) => x.id === ticketId);
    return t?.ticketNo || t?.id || ticketId;
  }, [tickets]);

  /* Definitions for the pinnable filters — shared by the pinned-filter bar and
     the advanced filter panel so a filter behaves identically in both places. */
  const pinnableFilters: PinnableFilterDef[] = useMemo(() => [
    {
      id: "type", label: "Type", type: "select", value: typeFilter,
      options: [{ label: "All Types", value: "all" }, { label: "Direct", value: "direct" }, { label: "Sales", value: "sales" }],
      onChange: setTypeFilter,
    },
    {
      id: "source", label: "Source", type: "select", value: sourceFilter,
      options: [{ label: "All Sources", value: "all" }, ...sources.map((s) => ({ label: s, value: s }))],
      onChange: setSourceFilter,
    },
    {
      id: "status", label: "Final Status", type: "select", value: statusFilter,
      options: [{ label: "All Statuses", value: "all" }, ...WALKIN_FINAL_STATUSES.map((s) => ({ label: WALKIN_STATUS_LABEL[s], value: s }))],
      onChange: setStatusFilter,
    },
    {
      id: "salesPerson", label: "Sales Person", type: "select", value: salesFilter,
      options: [{ label: "All Sales People", value: "all" }, ...activeStaff.map((m) => ({ label: m.name, value: m.id }))],
      onChange: setSalesFilter,
    },
    {
      id: "dateRange", label: "Date Range", type: "select", value: dateRange,
      options: WALKIN_DATE_RANGES.map((d) => ({ label: d.label, value: d.value })),
      onChange: (v: string) => setDateRange(v as WalkInDateRange),
    },
  ], [typeFilter, sourceFilter, statusFilter, salesFilter, dateRange, sources, activeStaff]);

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
        reasons: [],
        status: data.status || "visitor",
        salesPersonId: data.salesPersonId,
        salesPersonName: data.salesPersonName,
        customerId: data.customerId,
        invoiceValue: 0,
        businessValue: 0,
      };
      await addWalkIn(record);
      showToast(`Walk-In ${record.walkInNumber} created.`);
    }
    setShowCreate(false);
    setEditTarget(null);
  }, [walkIns, addWalkIn, updateWalkIn, showToast]);

  /* ── Convert Walk-In → Ticket (real, linked) ── */
  const handleConvert = useCallback(async (w: WalkIn) => {
    if (w.linkedTicketId) { showToast(`Already linked to ticket ${ticketNoFor(w.linkedTicketId)}.`); return; }
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: "", // store assigns the real id + T-### number
      customer: w.customer,
      phone: w.phone,
      device: w.model || "Device",
      model: w.model || "",
      issue: w.issue || (w.reasons || []).join(", ") || "Walk-in enquiry",
      status: "in_progress",
      priority: "normal",
      technician: w.salesPersonName || "",
      createdAt: now,
      amount: 0,
      source: w.source,
      customerId: w.customerId,
      internalNotes: `Converted from Walk-In ${walkInDisplayId(w)}.`,
    };
    const newId = await addTicket(ticket);
    await updateWalkIn(w.id, { status: "converted_ticket", linkedTicketId: newId, ticketId: newId });
    // addTicket returns the internal id; resolve the human ticket number for the toast.
    showToast(`Converted ${walkInDisplayId(w)} → ticket ${ticketNoFor(newId)}.`);
  }, [addTicket, updateWalkIn, showToast, ticketNoFor]);

  const anyFilterActive = typeFilter !== "all" || sourceFilter !== "all" || statusFilter !== "all" || salesFilter !== "all";
  const canDelete = can("delete") || can("full_access") || can("manage_repair_jobs");

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
          onChange={(v) => setView(v as "table" | "report")}
          options={[
            { label: "Walk-Ins", value: "table" },
            { label: "Report", value: "report" },
          ]}
          size="sm"
        />
        {view === "table" && (
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters || anyFilterActive ? "soft" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setShowFilters((s) => !s)}
            >
              <Filter className="h-3.5 w-3.5" /> Filters{anyFilterActive ? " ·" : ""}
            </Button>
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
          className="rounded-2xl border border-border bg-card p-4 shadow-card"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advanced Filters</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setTypeFilter("all"); setSourceFilter("all"); setStatusFilter("all"); setSalesFilter("all"); setDateRange("today"); setCustomFrom(""); setCustomTo(""); }}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  disabled={f.id === "salesPerson" && typeFilter === "direct"}
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

      {/* ── REPORT VIEW ── */}
      {view === "report" ? (
        <WalkInReport rows={filtered} />
      ) : (
        /* ── TABLE VIEW ──
           Straight (square) card with a flat bordered header — identical edge
           treatment to the Tickets/Invoice tables. No overflow-hidden on the
           card and [overflow-x:clip] (not auto) on the inner wrapper so the
           sticky thead isn't trapped and the freeze keeps working. */
        <div className="-mt-5 border-2 border-zinc-200 bg-card shadow-card">
          <div className="[overflow-x:clip]">
            <table className="w-full text-[14px]">
              <thead style={{ top: theadTop }} className="sticky z-[5] bg-[#D6DDFB] border-b-2 border-[#4361EE]/25">
                <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
                  <th className="w-10 pl-5 pr-2 py-4">
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
                  <th className="py-4 whitespace-nowrap">ID</th>
                  <th className="py-4">Type</th>
                  <th className="py-4">Source</th>
                  <th className="py-4">Name</th>
                  <th className="py-4">Contact</th>
                  <th className="py-4">Model</th>
                  <th className="py-4">Issue</th>
                  <th className="py-4">Final Status</th>
                  <th className="px-5 py-4 text-right">Action</th>
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
                    <td className="w-10 pl-5 pr-2 py-4" onClick={(e) => e.stopPropagation()}>
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
                    <td className="py-4 pr-4 text-[14px] font-semibold text-foreground whitespace-nowrap">{walkInDisplayId(w)}</td>
                    <td className="py-4 pr-4">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", WALKIN_TYPE_TONE[w.type ?? "direct"])}>
                        {WALKIN_TYPE_LABEL[w.type ?? "direct"]}
                      </span>
                      {w.type === "sales" && w.salesPersonName && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground truncate max-w-[120px]">{w.salesPersonName}</p>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-[13px]">{w.source || "—"}</td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={w.customer} size={32} />
                        <span className="text-[14px] font-medium truncate max-w-[150px]">{w.customer}</span>
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-[13px] whitespace-nowrap tabular-nums">{w.phone || "—"}</td>
                    <td className="py-4 pr-4 text-[13px] truncate max-w-[150px]">{w.model || "—"}</td>
                    <td className="py-4 pr-4 text-[13px] text-muted-foreground truncate max-w-[190px]" title={w.issue || (w.reasons || []).join(", ")}>
                      {w.issue || (w.reasons || []).join(", ") || "—"}
                    </td>
                    <td className="py-4 pr-4">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap", WALKIN_STATUS_TONE[w.status])}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {WALKIN_STATUS_LABEL[w.status]}
                      </span>
                      {w.linkedTicketId && (
                        <p className="mt-0.5 text-[11px] text-emerald-600">→ {ticketNoFor(w.linkedTicketId)}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
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
                                <MenuItem icon={TicketIcon} onClick={() => { setConvertTarget(w); close(); }}>Convert to Ticket</MenuItem>
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
      <WalkInViewDrawer walkIn={viewTarget} ticketNoFor={ticketNoFor} onClose={() => setViewTarget(null)} onEdit={(w) => { setViewTarget(null); setEditTarget(w); }} onConvert={(w) => { setViewTarget(null); setConvertTarget(w); }} />

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

      {/* Convert to Ticket confirm */}
      <ConfirmDialog
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        onConfirm={() => { if (convertTarget) handleConvert(convertTarget); }}
        title="Convert to Ticket?"
        description={
          convertTarget
            ? `A new repair ticket will be created for ${convertTarget.customer}${convertTarget.model ? ` (${convertTarget.model})` : ""} and linked to walk-in ${walkInDisplayId(convertTarget)}. Its final status becomes “Converted Ticket”.`
            : ""
        }
        confirmLabel="Convert to Ticket"
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

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]"
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
        <div className="flex items-center gap-3">
          <Avatar name={w.customer} size={40} />
          <div>
            <p className="font-semibold">{w.customer}</p>
            <p className="text-xs text-muted-foreground">{w.phone}</p>
          </div>
          <span className={cn("ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", WALKIN_TYPE_TONE[w.type ?? "direct"])}>
            {WALKIN_TYPE_LABEL[w.type ?? "direct"]}
          </span>
        </div>
        <div className="divide-y divide-border rounded-xl border border-border">
          {w.email && <DetailRow label="Email">{w.email}</DetailRow>}
          <DetailRow label="Source">{w.source || "—"}</DetailRow>
          <DetailRow label="Model">{w.model || "—"}</DetailRow>
          <DetailRow label="Issue">{w.issue || (w.reasons || []).join(", ") || "—"}</DetailRow>
          {w.type === "sales" && <DetailRow label="Sales Person">{w.salesPersonName || "—"}</DetailRow>}
          <DetailRow label="Final Status">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", WALKIN_STATUS_TONE[w.status])}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {WALKIN_STATUS_LABEL[w.status]}
            </span>
          </DetailRow>
          {w.linkedTicketId && <DetailRow label="Linked Ticket">{ticketNoFor(w.linkedTicketId)}</DetailRow>}
          <DetailRow label="Won">{isWalkInWon(w) ? "Yes" : "No"}</DetailRow>
        </div>
        {w.notes && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
            <p className="text-sm text-muted-foreground">{w.notes}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/* ─── CSV export (spreadsheet column structure) ──────────────────────── */
function exportWalkIns(rows: WalkIn[], ticketNoFor: (id?: string) => string | undefined) {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["DATE", "ID", "TYPE", "SOURCE", "NAME", "CONTACT", "MODEL", "ISSUE", "FINAL STATUS", "ACTION"];
  const lines = rows.map((w) => [
    w.date,
    walkInDisplayId(w),
    WALKIN_TYPE_LABEL[w.type ?? "direct"],
    w.source,
    w.customer,
    w.phone,
    w.model,
    w.issue || (w.reasons || []).join("; "),
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
