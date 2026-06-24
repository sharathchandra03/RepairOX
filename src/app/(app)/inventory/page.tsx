"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  Wallet, Boxes, AlertTriangle, PackageX, TrendingDown, RefreshCw, Gauge,
  Layers, ArrowRight, ArrowDownToLine, ArrowUpToLine, BadgeCheck, Activity,
  Sparkles, AlertCircle, Info, ChevronRight, PackageMinus, PackagePlus, SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatTile, SectionCard } from "@/components/inventory/widgets";
import { formatINR, formatNumber, cn } from "@/lib/utils";
import {
  inventoryStats, topSelling, topPurchased, recentActivity, recommendations,
  STOCK_HEALTH_LABEL, STOCK_HEALTH_TONE, LAST_UPDATED, type StockHealth,
} from "@/lib/inventory-data";

const HEALTH_COLORS: Record<StockHealth, string> = {
  negative: "#F43F5E",
  low: "#F59E0B",
  reorder: "#3B82F6",
  optimum: "#10B981",
  high: "#8B5CF6",
  excess: "#4361EE",
};

const ACTIVITY_ICON = {
  inward: { icon: ArrowDownToLine, tone: "text-emerald-700 bg-emerald-50 ring-emerald-200/60" },
  outward: { icon: ArrowUpToLine, tone: "text-sky-700 bg-sky-50 ring-sky-200/60" },
  adjust: { icon: SlidersHorizontal, tone: "text-amber-700 bg-amber-50 ring-amber-200/60" },
  approval: { icon: BadgeCheck, tone: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/60" },
  alert: { icon: AlertTriangle, tone: "text-rose-700 bg-rose-50 ring-rose-200/60" },
} as const;

const REC_ICON = { danger: AlertCircle, warning: AlertTriangle, info: Info } as const;
const REC_TONE = {
  danger: "border-rose-200 bg-rose-50/60 text-rose-600",
  warning: "border-amber-200 bg-amber-50/60 text-amber-600",
  info: "border-[#B3BFF6]/60 bg-[#EEF1FD]/60 text-[#4361EE]",
} as const;

export default function InventoryDashboard() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState(LAST_UPDATED);
  const s = inventoryStats();

  const health = (
    [
      ["optimum", s.optimum],
      ["high", s.high],
      ["excess", s.excess],
      ["reorder", s.reorder],
      ["low", s.low],
      ["negative", s.negative],
    ] as [StockHealth, number][]
  ).filter(([, v]) => v > 0);
  const healthTotal = health.reduce((a, [, v]) => a + v, 0) || 1;
  const healthData = health.map(([k, v]) => ({ name: STOCK_HEALTH_LABEL[k], value: v, color: HEALTH_COLORS[k] }));
  const healthyPct = Math.round(((s.optimum + s.high) / healthTotal) * 100);

  function refresh() {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setUpdated("Just now");
    }, 900);
  }

  const toMaster = (status?: string) =>
    router.push(`/inventory/item-master${status ? `?status=${status}` : ""}`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory Management"
        title="Inventory Overview"
        subtitle={`Last updated · ${updated}`}
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
            <Link href="/inventory/item-master">
              <Button size="sm" className="gap-1.5 rounded-full">
                <Boxes className="h-3.5 w-3.5" /> View Item Master
              </Button>
            </Link>
          </>
        }
      />

      {/* Primary KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Inventory Value" value={s.value} format={formatINR} tone="emerald" delta={{ value: "+4.2%", up: true }} hint={`${formatNumber(s.totalUnits)} units in stock`} />
        <KpiCard title="Total Items" value={s.count} tone="sky" delta={{ value: "+6", up: true }} hint="Across all stores & categories" />
        <KpiCard title="Low Stock" value={s.low} tone="amber" delta={{ value: "needs action", up: false }} hint="Below minimum level" />
        <KpiCard title="Excess Stock" value={s.excess} tone="violet" delta={{ value: "review", up: true }} hint="Above maximum level" />
      </div>

      {/* Secondary stat tiles — clickable drill-down into Item Master */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Negative Stock" value={s.negative} icon={PackageX} tone="rose" hint="Requires correction" delay={0.02} onClick={() => toMaster("negative")} />
        <StatTile label="Reorder" value={s.reorder} icon={TrendingDown} tone="sky" hint="Approaching minimum" delay={0.04} onClick={() => toMaster("low")} />
        <StatTile label="Optimum" value={s.optimum} icon={Gauge} tone="emerald" hint="Healthy range" delay={0.06} onClick={() => toMaster()} />
        <StatTile label="High Stock" value={s.high} icon={Layers} tone="violet" hint="Near maximum" delay={0.08} onClick={() => toMaster()} />
        <StatTile label="Pending Approvals" value={s.pendingApprovals} icon={BadgeCheck} tone="amber" hint="Awaiting action" delay={0.1} onClick={() => router.push("/inventory/approvals")} />
      </div>

      {/* Health overview + recommendations */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          icon={Gauge}
          title="Inventory Health Overview"
          description="Distribution of items across stock-level bands"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[180px_1fr]">
            <div className="relative mx-auto h-[180px] w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthData} dataKey="value" innerRadius={62} outerRadius={84} paddingAngle={3} stroke="none">
                    {healthData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="font-display text-3xl font-extrabold tracking-tight">{healthyPct}%</p>
                  <p className="text-[11px] font-medium text-muted-foreground">Healthy</p>
                </div>
              </div>
            </div>
            <div className="space-y-2.5">
              {health.map(([k, v], i) => (
                <motion.div
                  key={k}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex items-center gap-3"
                >
                  <span className="w-[110px] shrink-0 text-[12px] font-medium text-muted-foreground">{STOCK_HEALTH_LABEL[k]}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(v / healthTotal) * 100}%` }}
                      transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.05 * i }}
                      className={cn("h-full rounded-full", STOCK_HEALTH_TONE[k].bar)}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-right text-[12px] font-semibold tnum">{v}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={Sparkles}
          title="Recommendations"
          description="Smart actions to optimise stock"
        >
          <ul className="space-y-2.5">
            {recommendations.map((r, i) => {
              const Icon = REC_ICON[r.tone];
              return (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className={cn("flex items-start gap-3 rounded-xl border p-3 transition hover:shadow-sm", REC_TONE[r.tone])}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground">{r.detail}</p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-40" />
                </motion.li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      {/* Top selling / purchased + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard icon={PackageMinus} title="Top Selling Items" description="By units sold (30 days)">
          <RankList rows={topSelling.map((i) => ({ name: i.name, sub: i.category, value: i.soldUnits }))} accent="emerald" />
        </SectionCard>

        <SectionCard icon={PackagePlus} title="Top Purchased Items" description="By units purchased (30 days)">
          <RankList rows={topPurchased.map((i) => ({ name: i.name, sub: i.category, value: i.purchasedUnits }))} accent="brand" />
        </SectionCard>

        <SectionCard
          icon={Activity}
          title="Recent Activity"
          description="Latest stock movements"
          action={
            <Link href="/inventory/stock-movement" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <ul className="space-y-1">
            {recentActivity.map((a, i) => {
              const cfg = ACTIVITY_ICON[a.kind];
              const Icon = cfg.icon;
              return (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/50"
                >
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset", cfg.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight">{a.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{a.meta}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">{a.time}</span>
                </motion.li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function RankList({ rows, accent }: { rows: { name: string; sub: string; value: number }[]; accent: "emerald" | "brand" }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const bar = accent === "emerald" ? "bg-emerald-500" : "bg-[#4361EE]";
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <motion.li
          key={r.name}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold leading-tight">{r.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{r.sub}</p>
              </div>
            </div>
            <span className="shrink-0 text-[13px] font-bold tnum">{r.value}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(r.value / max) * 100}%` }}
              transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.05 * i }}
              className={cn("h-full rounded-full", bar)}
            />
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
