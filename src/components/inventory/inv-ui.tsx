"use client";

/* Shared building blocks for the redesigned Inventory pages. */

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { isStockItem, STOCK_STATUS_LABEL, type StockStatus } from "@/lib/inventory-analytics";
import { SegmentedTabs } from "@/components/ui/tabs";

/* ── Data scope: store-scoped inventory + what this user may see ─────────── */
export function useInventoryScope() {
  const { inventory } = useStore();
  const { can } = usePermissions();
  const canViewCost = allow(can, CAP.sensitive.viewCost);
  const canCreate = allow(can, CAP.inventory.create);
  const canEdit = allow(can, CAP.inventory.edit);
  const stockItems = useMemo(() => inventory.filter(isStockItem), [inventory]);
  return { inventory, stockItems, canViewCost, canCreate, canEdit };
}

/* ── Page header (icon chip + title + subtitle + actions) ───────────────── */
export function InvPageHeader({
  icon: Icon, title, subtitle, actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#4361EE] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.6)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <motion.h1 initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[1.5rem] font-extrabold leading-tight tracking-tight">
            {title}
          </motion.h1>
          {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── KPI card ───────────────────────────────────────────────────────────── */
const KPI_TONE = {
  brand: "bg-[#EEF1FD] text-[#4361EE]",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  sky: "bg-sky-50 text-sky-600",
} as const;
export type KpiTone = keyof typeof KPI_TONE;

export function InvKpi({
  label, value, hint, icon: Icon, tone = "brand", href, hintTone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: KpiTone;
  href?: string;
  hintTone?: "muted" | "danger" | "success";
}) {
  const body = (
    <div
      className={cn(
        "flex h-full items-center justify-between gap-3 rounded-xl border-2 border-zinc-200 bg-card p-4 shadow-card transition",
        href && "hover:border-[#4361EE]/40 hover:shadow-card-hover"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate whitespace-nowrap text-[12px] font-semibold text-muted-foreground" title={label}>{label}</p>
        <p className="font-display mt-1 whitespace-nowrap text-[1.6rem] font-extrabold leading-none tracking-tight tabular-nums">{value}</p>
        {hint && (
          <p className={cn("mt-2 text-[11.5px] font-medium leading-snug", hintTone === "danger" ? "text-rose-600" : hintTone === "success" ? "text-emerald-600" : "text-muted-foreground")}>
            {hint}
          </p>
        )}
      </div>
      <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full", KPI_TONE[tone])}>
        <Icon className="h-6 w-6" />
      </span>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/* ── Panel card ─────────────────────────────────────────────────────────── */
export function Panel({
  title, action, children, className, bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Stock status pill (table pill standard: full-width, glyph + label) ─── */
const STATUS_STYLE: Record<StockStatus, { pill: string; dot: string }> = {
  in: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  low: { pill: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  out: { pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
};
export function StockStatusPill({ status }: { status: StockStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span title={STOCK_STATUS_LABEL[status]} className={cn("flex h-7 w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", s.pill)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
      <span className="truncate">{STOCK_STATUS_LABEL[status]}</span>
    </span>
  );
}

/* ── Item cell: thumbnail + name + code ─────────────────────────────────── */
export function ItemCell({ name, code, sub }: { name: string; code?: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
        <Package className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-semibold text-foreground" title={name}>{name}</p>
        {(code || sub) && <p className="truncate text-[11.5px] text-muted-foreground">{[code, sub].filter(Boolean).join(" · ")}</p>}
      </div>
    </div>
  );
}

/* ── Status filter strip (connected SegmentedTabs) ──────────────────────── */
export function StatusTabs<V extends string>({
  value, onChange, options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: React.ReactNode }[];
}) {
  return <SegmentedTabs size="sm" value={value} onChange={(v) => onChange(v as V)} options={options as never} />;
}
