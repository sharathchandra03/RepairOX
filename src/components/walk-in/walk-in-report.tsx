"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Report — activity & conversion only. NO revenue metrics.

   Consumes the SAME filtered dataset the table shows (passed in as `rows`), so
   the report and table can never diverge (spec §38, §48). WON uses the single
   shared definition `isWalkInWon`.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { Users, UserCheck, Layers, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { type WalkIn, isWalkInWon } from "@/lib/mock-data";

export function WalkInReport({ rows }: { rows: WalkIn[] }) {
  const kpis = useMemo(() => {
    const direct = rows.filter((w) => (w.type ?? "direct") === "direct").length;
    const sales = rows.filter((w) => w.type === "sales").length;
    const won = rows.filter((w) => isWalkInWon(w)).length;
    return { direct, sales, total: rows.length, won };
  }, [rows]);

  // Sales-person breakdown — workload / activity / conversion (no revenue).
  const salesBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; assigned: number; won: number }>();
    for (const w of rows) {
      if (w.type !== "sales") continue;
      const key = w.salesPersonId || w.salesPersonName || "__unassigned__";
      const name = w.salesPersonName || (w.salesPersonId ? w.salesPersonId : "Unassigned");
      const entry = map.get(key) || { name, assigned: 0, won: 0 };
      entry.assigned += 1;
      if (isWalkInWon(w)) entry.won += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.assigned - a.assigned);
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* KPI cards — Direct / Sales / Total / Won */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={UserCheck} label="Direct" value={kpis.direct} />
        <KpiCard icon={Users} label="Sales" value={kpis.sales} />
        <KpiCard icon={Layers} label="Total" value={kpis.total} accent />
        <KpiCard icon={Trophy} label="Won" value={kpis.won} tone="emerald" />
      </div>

      {/* Sales Person Performance */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Sales Person Performance</h3>
          <p className="text-[11px] text-muted-foreground">Workload &amp; conversion for Sales walk-ins in the current view.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#EEF1FD] text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">
              <tr>
                <th className="px-5 py-3">Sales Person</th>
                <th className="px-3 py-3 text-right">Walk-Ins Assigned</th>
                <th className="px-3 py-3 text-right">Won</th>
                <th className="px-5 py-3 text-right">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {salesBreakdown.map((s) => {
                const conv = s.assigned > 0 ? Math.round((s.won / s.assigned) * 100) : 0;
                return (
                  <tr key={s.name} className="border-t border-border">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={s.name} size={26} />
                        <span className="text-[13px] font-medium">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.assigned}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-emerald-600">{s.won}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{conv}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {salesBreakdown.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No Sales walk-ins in the current view.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  accent,
}: {
  icon: any;
  label: string;
  value: number;
  tone?: "emerald";
  accent?: boolean;
}) {
  const iconCls = tone === "emerald"
    ? "bg-emerald-50 text-emerald-600 ring-emerald-200"
    : accent
      ? "bg-[#4361EE] text-white ring-[#4361EE]"
      : "bg-indigo-50 text-[#4361EE] ring-indigo-200";
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ring-inset ${iconCls}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold tracking-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}
