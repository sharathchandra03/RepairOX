"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export interface ModuleFeature {
  icon: any;
  label: string;
  desc: string;
}

export function InfoModal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  features,
  statusBadge,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  description: string;
  features: ModuleFeature[];
  statusBadge?: { label: string; tone: "live" | "preview" };
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onEsc);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/55 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-zinc-900/10"
          >
            {/* close */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-zinc-600 shadow-card ring-1 ring-zinc-200 backdrop-blur transition hover:bg-white hover:text-zinc-900"
            >
              <X className="h-4 w-4" />
            </button>

            {/* header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-indigo-50/60 to-white px-7 pb-6 pt-7">
              <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-25" />
              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl" />
              <div className="relative">
                {eyebrow && (
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                    {eyebrow}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <h2
                    id="modal-title"
                    className="font-display text-2xl font-extrabold tracking-tight md:text-3xl"
                  >
                    {title}
                  </h2>
                  {statusBadge && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                        statusBadge.tone === "live"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          statusBadge.tone === "live" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                        )}
                      />
                      {statusBadge.label}
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-xl text-sm text-zinc-700">{description}</p>
              </div>
            </div>

            {/* features */}
            <div className="max-h-[58vh] overflow-y-auto px-7 pb-7 pt-6">
              <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                What&apos;s inside
              </p>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {features.map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * i }}
                      className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 transition hover:border-indigo-200 hover:bg-indigo-50/30"
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-brand-700 ring-1 ring-indigo-100">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{f.label}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{f.desc}</p>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
