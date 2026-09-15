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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2, Ticket, ShoppingBag, ReceiptText, Wallet, Package,
  ChevronRight, TrendingUp, ArrowRight, Store as StoreIcon, CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { cn } from "@/lib/utils";

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
  id: string; name: string; code: string | null; address: string | null; isActive: boolean;
  tickets: number; walkIns: number; invoices: number; pickup: number; onsite: number;
  totalSales: number; paymentReceived: number; outstanding: number; stockValue: number; avgPerDay: number;
}
interface SummaryTotals {
  tickets: number; walkIns: number; invoices: number; pickup: number; onsite: number;
  totalSales: number; paymentReceived: number; outstanding: number; stockValue: number; avgPerDay: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Softer tone for zero values so active data stands out at a glance, without
 *  hiding the zero (meaning is preserved). */
const zeroMuted = (n: number) => (n === 0 ? "text-slate-300" : "");

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

  // When a specific store is selected in the header, scope the visible rows to
  // it so All-Shops ↔ single-store stay consistent with the header selection.
  const visibleRows = useMemo(
    () => (isAllShops ? rows : rows.filter((r) => r.id === activeStoreId)),
    [rows, isAllShops, activeStoreId]
  );

  const shownTotals = useMemo<SummaryTotals>(() => {
    if (isAllShops && totals) return totals;
    return visibleRows.reduce<SummaryTotals>(
      (t, s) => ({
        tickets: t.tickets + s.tickets, walkIns: t.walkIns + s.walkIns, invoices: t.invoices + s.invoices,
        pickup: t.pickup + s.pickup, onsite: t.onsite + s.onsite, totalSales: t.totalSales + s.totalSales,
        paymentReceived: t.paymentReceived + s.paymentReceived, outstanding: t.outstanding + s.outstanding,
        stockValue: t.stockValue + s.stockValue, avgPerDay: t.avgPerDay + s.avgPerDay,
      }),
      { tickets: 0, walkIns: 0, invoices: 0, pickup: 0, onsite: 0, totalSales: 0, paymentReceived: 0, outstanding: 0, stockValue: 0, avgPerDay: 0 }
    );
  }, [isAllShops, totals, visibleRows]);

  function enterStore(id: string) {
    setActiveStore(id);
    router.push("/dashboard");
  }

  const contextLabel = isAllShops ? "All Shops" : stores.find((s) => s.id === activeStoreId)?.name ?? "Store";

