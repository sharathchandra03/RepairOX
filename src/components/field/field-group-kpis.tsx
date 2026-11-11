"use client";
/* RepairOX — Pickup & Drop grouped KPI cards (modelled on the Lead dashboard's
   KpiGroupCard): one primary figure + related supporting figures + a progress
   bar. The whole card and each supporting figure are independently clickable
   queue filters; the active one is ringed. Colour is semantic and never the only
   signal (labels + aria-pressed). */
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiTone } from "@/components/field/field-kpi-cards";

const T: Record<KpiTone, { card: string; border: string; rail: string; tile: string; bar: string; ring: string }> = {
  sky:     { card: "from-sky-100/90 via-sky-50 to-white",         border: "border-sky-200",     rail: "from-sky-400 to-blue-600",       tile: "from-sky-400 to-blue-600",       bar: "from-sky-400 to-blue-500",       ring: "ring-sky-500/50" },
  slate:   { card: "from-slate-200/80 via-slate-100 to-white",    border: "border-slate-300",   rail: "from-slate-400 to-slate-600",    tile: "from-slate-500 to-slate-700",    bar: "from-slate-400 to-slate-600",    ring: "ring-slate-500/50" },
  amber:   { card: "from-amber-100/90 via-amber-50 to-white",     border: "border-amber-200",   rail: "from-amber-400 to-orange-500",   tile: "from-amber-400 to-orange-500",   bar: "from-amber-400 to-orange-500",   ring: "ring-amber-500/50" },
  teal:    { card: "from-teal-100/90 via-emerald-50 to-white",    border: "border-teal-200",    rail: "from-teal-400 to-emerald-600",   tile: "from-teal-400 to-emerald-600",   bar: "from-teal-400 to-emerald-500",   ring: "ring-teal-500/50" },
  violet:  { card: "from-violet-100/90 via-violet-50 to-white",   border: "border-violet-200",  rail: "from-violet-400 to-indigo-600",  tile: "from-violet-400 to-indigo-600",  bar: "from-violet-400 to-indigo-500",  ring: "ring-violet-500/50" },
  rose:    { card: "from-rose-100/90 via-rose-50 to-white",       border: "border-rose-200",    rail: "from-rose-400 to-red-600",       tile: "from-rose-400 to-red-600",       bar: "from-rose-400 to-red-500",       ring: "ring-rose-500/50" },
  emerald: { card: "from-emerald-100/90 via-emerald-50 to-white", border: "border-emerald-200", rail: "from-emerald-400 to-green-600",  tile: "from-emerald-400 to-green-600",  bar: "from-emerald-400 to-green-500",  ring: "ring-emerald-500/50" },
};

export interface GroupSupport {
  label: string;
  value: string | number;
  /** Omit for a read-only figure. */
  onClick?: () => void;
  active?: boolean;
  alert?: boolean;
}
export interface GroupKpi {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: KpiTone;
  primary: string | number;
  description: string;
  /** 0–1 */
  progress?: number;
  progressAlert?: boolean;
  urgent?: boolean;
  active?: boolean;
  onClick?: () => void;
  support: GroupSupport[];
}

export function FieldGroupKpis({ items }: { items: GroupKpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Trip queues">
      {items.map((k) => {
        const t = T[k.tone];
        const pct = typeof k.progress === "number" ? Math.max(0, Math.min(1, k.progress)) : null;
        const Wrapper: any = k.onClick ? "button" : "div";
        return (
          <Wrapper
            key={k.key}
            {...(k.onClick ? { type: "button", onClick: k.onClick, "aria-pressed": !!k.active } : {})}
            className={cn(
              "group relative flex min-h-[168px] w-full flex-col overflow-hidden rounded-2xl border-2 bg-gradient-to-br p-4 pl-[18px] text-left shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] transition-all duration-300",
              k.onClick && "hover:-translate-y-0.5 hover:shadow-[0_6px_20px_-6px_rgba(67,97,238,0.30)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
              t.card, k.urgent ? "border-red-300" : t.border,
              k.active && cn("-translate-y-0.5 ring-2", t.ring),
            )}
          >
            <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-gradient-to-b", t.rail)} />
            <div className="relative flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm ring-1 ring-white/40", t.tile)}><k.icon className="h-4 w-4" /></span>
                <span className="truncate text-[10.5px] font-bold uppercase tracking-wider text-slate-600">{k.label}</span>
              </div>
              {k.onClick && <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-[#4361EE]" />}
            </div>
            <p className={cn("relative mt-2.5 text-[28px] font-extrabold leading-none tabular-nums", k.urgent ? "text-[#B42318]" : "text-foreground")}>{k.primary}</p>
            <p className="relative mt-1 text-[11px] font-medium text-slate-600">{k.description}</p>
            <div className="relative mt-auto space-y-1.5 pt-3">
              {pct != null && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-inset ring-black/5" aria-hidden>
                  <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", k.progressAlert ? "from-rose-400 to-red-500" : t.bar)} style={{ width: `${pct > 0 ? Math.max(pct * 100, 2) : 0}%` }} />
                </div>
              )}
              <div className="space-y-1">
                {k.support.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate text-slate-600">{s.label}</span>
                    {s.onClick ? (
                      <span role="button" tabIndex={0} aria-pressed={!!s.active}
                        onClick={(e) => { e.stopPropagation(); s.onClick!(); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); s.onClick!(); } }}
                        className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-bold tabular-nums transition hover:bg-white/80 hover:underline",
                          s.alert ? "text-[#B42318]" : "text-foreground", s.active && "bg-white ring-1 ring-[#4361EE]/40")}>{s.value}</span>
                    ) : (
                      <span className={cn("shrink-0 px-1.5 font-bold tabular-nums", s.alert ? "text-[#B42318]" : "text-foreground")}>{s.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
