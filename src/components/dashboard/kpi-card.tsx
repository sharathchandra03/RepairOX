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
  title, value, format, hint, delta, tone = "rose",
}: {
  title: string;
  value: number;
  format?: (n: number) => string;
  hint?: string;
  delta?: { value: string; up?: boolean };
  tone?: "rose" | "amber" | "emerald" | "sky" | "violet";
}) {
  const TONES: Record<string, { from: string; to: string; chip: string; ring: string; line: string }> = {
    rose:    { from: "from-white", to: "to-white", chip: "text-[#4361EE] bg-[#EEF1FD] ring-[#B3BFF6]/60",   ring: "ring-[#B3BFF6]/50",   line: "text-[#4361EE]" },
    amber:   { from: "from-white", to: "to-white", chip: "text-amber-700 bg-amber-50 ring-amber-200/60",     ring: "ring-amber-200/50",   line: "text-amber-500" },
    emerald: { from: "from-white", to: "to-white", chip: "text-emerald-700 bg-emerald-50 ring-emerald-200/60", ring: "ring-emerald-200/50", line: "text-emerald-500" },
    sky:     { from: "from-white", to: "to-white", chip: "text-sky-700 bg-sky-50 ring-sky-200/60",            ring: "ring-sky-200/50",     line: "text-sky-500" },
    violet:  { from: "from-white", to: "to-white", chip: "text-violet-700 bg-violet-50 ring-violet-200/60",  ring: "ring-violet-200/50",  line: "text-violet-500" },
  };
  const t = TONES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition will-change-transform hover:-translate-y-0.5 hover:shadow-card-hover"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-700">{title}</p>
        {delta && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", t.chip)}>
            {delta.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
          </span>
        )}
      </div>
      <p className="font-display mt-3 text-3xl font-extrabold tracking-tight tnum">
        <AnimatedNumber value={value} format={format} />
      </p>
      {hint && <p className="mt-1.5 text-[12px] text-zinc-700/80">{hint}</p>}

      {/* sparkline decoration */}
      <svg viewBox="0 0 120 36" className="absolute inset-x-0 bottom-0 h-12 w-full opacity-50" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`gr-${tone}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,28 C12,22 22,30 36,18 C52,6 64,24 80,16 C96,8 110,18 120,12 L120,36 L0,36 Z"
          fill={`url(#gr-${tone})`}
          className={t.line}
        />
        <path
          d="M0,28 C12,22 22,30 36,18 C52,6 64,24 80,16 C96,8 110,18 120,12"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
          className={t.line}
        />
      </svg>
    </motion.div>
  );
}
