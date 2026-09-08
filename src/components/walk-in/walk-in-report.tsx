"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Report — activity & conversion only. NO revenue metrics.

   Consumes the SAME filtered dataset the table shows (passed in as `rows`), so
   the report and table can never diverge. WON uses the single shared definition
   `isWalkInWon`.

   Layout:
     • A row of creative KPI cards (Direct / Marketing / Total / Won / SR).
     • A DATE-WISE breakdown table:  DATE · DIRECT · MARKETING · TOTAL · WON · SR
       where SR (Success Rate / conversion) = Won ÷ Total × 100 (one decimal, %).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { UserCheck, Megaphone, Layers, Trophy, TrendingUp } from "lucide-react";
import { type WalkIn, isWalkInWon } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

/** Success rate — Won ÷ Total × 100, one decimal, with a % sign. */
function successRate(won: number, total: number): string {
  if (total <= 0) return "—";
  return `${((won / total) * 100).toFixed(1)}%`;
}

/** Compact date label, e.g. "1 Jan 26". */
function fmtDay(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

export function WalkInReport({ rows }: { rows: WalkIn[] }) {
  const kpis = useMemo(() => {
    const direct = rows.filter((w) => (w.type ?? "direct") === "direct").length;
    const marketing = rows.filter((w) => w.type === "sales").length;
    const won = rows.filter((w) => isWalkInWon(w)).length;
    const total = rows.length;
    return { direct, marketing, total, won, sr: total > 0 ? (won / total) * 100 : 0 };
  }, [rows]);

  /* Date-wise breakdown — one row per calendar date, newest first. */
  const byDate = useMemo(() => {
    const map = new Map<string, { date: string; direct: number; marketing: number; total: number; won: number }>();
    for (const w of rows) {
      const key = w.date || "";
      const entry = map.get(key) || { date: key, direct: 0, marketing: 0, total: 0, won: 0 };
      if (w.type === "sales") entry.marketing += 1;
      else entry.direct += 1;
      entry.total += 1;
      if (isWalkInWon(w)) entry.won += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* ── Creative KPI cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard icon={UserCheck} label="Direct" value={kpis.direct} tone="sky" share={kpis.total ? kpis.direct / kpis.total : 0} />
        <KpiCard icon={Megaphone} label="Marketing" value={kpis.marketing} tone="violet" share={kpis.total ? kpis.marketing / kpis.total : 0} />
        <KpiCard icon={Layers} label="Total" value={kpis.total} tone="brand" share={1} />
        <KpiCard icon={Trophy} label="Won" value={kpis.won} tone="emerald" share={kpis.total ? kpis.won / kpis.total : 0} />
        <SrCard value={kpis.sr} won={kpis.won} total={kpis.total} />
      </div>

      {/* ── Date-wise breakdown table ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Date-wise Breakdown</h3>
          <p className="text-[11px] text-muted-foreground">Direct + Marketing = Total per day. SR = Won ÷ Total × 100.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#EEF1FD] text-left text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-3 py-3 text-right">Direct</th>
                <th className="px-3 py-3 text-right">Marketing</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Won</th>
                <th className="px-5 py-3 text-right">SR</th>
              </tr>
            </thead>
            <tbody>
              {byDate.map((d) => (
                <tr key={d.date || "unknown"} className="border-t border-border transition hover:bg-muted/40">
                  <td className="px-5 py-3 whitespace-nowrap font-medium">{fmtDay(d.date)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{d.direct}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{d.marketing}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{d.total}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-emerald-600">{d.won}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">{successRate(d.won, d.total)}</td>
                </tr>
              ))}
            </tbody>
            {byDate.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#4361EE]/20 bg-[#EEF1FD]/50 font-bold text-[#4361EE]">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{kpis.direct}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{kpis.marketing}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{kpis.total}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{kpis.won}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{successRate(kpis.won, kpis.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {byDate.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No walk-ins in the current view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Creative KPI card: icon, value, and a thin share bar ─────────────── */
const TONES: Record<string, { icon: string; bar: string; ring: string }> = {
  sky:     { icon: "bg-sky-50 text-sky-600 ring-sky-200",           bar: "bg-sky-500",     ring: "ring-sky-200" },
  violet:  { icon: "bg-violet-50 text-violet-600 ring-violet-200",   bar: "bg-violet-500",  ring: "ring-violet-200" },
  brand:   { icon: "bg-[#4361EE] text-white ring-[#4361EE]",         bar: "bg-[#4361EE]",   ring: "ring-indigo-200" },
  emerald: { icon: "bg-emerald-50 text-emerald-600 ring-emerald-200", bar: "bg-emerald-500", ring: "ring-emerald-200" },
};

function KpiCard({
  icon: Icon, label, value, tone, share,
}: {
  icon: any; label: string; value: number; tone: keyof typeof TONES | string; share: number;
}) {
  const t = TONES[tone] ?? TONES.brand;
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl ring-1 ring-inset", t.icon)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight tabular-nums">{value}</span>
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {/* Thin share bar — proportion of total this metric represents. */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-500", t.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── SR (Success Rate) card — a compact conversion gauge ──────────────── */
function SrCard({ value, won, total }: { value: number; won: number; total: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#4361EE] to-[#6366F1] p-4 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/30">
          <TrendingUp className="h-[18px] w-[18px]" />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight tabular-nums">
          {total > 0 ? `${value.toFixed(1)}%` : "—"}
        </span>
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-white/80">Success Rate</p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-white/70 tabular-nums">{won} won of {total}</p>
    </div>
  );
}
