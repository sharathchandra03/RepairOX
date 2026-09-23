"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Management → Pickup & Drop (device pickup/drop logistics).

   Operational/logistics workspace that moves devices between the customer and
   the store. NOT a ticket system — it wraps the existing Ticket/Invoice flow.
   Data comes from the FieldProvider; a job is created when Sales routes a Lead
   to "Pickup & Drop". KPIs are operational (no revenue).

   Layout mirrors the Tickets/Invoices tables: a sticky frozen workspace
   (KPIs → status strip → filter toolbar → thead all pin below the topbar) with
   a table-fixed, horizontally-clipped table so the header freeze survives and
   no columns are lost at any zoom level.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Truck, Search, Filter, MapPin, Clock, AlertTriangle, CheckCircle2, Package,
  PackageCheck, Eye, RotateCcw, Plus, TrendingUp, ChevronDown, Check, LayoutList,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { Pagination } from "@/components/ui/pagination";
import { RoxFilterPanelHeader } from "@/components/ui/rox-filter";
import { SegmentedTabs } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useField, FIELD_OPEN_EVENT } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { FieldJobDrawer } from "@/components/field/field-job-drawer";
import { BRANCHES } from "@/lib/auth";
import { staffByRole } from "@/lib/field-linking";
import { isWalkInInDateRange } from "@/lib/walk-in-data";
import {
  jobMatchesQueue, isDelayed, isPickupLeg, isDropLeg, accentColor, initials,
  FIELD_STATUS_LABEL, FIELD_STATUS_TONE,
  FIELD_LEAD_TYPE_LABEL, FIELD_LEAD_TYPE_TONE, FIELD_LEAD_TYPES,
  FIELD_SOURCE_LABEL, FIELD_SOURCE_TONE, classifySource, normaliseLeadType,
  allowedFieldTransitions,
  FIELD_DATE_RANGES,
  type FieldQueue, type FieldJob, type FieldJobStatus, type FieldDateRange, type FieldSource,
} from "@/lib/field-data";
import { resolveFieldRow, formatInvoiceAmount, type FieldResolveSources } from "@/lib/field-resolve";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { EmptyStateCharacter } from "@/components/common/empty-state-character";
import { useStoreContext, type StoreBranch } from "@/lib/store-context";

const PAGE_SIZES = [10, 20, 50, 100];

/* KPI card definitions — colours match the reference (tinted card + icon). */
const KPI_DEFS: { key: string; label: string; queue: FieldQueue; Icon: React.ComponentType<{ className?: string }>; card: string; icon: string; num: string }[] = [
  { key: "todayPickups", label: "Today's Pickups", queue: "today_pickup",       Icon: Truck,          card: "bg-sky-50 border-sky-100",       icon: "bg-sky-100 text-sky-600",       num: "text-sky-900" },
  { key: "pending",      label: "Pending Assignment", queue: "pending_assignment", Icon: Clock,       card: "bg-zinc-50 border-zinc-100",     icon: "bg-zinc-200/70 text-zinc-600",  num: "text-zinc-900" },
  { key: "atStore",      label: "At Store",        queue: "at_store",           Icon: Package,        card: "bg-amber-50 border-amber-100",   icon: "bg-amber-100 text-amber-600",   num: "text-amber-900" },
  { key: "readyDrop",    label: "Ready for Drop",  queue: "ready_for_drop",     Icon: PackageCheck,   card: "bg-teal-50 border-teal-100",     icon: "bg-teal-100 text-teal-600",     num: "text-teal-900" },
  { key: "todayDrops",   label: "Today's Drops",   queue: "today_drop",         Icon: MapPin,         card: "bg-violet-50 border-violet-100", icon: "bg-violet-100 text-violet-600", num: "text-violet-900" },
  { key: "delayed",      label: "Delayed",         queue: "delayed",            Icon: AlertTriangle,  card: "bg-rose-50 border-rose-100",     icon: "bg-rose-100 text-rose-600",     num: "text-rose-900" },
  { key: "completed",    label: "Completed",       queue: "completed",          Icon: CheckCircle2,   card: "bg-emerald-50 border-emerald-100", icon: "bg-emerald-100 text-emerald-600", num: "text-emerald-900" },
];

/* Status strip queues (order per the reference). */
const STRIP: { value: FieldQueue; label: string }[] = [
  { value: "all",                label: "All Jobs" },
  { value: "today_pickup",       label: "Today's Pickup" },
  { value: "upcoming_pickup",    label: "Upcoming Pickup" },
  { value: "pending_assignment", label: "Pending Assignment" },
  { value: "in_transit",         label: "In Transit" },
  { value: "at_store",           label: "At Store" },
  { value: "ready_for_drop",     label: "Ready for Drop" },
  { value: "today_drop",         label: "Today's Drop" },
  { value: "delayed",            label: "Delayed" },
  { value: "completed",          label: "Completed" },
];