  if (authReady && currentUser && !isOwner) {
    return <div className="h-[40vh]" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization / Overview"
        title="Owner Dashboard"
        subtitle={isAllShops
          ? "Consolidated performance across every store in your organization."
          : `Focused on ${contextLabel}. Switch to All Shops in the header for the full picture.`}
      />

      {/* Date filter strip — works together with the header store selector. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-[12px] font-semibold text-[#3A4DBB]">
          {isAllShops ? <Building2 className="h-3.5 w-3.5" /> : <StoreIcon className="h-3.5 w-3.5" />}
          {contextLabel}
        </span>
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

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {error}
        </div>
      )}

      {/* Consolidated KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Total Sales" value={shownTotals.totalSales} format={inr} tone="blue" icon={TrendingUp}
          hint={`${visibleRows.length} store${visibleRows.length !== 1 ? "s" : ""}`} />
        <KpiCard title="Payment Received" value={shownTotals.paymentReceived} format={inr} tone="emerald" icon={Wallet} />
        <KpiCard title="Outstanding" value={shownTotals.outstanding} format={inr} tone="overdue" icon={ReceiptText} />
        <KpiCard title="Tickets" value={shownTotals.tickets} tone="sky" icon={Ticket} />
        <KpiCard title="Walk-Ins" value={shownTotals.walkIns} tone="violet" icon={ShoppingBag} />
        <KpiCard title="Stock Value" value={shownTotals.stockValue} format={inr} tone="amber" icon={Package} />
      </div>

      {/* Store comparison table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
              <Building2 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-[15px] font-bold leading-tight">Store Performance</h3>
              <p className="text-[11.5px] text-muted-foreground">Click any store to open its dashboard</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] table-fixed text-left">
            {/* Fixed column grid so every metric aligns vertically row-to-row,
                with generous width for currency so values never collide. */}
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[44px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-[#F7F8FE] text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                <th className="px-5 py-3.5 text-left">Store</th>
                <th className="px-3 py-3.5 text-center">Tickets</th>
                <th className="px-3 py-3.5 text-center">Pickup</th>
                <th className="px-3 py-3.5 text-center">Onsite</th>
                <th className="px-3 py-3.5 text-center">Walk-In</th>
                <th className="px-4 py-3.5 text-right">Total Sales</th>
                <th className="px-4 py-3.5 text-right">Payment Received</th>
                <th className="px-4 py-3.5 text-right">Avg / Day</th>
                <th className="px-4 py-3.5 text-right">Outstanding</th>
                <th className="px-4 py-3.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="px-5 py-10 text-center text-muted-foreground">Loading store metrics…</td></tr>
              )}
              {!loading && visibleRows.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-10 text-center text-muted-foreground">No stores to show.</td></tr>
              )}
              {!loading && visibleRows.map((s, i) => {
                const hasActivity = s.tickets > 0 || s.walkIns > 0 || s.totalSales > 0;
                return (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * i }}
                  onClick={() => enterStore(s.id)}
                  className={cn(
                    "group cursor-pointer border-b border-border/60 transition-colors hover:bg-[#F5F7FF]",
                    // Stores that actually have data get a very light tint so
                    // they read as the meaningful rows; empty stores stay clean.
                    hasActivity && "bg-[#FAFBFF]"
                  )}
                >
                  {/* STORE — strongest hierarchy in the row */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                        {(s.code || s.name).slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold leading-tight text-slate-800 group-hover:text-[#3A4DBB]">{s.name}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{s.isActive ? "Active" : "Inactive"}</p>
                      </div>
                    </div>
                  </td>
                  {/* OPERATIONAL COUNTS — bold, centered, zeros softened */}
                  <td className={cn("px-3 py-4 text-center text-[15px] font-bold tabular-nums text-slate-800", zeroMuted(s.tickets))}>{s.tickets}</td>
                  <td className={cn("px-3 py-4 text-center text-[15px] font-semibold tabular-nums text-slate-700", zeroMuted(s.pickup))}>{s.pickup}</td>
                  <td className={cn("px-3 py-4 text-center text-[15px] font-semibold tabular-nums text-slate-700", zeroMuted(s.onsite))}>{s.onsite}</td>
                  <td className={cn("px-3 py-4 text-center text-[15px] font-semibold tabular-nums text-slate-700", zeroMuted(s.walkIns))}>{s.walkIns}</td>
                  {/* FINANCIALS — strongest numeric weight, right-aligned, semantic colour */}
                  <td className={cn("px-4 py-4 text-right text-[15px] font-bold tabular-nums text-slate-900", zeroMuted(s.totalSales))}>{inr(s.totalSales)}</td>
                  <td className={cn("px-4 py-4 text-right text-[15px] font-bold tabular-nums text-emerald-700", zeroMuted(s.paymentReceived))}>{inr(s.paymentReceived)}</td>
                  <td className={cn("px-4 py-4 text-right text-[14px] font-semibold tabular-nums text-slate-600", zeroMuted(s.avgPerDay))}>{inr(s.avgPerDay)}</td>
                  <td className={cn("px-4 py-4 text-right text-[15px] font-bold tabular-nums text-[#C4506B]", zeroMuted(s.outstanding))}>{inr(s.outstanding)}</td>
                  <td className="px-4 py-4 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
                  </td>
                </motion.tr>
                );
              })}
            </tbody>
            {!loading && visibleRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#B3BFF6]/60 bg-[#EEF1FD] text-[#3A4DBB]">
                  <td className="px-5 py-4 text-[13px] font-extrabold uppercase tracking-wide">Total</td>
                  <td className="px-3 py-4 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.tickets}</td>
                  <td className="px-3 py-4 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.pickup}</td>
                  <td className="px-3 py-4 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.onsite}</td>
                  <td className="px-3 py-4 text-center text-[15px] font-extrabold tabular-nums">{shownTotals.walkIns}</td>
                  <td className="px-4 py-4 text-right text-[15px] font-extrabold tabular-nums">{inr(shownTotals.totalSales)}</td>
                  <td className="px-4 py-4 text-right text-[15px] font-extrabold tabular-nums">{inr(shownTotals.paymentReceived)}</td>
                  <td className="px-4 py-4 text-right text-[14px] font-bold tabular-nums">{inr(shownTotals.avgPerDay)}</td>
                  <td className="px-4 py-4 text-right text-[15px] font-extrabold tabular-nums">{inr(shownTotals.outstanding)}</td>
                  <td className="px-4 py-4"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Store quick-enter cards (mobile-friendly drill-in) */}
      {isAllShops && !loading && visibleRows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((s) => (
            <button
              key={s.id}
              onClick={() => enterStore(s.id)}
              className="group flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-[#4361EE]/40 hover:shadow-card-hover"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                  <StoreIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[14px] font-bold">{s.name}</p>
                  <p className="text-[12px] text-muted-foreground">{s.tickets} tickets · {inr(s.totalSales)}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
