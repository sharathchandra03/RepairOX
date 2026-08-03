"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Chart primitives (recharts wrappers)
   Consistent, restrained styling in the RepairOX palette. Charts are used only
   where they answer a business question — trends and comparisons — never for
   decoration.
   ────────────────────────────────────────────────────────────────────────── */

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { SeriesPoint } from "@/lib/reports/types";
import { formatINR, formatNumber } from "@/lib/utils";

const BRAND = "#4361EE";
const PALETTE = ["#4361EE", "#7C3AED", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#8B5CF6", "#F97316"];

function fmt(v: number, currency?: boolean) {
  return currency ? formatINR(v) : formatNumber(v);
}

const axisProps = {
  tick: { fontSize: 11, fill: "#6b7280" },
  axisLine: { stroke: "#e5e7eb" },
  tickLine: false,
} as const;

function TooltipContent({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium text-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-[11px] text-muted-foreground">
          <span className="font-semibold" style={{ color: p.color || p.fill }}>{p.name}: </span>
          {fmt(p.value, currency)}
        </p>
      ))}
    </div>
  );
}

export function BarChartView({ data, currency, height = 260, onClickBar }: { data: SeriesPoint[]; currency?: boolean; height?: number; onClickBar?: (p: SeriesPoint) => void }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={54} tickFormatter={(v) => (currency ? `₹${formatNumber(v)}` : formatNumber(v))} />
        <Tooltip content={<TooltipContent currency={currency} />} cursor={{ fill: "rgba(67,97,238,0.06)" }} />
        <Bar dataKey="value" name="Value" radius={[6, 6, 0, 0]} onClick={(_, idx) => onClickBar?.(data[idx])} cursor={onClickBar ? "pointer" : undefined}>
          {data.map((_, i) => <Cell key={i} fill={BRAND} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineChartView({ data, currency, height = 260 }: { data: SeriesPoint[]; currency?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={54} tickFormatter={(v) => (currency ? `₹${formatNumber(v)}` : formatNumber(v))} />
        <Tooltip content={<TooltipContent currency={currency} />} />
        <Line type="monotone" dataKey="value" name="Value" stroke={BRAND} strokeWidth={2.5} dot={{ r: 2.5, fill: BRAND }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaChartView({ data, currency, height = 260 }: { data: SeriesPoint[]; currency?: boolean; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <defs>
          <linearGradient id="repAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} width={54} tickFormatter={(v) => (currency ? `₹${formatNumber(v)}` : formatNumber(v))} />
        <Tooltip content={<TooltipContent currency={currency} />} />
        <Area type="monotone" dataKey="value" name="Value" stroke={BRAND} strokeWidth={2.5} fill="url(#repAreaFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PieChartView({ data, currency, height = 260 }: { data: SeriesPoint[]; currency?: boolean; height?: number }) {
  const top = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={top} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={48} paddingAngle={2}>
          {top.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip content={<TooltipContent currency={currency} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** A compact horizontal leaderboard bar list — great for top-N rankings. */
export function Leaderboard({ data, currency, onRowClick }: { data: SeriesPoint[]; currency?: boolean; onRowClick?: (p: SeriesPoint) => void }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <button
          key={d.key}
          onClick={() => onRowClick?.(d)}
          className="group w-full text-left"
          disabled={!onRowClick}
        >
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-2 truncate">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">{i + 1}</span>
              <span className="truncate font-medium">{d.label}</span>
            </span>
            <span className="ml-2 shrink-0 font-semibold tabular-nums">{fmt(d.value, currency)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#4361EE] transition-all group-hover:brightness-110"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
        </button>
      ))}
      {data.length === 0 && <p className="py-6 text-center text-[12px] text-muted-foreground">No data for this selection.</p>}
    </div>
  );
}

export function ChartByType({ type, data, currency }: { type: string; data: SeriesPoint[]; currency?: boolean }) {
  switch (type) {
    case "line": return <LineChartView data={data} currency={currency} />;
    case "area": return <AreaChartView data={data} currency={currency} />;
    case "pie": return <PieChartView data={data} currency={currency} />;
    case "leaderboard": return <Leaderboard data={data} currency={currency} />;
    case "stacked":
    case "bar":
    default: return <BarChartView data={data} currency={currency} />;
  }
}