function fmtPickup(date: string, time: string): { day: string; time: string } {
  if (!date) return { day: "—", time: "" };
  const d = new Date(date + "T00:00:00");
  // Compact form: "10 Sept 26" (2-digit year) so the Date column stays narrow.
  const day = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  return { day, time: time || "" };
}

export default function FieldPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, role, team } = usePermissions();
  const { id: currentUserId } = useSession();
  const { jobs, hydrated, filters, setFilters, clearFilters, getJob, transition } = useField();
  const { tickets, invoices, customers } = useStore();

  /* Active-store context — drives the context-aware Store column (§3h). Field
     jobs carry the owning store as a NAME (job.branch, one of BRANCHES), so we
     resolve it to the authoritative store row by name from the user's
     authorized store list. Shown only in multi-store / All-Shops mode. */
  const { isAllShops, stores } = useStoreContext();
  const multiStore = isAllShops && stores.length > 1;
  const resolveJobStore = useCallback(
    (branchName: string | null | undefined): StoreBranch | null => {
      const name = branchName?.trim();
      if (!name) return null;
      const match = stores.find((s) => s.name === name);
      if (match) return match; // authoritative store row
      // The job references a store not in the resolved list — still show the
      // name (never invent an id-driven identity); StoreContextCell only uses
      // name/code/id for display, so a light synthetic row is safe here.
      return { id: name, organizationId: null, name, code: null, address: null, isActive: true, environment: "live" };
    },
    [stores],
  );

  /* Live source-of-truth records the resolver reads from (Customer Master,
     linked Ticket + Ticket Device, linked Invoice) — nothing is duplicated. */
  const resolveSrc: FieldResolveSources = useMemo(
    () => ({ tickets, invoices, customers }),
    [tickets, invoices, customers],
  );

  const [queue, setQueue] = useState<FieldQueue>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState<FieldDateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [detailJob, setDetailJob] = useState<FieldJob | null>(null);
  const [newRouteOpen, setNewRouteOpen] = useState(false);

  const isNinja = role?.id === "ninja";

  /* Role scoping: a Ninja only sees jobs assigned to them. */
  const scopedJobs = useMemo(() => {
    if (isNinja && currentUserId) {
      return jobs.filter((j) => j.ninjaId === currentUserId || j.dropNinjaId === currentUserId);
    }
    return jobs;
  }, [jobs, isNinja, currentUserId]);

  /* Shared predicate: search + advanced filters + date range (NOT the queue).
     Search resolves the live Ticket number / Invoice id so "T-056" and the
     invoice id find the job even though the job only stores raw record ids. */
  const matchesFilters = useMemo(() => (j: FieldJob): boolean => {
    if (filters.query) {
      const r = resolveFieldRow(j, resolveSrc);
      const hay = [
        j.jobNo, j.leadNo, r.customerName, r.contact, r.model, j.device,
        r.ticketNo, r.invoiceId, j.ninjaName, j.fieldManagerName, j.source,
        FIELD_LEAD_TYPE_LABEL[normaliseLeadType(j.leadType)],
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(filters.query.toLowerCase())) return false;
    }
    if (filters.status && j.status !== filters.status) return false;
    if (filters.branch && j.branch !== filters.branch) return false;
    if (filters.ninjaId && j.ninjaId !== filters.ninjaId && j.dropNinjaId !== filters.ninjaId) return false;
    if (filters.fieldManagerId && j.fieldManagerId !== filters.fieldManagerId) return false;
    if (filters.leg === "pickup" && !isPickupLeg(j.status)) return false;
    if (filters.leg === "drop" && !isDropLeg(j.status)) return false;
    if (filters.delayed && !isDelayed(j)) return false;
    if (filters.hasTicket === "yes" && !j.linkedTicketId) return false;
    if (filters.hasTicket === "no" && j.linkedTicketId) return false;
    if (filters.leadType && normaliseLeadType(j.leadType) !== filters.leadType) return false;
    if (filters.source && classifySource(j.source) !== filters.source) return false;
    // Date range applies to the relevant leg's scheduled date (pickup, else drop).
    const refDate = j.pickupDate || j.dropDate || j.createdAt.slice(0, 10);
    if (!isWalkInInDateRange(refDate, dateRange as any, customFrom, customTo)) return false;
    return true;
  }, [filters, dateRange, customFrom, customTo, resolveSrc]);

  /* Jobs after search+filters+date (used for BOTH the strip counts and table). */
  const filteredBase = useMemo(() => scopedJobs.filter(matchesFilters), [scopedJobs, matchesFilters]);

  /* Then apply the active queue for the table. */
  const filtered = useMemo(() => {
    const now = new Date();
    return filteredBase.filter((j) => jobMatchesQueue(j, queue, now));
  }, [filteredBase, queue]);

  useEffect(() => { setPage(1); }, [queue, filters, pageSize, dateRange, customFrom, customTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);

  /* KPIs from the full scoped dataset (independent of the active queue). */
  const kpis = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const c = (fn: (j: FieldJob) => boolean) => scopedJobs.filter(fn).length;
    return {
      todayPickups: c((j) => isPickupLeg(j.status) && j.pickupDate === today && j.status !== "picked_up"),
      pending: c((j) => j.status === "pending_assignment"),
      atStore: c((j) => j.status === "at_store" || j.status === "in_repair"),
      readyDrop: c((j) => j.status === "ready_for_drop" || j.status === "drop_scheduled"),
      todayDrops: c((j) => isDropLeg(j.status) && j.dropDate === today && j.status !== "delivered"),
      delayed: c((j) => isDelayed(j, now)),
      completed: c((j) => j.status === "completed"),
    } as Record<string, number>;
  }, [scopedJobs]);

  /* Strip counts reflect current search+filters (so counts always match table). */
  const stripCount = useMemo(() => {
    const now = new Date();
    const map: Record<string, number> = {};
    for (const s of STRIP) map[s.value] = filteredBase.filter((j) => jobMatchesQueue(j, s.value, now)).length;
    return map;
  }, [filteredBase]);

  /* Deep-link + notification open. */
  useEffect(() => {
    const id = searchParams.get("job");
    if (id) { const j = getJob(id); if (j) setDetailJob(j); }
  }, [searchParams, getJob, jobs]);
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const j = jobs.find((x) => x.id === id);
      if (j) setDetailJob(j);
    };
    window.addEventListener(FIELD_OPEN_EVENT, handler);
    return () => window.removeEventListener(FIELD_OPEN_EVENT, handler);
  }, [jobs]);
  useEffect(() => {
    if (detailJob) { const fresh = jobs.find((j) => j.id === detailJob.id); if (fresh && fresh !== detailJob) setDetailJob(fresh); }
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const managers = useMemo(() => staffByRole(team, ["field_manager", "shop_owner_branch_manager"]), [team]);
  const ninjas = useMemo(() => staffByRole(team, ["ninja"]), [team]);

  const activeFilters = !!(filters.status || filters.branch || filters.ninjaId || filters.fieldManagerId || filters.leg || filters.delayed || filters.hasTicket || filters.leadType || filters.source || dateRange !== "all");

  const resetAll = () => {
    clearFilters();
    setQueue("all");
    setDateRange("all");
    setCustomFrom(""); setCustomTo("");
  };

  /* ─── Sticky frozen workspace (identical technique to Tickets/Invoices) ──
     The date strip + status/filter toolbar pin just below the app topbar; the
     table header then pins flush right beneath that block. Offsets are MEASURED
     at runtime (topbar height + wrapper height) so there is no gap or jump when
     the filter panel opens/closes. Pure CSS position:sticky — smooth, no glitch. */
  const stickyWrapRef = useRef<HTMLDivElement>(null);
  const [stickyTop, setStickyTop] = useState(60);   // app topbar height
  const [wrapH, setWrapH] = useState(0);            // frozen wrapper height
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
    const measure = () => { setWrapH(wrap.offsetHeight); if (bar) setStickyTop(bar.offsetHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (bar) ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  // The thead pins flush at the wrapper's bottom edge — no seam for rows to
  // bleed through.
  const theadTop = stickyTop + wrapH;

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        eyebrow="Field Management · Logistics"
        title="Pickup & Drop"
        subtitle="Pickup & drop operations — from the customer's door to the workbench and back."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="w-full sm:w-64">
              <Input
                value={filters.query}
                onChange={(e: any) => setFilters((f) => ({ ...f, query: e.target.value }))}
                placeholder="Search field jobs…"
                iconLeft={<Search className="h-4 w-4" />}
              />
            </div>
            {can("view_field_reports") && (
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => router.push("/field/reports")}>
                <TrendingUp className="h-3.5 w-3.5" /> Reports
              </Button>
            )}
            {can("route_leads") && (
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setNewRouteOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New Field Job
              </Button>
            )}
          </div>
        }
      />

      {/* KPI cards — colourful tinted cards (icon · number · label · delta). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {KPI_DEFS.map((k, i) => {
          const value = kpis[k.key] ?? 0;
          const active = queue === k.queue;
          return (
            <motion.button
              key={k.key}
              onClick={() => setQueue(active ? "all" : k.queue)}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
              className={cn(
                "rounded-2xl border p-3.5 text-left transition hover:shadow-card",
                k.card,
                active && "ring-2 ring-[#4361EE]/50",
              )}
            >
              <span className={cn("grid h-9 w-9 place-items-center rounded-xl", k.icon)}><k.Icon className="h-4 w-4" /></span>
              <p className={cn("font-display mt-2.5 text-[26px] font-extrabold leading-none tnum", k.num)}>{value}</p>
              <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{k.label}</p>
            </motion.button>
          );
        })}
      </div>

      {/* ── Sticky frozen block: date strip → status/filter toolbar → (thead pins below) ── */}
      <div
        ref={stickyWrapRef}
        style={{ top: stickyTop }}
        className="sticky z-10 -mt-5 space-y-3 bg-[hsl(var(--background))] pt-5 pb-3 shadow-[-32px_0_0_0_hsl(var(--background)),32px_0_0_0_hsl(var(--background))]"
      >
        {/* Date Range Strip — shared 8-option strip as ONE connected segmented
            control (RepairOX standard: all filter strips use the connected
            SegmentedTabs container, never detached pills). */}
        <div className="max-w-full overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs
            value={dateRange}
            onChange={(v) => setDateRange(v as FieldDateRange)}
            options={FIELD_DATE_RANGES.map((dr) => ({ label: dr.label, value: dr.value }))}
            size="sm"
          />
        </div>

        {/* Custom Date Range — reuses the shared Date Range picker (same as Tickets). */}
        <DateRangePicker
          open={dateRange === "custom"}
          from={customFrom}
          to={customTo}
          onFromChange={(v) => { setCustomFrom(v); setDateRange("custom"); }}
          onToChange={(v) => { setCustomTo(v); setDateRange("custom"); }}
        />

        {/* Filter toolbar: View · store · status · ninja · Filters · Reset.
            The 10 status views are a single compact "View" dropdown (with live
            counts) so the whole control row stays inside the page at any width. */}
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <ViewPicker queue={queue} onChange={setQueue} counts={stripCount} />

          <span className="hidden h-6 w-px bg-border sm:block" />

          <div className="w-[150px]">
            <RSelect
              value={filters.branch}
              onChange={(v) => setFilters((f) => ({ ...f, branch: v }))}
              options={[{ label: "All Stores", value: "" }, ...BRANCHES.map((b) => ({ label: b, value: b }))]}
              placeholder="All Stores"
              searchable
              menuWidth="w-56"
            />
          </div>

          <div className="w-[160px]">
            <RSelect
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v as FieldJobStatus | "" }))}
              options={[{ label: "All Statuses", value: "" }, ...(Object.keys(FIELD_STATUS_LABEL) as FieldJobStatus[]).map((s) => ({ label: FIELD_STATUS_LABEL[s], value: s }))]}
              placeholder="All Statuses"
              searchable
              menuWidth="w-56"
            />
          </div>

          <div className="w-[140px]">
            <RSelect
              value={filters.leadType}
              onChange={(v) => setFilters((f) => ({ ...f, leadType: v as any }))}
              options={[{ label: "All Types", value: "" }, ...FIELD_LEAD_TYPES.map((t) => ({ label: t.label, value: t.value }))]}
              placeholder="All Types"
              menuWidth="w-52"
            />
          </div>

          <div className="w-[140px]">
            <RSelect
              value={filters.source}
              onChange={(v) => setFilters((f) => ({ ...f, source: v as FieldSource | "" }))}
              options={[{ label: "All Sources", value: "" }, ...(Object.keys(FIELD_SOURCE_LABEL) as FieldSource[]).map((s) => ({ label: FIELD_SOURCE_LABEL[s], value: s }))]}
              placeholder="All Sources"
              menuWidth="w-48"
            />
          </div>

          {!isNinja && (
            <div className="w-[150px]">
              <RSelect
                value={filters.ninjaId}
                onChange={(v) => setFilters((f) => ({ ...f, ninjaId: v }))}
                options={[{ label: "All Ninjas", value: "" }, ...ninjas.map((n) => ({ label: n.name, value: n.id }))]}
                placeholder="All Ninjas"
                searchable
                menuWidth="w-56"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant={showFilters || activeFilters ? "soft" : "outline"} size="sm" className="gap-1.5" onClick={() => setShowFilters((s) => !s)}>
              <Filter className="h-3.5 w-3.5" /> Filters
            </Button>
            {(activeFilters || filters.query || queue !== "all") && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-zinc-500" onClick={resetAll}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Advanced filters (Field Manager, Pickup/Drop leg, Delayed, Ticket, Custom date). */}
        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            {/* Canonical filter-panel header — mandatory close (×) + Reset
                (Design System v2 §3g). */}
            <RoxFilterPanelHeader
              title="Filters"
              onClose={() => setShowFilters(false)}
              onReset={resetAll}
              resetLabel="Reset"
              showReset={activeFilters || !!filters.query || queue !== "all"}
            />
            <div className="flex flex-wrap items-end gap-3">
              {!isNinja && (
                <Field label="Field Manager">
                  <div className="w-44">
                    <RSelect
                      value={filters.fieldManagerId}
                      onChange={(v) => setFilters((f) => ({ ...f, fieldManagerId: v }))}
                      options={[{ label: "All Field Managers", value: "" }, ...managers.map((m) => ({ label: m.name, value: m.id }))]}
                      placeholder="All Field Managers"
                      searchable
                      menuWidth="w-56"
                    />
                  </div>
                </Field>
              )}
              <Field label="Leg">
                <div className="w-36">
                  <RSelect
                    value={filters.leg}
                    onChange={(v) => setFilters((f) => ({ ...f, leg: v as any }))}
                    options={[{ label: "Pickup & Drop", value: "" }, { label: "Pickup", value: "pickup" }, { label: "Drop", value: "drop" }]}
                  />
                </div>
              </Field>
              <Field label="Linked Ticket">
                <div className="w-36">
                  <RSelect
                    value={filters.hasTicket}
                    onChange={(v) => setFilters((f) => ({ ...f, hasTicket: v as any }))}
                    options={[{ label: "Any", value: "" }, { label: "Has Ticket", value: "yes" }, { label: "No Ticket", value: "no" }]}
                  />
                </div>
              </Field>
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-[12px] font-medium text-zinc-700">
                <input type="checkbox" checked={filters.delayed} onChange={(e) => setFilters((f) => ({ ...f, delayed: e.target.checked }))} className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30" />
                Delayed only
              </label>
            </div>
          </motion.div>
        )}
      </div>

      {/* Desktop table — sharp/flat bordered card matching Tickets & Invoices.
          [overflow-x:clip] (not auto) + table-fixed w-full means the table always
          fits its container (header & body aligned, no column lost), and lets the
          thead FREEZE (an overflow:auto ancestor would trap the sticky header). */}
      <div className="hidden -mt-3 border-2 border-zinc-300 bg-card shadow-card md:block">
        {/* [overflow-x:clip] (NOT auto) + table-fixed w-full: the table always
            fits its container so the frozen thead survives and no column is
            ever lost/hidden at any zoom (same technique as Tickets/Invoices).
            Widths favour Customer / Model / Service Status; IDs stay compact. */}
        <div className="[overflow-x:clip]">
          <table className="w-full table-fixed text-sm">
            {/* Single shared column definition — the SAME <colgroup> governs
                both the header and every body row, so a header always sits
                exactly over its content. Widths are proportional to how much
                information each column carries (not uniform). */}
            <colgroup>
              {multiStore && <col className="w-[9%]" />}{/* Store (multi-store only) */}
              <col className="w-[8%]" />   {/* Date */}
              <col className="w-[9%]" />   {/* Trip ID — widened so FJ-001 never wraps */}
              <col className="w-[9%]" />   {/* Lead Type */}
              <col className="w-[8%]" />   {/* Source */}
              <col className="w-[11%]" />  {/* Assignee */}
              <col className="w-[15%]" />  {/* Customer (+ contact below) */}
              <col className="w-[13%]" />  {/* Model Info (+ issue below) */}
              <col className="w-[6%]" />   {/* Ticket */}
              <col className="w-[11%]" />  {/* Service Status */}
              <col className="w-[6%]" />   {/* Invoice */}
              <col className="w-[7%]" />   {/* Invoice Amt */}
              <col className="w-[64px]" /> {/* Action — fixed, always visible */}
            </colgroup>
            <thead style={{ top: theadTop }} className="sticky z-[5] border-b-2 border-[#4361EE]/40 bg-[#D6DDFB]">
              {/* Header alignment matches the data type of each column
                  (left for text, center for compact IDs/pill, right for money). */}
              <tr className="text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
                {multiStore && <th className="px-3 py-3 text-left">Store</th>}
                <th className="px-3 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Trip ID</th>
                <th className="px-3 py-3 text-left">Lead Type</th>
                <th className="px-3 py-3 text-left">Source</th>
                <th className="px-3 py-3 text-left">Assignee</th>
                <th className="px-3 py-3 text-left">Customer</th>
                <th className="py-3 pr-3 pl-[7px] text-left"><span className="inline-block -ml-[14px]">Model Info</span></th>
                <th className="py-3 pr-3 pl-[7px] text-center"><span className="inline-block -ml-[31px]">Ticket</span></th>
                <th className="px-3 py-3 text-center">Service Status</th>
                <th className="px-3 py-3 text-center">Invoice</th>
                <th className="px-3 py-3 text-right">Inv. Amt</th>
                <th className="px-3 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((j, i) => {
                const delayed = isDelayed(j);
                const r = resolveFieldRow(j, resolveSrc);
                const p = fmtPickup(j.pickupDate || j.dropDate, j.pickupTime || j.dropTime);
                const lt = normaliseLeadType(j.leadType);
                const srcBucket = classifySource(j.source);
                const srcLabel = j.source?.trim() || FIELD_SOURCE_LABEL[srcBucket];
                const assignee = j.ninjaName || j.fieldManagerName || "";
                return (
                  <motion.tr
                    key={j.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.015 * i, 0.25) }}
                    onClick={() => setDetailJob(j)}
                    className={cn(
                      "group h-[84px] cursor-pointer border-b border-zinc-500 transition-colors",
                      delayed ? "bg-rose-50/70 hover:bg-rose-50" : "hover:bg-[#EEF1FD]/50",
                    )}
                  >
                    {/* STORE — owning store (multi-store / All-Shops only). */}
                    {multiStore && (
                      <td className="px-3 py-4 text-left align-middle" onClick={(e) => e.stopPropagation()}>
                        <StoreContextCell store={resolveJobStore(j.branch)} mode="stacked" />
                      </td>
                    )}
                    {/* DATE — the field trip date (scheduled pickup, else drop). */}
                    <td className="px-3 py-4 text-left align-middle">
                      {p.day !== "—" ? (
                        <div className={cn("leading-tight", delayed && "font-semibold text-rose-600")}>
                          <p className="whitespace-nowrap text-[12.5px] font-medium">{p.day}</p>
                          {p.time && <p className="text-[11px] font-normal text-zinc-500">{p.time}</p>}
                        </div>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* TRIP ID (+ originating lead) */}
                    <td className="px-3 py-4 text-left align-middle">
                      <p className="whitespace-nowrap font-semibold leading-tight text-foreground tnum">{j.jobNo}</p>
                      {j.leadNo && <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-zinc-500 tnum">{j.leadNo}</p>}
                    </td>

                    {/* LEAD TYPE */}
                    <td className="px-3 py-4 text-left align-middle">
                      <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", FIELD_LEAD_TYPE_TONE[lt])}>
                        {FIELD_LEAD_TYPE_LABEL[lt]}
                      </span>
                    </td>

                    {/* SOURCE — mapped from the originating lead/walk-in */}
                    <td className="px-3 py-4 text-left align-middle">
                      {j.source || srcBucket !== "other" ? (
                        <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset", FIELD_SOURCE_TONE[srcBucket])}>
                          {srcLabel}
                        </span>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* ASSIGNEE — Ninja (operational), else Field Manager.
                        Short colour strip sits INSIDE the px-3 padding (absolute,
                        vertically centred) so text starts at the same 12px edge
                        as the header. */}
                    <td className="relative px-3 py-4 text-left align-middle">
                      {assignee ? (
                        <>
                          <span className="absolute left-1 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: accentColor(assignee) }} />
                          <div className="min-w-0">
                            <span className="block truncate font-medium leading-tight text-zinc-800">{assignee}</span>
                            <span className="block text-[11px] leading-tight text-zinc-500">{j.ninjaName ? "Ninja" : "Field Mgr"}</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-[12px] italic text-zinc-500">Unassigned</span>
                      )}
                    </td>

                    {/* CUSTOMER — live Customer Master name with the contact number
                        below it (like the Tickets table). Colour strip (no avatar). */}
                    <td className="relative px-3 py-4 text-left align-middle" onClick={(e) => e.stopPropagation()}>
                      <span className="absolute left-1 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: accentColor(r.customerName) }} />
                      <button
                        onClick={() => router.push(j.customerId ? `/contacts?customer=${j.customerId}` : "/contacts")}
                        className="block w-full min-w-0 text-left"
                        title="View customer"
                      >
                        <span className="block truncate font-semibold leading-tight text-foreground group-hover:text-[#4361EE]">{r.customerName || "—"}</span>
                        {r.contact && <span className="block truncate text-[11px] font-medium leading-tight text-zinc-500 tnum">{r.contact}</span>}
                      </button>
                    </td>

                    {/* MODEL — the specific ticket device (multi-device aware).
                        Nudged 5px left (pl-[7px]) with its strip, per request. */}
                    <td className="relative py-4 pr-3 pl-[7px] text-left align-middle">
                      <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: accentColor(r.model) }} />
                      <div className="min-w-0">
                        <span className="block truncate font-semibold leading-tight text-foreground">{r.model || "N/A"}</span>
                        {r.modelDetail && <span className="block truncate text-[11px] font-medium leading-tight text-zinc-500">{r.modelDetail}</span>}
                      </div>
                    </td>

                    {/* TICKET ID — opens the existing View Ticket (nudged 31px left) */}
                    <td className="py-4 pr-3 pl-[7px] text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-block -ml-[31px]">
                        {r.ticket ? (
                          <button onClick={() => router.push(`/tickets/${r.ticket!.id}`)} className="whitespace-nowrap font-medium text-[#4361EE] hover:underline tnum">
                            {r.ticketNo}
                          </button>
                        ) : <span className="text-zinc-300">—</span>}
                      </span>
                    </td>

                    {/* SERVICE STATUS — interactive pill (valid transitions only) */}
                    <td className="px-3 py-4 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <StatusPill
                          job={j}
                          canEdit={can("manage_field_jobs") || can("assign_ninja")}
                          onSelect={(next) => transition(j.id, next)}
                        />
                      </div>
                    </td>

                    {/* INVOICE ID — opens the existing View Invoice */}
                    <td className="px-3 py-4 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      {r.invoice ? (
                        <button onClick={() => router.push(`/invoice/${r.invoice!.id}`)} className="whitespace-nowrap font-medium text-[#4361EE] hover:underline tnum">
                          {r.invoiceId}
                        </button>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* INVOICE AMOUNT — live from the linked invoice (right-aligned, tabular) */}
                    <td className="px-3 py-4 text-right align-middle tnum">
                      {r.invoiceAmount != null ? (
                        <span className="whitespace-nowrap font-semibold text-zinc-800">{formatInvoiceAmount(r.invoiceAmount)}</span>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* ACTION — fixed column, icon centred, always visible */}
                    <td className="px-3 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <button onClick={() => setDetailJob(j)} title="Open field job"
                          className="grid h-7 w-7 place-items-center rounded-lg text-zinc-500 transition hover:bg-[#EEF1FD] hover:text-[#4361EE]">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hydrated && filtered.length === 0 && <EmptyState hasJobs={scopedJobs.length > 0} />}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading field jobs…</div>}
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((j) => {
          const delayed = isDelayed(j);
          const r = resolveFieldRow(j, resolveSrc);
          const p = fmtPickup(j.pickupDate || j.dropDate, j.pickupTime || j.dropTime);
          const lt = normaliseLeadType(j.leadType);
          return (
            <button key={j.id} onClick={() => setDetailJob(j)} className={cn("w-full rounded-2xl border border-border bg-card p-4 text-left shadow-card", delayed && "border-rose-200 bg-rose-50/40")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EEF1FD] text-[11px] font-bold text-[#4361EE]">{initials(r.customerName)}</span>
                  <div>
                    <p className="font-semibold">{r.customerName || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{j.jobNo}{j.leadNo ? ` · ${j.leadNo}` : ""}</p>
                  </div>
                </div>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[j.status])}>{FIELD_STATUS_LABEL[j.status]}</span>
              </div>
              {multiStore && (
                <div className="mt-2">
                  <StoreContextCell store={resolveJobStore(j.branch)} mode="inline" />
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", FIELD_LEAD_TYPE_TONE[lt])}>{FIELD_LEAD_TYPE_LABEL[lt]}</span>
                {r.ticketNo && <span className="inline-flex rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">{r.ticketNo}</span>}
                {r.invoiceAmount != null && <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">{formatInvoiceAmount(r.invoiceAmount)}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[12px] text-zinc-600">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor(r.model) }} /> {r.model || "N/A"}</span>
                {p.day !== "—" && <span className={cn("ml-auto inline-flex items-center gap-1", delayed && "font-semibold text-rose-600")}><Clock className="h-3 w-3" /> {p.day}</span>}
              </div>
            </button>
          );
        })}
        {hydrated && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <EmptyStateCharacter variant="field" />
            <p className="font-semibold">{scopedJobs.length === 0 ? "No field jobs yet" : "No jobs match this view"}</p>
            <p className="text-sm text-muted-foreground">{scopedJobs.length === 0 ? "Field jobs are created when Sales routes a lead to Pickup & Drop." : "Try a different queue, filter or date range."}</p>
          </div>
        )}
      </div>

      {/* Pagination — DETACHED below the table frame (matches the Tickets table):
          bare footer, no wrapping card, separated by the page's root spacing. */}
      <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="job" />

      <FieldJobDrawer job={detailJob} open={!!detailJob} onClose={() => setDetailJob(null)} />
      {/* New Field Job routing is initiated from a Lead; guide the user there. */}
      {newRouteOpen && <NewFieldJobHint onClose={() => setNewRouteOpen(false)} onGoLeads={() => { setNewRouteOpen(false); router.push("/leads/list"); }} />}
    </div>
  );
}

