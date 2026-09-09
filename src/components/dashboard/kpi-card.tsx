"use client";

import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, type ComponentType } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 80, damping: 20, mass: 0.6 });
  const out = useTransform(spring, (n) => (format ? format(Math.round(n)) : Math.round(n).toLocaleString("en-IN")));

  useEffect(() => { if (inView) mv.set(value); }, [inView, value, mv]);
  return <motion.span ref={ref}>{out}</motion.span>;
}

/* ── Per-tone visual system ───────────────────────────────────────────────
   Each KPI tone maps to a coherent accent set: the delta chip, the progress
   fill gradient, the left accent rail, the top wash, and the sparkline stroke.
   Every colour is drawn from the existing RepairOX palette (blue #4361EE plus
   the emerald / amber / overdue tokens already used by the cards) so the visual
   system stays on-brand — only the presentation gets richer.                */
const TONES: Record<
  string,
  { chip: string; barFrom: string; barTo: string; rail: string; wash: string }
> = {
  rose:    { chip: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/50", barFrom: "#4361EE", barTo: "#6366F1", rail: "#4361EE", wash: "from-[#4361EE]/[0.07]" },
  blue:    { chip: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/50", barFrom: "#4361EE", barTo: "#6366F1", rail: "#4361EE", wash: "from-[#4361EE]/[0.07]" },
  emerald: { chip: "text-emerald-700 bg-emerald-50 ring-emerald-200/50", barFrom: "#10B981", barTo: "#34D399", rail: "#10B981", wash: "from-emerald-500/[0.07]" },
  amber:   { chip: "text-amber-700 bg-amber-50 ring-amber-200/50", barFrom: "#F59E0B", barTo: "#FBBF24", rail: "#F59E0B", wash: "from-amber-500/[0.07]" },
  sky:     { chip: "text-sky-700 bg-sky-50 ring-sky-200/50", barFrom: "#0EA5E9", barTo: "#38BDF8", rail: "#0EA5E9", wash: "from-sky-500/[0.07]" },
  violet:  { chip: "text-violet-700 bg-violet-50 ring-violet-200/50", barFrom: "#8B5CF6", barTo: "#A78BFA", rail: "#8B5CF6", wash: "from-violet-500/[0.07]" },
  overdue: { chip: "text-[#C4506B] bg-[#FBEDF0] ring-[#E7B8C4]/60", barFrom: "#D96A82", barTo: "#E58AA0", rail: "#D96A82", wash: "from-[#D96A82]/[0.08]" },
};

export function KpiCard({
  title, value, format, hint, delta, tone = "rose", progress, onCardClick, icon: Icon, barThickness = "default",
}: {
  title: string;
  value: number;
  format?: (n: number) => string;
  hint?: string;
  delta?: { value: string; up?: boolean };
  tone?: "rose" | "amber" | "emerald" | "sky" | "violet" | "blue" | "overdue";
  /** 0–100 progress value. Omit to hide the bar. */
  progress?: { value: number; label?: string; targetValue?: string };
  /** If provided, the card becomes clickable (e.g. to edit target) */
  onCardClick?: () => void;
  /** Progress bar thickness. "default" = h-1.5 (all cards); "2x" = exactly twice
   *  the default vertical thickness, used only by the Revenue Monthly Target bar. */
  barThickness?: "default" | "2x";
  /** Optional leading icon rendered next to the title. Reuse an existing app icon
   *  (e.g. the lucide `Ticket` icon used across the Tickets module). Omit to keep
   *  the card icon-free, exactly as the other KPI cards render today. */
  icon?: ComponentType<{ className?: string }>;
}) {
  const t = TONES[tone] ?? TONES.rose;
  const pct = Math.max(0, Math.min(100, progress?.value ?? 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onCardClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-[#B3BFF6]/50 bg-card p-5 pl-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 will-change-transform hover:-translate-y-1 hover:border-[#4361EE]/40 hover:shadow-[0_6px_20px_-6px_rgba(67,97,238,0.30),0_12px_32px_-10px_rgba(67,97,238,0.20)]",
        onCardClick && "cursor-pointer"
      )}
    >
      {/* Left accent rail — instantly distinguishes each metric at a glance. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(to bottom, ${t.barFrom}, ${t.barTo})` }}
      />
      {/* Soft top wash — tone-tinted, fades to transparent. Keeps the card light. */}
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent", t.wash)} />

      <div className="relative flex items-center justify-between">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-600">{title}</p>
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset shadow-sm", t.chip)}>
            {delta.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
          </span>
        )}
      </div>

      <div className="relative mt-3 flex items-center gap-2.5">
        {Icon && (
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
            style={{ background: `${t.barFrom}14`, borderColor: `${t.barFrom}33`, color: t.barFrom }}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <p className="font-display text-[30px] font-extrabold leading-none tracking-tight tnum text-foreground">
          <AnimatedNumber value={value} format={format} />
        </p>
      </div>

      {hint && (
        <p className="relative mt-[11px] inline-flex items-center rounded-full bg-[#EEF1FD] px-2.5 py-0.5 text-[11px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/50">
          {hint}
        </p>
      )}

      {/* Progress indicator — gradient fill, tone-tinted track, glowing end-cap. */}
      {progress && (
        <div className={cn("relative", barThickness === "2x" ? "mt-[6px]" : "mt-3")}>
          {progress.label && (
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-500">{progress.label}</span>
              {progress.targetValue ? (
                <span className="text-[10px] font-bold tabular-nums text-slate-700">{progress.targetValue}</span>
              ) : (
                <span className="text-[10px] font-bold tabular-nums text-slate-700">{pct}%</span>
              )}
            </div>
          )}
          <div
            className={cn("relative w-full overflow-hidden rounded-full", barThickness === "2x" ? "h-3" : "h-2")}
            style={{ background: `${t.barFrom}1A` }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative h-full rounded-full"
              style={{ background: `linear-gradient(to right, ${t.barFrom}, ${t.barTo})` }}
            >
              {/* Soft glowing end-cap so the fill level is easy to read. */}
              {pct > 4 && (
                <span
                  aria-hidden
                  className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.6)]"
                  style={{ boxShadow: `0 0 6px 1px ${t.barTo}` }}
                />
              )}
            </motion.div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
