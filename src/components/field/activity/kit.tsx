"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Field Activity layout kit — every page is built from the same pieces so they look and behave the same:
     KpiStrip   → the bordered summary boxes at the top
     ViewBar    → one connected view switch on the left, actions on the right
     Tables     → components/field/grid.tsx (FieldGrid: column reorder + freeze, zebra rows, sticky totals).
     usePaged   → page / page size state + the standard detached <Pagination> footer (10/20/50/100)
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";

export const PAGE_SIZES = [10, 20, 50, 100];

export interface Kpi { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad"; icon?: React.ComponentType<{ className?: string }> }
const TONE = { default: "", good: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700" };
export function KpiStrip({ items, loading }: { items: Kpi[]; loading?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4", items.length >= 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : "")}>
      {items.map((k) => (
        <div key={k.label} className="rounded-xl border-2 border-zinc-200 bg-card px-4 py-3.5 shadow-card transition hover:border-[#4361EE]/30">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">{k.icon && <k.icon className="h-3.5 w-3.5 text-[#4361EE]" />}{k.label}</p>
          <p className={cn("mt-1 text-[24px] font-extrabold leading-tight tabular-nums", TONE[k.tone ?? "default"])}>{loading ? "–" : k.value}</p>
          {k.sub != null && <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{loading ? "\u00a0" : k.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function ViewBar<T extends string>({ value, onChange, options, info, children }: {
  value?: T; onChange?: (v: T) => void; options?: { label: React.ReactNode; value: T }[]; info?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {options && value != null && onChange && <SegmentedTabs size="md" value={value} onChange={(v) => onChange(v as T)} options={options} />}
      {info && <InfoHint content={info} />}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Paging for one table. Resets to page 1 whenever `resetKey` (filters / view) changes. */
export function usePaged<T>(rows: T[], resetKey: string, initial = 20) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initial);
  useEffect(() => { setPage(1); }, [resetKey, size]);
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, totalPages);
  const slice = useMemo(() => rows.slice((cur - 1) * size, cur * size), [rows, cur, size]);
  const footer = (itemLabel: string) => (
    <Pagination page={cur} totalPages={totalPages} onPageChange={setPage} totalItems={rows.length} pageSize={size}
      pageSizeOptions={PAGE_SIZES} onPageSizeChange={(s) => setSize(s)} itemLabel={itemLabel} className="rox-lock-footer !py-0" />
  );
  return { slice, footer, page: cur, size };
}

export function Notice({ tone = "amber", icon: Icon, children, action }: { tone?: "amber" | "emerald" | "rose" | "blue"; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; action?: React.ReactNode }) {
  const t = { amber: "border-amber-200 bg-amber-50/70 text-amber-900", emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-900", rose: "border-rose-200 bg-rose-50/70 text-rose-900", blue: "border-[#4361EE]/20 bg-[#EEF1FD] text-[#2F46C4]" }[tone];
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border-2 px-4 py-2.5", t)}>
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1 text-[13px] font-semibold">{children}</div>
      {action}
    </div>
  );
}

export function Unavailable({ text }: { text: string }) {
  return <p className="rounded-2xl border border-border bg-card p-6 text-center text-[13px] text-muted-foreground">{text}</p>;
}
export function LoadError({ what, err }: { what: string; err: string }) {
  return <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load {what}: {err}</p>;
}
