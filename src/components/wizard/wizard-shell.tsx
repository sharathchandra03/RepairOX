"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, Check, Sparkles } from "lucide-react";
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
  onClose,
  closeHref,
  isEdit,
  footer,
}: {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  closeHref?: string;
  isEdit?: boolean;
  footer?: React.ReactNode;
}) {
  const pct = Math.round(((step - 1) / TOTAL_STEPS) * 100);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[hsl(228,30%,95%)] via-white to-[hsl(228,30%,95%)]">
      {/* Decorative background — enhanced */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-20 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-60 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#B3BFF6]/25 to-[#4361EE]/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-[#4361EE]/5 blur-3xl" />

      {/* Top bar */}
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
        <motion.button
          onClick={onBack}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card text-zinc-700 shadow-card transition hover:bg-muted hover:border-[#B3BFF6]"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </motion.button>

        {/* Step pill + progress */}
        <div className="relative flex flex-1 items-center justify-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-3 rounded-full border border-[#B3BFF6]/40 bg-card px-4 py-1.5 shadow-card"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#4361EE]" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Step</span>
            <span className="font-display tnum text-base font-bold">
              {String(step).padStart(2, "0")}
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="brand-gradient-text">10</span>
            </span>
          </motion.div>
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card text-indigo-600 shadow-card transition hover:bg-indigo-50 hover:border-indigo-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <Link
            href={closeHref || "/tickets"}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card text-indigo-600 shadow-card transition hover:bg-indigo-50 hover:border-indigo-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Step indicator strip */}
      <div className="relative mx-auto flex max-w-6xl items-center gap-2 px-4 sm:px-6 mb-2">
        <Progress value={pct} className="hidden sm:block" />
        {/* Mobile progress bar */}
        <div className="block w-full sm:hidden">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full brand-gradient"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* Stepper labels (desktop) */}
      <div className="relative mx-auto hidden max-w-6xl px-6 md:block">
        <ol className="grid grid-cols-10 gap-1.5 text-[10px]">
            {STEP_LABELS.map((label, i) => {
              const idx = i + 1;
              const done = idx < step;
              const active = idx === step;
              return (
                <li key={label} className="flex flex-col items-center gap-1">
                  <motion.span
                    initial={false}
                    animate={active ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold transition",
                      done ? "bg-emerald-500 text-white"
                        : active ? "brand-gradient text-white shadow-glow"
                        : "bg-muted text-muted-foreground ring-1 ring-border"
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : idx}
                  </motion.span>
                  <span className={cn("truncate text-center font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

      {/* Title */}
      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6 mt-6 sm:mt-8">
        <motion.h1
          key={title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="font-display text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl brand-gradient-text"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            key={subtitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-1.5 text-sm text-muted-foreground"
          >
            {subtitle}
          </motion.p>
        )}
      </div>

      {/* Step content */}
      <div className={cn(
        "relative mx-auto max-w-6xl px-4 sm:px-6 mt-6",
        isEdit ? "pb-24" : "pb-16"
      )}>
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

      {/* Footer slot for edit mode */}
      {isEdit && footer && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.06)]">
          {footer}
        </div>
      )}
    </div>
  );
}
