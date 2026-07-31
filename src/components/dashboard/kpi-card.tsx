"use client";

import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
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

export function KpiCard({
  title, value, format, hint, delta, tone = "rose", progress, onCardClick,
}: {
  title: string;
  value: number;
  format?: (n: number) => string;
  hint?: string;
  delta?: { value: string; up?: boolean };
  tone?: "rose" | "amber" | "emerald" | "sky" | "violet";
  /** 0–100 progress value. Omit to hide the bar. */
  progress?: { value: number; label?: string; targetValue?: string };
  /** If provided, the card becomes clickable (e.g. to edit target) */
  onCardClick?: () => void;
}) {
  const TONES: Record<string, { chip: string; bar: string }> = {
    rose:    { chip: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/40", bar: "bg-[#4361EE]" },
    amber:   { chip: "text-amber-700 bg-amber-50 ring-amber-200/40", bar: "bg-amber-500" },
    emerald: { chip: "text-emerald-700 bg-emerald-50 ring-emerald-200/40", bar: "bg-emerald-500" },
    sky:     { chip: "text-sky-700 bg-sky-50 ring-sky-200/40", bar: "bg-sky-500" },
    violet:  { chip: "text-violet-700 bg-violet-50 ring-violet-200/40", bar: "bg-violet-500" },
  };
  const t = TONES[tone];
  const pct = Math.max(0, Math.min(100, progress?.value ?? 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onCardClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-[#B3BFF6]/50 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] transition-all duration-300 will-change-transform hover:-translate-y-1 hover:border-[#4361EE]/40 hover:shadow-[0_6px_20px_-6px_rgba(67,97,238,0.30),0_12px_32px_-10px_rgba(67,97,238,0.20)]",
        onCardClick && "cursor-pointer"
      )}
    >
      <div className="relative flex items-center justify-between">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", t.chip)}>
            {delta.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
          </span>
        )}
      </div>
      <p className="relative font-display mt-3 text-[28px] font-extrabold leading-none tracking-tight tnum">
        <AnimatedNumber value={value} format={format} />
      </p>
      {hint && <p className="relative mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>}

      {/* Progress indicator */}
      {progress && (
        <div className="relative mt-3">
          {progress.label && (
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-muted-foreground">{progress.label}</span>
              {progress.targetValue ? (
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{progress.targetValue}</span>
              ) : (
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{pct}%</span>
              )}
            </div>
          )}
          <div className="h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={cn("h-full rounded-full transition-colors group-hover:brightness-110", t.bar)}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
