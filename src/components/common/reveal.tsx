"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reveal: a subtle scroll / mount entrance primitive.

   A thin wrapper around framer-motion that fades + lifts its children into view
   the first time they enter the viewport (or on mount, for above-the-fold
   content). It is intentionally RESTRAINED — this is a CRM, not a marketing
   site: opacity 0→1 + translateY 12px→0, ~300ms, once, no bounce/scale/parallax.

   • Respects `prefers-reduced-motion`: when set, children render instantly with
     NO transform and NO opacity animation — all information stays available.
   • `delay` lets a section stagger its header → body (keep ≤ ~60ms).
   • `as` picks the rendered element (default a plain block wrapper via <div>).

   Use it to wrap each major View-Lead section so the page reveals as the user
   scrolls, telling one continuous Lead story instead of dumping static cards.
   ────────────────────────────────────────────────────────────────────────── */

import { useReducedMotion, motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function Reveal({
  children,
  className,
  delay = 0,
  /** px threshold before the top of the viewport before firing (negative = earlier). */
  margin = "0px 0px -8% 0px",
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  margin?: string;
  once?: boolean;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    // Reduced motion: render immediately, no transform, no fade.
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={VARIANTS}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: margin as never }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
