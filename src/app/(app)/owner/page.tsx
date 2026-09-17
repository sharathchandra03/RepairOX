"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Owner / Master Shop Owner dashboard.

   A DEDICATED multi-store overview, distinct from the per-store operational
   dashboard (/dashboard). It shows:

     • Consolidated KPIs across every store the owner can access, OR a single
       store when one is selected in the header (All Shops ↔ store share one
       source of truth via the store selector + date filter).
     • A store-by-store comparison table (reference: the owner report grid).
       Every store row is clickable → sets the active store context and opens
       that store's operational dashboard.

   Data comes from the server (/api/owner/summary) which aggregates in the DB
   and only returns compact per-store rows — never the full dataset — so this
   scales as stores/tickets/invoices grow. Access is enforced server-side
   (owner/admin only); non-owners are redirected.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2, Ticket, ShoppingBag, ReceiptText, Wallet, Package,
  ChevronRight, TrendingUp, Store as StoreIcon, CalendarDays, Check, ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RoxFilterPanelHeader, ActiveFiltersBar } from "@/components/ui/rox-filter";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { cn } from "@/lib/utils";

/** Normalized monthly projection horizon. Projection for any selected period is
 *  the store's average DAILY sales for that period × this constant, so the
 *  figure is always a comparable "per-month" number regardless of the filter. */
const PROJECTION_DAYS = 31;

/* ── Date presets (mirrors the app's shared date vocabulary) ── */
type PresetId = "all" | "today" | "yesterday" | "7days" | "1month" | "lastmonth" | "1year" | "custom";
const PRESETS: { id: PresetId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7days", label: "7 Days" },
  { id: "1month", label: "1 Month" },
  { id: "lastmonth", label: "Last Month" },
  { id: "1year", label: "1 Year" },
  { id: "custom", label: "Custom" },
];

function resolveRange(preset: PresetId, from?: string, to?: string): { from: string | null; to: string | null } {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  switch (preset) {
    case "all": return { from: null, to: null };
    case "today": return { from: iso(startOfDay(now)), to: iso(end) };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const e = new Date(y); e.setHours(23, 59, 59, 999);
      return { from: iso(startOfDay(y)), to: iso(e) };
    }
    case "7days": { const s = new Date(now); s.setDate(s.getDate() - 6); return { from: iso(startOfDay(s)), to: iso(end) }; }
    case "1month": { const s = new Date(now); s.setMonth(s.getMonth() - 1); return { from: iso(startOfDay(s)), to: iso(end) }; }
    case "lastmonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0); e.setHours(23, 59, 59, 999);
      return { from: iso(startOfDay(s)), to: iso(e) };
    }
    case "1year": { const s = new Date(now); s.setFullYear(s.getFullYear() - 1); return { from: iso(startOfDay(s)), to: iso(end) }; }
    case "custom": return { from: from ? iso(startOfDay(new Date(from))) : null, to: to ? iso(new Date(`${to}T23:59:59`)) : null };
  }
}

