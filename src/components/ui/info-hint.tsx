"use client";

/* ─── InfoHint — the canonical click-to-reveal "(i)" helper ───────────────
   A compact info icon that reveals a short explanation in a popover on click.
   Use it INSTEAD of a long helper paragraph next to / below a field, pill or
   label — it keeps dense forms clean while the detail stays one click away.

   Usage:
     <Label className="flex items-center gap-1.5">
       Creation Date Back-dating Limit (days)
       <InfoHint>How far back staff may set an invoice's Creation Date…</InfoHint>
     </Label>

   The content may be a string or any React node. The popover is portalled to
   <body> and positioned from the trigger's live rect, so it never clips inside
   an overflow-hidden card and never disturbs the field's layout.
   ────────────────────────────────────────────────────────────────────────── */

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoHint({
  children,
  label = "More information",
  className,
}: {
  children: ReactNode;
  /** Accessible label for the trigger button. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Positioned just below the icon, left-aligned to it, clamped to the viewport.
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 272);
    setCoords({ top: r.bottom + 8, left });
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next) place();
      return next;
    });
  }, [place]);

  // Close on outside click / Escape / scroll / resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      const pop = document.getElementById("info-hint-popover");
      if (pop && pop.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScrollOrResize = () => place();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(); }}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "inline-grid h-4 w-4 shrink-0 place-items-center rounded-full text-[#4361EE] transition hover:bg-[#4361EE]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/30",
          open && "bg-[#4361EE]/10",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                id="info-hint-popover"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                role="tooltip"
                onMouseDown={(e) => e.stopPropagation()}
                style={{ position: "fixed", top: coords.top, left: coords.left }}
                className="z-[10060] w-64 rounded-xl bg-slate-900 px-3 py-2.5 text-[12px] font-medium leading-relaxed text-white/90 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.5)] ring-1 ring-white/10"
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
