"use client";
/* RepairOX — Field Insights comparison charts (SVG/CSS, no chart library).
   • CompareBars — the chosen entities side by side, one column per chosen
     metric. Each column is scaled to its OWN max (₹ and counts never share an
     axis), the real value is printed on every bar, and "vs previous period"
     adds a marker + change. Hovering a row shows every number for it.
   • TrendLines — one metric over time for the chosen entities, with a hover
     crosshair that lists the exact value of every line at that point. */
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  metricDef, metricValue, formatMetric, shortMetric, pctDelta,
  type InsightRow, type MetricKey, type TrendBucket,
} from "@/lib/field-insights";

export const ENTITY_COLORS = ["#4361EE", "#10B981", "#F59E0B", "#8B5CF6", "#E11D48", "#0EA5E9", "#14B8A6", "#F97316"];

function Delta({ cur, prev, k }: { cur: number | null; prev: number | null; k: MetricKey }) {
  const d = metricDef(k);
  if (d.kind === "pct") {
    if (cur == null || prev == null) return null;
    const pts = cur - prev;
    const good = pts === 0 ? null : (pts > 0) === d.higherIsBetter;
    return <span className={cn("text-[10.5px] font-semibold tabular-nums", good == null ? "text-muted-foreground" : good ? "text-emerald-600" : "text-rose-600")}>{pts > 0 ? "▲" : pts < 0 ? "▼" : "•"} {Math.abs(pts)} pts</span>;
  }
  const p = pctDelta(cur, prev);
  if (p == null) return prev === 0 && (cur ?? 0) > 0 ? <span className="text-[10.5px] font-semibold text-emerald-600">new</span> : null;
  const good = p === 0 ? null : (p > 0) === d.higherIsBetter;
  return <span className={cn("text-[10.5px] font-semibold tabular-nums", good == null ? "text-muted-foreground" : good ? "text-emerald-600" : "text-rose-600")}>{p > 0 ? "▲" : p < 0 ? "▼" : "•"} {Math.abs(p)}%</span>;
}

