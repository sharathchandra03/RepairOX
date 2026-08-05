"use client";

import * as React from "react";
import { motion } from "framer-motion";

/**
 * One-time premium pen-writing onboarding animation.
 * Reveals real readable text ("What's your priority today?") with a
 * left-to-right clip reveal that simulates handwriting, plus a pen icon
 * that tracks the reveal edge.
 */

const STORAGE_KEY = "repairox_todo_pen_anim_played";

/* Timing:
   - Pen enters: 0–200ms
   - Text reveals left→right: 200–1100ms (900ms)
   - Hold: 1100–1600ms (500ms)
   - Fade out: 1600–1900ms (300ms)
*/
const REVEAL_DELAY = 300;
const REVEAL_DURATION = 1800;
const HOLD_DURATION = 600;
const FADE_DURATION = 400;
const TOTAL_DURATION = REVEAL_DELAY + REVEAL_DURATION + HOLD_DURATION + FADE_DURATION;

interface PenWriteAnimationProps {
  onComplete: () => void;
}

export function PenWriteAnimation({ onComplete }: PenWriteAnimationProps) {
  const [phase, setPhase] = React.useState<"entering" | "writing" | "holding" | "fading">("entering");
  const [revealPercent, setRevealPercent] = React.useState(0);

  React.useEffect(() => {
    // Phase 1: Pen enters (200ms)
    const writeStart = setTimeout(() => {
      setPhase("writing");
    }, REVEAL_DELAY);

    // Phase 2: Animate reveal from 0% to 100% over REVEAL_DURATION
    const startTime = Date.now() + REVEAL_DELAY;
    let rafId: number;

    const animateReveal = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 0) {
        rafId = requestAnimationFrame(animateReveal);
        return;
      }
      const progress = Math.min(elapsed / REVEAL_DURATION, 1);
      // Ease-in-out cubic
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      setRevealPercent(eased * 100);

      if (progress < 1) {
        rafId = requestAnimationFrame(animateReveal);
      } else {
        setPhase("holding");
      }
    };
    rafId = requestAnimationFrame(animateReveal);

    // Phase 3: Hold then fade
    const fadeStart = setTimeout(() => {
      setPhase("fading");
    }, REVEAL_DELAY + REVEAL_DURATION + HOLD_DURATION);

    // Phase 4: Complete
    const doneTimer = setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch { /* ignore */ }
      onComplete();
    }, TOTAL_DURATION);

    return () => {
      clearTimeout(writeStart);
      clearTimeout(fadeStart);
      clearTimeout(doneTimer);
      cancelAnimationFrame(rafId);
    };
  }, [onComplete]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
      aria-hidden="true"
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: 0.3, ease: "easeIn" }}
    >
      <div className="relative flex items-center gap-1 px-6">
        {/* Text with clip reveal */}
        <div
          className="overflow-hidden whitespace-nowrap"
          style={{ clipPath: `inset(0 ${100 - revealPercent}% 0 0)` }}
        >
          <p
            className="text-[22px] font-medium italic text-amber-900/80 select-none"
            style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
          >
            What&apos;s your priority today?
          </p>
        </div>

        {/* Pen icon — tracks the reveal edge */}
        <motion.div
          className="flex-shrink-0"
          initial={{ opacity: 0, x: -4 }}
          animate={{
            opacity: phase === "entering" ? 0 : 1,
            x: 0,
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{
            marginLeft: `-${100 - revealPercent}%`,
            position: "relative",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#92400e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-80"
          >
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Hook to manage pen animation lifecycle.
 * Returns: [showAnimation, markComplete]
 *
 * State: "checking" → "playing" | "done"
 */
export function usePenAnimation(): [boolean, () => void] {
  const [state, setState] = React.useState<"checking" | "playing" | "done">("checking");

  React.useEffect(() => {
    setState("playing");
  }, []);

  const markComplete = React.useCallback(() => {
    setState("done");
  }, []);

  return [state === "playing", markComplete];
}
