"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { AnimatedNumber } from "@/components/dashboard/kpi-card";
import { itemHealth, STOCK_HEALTH_LABEL, STOCK_HEALTH_TONE, type InventoryItem, type StockHealth } from "@/lib/inventory-data";

/* ── Compact stat tile — icon + animated value + sublabel ─────────────────
   A denser sibling of KpiCard for dashboards with many metrics. */
const TONES = {
  brand:   { icon: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/60" },
  emerald: { icon: "text-emerald-700 bg-emerald-50 ring-emerald-200/60" },
  amber:   { icon: "text-amber-700 bg-amber-50 ring-amber-200/60" },
  rose:    { icon: "text-rose-700 bg-rose-50 ring-rose-200/60" },
  violet:  { icon: "text-violet-700 bg-violet-50 ring-violet-200/60" },
  sky:     { icon: "text-sky-700 bg-sky-50 ring-sky-200/60" },
  slate:   { icon: "text-slate-700 bg-slate-100 ring-slate-200/60" },
} as const;

export type StatTone = keyof typeof TONES;

export function StatTile({
  label, value, format, icon: Icon, tone = "brand", hint, delay = 0, onClick, active,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  hint?: string;
  delay?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  const t = TONES[tone];
  const Wrapper = onClick ? "button" : "div";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Wrapper
        onClick={onClick}
        className={cn(
          "group flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left shadow-card transition will-change-transform",
          onClick && "hover:-translate-y-0.5 hover:shadow-card-hover cursor-pointer",
          active ? "border-[#4361EE] ring-2 ring-brand-200/50" : "border-border"
        )}
      >
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset", t.icon)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display mt-0.5 text-2xl font-extrabold tracking-tight tnum">
            <AnimatedNumber value={value} format={format} />
          </p>
          {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </Wrapper>
    </motion.div>
  );
}

/* ── Stock health badge ──────────────────────────────────────────────── */
export function HealthBadge({ health }: { health: StockHealth }) {
  return (
    <Badge tone={STOCK_HEALTH_TONE[health].badge} dot>
      {STOCK_HEALTH_LABEL[health]}
    </Badge>
  );
}

export function ItemHealthBadge({ item }: { item: InventoryItem }) {
  return <HealthBadge health={itemHealth(item)} />;
}

/* ── Filter select — labelled dropdown used across module filter bars ──── */
export function FilterSelect({
  label, value, onChange, options, width = "w-52",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  width?: string;
}) {
  return (
    <Dropdown
      width={width}
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-[13px] font-medium transition",
            open ? "border-[#4361EE]" : "border-border hover:bg-muted"
          )}
        >
          <span className="text-muted-foreground">{label}:</span>
          <span className="max-w-[140px] truncate">{options.find((o) => o.value === value)?.label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          {options.map((o) => (
            <MenuItem key={o.value} onClick={() => { onChange(o.value); close(); }} className={cn(value === o.value && "bg-muted font-semibold")}>
              {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

/* ── Section card — consistent card with header + optional action ──────── */
export function SectionCard({
  title, description, action, icon: Icon, children, className, bodyClassName,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-card", className)}>
      <div className="flex items-start justify-between gap-3 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div>
            <h3 className="font-display text-base font-bold tracking-tight">{title}</h3>
            {description && <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", bodyClassName)}>{children}</div>
    </div>
  );
}
