"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Shop Management → Field (Pickup & Drop operations).

   Operational/logistics workspace that moves devices between the customer and
   the store. NOT a ticket system — it wraps the existing Ticket/Invoice flow.
   Data comes from the FieldProvider; a job is created when Sales routes a Lead
   to "Pickup & Drop". KPIs are operational (no revenue).

   Layout mirrors the Tickets/Invoices tables: a sticky frozen workspace
   (KPIs → status strip → filter toolbar → thead all pin below the topbar) with
   a table-fixed, horizontally-clipped table so the header freeze survives and
   no columns are lost at any zoom level.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
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
  FIELD_DATE_RANGES,
  type FieldQueue, type FieldJob, type FieldJobStatus, type FieldDateRange,
} from "@/lib/field-data";

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
  const day = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return { day, time: time || "" };
}

export default function FieldPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, role, team } = usePermissions();
  const { id: currentUserId } = useSession();
  const { jobs, hydrated, filters, setFilters, clearFilters, getJob } = useField();
  const { tickets } = useStore();

  /* Resolve a Ticket's human number (T-052) from its id for the Ticket column. */
  const getTicketLabel = (ticketId: string): string => {
    const t = tickets.find((x) => x.id === ticketId);
    return t?.ticketNo || t?.id || ticketId;
  };

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

  /* Shared predicate: search + advanced filters + date range (NOT the queue). */
  const matchesFilters = useMemo(() => (j: FieldJob): boolean => {
    if (filters.query) {
      const hay = [j.jobNo, j.leadNo, j.customer, j.phone, j.device, j.linkedTicketId, j.ninjaName, j.fieldManagerName]
        .filter(Boolean).join(" ").toLowerCase();
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
    // Date range applies to the relevant leg's scheduled date (pickup, else drop).
    const refDate = j.pickupDate || j.dropDate || j.createdAt.slice(0, 10);
    if (!isWalkInInDateRange(refDate, dateRange as any, customFrom, customTo)) return false;
    return true;
  }, [filters, dateRange, customFrom, customTo]);

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

  const activeFilters = !!(filters.status || filters.branch || filters.ninjaId || filters.fieldManagerId || filters.leg || filters.delayed || filters.hasTicket || dateRange !== "all");

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
        eyebrow="Shop · Logistics"
        title="Field Operations"
        subtitle="Pickup & drop operations — from the customer's door to the workbench and back."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="w-full sm:w-64">
              <Input
                value={filters.query}
                onChange={(e: any) => setFilters((f) => ({ ...f, query: e.target.value }))}
                placeholder="Search job, customer, device, ticket…"
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
        {/* Date Range Strip — shared 8-option pill strip (same as Tickets/Invoices),
            scrollable on narrow screens without pushing the page. */}
        <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {FIELD_DATE_RANGES.map((dr) => (
            <button
              key={dr.value}
              onClick={() => setDateRange(dr.value)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-5 py-1.5 text-center text-xs font-semibold transition-all",
                dateRange === dr.value
                  ? "bg-[#4361EE] text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.4)]"
                  : "bg-muted text-muted-foreground hover:bg-slate-200 hover:text-foreground",
              )}
            >
              {dr.label}
            </button>
          ))}
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
      <div className="hidden -mt-3 border-2 border-zinc-200 bg-card shadow-card md:block">
        <div className="[overflow-x:clip]">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[9%]" />   {/* Job */}
              <col className="w-[16%]" />  {/* Customer */}
              <col className="w-[18%]" />  {/* Device */}
              <col className="w-[13%]" />  {/* Store */}
              <col className="w-[12%]" />  {/* Pickup */}
              <col className="w-[13%]" />  {/* Status */}
              <col className="w-[13%]" />  {/* Ninja */}
              <col className="w-[70px]" /> {/* Ticket */}
              <col className="w-[84px]" /> {/* Actions — stable minimum width */}
            </colgroup>
            <thead style={{ top: theadTop }} className="sticky z-[5] border-b-2 border-[#4361EE]/25 bg-[#D6DDFB]">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
                <th className="px-4 py-3">Job</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Device</th>
                <th className="px-3 py-3">Store</th>
                <th className="px-3 py-3">Pickup</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Ninja</th>
                <th className="px-3 py-3">Ticket</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((j, i) => {
                const delayed = isDelayed(j);
                const p = fmtPickup(j.pickupDate, j.pickupTime);
                return (
                  <motion.tr
                    key={j.id}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.015 * i, 0.25) }}
                    onClick={() => setDetailJob(j)}
                    className={cn(
                      "group h-[72px] cursor-pointer border-b border-zinc-200 align-middle transition-colors",
                      delayed ? "bg-rose-50/70 hover:bg-rose-50" : "hover:bg-[#EEF1FD]/50",
                    )}
                  >
                    {/* JOB */}
                    <td className="px-4 py-3 align-middle">
                      <p className="font-semibold text-foreground tnum">{j.jobNo}</p>
                      {j.leadNo && <p className="text-[11px] text-zinc-400">· {j.leadNo}</p>}
                    </td>

                    {/* CUSTOMER — neutral initials (no multicolour avatars) */}
                    <td className="px-3 py-3 align-middle">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push("/contacts"); }}
                        className="flex w-full min-w-0 items-center gap-2.5 text-left"
                        title="View customer"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EEF1FD] text-[11px] font-bold text-[#4361EE] ring-1 ring-inset ring-[#4361EE]/15">
                          {initials(j.customer)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{j.customer || "—"}</span>
                          {j.phone && <span className="block truncate text-[11px] text-zinc-400">{j.phone}</span>}
                        </span>
                      </button>
                    </td>

                    {/* DEVICE — coloured left strip + model + issue */}
                    <td className="px-3 py-3 align-middle">
                      <div className="flex min-w-0 items-stretch gap-2.5">
                        <span className="w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: accentColor(j.device) }} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{j.device || "N/A"}</span>
                          {j.issue && <span className="block truncate text-[11px] text-zinc-400">{j.issue}</span>}
                        </span>
                      </div>
                    </td>

                    {/* STORE — coloured square marker (distinct from the device strip) */}
                    <td className="px-3 py-3 align-middle">
                      {j.branch ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: accentColor(j.branch) }} />
                          <span className="truncate text-zinc-700">{j.branch}</span>
                        </span>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* PICKUP */}
                    <td className="px-3 py-3 align-middle">
                      {j.pickupDate ? (
                        <span className={cn("inline-flex items-center gap-1.5", delayed && "font-semibold text-rose-600")}>
                          <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          <span className="min-w-0">
                            <span className="block truncate">{p.day}</span>
                            {p.time && <span className="block text-[11px] text-zinc-400">{p.time}</span>}
                          </span>
                        </span>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* STATUS pill */}
                    <td className="px-3 py-3 align-middle">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[j.status])}>
                        {FIELD_STATUS_LABEL[j.status]}
                      </span>
                    </td>

                    {/* NINJA — neutral initials + name, or Unassigned */}
                    <td className="px-3 py-3 align-middle">
                      {j.ninjaName ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600">{initials(j.ninjaName)}</span>
                          <span className="min-w-0 truncate text-zinc-700">{j.ninjaName}</span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-zinc-400">Unassigned</span>
                      )}
                    </td>

                    {/* TICKET */}
                    <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      {j.linkedTicketId ? (
                        <button onClick={() => router.push(`/tickets/${j.linkedTicketId}`)} className="font-medium text-[#4361EE] hover:underline">
                          {getTicketLabel(j.linkedTicketId)}
                        </button>
                      ) : <span className="text-zinc-300">—</span>}
                    </td>

                    {/* ACTIONS */}
                    <td className="px-4 py-3 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setDetailJob(j)} title="Open field job"
                        className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-zinc-400 transition hover:bg-[#EEF1FD] hover:text-[#4361EE]">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
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
          const p = fmtPickup(j.pickupDate, j.pickupTime);
          return (
            <button key={j.id} onClick={() => setDetailJob(j)} className={cn("w-full rounded-2xl border border-border bg-card p-4 text-left shadow-card", delayed && "border-rose-200 bg-rose-50/40")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EEF1FD] text-[11px] font-bold text-[#4361EE]">{initials(j.customer)}</span>
                  <div>
                    <p className="font-semibold">{j.customer || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{j.jobNo}{j.leadNo ? ` · ${j.leadNo}` : ""}</p>
                  </div>
                </div>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[j.status])}>{FIELD_STATUS_LABEL[j.status]}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[12px] text-zinc-600">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor(j.device) }} /> {j.device || "N/A"}</span>
                {j.pickupDate && <span className={cn("ml-auto inline-flex items-center gap-1", delayed && "font-semibold text-rose-600")}><Clock className="h-3 w-3" /> {p.day}</span>}
              </div>
            </button>
          );
        })}
        {hydrated && filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {scopedJobs.length === 0 ? "No field jobs yet. They appear when Sales routes a lead to Pickup & Drop." : "No jobs match this view."}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="job" />
      </div>

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
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Truck className="h-6 w-6" /></div>
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
