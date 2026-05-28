"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export const TOTAL_STEPS = 10;
export const STEP_LABELS = [
  "Process",
  "Category",
  "Device",
  "Parts",
  "Contact",
  "Customer",
  "Quote",
  "QC Form",
  "Upload",
  "Signature",
];

export function WizardShell({
  step,
  title,
  subtitle,
  children,
  onBack,
}: {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  const pct = Math.round(((step - 1) / TOTAL_STEPS) * 100);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(228,30%,95%)]">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-30 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[#B3BFF6]/20 blur-3xl" />

      {/* Top bar */}
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-6">
        <button
          onClick={onBack}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card text-zinc-700 shadow-card transition hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Step pill + progress */}
        <div className="relative flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-1.5 shadow-card">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Step</span>
            <span className="font-display tnum text-base font-bold">
              {String(step).padStart(2, "0")}
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="brand-gradient-text">10</span>
            </span>
          </div>
        </div>

        <Link
          href="/dashboard"
          className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card text-indigo-600 shadow-card transition hover:bg-indigo-50"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>

      {/* Step indicator strip */}
      <div className="relative mx-auto mb-2 flex max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Progress value={pct} className="hidden sm:block" />
      </div>

      {/* Stepper labels (desktop) */}
      <div className="relative mx-auto hidden max-w-6xl px-6 sm:block">
        <ol className="grid grid-cols-10 gap-1.5 text-[10px]">
          {STEP_LABELS.map((label, i) => {
            const idx = i + 1;
            const done = idx < step;
            const active = idx === step;
            return (
              <li key={label} className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold transition",
                    done ? "bg-emerald-500 text-white"
                      : active ? "brand-gradient text-white shadow-glow"
                      : "bg-muted text-muted-foreground ring-1 ring-border"
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : idx}
                </span>
                <span className={cn("truncate text-center font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Title */}
      <div className="relative mx-auto mt-8 max-w-6xl px-4 text-center sm:px-6">
        <motion.h1
          key={title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="font-display text-2xl font-extrabold tracking-tight md:text-3xl brand-gradient-text"
        >
          {title}
        </motion.h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {/* Step content */}
      <div className="relative mx-auto mt-6 max-w-6xl px-4 pb-16 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
