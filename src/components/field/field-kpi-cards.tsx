"use client";
/* RepairOX — Field KPI cards (clickable queue shortcuts).
   Gradient surface per semantic tone, a gradient icon tile, a big tabular
   number, the label, and a share-of-trips meter so a count is read in context
   ("3 of 15"). Pressing a card toggles its queue; the active card is lifted and
   ringed. Colour is semantic (sky=inbound, slate=waiting, amber=at store,
   teal=ready, violet=outbound, rose=problem, emerald=done) and never the only
   signal — every card has a label and an aria-pressed state. */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "sky" | "slate" | "amber" | "teal" | "violet" | "rose" | "emerald";

/* Literal class strings so Tailwind can see them. */
const TONES: Record<KpiTone, { card: string; border: string; glow: string; tile: string; num: string; label: string; bar: string; track: string; ring: string }> = {
  sky:     { card: "from-sky-100 via-sky-50 to-white",         border: "border-sky-200/80",     glow: "bg-sky-300/40",     tile: "from-sky-400 to-blue-600",       num: "text-sky-950",     label: "text-sky-800/80",     bar: "from-sky-400 to-blue-500",       track: "bg-sky-200/60",     ring: "ring-sky-500/50" },
  slate:   { card: "from-slate-200/80 via-slate-100 to-white", border: "border-slate-300/70",   glow: "bg-slate-300/50",   tile: "from-slate-500 to-slate-700",    num: "text-slate-900",   label: "text-slate-600",      bar: "from-slate-400 to-slate-600",    track: "bg-slate-300/60",   ring: "ring-slate-500/50" },
  amber:   { card: "from-amber-100 via-amber-50 to-white",     border: "border-amber-200/80",   glow: "bg-amber-300/40",   tile: "from-amber-400 to-orange-500",   num: "text-amber-950",   label: "text-amber-800/80",   bar: "from-amber-400 to-orange-500",   track: "bg-amber-200/60",   ring: "ring-amber-500/50" },
  teal:    { card: "from-teal-100 via-emerald-50 to-white",    border: "border-teal-200/80",    glow: "bg-teal-300/40",    tile: "from-teal-400 to-emerald-600",   num: "text-teal-950",    label: "text-teal-800/80",    bar: "from-teal-400 to-emerald-500",   track: "bg-teal-200/60",    ring: "ring-teal-500/50" },
  violet:  { card: "from-violet-100 via-violet-50 to-white",   border: "border-violet-200/80",  glow: "bg-violet-300/40",  tile: "from-violet-400 to-indigo-600",  num: "text-violet-950",  label: "text-violet-800/80",  bar: "from-violet-400 to-indigo-500",  track: "bg-violet-200/60",  ring: "ring-violet-500/50" },
  rose:    { card: "from-rose-100 via-rose-50 to-white",       border: "border-rose-200/80",    glow: "bg-rose-300/40",    tile: "from-rose-400 to-red-600",       num: "text-rose-950",    label: "text-rose-800/80",    bar: "from-rose-400 to-red-500",       track: "bg-rose-200/60",    ring: "ring-rose-500/50" },
  emerald: { card: "from-emerald-100 via-emerald-50 to-white", border: "border-emerald-200/80", glow: "bg-emerald-300/40", tile: "from-emerald-400 to-green-600",  num: "text-emerald-950", label: "text-emerald-800/80", bar: "from-emerald-400 to-green-500",  track: "bg-emerald-200/60", ring: "ring-emerald-500/50" },
};

export interface FieldKpi {
  key: string;
  label: string;
  /** Number, or a pre-formatted string (e.g. "₹1,20,000"). */
  value: number | string;
  tone: KpiTone;
  Icon: React.ComponentType<{ className?: string }>;
  /** Pressed state (clickable cards only). */
  active?: boolean;
  /** When omitted the card is a static, non-interactive stat. */
  onClick?: () => void;
  /** Share bar 0–100. Defaults to value/total for numeric values; hidden if undefined for strings. */
  share?: number;
  /** Small caption under the label. */
  hint?: string;
}

export function FieldKpiCards({ items, total, columns = "lg:grid-cols-7" }: { items: FieldKpi[]; total: number; columns?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", columns)} role="group" aria-label="Trip queues">
      {items.map((k) => {
        const t = TONES[k.tone];
        const share = k.share ?? (typeof k.value === "number" && total > 0 ? Math.min(100, Math.round((k.value / total) * 100)) : undefined);
        const interactive = !!k.onClick;
        const Wrapper: any = interactive ? "button" : "div";
        const wrapperProps = interactive
          ? { type: "button", onClick: k.onClick, "aria-pressed": !!k.active, title: `${k.label}: ${k.value}${typeof k.value === "number" ? ` of ${total} trips` : ""}${k.active ? " — click to clear" : " — click to filter"}` }
          : { role: "group", "aria-label": `${k.label}: ${k.value}` };
        return (
          <Wrapper
            key={k.key}
            {...wrapperProps}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 text-left shadow-sm transition duration-200",
              interactive && "hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2",
              t.card, t.border, interactive && t.ring.replace("ring-", "focus-visible:ring-"),
              k.active && cn("-translate-y-0.5 shadow-md ring-2", t.ring),
            )}
          >
            <span aria-hidden className={cn("pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl", t.glow)} />
            <div className="relative flex items-start justify-between">
              <span className={cn("grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.45)] ring-1 ring-white/40", t.tile)}>
                <k.Icon className="h-[18px] w-[18px]" />
              </span>
              {k.active && <span className="grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[#4361EE] shadow-sm"><Check className="h-3 w-3" /></span>}
            </div>
            <p className={cn("relative mt-3 font-display text-[28px] font-extrabold leading-none tabular-nums tracking-tight", t.num)}>{k.value}</p>
            <p className={cn("relative mt-1.5 text-[10.5px] font-bold uppercase tracking-wider", t.label)}>{k.label}</p>
            {k.hint && <p className={cn("relative mt-0.5 text-[11px]", t.label)}>{k.hint}</p>}
            {share !== undefined && (
              <div className={cn("relative mt-2.5 h-1 overflow-hidden rounded-full", t.track)} aria-hidden>
                <div className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-500", t.bar)} style={{ width: `${share}%` }} />
              </div>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}
