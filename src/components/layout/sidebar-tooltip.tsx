"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

/**
 * SidebarTooltip — the canonical hover label for the COLLAPSED (icon-only)
 * sidebar. Wrap any collapsed sidebar trigger (a nav icon, an expandable
 * section icon, a workspace switcher icon) with this and pass the exact
 * section name as `label`.
 *
 * Why a portal: the sidebar `<aside>` is `overflow-hidden` (so the width
 * transition never leaks content), which would clip a normal absolutely
 * positioned tooltip. The label is therefore portalled to `<body>` and
 * positioned from the trigger's live bounding rect, so it sits BESIDE the icon
 * and never covers neighbouring icons.
 *
 * UX: compact, readable, subtle shadow, proper contrast, a small open delay to
 * avoid flicker while the pointer crosses icons, and a smooth fade/slide. It
 * only renders when `enabled` (collapsed mode) is true — expanding the sidebar
 * disables it entirely since the labels are then visible inline.
 */
export function SidebarTooltip({
  label,
  enabled,
  children,
  delay = 120,
}: {
  label: string;
  enabled: boolean;
  children: ReactNode;
  delay?: number;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The wrapper is `display: contents` (so it never affects the sidebar's flex
  // layout or icon centring), which can report an empty rect from
  // getBoundingClientRect. We therefore measure the real trigger element — the
  // wrapper's first element child (the nav link / button) — instead.
  const show = useCallback(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = (wrapRef.current?.firstElementChild as HTMLElement) ?? null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      // Positioned to the RIGHT of the icon, vertically centred on it, with a
      // small gap so the tooltip never overlaps the trigger or its neighbours.
      setCoords({ top: r.top + r.height / 2, left: r.right + 10 });
    }, delay);
  }, [enabled, delay]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCoords(null);
  }, []);

  // Focus should only reveal the label for genuine KEYBOARD navigation, never
  // for a mouse click. A click focuses the <Link>/<button>, which would
  // otherwise fire onFocusCapture and leave the label stuck on the active item
  // while the pointer is elsewhere. We therefore only show on focus when the
  // trigger matches :focus-visible (keyboard focus).
  const showOnFocus = useCallback(() => {
    const el = (wrapRef.current?.firstElementChild as HTMLElement) ?? null;
    if (!el) return;
    try {
      if (!el.matches(":focus-visible")) return;
    } catch {
      // Browsers without :focus-visible support — fall back to no focus label
      // (hover still works) rather than risk the stuck-label glitch.
      return;
    }
    show();
  }, [show]);

  return (
    <div
      ref={wrapRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={showOnFocus}
      onBlurCapture={hide}
      className="contents"
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {enabled && coords && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                role="tooltip"
                style={{ position: "fixed", top: coords.top, left: coords.left, transform: "translateY(-50%)" }}
                className="pointer-events-none z-[70] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold leading-none text-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.45)] ring-1 ring-white/10"
              >
                {label}
                {/* Left-pointing caret so the label clearly belongs to the icon. */}
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-y-[5px] border-r-[5px] border-y-transparent border-r-slate-900" />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
