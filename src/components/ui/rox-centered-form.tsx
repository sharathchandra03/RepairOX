"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Design System v2 — SHARED CENTERED-FORM FOUNDATION
   ────────────────────────────────────────────────────────────────────────
   The canonical RepairOX FULL data-entry / create-edit form experience,
   extracted from the finalized Shop → Walk-In → New Walk-In form. This is the
   DEFAULT shell every NEW full creation/edit form should use — NOT a
   right-side drawer. (Drawers remain valid ONLY for quick-edit, contextual
   detail, filters and utility actions.)

     • dimmed + blurred full-screen backdrop (app stays visible behind it)
     • vertically + horizontally CENTERED panel
     • thin crisp outer boundary + RepairOX radius + soft deep shadow
       (.rox-form-panel, tokens --rox-form-*)
     • fixed HEADER (icon tile + title/subtitle + close)
     • independently SCROLLABLE body (flex-1 overflow-y-auto)
     • fixed FOOTER (actions)
     • portalled to <body>, scroll-locked, Escape-to-close
     • gentle scale/opacity entrance (motion)

   See docs/REPAIROX-DESIGN-SYSTEM.md. Inputs inside should use the shared
   Input / Select / Textarea (border-input token) so the field border language
   propagates automatically.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export function RoxCenteredForm({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  /** Panel max width — Tailwind max-w-* utility. Default matches Walk-In. */
  width = "max-w-lg",
  /** Set false to keep the panel open on backdrop click (explicit close only). */
  closeOnBackdrop = true,
  /** When false, the whole form renders READ-ONLY: every field inside is
   *  disabled (native <fieldset disabled>), a view-only banner shows, and the
   *  footer save actions are hidden (only the read-only footer, if provided,
   *  shows). Defaults to true for backward compatibility — callers pass their
   *  permission check (e.g. canEdit={allow(can, CAP.customer.edit)}). */
  canEdit = true,
  /** Footer to render when read-only (typically just a Close button). If
   *  omitted, the normal footer is hidden entirely in read-only mode. */
  readOnlyFooter,
  /** Custom read-only banner message. */
  readOnlyNote,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  closeOnBackdrop?: boolean;
  canEdit?: boolean;
  readOnlyFooter?: React.ReactNode;
  readOnlyNote?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
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

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Dimmed + blurred backdrop — the CRM stays visible behind it. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-sm"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          {/* Centered container. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          >
            <div
              className={cn(
                // .rox-form-panel = thin crisp boundary + RepairOX radius + bg.
                "rox-form-panel relative flex max-h-[92vh] w-full flex-col overflow-hidden ring-1 ring-black/10 shadow-[0_32px_80px_-20px_rgba(20,30,80,0.35)]",
                width,
              )}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Fixed header. */}
              <div className="rox-form-pad flex items-start justify-between gap-3 border-b border-border p-5">
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

              {/* Scrollable body. A disabled <fieldset> natively blocks every
                  input/select/textarea/button inside when read-only, so a
                  view-only user physically cannot edit or submit — with no
                  per-field code. */}
              <div className="rox-form-pad flex-1 overflow-y-auto p-5">
                {!canEdit && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-700">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{readOnlyNote ?? "View-only: you don't have permission to change this. Ask an administrator for edit access."}</span>
                  </div>
                )}
                <fieldset disabled={!canEdit} className={cn("m-0 min-w-0 border-0 p-0", !canEdit && "opacity-70")}>
                  {children}
                </fieldset>
              </div>

              {/* Fixed footer. In read-only mode the editing footer (Save etc.)
                  is hidden; a read-only footer (e.g. a Close button) may be
                  supplied instead. */}
              {canEdit && footer && (
                <div className="rox-form-pad flex items-center justify-between gap-2 border-t border-border p-5">
                  {footer}
                </div>
              )}
              {!canEdit && readOnlyFooter && (
                <div className="rox-form-pad flex items-center justify-end gap-2 border-t border-border p-5">
                  {readOnlyFooter}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
