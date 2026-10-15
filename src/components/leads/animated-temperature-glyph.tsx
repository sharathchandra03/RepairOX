"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Animated temperature glyph (presentation only).

   A tiny, reusable treatment for the Lead TEMPERATURE emoji (🔥 Hot / 🌤️ Warm /
   ❄️ Cold). When the temperature value actually CHANGES (a previous non-empty
   value → a different new value), the glyph plays a ONE-SHOT pop + wiggle for
   ~2.5s, then rests. It is NOT continuous — a loop on a dense data grid is
   visual noise and the repo's motion rules ban continuous pulsing/spinning.

   Guarantees:
   • Animates ONLY on a real value change — never on initial mount, never on
     re-render / scroll / virtualization window changes. A tracked `prevRef`
     plus a `key`-remounted one-shot `motion.span` drives the replay.
   • `prefers-reduced-motion` → renders the final glyph INSTANTLY with no
     transform/animation. Information is never hidden behind the animation.
   • Transform-only (scale + rotate). Never animates width/height/margin/font-
     size, so it cannot change the pill's width or push the trailing chevron /
     lock around. It lives inside the same fixed `shrink-0` slot it replaces.

   This component owns NO temperature/data logic — the caller passes the
   already-resolved glyph node + the raw value used as the change key, so no
   emoji / value is fabricated here.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function AnimatedTemperatureGlyph({
  glyph,
  changeKey,
  className = "shrink-0 text-[12px] leading-none",
}: {
  /** The already-resolved emoji node (from temperatureGlyph / leadNatureGlyph). */
  glyph: ReactNode;
  /** The raw value that identifies "which temperature" (e.g. lead.leadNature). */
  changeKey: string;
  /** Classes for the glyph slot — defaults match the existing table glyph span. */
  className?: string;
}) {
  const reduce = useReducedMotion();

  // Track the previously-seen value. Initialised to the first value on mount so
  // mount is NEVER counted as a change.
  const prevRef = useRef(changeKey);
  // Incrementing key: a bump remounts the motion.span and replays the one-shot.
  // Starts at 0 (no animation) so the first paint is static.
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (prevRef.current === changeKey) return;
    // Only a non-empty → different transition is a real "change". Setting from
    // empty (first set) and clearing to empty do NOT animate.
    const wasRealChange = prevRef.current !== "" && changeKey !== "";
    prevRef.current = changeKey;
    if (wasRealChange) setAnimKey((k) => k + 1);
  }, [changeKey]);

  // Reduced motion OR no change yet → plain static glyph, no transform.
  if (reduce || animKey === 0) {
    return <span className={className}>{glyph}</span>;
  }

  return (
    <motion.span
      key={animKey}
      className={cn("inline-block", className)}
      style={{ transformOrigin: "center", willChange: "transform" }}
      initial={{ scale: 1, rotate: 0 }}
      animate={{ scale: [1, 1.35, 1, 1], rotate: [0, -8, 8, 0] }}
      transition={{ duration: 2.5, ease: "easeOut", times: [0, 0.12, 0.3, 1] }}
    >
      {glyph}
    </motion.span>
  );
}
