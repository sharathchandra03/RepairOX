"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Mini chart primitives
   ──────────────────────────────────────────────────────────────────────────
   Small, purposeful visuals for the executive cockpit: sparklines inside KPI
   cards, a labelled donut for revenue composition, and a stacked progress bar
   for collections risk. Restrained by design — no 3D, no exploding pies, no
   decorative animation.
   ────────────────────────────────────────────────────────────────────────── */

import { AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { cn, formatINR, formatNumber } from "@/lib/utils";
import { CATEGORICAL_PALETTE } from "./report-theme";
import type { SeriesPoint } from "@/lib/reports/types";

/* ─── Sparkline ─────────────────────────────────────────────────────────── */

export function Sparkline({ data, color = "#4361EE", height = 44 }: { data: SeriesPoint[]; color?: string; height?: number }) {
  if (data.length < 2) {
    return <div style={{ height }} className="flex items-center text-[10px] text-muted-foreground">Not enough data yet</div>;
  }
  const gradId = `spark-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Donut split with legend ───────────────────────────────────────────── */

function DonutTooltip({ active, payload, currency }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-foreground">{p.name}</p>
      <p className="text-[11px] text-muted-foreground">{currency ? formatINR(p.value) : formatNumber(p.value)}</p>
    </div>
  );
}

export function DonutSplit({
  data,
  currency = true,
  height = 220,
  colors = CATEGORICAL_PALETTE,
  centerLabel,
}: {
  data: SeriesPoint[];
  currency?: boolean;
  height?: number;
  colors?: string[];
  centerLabel?: { value: string; label: string };
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0 || total <= 0) return null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="62%" outerRadius="92%" paddingAngle={2} strokeWidth={0}>
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip content={<DonutTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[15px] font-extrabold tabular-nums leading-none">{centerLabel.value}</span>
            <span className="mt-0.5 text-[9.5px] text-muted-foreground">{centerLabel.label}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {data.map((d, i) => {
          const share = total ? (d.value / total) * 100 : 0;
          return (
            <div key={d.key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex items-center gap-2 truncate">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
                <span className="truncate text-muted-foreground">{d.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {currency ? formatINR(Math.round(d.value)) : formatNumber(Math.round(d.value))}
                <span className="ml-1.5 text-[10.5px] font-normal text-muted-foreground">{share.toFixed(0)}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Stacked progress bar (collections) ────────────────────────────────── */

export interface StackedSegment {
  label: string;
  value: number;
  color: string;
}

export function StackedProgressBar({ segments, total }: { segments: StackedSegment[]; total: number }) {
  const safeTotal = Math.max(1, total);
  return (
    <div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            style={{ width: `${Math.max(0, (s.value / safeTotal) * 100)}%`, background: s.color }}
            title={`${s.label}: ${formatINR(Math.round(s.value))}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {segments.map((s, i) => (
          <div key={i}>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</span>
            </div>
            <p className="mt-0.5 text-[15px] font-bold tabular-nums" style={{ color: s.color }}>{formatINR(Math.round(s.value))}</p>
            <p className="text-[10.5px] text-muted-foreground">{((s.value / safeTotal) * 100).toFixed(0)}% of billed</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Mini compare row (used in Operations / Financial widgets) ─────────── */

export function MiniCompareRow({
  current,
  previous,
  format,
}: {
  current: number;
  previous: number;
  format: (n: number) => string;
}) {
  return (
    <div className="mt-2 flex items-center gap-3 text-[10.5px] text-muted-foreground">
      <span>Current <strong className="font-semibold text-foreground">{format(current)}</strong></span>
      <span className="text-border">|</span>
      <span>Previous <strong className="font-semibold text-foreground">{format(previous)}</strong></span>
    </div>
  );
}

/* ─── Delta chip (shared visual language for movement) ──────────────────── */

export function DeltaChip({ deltaPct, higherIsBetter = true, size = "sm" }: { deltaPct: number | null; higherIsBetter?: boolean; size?: "sm" | "md" }) {
  if (deltaPct == null) {
    return <span className="text-[10.5px] text-muted-foreground">—</span>;
  }
  const up = deltaPct >= 0;
  const good = up === higherIsBetter;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-[12px]",
        good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%
    </span>
  );
}