interface StoreMetrics {
  id: string; name: string; code: string | null; address: string | null; isActive: boolean; environment: "demo" | "live";
  tickets: number; walkIns: number; invoices: number; pickup: number; onsite: number;
  totalSales: number; paymentReceived: number; outstanding: number; stockValue: number; avgPerDay: number;
}
interface SummaryTotals {
  tickets: number; walkIns: number; invoices: number; pickup: number; onsite: number;
  totalSales: number; paymentReceived: number; outstanding: number; stockValue: number; avgPerDay: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Zero values are REAL business information (a store with 0 activity still
 *  exists and matters), so they must stay clearly READABLE — never faded or
 *  disabled-looking. We only step the WEIGHT down (semibold → medium) and use a
 *  normal readable secondary ink (slate-500), not a pale/low-opacity treatment.
 *  Non-zero values keep their stronger colour + weight, so the hierarchy is
 *  subtle rather than "available vs unavailable". */
const zeroTone = (n: number) => (n === 0 ? "font-medium !text-slate-500" : "");

export default function OwnerDashboardPage() {
  const router = useRouter();
  const { can, apiFetch, authReady, currentUser } = usePermissions();
  const { stores, activeStoreId, isAllShops, canViewAllShops, setActiveStore, ready: storeReady } = useStoreContext();

  const [preset, setPreset] = useState<PresetId>("1month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<StoreMetrics[]>([]);
  const [totals, setTotals] = useState<SummaryTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Owner-Dashboard-LOCAL multi-store selection ──────────────────────────
     A VIEW/FILTER over the already-fetched per-store rows — it never touches
     the DB, store ownership or the global header context (§25/§27). An EMPTY
     set means "All Shops" (the neutral default). This capability is exposed
     only on this owner-guarded page, so normal store users never see it (§28).
     Selecting stores here narrows the KPIs, table, total AND projection to
     exactly that set (§24/§39/§40/§41). */
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const storeMenuRef = useRef<HTMLDivElement>(null);

  const isOwner = can("manage_branches") || can("full_access");

  // Access guard: only owners / cross-branch managers may view this page.
  useEffect(() => {
    if (authReady && currentUser && !isOwner) router.replace("/dashboard");
  }, [authReady, currentUser, isOwner, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = resolveRange(preset, customFrom, customTo);
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const res = await apiFetch(`/api/owner/summary?${qs.toString()}`);
    if (!res.ok || !res.json?.ok) {
      setError(res.json?.error ?? "Could not load store metrics.");
      setLoading(false);
      return;
    }
    setRows(res.json.stores as StoreMetrics[]);
    setTotals(res.json.totals as SummaryTotals);
    setLoading(false);
  }, [apiFetch, preset, customFrom, customTo]);

  useEffect(() => {
    if (!authReady || !isOwner) return;
    if (preset === "custom" && (!customFrom || !customTo)) return;
    load();
  }, [authReady, isOwner, load, preset, customFrom, customTo]);

  // When a specific store is selected in the GLOBAL header, this page stays
  // scoped to that one store (§27 — the header selector is never broken). The
  // local multi-store selection is an ALL-SHOPS-only capability.
  const multiSelectActive = isAllShops && selectedStoreIds.size > 0;

  // Resolve the effective store set feeding EVERYTHING on the page (KPIs, table,
  // total, projection) so they can never disagree (§39):
  //   • header = single store  → just that store
  //   • header = All Shops + local multi-select → only the selected stores
  //   • header = All Shops + nothing selected   → every authorized store
  const visibleRows = useMemo(() => {
    if (!isAllShops) return rows.filter((r) => r.id === activeStoreId);
    if (selectedStoreIds.size > 0) return rows.filter((r) => selectedStoreIds.has(r.id));
    return rows;
  }, [rows, isAllShops, activeStoreId, selectedStoreIds]);

  const shownTotals = useMemo<SummaryTotals>(() => {
    // Use the precomputed server totals ONLY for the true full All-Shops view;
    // any narrowed set (single store or multi-select) is summed from the exact
    // underlying store rows so the aggregate stays accurate (§20).
    if (isAllShops && !multiSelectActive && totals) return totals;
    return visibleRows.reduce<SummaryTotals>(
      (t, s) => ({
        tickets: t.tickets + s.tickets, walkIns: t.walkIns + s.walkIns, invoices: t.invoices + s.invoices,
        pickup: t.pickup + s.pickup, onsite: t.onsite + s.onsite, totalSales: t.totalSales + s.totalSales,
        paymentReceived: t.paymentReceived + s.paymentReceived, outstanding: t.outstanding + s.outstanding,
        stockValue: t.stockValue + s.stockValue, avgPerDay: t.avgPerDay + s.avgPerDay,
      }),
      { tickets: 0, walkIns: 0, invoices: 0, pickup: 0, onsite: 0, totalSales: 0, paymentReceived: 0, outstanding: 0, stockValue: 0, avgPerDay: 0 }
    );
  }, [isAllShops, multiSelectActive, totals, visibleRows]);

  /* Projection = the store's AVERAGE DAILY sales for the selected period × 31.
     `avgPerDay` already comes from the server as totalSales ÷ (days in the
     selected range), so multiplying by 31 yields a normalized monthly figure
     that recalculates automatically whenever the date preset changes (§15/§16).
     Each store gets its OWN projection (§19); the total is the aggregate of the
     selected set's avg/day × 31 (§20), summed from real values — never a shared
     org-wide figure and never hardcoded (§18). */
  const projection = useCallback((avgPerDay: number) => avgPerDay * PROJECTION_DAYS, []);
  const totalProjection = useMemo(
    () => shownTotals.avgPerDay * PROJECTION_DAYS,
    [shownTotals.avgPerDay]
  );

  // Only stores the owner can actually see feed the multi-select control.
  const selectableStores = useMemo(
    () => rows.map((r) => ({ id: r.id, name: r.name, code: r.code })),
    [rows]
  );

  const toggleStore = useCallback((id: string) => {
    setSelectedStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Close the multi-store dropdown on outside click / Escape.
  useEffect(() => {
    if (!storeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (storeMenuRef.current && !storeMenuRef.current.contains(e.target as Node)) setStoreMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setStoreMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [storeMenuOpen]);

  function enterStore(id: string) {
    // "View Reports" opens the INDIVIDUAL store's Reports (not its operational
    // dashboard). Set the active store first so /reports is scoped to it via the
    // global store context, then navigate.
    setActiveStore(id);
    router.push("/reports");
  }

  const contextLabel = isAllShops ? "All Shops" : stores.find((s) => s.id === activeStoreId)?.name ?? "Store";

  if (authReady && currentUser && !isOwner) {
    return <div className="h-[40vh]" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Organization / Overview"
        title="Owner Dashboard"
        subtitle={isAllShops
          ? "Consolidated performance across every store in your organization."
          : `Focused on ${contextLabel}. Switch to All Shops in the header for the full picture.`}
      />

      {/* Date + store filter strip — the two filters combine so the whole page
          represents ONLY the selected stores AND ONLY the selected period. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Multi-store selector — an Owner-Dashboard-local control (§22). Shown
            only in All-Shops mode with more than one store; when a single store
            is picked in the global header, this page follows that instead. */}
        {isAllShops && selectableStores.length > 1 ? (
          <div ref={storeMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setStoreMenuOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={storeMenuOpen}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                // Highlighted blue pill so the multi-store control clearly reads
                // as the primary filter affordance. A specific selection deepens
                // to the light-indigo tint; the neutral "All Shops" state stays a
                // solid brand-blue pill (matching the active date preset).
                multiSelectActive
                  ? "border-[#4361EE] bg-[#EEF1FD] text-[#3A4DBB]"
                  : "border-[#4361EE] bg-[#4361EE] text-white hover:bg-[#3A4DBB]"
              )}
            >
              <Building2 className="h-3.5 w-3.5" />
              {multiSelectActive
                ? `${selectedStoreIds.size} store${selectedStoreIds.size !== 1 ? "s" : ""} selected`
                : "All Shops"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", storeMenuOpen && "rotate-180")} />
            </button>

            {storeMenuOpen && (
              <div
                role="listbox"
                className="absolute left-0 z-30 mt-2 w-64 rounded-xl border-2 border-zinc-200 bg-card p-2 shadow-card"
              >
                <RoxFilterPanelHeader
                  title="Compare stores"
                  onClose={() => setStoreMenuOpen(false)}
                  onReset={() => setSelectedStoreIds(new Set())}
                  showReset={selectedStoreIds.size > 0}
                  resetLabel="Clear"
                />
                <div className="max-h-[280px] overflow-auto [scrollbar-width:thin]">
                  {/* "All Shops" = the neutral empty-selection state (§26). */}
                  <button
                    type="button"
                    onClick={() => setSelectedStoreIds(new Set())}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition hover:bg-muted"
                  >
                    <span className={cn(
                      "grid h-4 w-4 place-items-center rounded border",
                      selectedStoreIds.size === 0 ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-zinc-300"
                    )}>
                      {selectedStoreIds.size === 0 && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="font-semibold text-slate-900">All Shops</span>
                  </button>
                  {selectableStores.map((s) => {
                    const checked = selectedStoreIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleStore(s.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition hover:bg-muted"
                      >
                        <span className={cn(
                          "grid h-4 w-4 place-items-center rounded border",
                          checked ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-zinc-300"
                        )}>
                          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[9px] font-bold text-[#4361EE]">
                          {(s.code || s.name).slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-slate-800">{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-[12px] font-semibold text-[#3A4DBB]">
            {isAllShops ? <Building2 className="h-3.5 w-3.5" /> : <StoreIcon className="h-3.5 w-3.5" />}
            {contextLabel}
          </span>
        )}

        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                preset === p.id
                  ? "border-[#4361EE] bg-[#4361EE] text-white"
                  : "border-border bg-card text-zinc-600 hover:bg-muted"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-[12px]" />
            <span className="text-muted-foreground">–</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-[12px]" />
          </div>
        )}
      </div>

      {/* Applied multi-store filters as individually-removable chips (design
          system §3g). Each store selected for comparison shows its own × so it
          can be dropped one at a time; a trailing Clear all resets to All Shops. */}
      {multiSelectActive && (
        <ActiveFiltersBar
          label="Comparing"
          filters={rows
            .filter((r) => selectedStoreIds.has(r.id))
            .map((r) => ({
              id: r.id,
              value: r.name,
              onClear: () => toggleStore(r.id),
            }))}
          onClearAll={() => setSelectedStoreIds(new Set())}
        />
      )}

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {error}
        </div>
      )}

      {/* Consolidated KPIs — tighter gap so the Store Performance table rises
          into the initial viewport without cramping the cards. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Sharper corners for the management-console feel; the "6 stores" hint
            pill is intentionally removed so Total Sales stays focused on sales
            (the store count already lives on the Store Performance header). */}
        <KpiCard title="Total Sales" value={shownTotals.totalSales} format={inr} tone="blue" icon={TrendingUp} sharp />
        <KpiCard title="Payment Received" value={shownTotals.paymentReceived} format={inr} tone="emerald" icon={Wallet} sharp />
        <KpiCard title="Outstanding" value={shownTotals.outstanding} format={inr} tone="overdue" icon={ReceiptText} sharp />
        <KpiCard title="Tickets" value={shownTotals.tickets} tone="sky" icon={Ticket} sharp />
        <KpiCard title="Walk-Ins" value={shownTotals.walkIns} tone="violet" icon={ShoppingBag} sharp />
        <KpiCard title="Stock Value" value={shownTotals.stockValue} format={inr} tone="amber" icon={Package} sharp />
      </div>

      {/* ── Store Performance — the PRIMARY multi-store comparison surface ──
          A single enterprise data-table: sharp column grid, sticky header AND
          sticky total footer, with the store rows scrolling INTERNALLY so the
          page itself stays short and the header + totals are always in view no
          matter how many stores exist. The old duplicate store-card grid below
          it has been removed — this table is now the one place stores are
          compared. Horizontal scroll is confined to the table (never the page)
          so nothing clips at higher browser zoom. */}
      <div
        className="overflow-hidden bg-card shadow-card"
        style={{ border: "2px solid hsl(var(--rox-table-border))" }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-3.5"
          style={{ borderBottom: "2px solid hsl(var(--rox-table-border))" }}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
              <Building2 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-[15px] font-bold leading-tight text-slate-900">Store Performance</h3>
              <p className="text-[11.5px] text-muted-foreground">Compare every store, then open one with View Reports</p>
            </div>
          </div>
          {!loading && visibleRows.length > 0 && (
            <span className="shrink-0 rounded-full bg-[#EEF1FD] px-2.5 py-1 text-[11px] font-semibold text-[#3A4DBB] sm:inline-block">
              {visibleRows.length} store{visibleRows.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* The scroll container owns BOTH axes: vertical scroll for long store
            lists and horizontal scroll on narrow screens. The <thead>/<tfoot>
            are position:sticky against THIS container, so the header pins to the
            top and the Total pins to the bottom while rows scroll between them.

            Height is VIEWPORT-RELATIVE, not a hardcoded pixel value: it fills
            the space that remains after the topbar, page header, date strip,
            KPI cards and padding (~320px reserved), so the table lands inside
            the initial viewport on any screen. A min floor keeps a few rows +
            sticky header + sticky total usable on short laptops; a max ceiling
            stops it dominating very tall monitors. clamp() adapts automatically
            across small laptop / tablet / large monitor without media queries. */}
        <div className="overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [max-height:clamp(280px,calc(100vh-320px),620px)]">
          <table className="w-full min-w-[940px] table-fixed border-collapse text-left">
            {/* One shared column grid used by header, every row and the footer,
                so metrics line up perfectly. STORE is widest (identity + action);
                counts are compact; currency columns are wider. */}
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              {/* Clean light-grey header (not the previous blue fill), dark bold
                  text for strong readability, a firm bottom border to separate it
                  from the body, and 1px vertical dividers between every column so
                  columns are easy to scan. */}
              <tr className="text-[12px] font-bold uppercase tracking-wider text-slate-700 [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:border-b-2 [&>th]:border-b-slate-400 [&>th]:bg-slate-100 [&>th+th]:border-l [&>th+th]:border-l-slate-200">
                <th className="px-5 py-3.5 text-left">Store</th>
                <th className="px-3 py-3.5 text-center">Tickets</th>
                <th className="px-3 py-3.5 text-center">Pickup</th>
                <th className="px-3 py-3.5 text-center">Onsite</th>
                <th className="px-3 py-3.5 text-center">Walk-In</th>
                <th className="px-4 py-3.5 text-right">Total Sales</th>
                <th className="px-4 py-3.5 text-right">Payment Received</th>
                <th className="px-4 py-3.5 text-right">Avg / Day</th>
                <th className="px-4 py-3.5 text-right">Projection</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">Loading store metrics…</td></tr>
              )}
              {!loading && visibleRows.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">No stores to show.</td></tr>
              )}
              {!loading && visibleRows.map((s, i) => {
                return (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.02 * i, 0.2) }}
                  onClick={() => enterStore(s.id)}
                  style={{ borderTop: "1px solid hsl(var(--rox-table-divider))" }}
                  className="group cursor-pointer align-middle transition hover:bg-muted/40 [&>td+td]:border-l [&>td+td]:border-slate-200"
                >
                  {/* STORE — strongest hierarchy: name (primary) + View Reports
                      (secondary actionable link). Compact but comfortable height. */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                        {(s.code || s.name).slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[15px] font-bold leading-tight text-slate-900 group-hover:text-[#3A4DBB]">{s.name}</p>
                          {s.environment === "demo" && (
                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                              Demo
                            </span>
                          )}
                        </div>
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); enterStore(s.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); enterStore(s.id); } }}
                          className="mt-1 inline-flex items-center gap-1 rounded text-[12px] font-semibold text-[#4361EE] underline-offset-2 transition-colors hover:text-[#3A4DBB] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40"
                        >
                          View Reports
                          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </div>
                  </td>
                  {/* OPERATIONAL COUNTS — non-zero prominent, zero still readable */}
                  <td className={cn("px-3 py-3 text-center text-[15px] font-bold tabular-nums text-slate-900", zeroTone(s.tickets))}>{s.tickets}</td>
                  <td className={cn("px-3 py-3 text-center text-[15px] font-semibold tabular-nums text-slate-700", zeroTone(s.pickup))}>{s.pickup}</td>
                  <td className={cn("px-3 py-3 text-center text-[15px] font-semibold tabular-nums text-slate-700", zeroTone(s.onsite))}>{s.onsite}</td>
                  <td className={cn("px-3 py-3 text-center text-[15px] font-semibold tabular-nums text-slate-700", zeroTone(s.walkIns))}>{s.walkIns}</td>
                  {/* FINANCIALS — strongest numeric weight, right-aligned, semantic colour */}
                  <td className={cn("px-4 py-3 text-right text-[15px] font-bold tabular-nums text-slate-900", zeroTone(s.totalSales))}>{inr(s.totalSales)}</td>
                  <td className={cn("px-4 py-3 text-right text-[15px] font-bold tabular-nums text-emerald-700", zeroTone(s.paymentReceived))}>{inr(s.paymentReceived)}</td>
                  <td className={cn("px-4 py-3 text-right text-[14px] font-semibold tabular-nums text-slate-700", zeroTone(s.avgPerDay))}>{inr(s.avgPerDay)}</td>
                  {/* PROJECTION — this store's own normalized monthly figure:
                      its avg/day for the selected period × 31. Real data only. */}
                  <td className={cn("px-4 py-3 text-right text-[15px] font-bold tabular-nums text-[#4361EE]", zeroTone(projection(s.avgPerDay)))}>{inr(projection(s.avgPerDay))}</td>
                </motion.tr>
                );
              })}
            </tbody>
            {!loading && visibleRows.length > 0 && (
              <tfoot>
                {/* Sticky bottom Total — a real table footer aligned to the same
                    column grid (not a floating card). Stronger blue-tint, bold
                    type, top divider + subtle lift so it reads as the summary. */}
                {/* Total footer — same light-grey visual family as the header,
                    a firm top border to lift it off the body, bold readable
                    values, matching vertical column dividers, and semantic
                    colours preserved (emerald Payment Received, blue Projection). */}
                <tr className="text-slate-900 [&>td]:sticky [&>td]:bottom-0 [&>td]:z-10 [&>td]:border-t-2 [&>td]:border-t-slate-400 [&>td]:bg-slate-100 [&>td+td]:border-l [&>td+td]:border-l-slate-200">
                  <td className="px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide">Total</td>
                  <td className="px-3 py-3 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.tickets}</td>
                  <td className="px-3 py-3 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.pickup}</td>
                  <td className="px-3 py-3 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.onsite}</td>
                  <td className="px-3 py-3 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.walkIns}</td>
                  <td className="px-4 py-3 text-right text-[15px] font-extrabold tabular-nums">{inr(shownTotals.totalSales)}</td>
                  <td className="px-4 py-3 text-right text-[15px] font-extrabold tabular-nums text-emerald-700">{inr(shownTotals.paymentReceived)}</td>
                  <td className="px-4 py-3 text-right text-[14px] font-bold tabular-nums">{inr(shownTotals.avgPerDay)}</td>
                  {/* TOTAL PROJECTION — aggregate of the selected set's avg/day × 31. */}
                  <td className="px-4 py-3 text-right text-[15px] font-extrabold tabular-nums text-[#4361EE]">{inr(totalProjection)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