/* Compact "View" dropdown that replaces the long status pill strip. Shows the
   active view + its live count, and lists every queue with counts. Selecting a
   view drives the same `queue` state the KPI cards use (fully synchronised). */
function ViewPicker({ queue, onChange, counts }: {
  queue: FieldQueue;
  onChange: (q: FieldQueue) => void;
  counts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const active = STRIP.find((s) => s.value === queue) ?? STRIP[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[34px] items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition",
          queue !== "all" ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-border bg-card text-zinc-700 hover:border-[#4361EE]/40",
        )}
      >
        <LayoutList className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">{active.label}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", queue !== "all" ? "bg-[#4361EE] text-white" : "bg-muted text-zinc-500")}>
          {counts[active.value] ?? 0}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-[340px] w-60 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
            {STRIP.map((s) => {
              const isActive = s.value === queue;
              const count = counts[s.value] ?? 0;
              return (
                <button
                  key={s.value}
                  onClick={() => { onChange(s.value); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition",
                    isActive ? "bg-[#EEF1FD] font-semibold text-[#4361EE]" : "text-zinc-700 hover:bg-muted",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isActive && <Check className="h-3.5 w-3.5" />}
                    <span className={cn(!isActive && "pl-[22px]")}>{s.label}</span>
                  </span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", count > 0 ? "bg-[#4361EE]/10 text-[#4361EE]" : "bg-muted text-zinc-400")}>{count}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* Service Status pill. Read-only chip by default; when the user can edit and
   the current status has valid next states, it becomes a dropdown that exposes
   ONLY those guarded transitions (prevents illegal jumps like Pending →
   Completed). Selecting one calls the context transition (persists + logs +
   the table/history update via the live jobs state). */
function StatusPill({ job, canEdit, onSelect }: {
  job: FieldJob;
  canEdit: boolean;
  onSelect: (next: FieldJobStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const nexts = useMemo(() => allowedFieldTransitions(job.status, normaliseLeadType(job.leadType)), [job.status, job.leadType]);
  const editable = canEdit && nexts.length > 0;

  const chip = (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[job.status])}>
      {FIELD_STATUS_LABEL[job.status]}
      {editable && <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />}
    </span>
  );

  if (!editable) return chip;

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} title="Update service status" className="outline-none">
        {chip}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl">
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Update status</p>
            {nexts.map((s) => (
              <button
                key={s}
                onClick={() => { onSelect(s); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-zinc-700 transition hover:bg-muted"
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset", FIELD_STATUS_TONE[s])} />
                {FIELD_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ hasJobs }: { hasJobs: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 p-12 text-center">
      <EmptyStateCharacter variant="field" />
      <p className="font-semibold">{hasJobs ? "No jobs match this view" : "No field jobs yet"}</p>
      <p className="text-sm text-muted-foreground">{hasJobs ? "Try a different queue, filter or date range." : "Field jobs are created when Sales routes a lead to Pickup & Drop."}</p>
    </div>
  );
}

/* A field job originates from routing a Lead to Pickup & Drop (spec §27). The
   "New Field Job" button guides the user to the Leads list to route one, rather
   than creating an orphan job with no lead/customer. */
function NewFieldJobHint({ onClose, onGoLeads }: { onClose: () => void; onGoLeads: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl ring-1 ring-border" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><Truck className="h-5 w-5" /></span>
          <h3 className="font-display text-lg font-bold">New Field Job</h3>
        </div>
        <p className="text-[13px] text-zinc-600">
          Field jobs are created by routing a Lead to <strong>Pickup &amp; Drop</strong>. This keeps one customer, one lead and one operational route connected.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="gap-1.5" onClick={onGoLeads}>Go to Leads</Button>
        </div>
      </div>
    </div>
  );
}
