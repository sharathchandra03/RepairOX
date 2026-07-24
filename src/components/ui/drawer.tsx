"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Right-side slide-over drawer for detail views. Locks scroll, closes on
   backdrop click / Escape. Renders via portal to escape stacking context
   issues from parent containers with overflow/transform. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[9999] bg-foreground/40 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className={cn("fixed inset-y-0 right-0 z-[9999] flex w-full flex-col bg-card shadow-2xl", width)}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="flex items-start gap-3">
                {Icon && (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60">
                    <Icon className="h-5 w-5" />
                  </span>
                )}
                <div>
                  <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
                  {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">{children}</div>

            {footer && <div className="border-t border-border p-4">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  // Portal to body to escape any stacking context / overflow constraints
  if (!mounted) return null;
  return createPortal(content, document.body);
}

/* Key/value detail row helper for drawer bodies */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <span className="text-right text-[13px] font-medium">{children}</span>
    </div>
  );
}
