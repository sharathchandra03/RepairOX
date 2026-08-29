"use client";

import Image from "next/image";
import { motion, useReducedMotion, type Variants } from "framer-motion";

/**
 * Empty-state illustration for RepairOX.
 *
 * Uses the provided source artwork (cropped per module) — the LEFT "ticket"
 * character for Tickets and the RIGHT "invoice" character for Invoices.
 * The illustration is NOT regenerated; these are the supplied assets.
 *
 * On mount it plays a short, expressive entrance: the character pops in from
 * below with a soft overshoot, then steadies itself with a damped wobble and
 * a subtle drop-shadow "landing" (~1.8s), before resting completely still.
 * Because the motion runs on mount, it replays whenever the empty state is
 * newly mounted — page enter, refresh, or filters returning zero results —
 * but not on ordinary re-renders.
 * Respects prefers-reduced-motion (renders the static resting state).
 *
 * All animation is transform/opacity only (GPU-friendly, no layout shift).
 * Scope: purely visual. No layout, filtering, or data logic lives here.
 */

type Variant = "ticket" | "invoice";

const ASSETS: Record<Variant, { src: string; w: number; h: number; alt: string }> = {
  ticket: { src: "/empty-states/ticket-empty.png", w: 340, h: 390, alt: "" },
  invoice: { src: "/empty-states/invoice-empty.png", w: 340, h: 355, alt: "" },
};

// Rendered height for the illustration inside the empty-state area (compact).
const DISPLAY_HEIGHT = 132;

/* Outer layer: pop in from below with a springy overshoot, fade in,
   then a soft ground "shadow" flash implied by the scale bloom. */
const popIn: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.6 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 15,
      mass: 0.9,
    },
  },
};

/* Inner layer: after landing, the character rocks side to side and damps to
   rest — a natural "settling" wobble that reacts to the pop-in. Plays once. */
const settleWobble: Variants = {
  hidden: { rotate: 0 },
  shown: {
    rotate: [0, -6, 4.5, -2.5, 1.2, 0],
    transition: {
      duration: 1.5,
      ease: "easeInOut",
      times: [0, 0.28, 0.5, 0.7, 0.86, 1],
      delay: 0.28,
    },
  },
};

export function EmptyStateCharacter({ variant }: { variant: Variant }) {
  const reduce = useReducedMotion();
  const asset = ASSETS[variant];
  const width = Math.round((asset.w / asset.h) * DISPLAY_HEIGHT);

  return (
    <motion.div
      // key forces a fresh mount per variant so the entrance replays reliably.
      key={variant}
      className="relative flex items-center justify-center"
      style={{ width, height: DISPLAY_HEIGHT }}
      variants={popIn}
      initial={reduce ? "shown" : "hidden"}
      animate="shown"
      aria-hidden="true"
    >
      <motion.div
        className="h-full w-full origin-bottom"
        variants={reduce ? undefined : settleWobble}
        initial={reduce ? false : "hidden"}
        animate="shown"
      >
        <Image
          src={asset.src}
          alt={asset.alt}
          width={asset.w}
          height={asset.h}
          priority
          draggable={false}
          className="h-full w-auto select-none object-contain [filter:drop-shadow(0_8px_18px_rgba(79,70,229,0.12))]"
        />
      </motion.div>
    </motion.div>
  );
}
