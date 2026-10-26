"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — InfoHint: a compact (i) tooltip for field help text.

   Use this to keep a field label short while still offering the full
   explanation on demand. When a hint is long enough to push a field's label
   onto a second line (which breaks the baseline alignment of a row of fields),
   render the hint inside an InfoHint next to the label instead of as an inline
   sub-line.

   Why a portal: the tooltip is often rendered inside a modal/drawer body that
   is `overflow-y-auto` / `overflow-hidden`, which would clip a normal absolutely
   positioned bubble. The bubble is therefore portalled to <body> and positioned
   from the trigger's live bounding rect. It flips above/below depending on the
   available space, and is clamped to the viewport horizontally.

   UX: compact, readable, dark surface + white text (matching SidebarTooltip),
   a small open delay to avoid flicker, opens on hover AND keyboard focus, and
   closes on Escape / blur / pointer-leave. Accessible: the trigger is a real
   <button> with an aria-label and the bubble has role="tooltip".
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoHint({
  content,
  children,
  label = "More information",
  className,
  delay = 90,
}: {
  /** The help text (or rich node) shown inside the bubble. Either `content` or
   *  `children` may be used — `children` is the common call-site form. */
  content?: ReactNode;
  /** Alias for `content` so <InfoHint>…</InfoHint> works. */
  children?: ReactNode;
  /** Accessible label for the trigger button. */
  label?: string;
  /** Extra classes for the trigger button. */
  className?: string;
  delay?: number;
}) {
  const body = content ?? children;
  const id = useId();
  const [coords, setCoords] = useState<{ top: number; left: number; placement: "top" | "bottom" } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Prefer below the icon; flip above when there isn't enough room.
    const spaceBelow = window.innerHeight - r.bottom;
    const placement: "top" | "bottom" = spaceBelow < 120 && r.top > spaceBelow ? "top" : "bottom";
    const left = Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120);
    const top = placement === "bottom" ? r.bottom + 8 : r.top - 8;
    setCoords({ top, left, placement });
  }, []);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(place, delay);
  }, [place, delay]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCoords(null);
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-describedby={coords ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={place}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); coords ? hide() : place(); }}
        onKeyDown={(e) => { if (e.key === "Escape") hide(); }}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors",
          "hover:text-[#4361EE] focus:text-[#4361EE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/25",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {coords && (
              <motion.div
                id={id}
                role="tooltip"
                initial={{ opacity: 0, y: coords.placement === "bottom" ? -4 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: coords.placement === "bottom" ? -4 : 4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  transform: `translateX(-50%)${coords.placement === "top" ? " translateY(-100%)" : ""}`,
                }}
                className="pointer-events-none z-[10060] max-w-[240px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] font-medium leading-snug text-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.45)] ring-1 ring-white/10"
              >
                {body}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