export function CompareBars({ rows, prev, metrics, showPrev, colorOf }: {
  rows: InsightRow[]; prev: Map<string, InsightRow>; metrics: MetricKey[]; showPrev: boolean; colorOf: (key: string) => string;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const max = useMemo(() => Object.fromEntries(metrics.map((m) => {
    const vals = rows.map((r) => metricValue(r, m) ?? 0);
    if (showPrev) rows.forEach((r) => vals.push(metricValue(prev.get(r.key), m) ?? 0));
    const top = Math.max(0, ...vals);
    return [m, metricDef(m).kind === "pct" ? 100 : top || 1];
  })) as Record<MetricKey, number>, [rows, prev, metrics, showPrev]);

  if (rows.length === 0) return <p className="py-10 text-center text-[12.5px] text-muted-foreground">Nothing to compare in this selection.</p>;
  const cols = `minmax(150px,200px) repeat(${metrics.length}, minmax(150px, 1fr))`;
  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <div className="min-w-[560px]" role="table" aria-label="Comparison">
        <div role="row" className="grid items-end gap-4 border-b border-border pb-2" style={{ gridTemplateColumns: cols }}>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Compared</span>
          {metrics.map((m) => (
            <span key={m} role="columnheader" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: metricDef(m).color }} />{metricDef(m).label}
            </span>
          ))}
        </div>
        {rows.map((r) => {
          const p = prev.get(r.key);
          return (
            <div key={r.key} role="row" onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}
              className={cn("relative grid items-center gap-4 rounded-xl px-0 py-2.5 transition-colors", hover === r.key && "bg-[#EEF1FD]/60")} style={{ gridTemplateColumns: cols }}>
              <span className="flex min-w-0 items-center gap-2 pl-1">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(r.key) }} />
                <span className="truncate text-[13px] font-semibold" title={r.label}>{r.label}</span>
              </span>
              {metrics.map((m) => {
                const v = metricValue(r, m), pv = metricValue(p, m);
                const w = v == null ? 0 : Math.min(100, (v / max[m]) * 100);
                const pw = pv == null ? null : Math.min(100, (pv / max[m]) * 100);
                return (
                  <div key={m} role="cell" className="min-w-0">
                    <div className="relative h-6 overflow-visible rounded-full bg-muted/70">
                      <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: metricDef(m).color }}
                        initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.max(w, v ? 2 : 0)}%` }}
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 24 }} />
                      {showPrev && pw != null && (
                        <span aria-hidden title={`Previous: ${formatMetric(pv, m)}`} className="absolute -bottom-1 -top-1 w-[2px] rounded-full bg-zinc-800/70" style={{ left: `calc(${pw}% - 1px)` }} />
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-[12.5px] font-bold tabular-nums">{formatMetric(v, m)}</span>
                      {showPrev && <><span className="text-[10.5px] text-muted-foreground tabular-nums">prev {shortMetric(pv, m)}</span><Delta cur={v} prev={pv} k={m} /></>}
                    </div>
                  </div>
                );
              })}
              {hover === r.key && (
                <div className="pointer-events-none absolute left-[170px] top-full z-20 mt-1 min-w-[220px] rounded-xl border border-border bg-card px-3 py-2 text-[12px] shadow-lg">
                  <p className="mb-1 font-bold">{r.label}</p>
                  {metrics.map((m) => (
                    <p key={m} className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: metricDef(m).color }} />{metricDef(m).label}</span>
                      <span className="tabular-nums"><strong>{formatMetric(metricValue(r, m), m)}</strong>{showPrev && <span className="text-muted-foreground"> · prev {formatMetric(metricValue(p, m), m)}</span>}</span>
                    </p>
                  ))}
                  <p className="mt-1 border-t border-border pt-1 text-muted-foreground">Pickup {r.pickup} · On-Site {r.onsite} · Drop {r.drop}</p>
                </div>
              )}
            </div>
          );
        })}
        {showPrev && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="inline-block h-3 w-[2px] rounded-full bg-zinc-800/70" /> marks the previous period. Each column is scaled to its own highest value.</p>}
        {!showPrev && <p className="mt-2 text-[11px] text-muted-foreground">Each column is scaled to its own highest value, so money and counts are never drawn on one axis.</p>}
      </div>
    </div>
  );
}

export function TrendLines({ buckets, series, entities, metric }: {
  buckets: TrendBucket[]; series: Record<string, (number | null)[]>; entities: { key: string; label: string; color: string }[]; metric: MetricKey;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 260, padL = 44, padR = 12, padT = 14, padB = 26;
  const cw = W - padL - padR, ch = H - padT - padB;
  const all = entities.flatMap((e) => (series[e.key] ?? []).filter((v): v is number => v != null));
  const top = metricDef(metric).kind === "pct" ? 100 : Math.max(1, ...all);
  const n = buckets.length;
  const xOf = (i: number) => padL + (n <= 1 ? cw / 2 : (i / (n - 1)) * cw);
  const yOf = (v: number) => padT + ch - (v / top) * ch;
  const labelEvery = Math.max(1, Math.ceil(n / 10));
  const ticks = [0.25, 0.5, 0.75, 1].map((g) => g * top);
  if (!n || entities.length === 0) return <p className="py-10 text-center text-[12.5px] text-muted-foreground">Pick at least one item above to see the trend.</p>;
  const hb = hover != null ? buckets[hover] : null;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[280px] w-full" role="img" aria-label={`${metricDef(metric).label} over time`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
            <text x={padL - 6} y={yOf(v) + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>{shortMetric(Math.round(v * 10) / 10, metric)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={yOf(0)} y2={yOf(0)} stroke="currentColor" className="text-border" />
        {buckets.map((b, i) => i % labelEvery === 0 && (
          <text key={b.key} x={xOf(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>{b.label}</text>
        ))}
        {hover != null && <line x1={xOf(hover)} x2={xOf(hover)} y1={padT} y2={padT + ch} stroke="#4361EE" strokeOpacity={0.35} />}
        {entities.map((e) => {
          const vals = series[e.key] ?? [];
          let d = ""; let pen = false;
          vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${xOf(i)},${yOf(v)} `; pen = true; });
          return (
            <g key={e.key}>
              <path d={d} fill="none" stroke={e.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {vals.map((v, i) => v != null && (n <= 31 || hover === i) && <circle key={i} cx={xOf(i)} cy={yOf(v)} r={hover === i ? 4 : 2.4} fill="#fff" stroke={e.color} strokeWidth={2} />)}
            </g>
          );
        })}
        {buckets.map((b, i) => (
          <rect key={b.key} x={xOf(i) - (n <= 1 ? cw / 2 : cw / (n - 1) / 2)} y={padT} width={n <= 1 ? cw : cw / (n - 1)} height={ch} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hb && hover != null && (
        <div className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-xl border border-border bg-card px-3 py-2 text-[12px] shadow-lg"
          style={{ left: `${Math.min(74, Math.max(2, (xOf(hover) / W) * 100 - 10))}%` }}>
          <p className="mb-1 font-bold">{hb.label}</p>
          {entities.map((e) => (
            <p key={e.key} className="flex items-center justify-between gap-4">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} /><span className="truncate">{e.label}</span></span>
              <strong className="tabular-nums">{formatMetric(series[e.key]?.[hover] ?? null, metric)}</strong>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
