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
  const TONES: Record<string, { from: string; to: string; chip: string; ring: string }> = {
    rose:    { from: "from-rose-100",    to: "to-rose-50/40",    chip: "text-rose-700 bg-rose-100/70 ring-rose-200",    ring: "ring-rose-200/70" },
    amber:   { from: "from-amber-100",   to: "to-amber-50/40",   chip: "text-amber-800 bg-amber-100/70 ring-amber-200", ring: "ring-amber-200/70" },
    emerald: { from: "from-emerald-100", to: "to-emerald-50/40", chip: "text-emerald-700 bg-emerald-100/70 ring-emerald-200", ring: "ring-emerald-200/70" },
    sky:     { from: "from-sky-100",     to: "to-sky-50/40",     chip: "text-sky-700 bg-sky-100/70 ring-sky-200",       ring: "ring-sky-200/70" },
    violet:  { from: "from-violet-100",  to: "to-violet-50/40",  chip: "text-violet-700 bg-violet-100/70 ring-violet-200", ring: "ring-violet-200/70" },
  };
  const t = TONES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br p-5 shadow-card transition will-change-transform hover:-translate-y-0.5",
        t.from, t.to
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
          className="text-zinc-700"
        />
        <path
          d="M0,28 C12,22 22,30 36,18 C52,6 64,24 80,16 C96,8 110,18 120,12"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          className="text-zinc-700"
        />
      </svg>
    </motion.div>
  );
}
