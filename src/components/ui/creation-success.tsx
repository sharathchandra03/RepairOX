"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CelebrationBurst } from "./celebration-burst";
import { useStore } from "@/lib/store";

/* ─── Creation Success Animation ─────────────────────────────────────── */
/*
 * A premium success screen shown after ticket/invoice creation.
 * Features a blue success icon that scales in, followed by a physics-based
 * radial burst of ₹ symbols that explode outward and fall with gravity.
 *
 * Props:
 *  - type: "ticket" | "invoice"
 *  - id: the created document ID (e.g. "T-1234" or "INV001")
 *  - onComplete: callback when animation finishes and user should move on
 *  - autoAdvanceMs: time before auto-advance (default 3500ms)
 */

type CreationSuccessProps = {
  type: "ticket" | "invoice";
  id: string;
  onComplete: () => void;
  autoAdvanceMs?: number;
};

export function CreationSuccess({ type, id, onComplete, autoAdvanceMs = 1800 }: CreationSuccessProps) {
  const [phase, setPhase] = useState<"animate" | "done">("animate");
  const { tickets } = useStore();

  // For tickets, show the human-readable display number (T-041) instead of the
  // internal primary key (TK-…). The `id` prop stays the real record id for any
  // downstream navigation; this only affects what the badge shows. Falls back to
  // the id if the ticket/number isn't resolved yet.
  const displayId =
    type === "ticket"
      ? (tickets.find((t) => t.id === id)?.ticketNo ?? id)
      : id;

  // Auto-advance after the animation plays
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [autoAdvanceMs, onComplete]);

  const isInvoice = type === "invoice";

  // Color tokens — green for invoice, blue for ticket
  const accentGradient = isInvoice
    ? "linear-gradient(135deg, #16A34A 0%, #15803D 100%)"
    : "linear-gradient(135deg, #4361EE 0%, #3A56D4 100%)";
  const pulseColor1 = isInvoice ? "rgba(22, 163, 74, 0.08)" : "rgba(67, 97, 238, 0.08)";
  const pulseColor2 = isInvoice ? "rgba(22, 163, 74, 0.05)" : "rgba(67, 97, 238, 0.05)";
  const glowShadow = isInvoice
    ? "0 0 40px rgba(22, 163, 74, 0.3), 0 8px 32px -8px rgba(22, 163, 74, 0.4)"
    : "0 0 40px rgba(67, 97, 238, 0.3), 0 8px 32px -8px rgba(67, 97, 238, 0.4)";
  const badgeDotColor = isInvoice ? "bg-[#16A34A]" : "bg-[#4361EE]";
  const badgeTextColor = isInvoice ? "text-[#16A34A]" : "text-[#4361EE]";
  const badgeBorderColor = isInvoice ? "border-[#BBF7D0]" : "border-[#E2E8F8]";
  const badgeBgColor = isInvoice ? "bg-[#F0FDF4]" : "bg-[#F7FAFF]";
  const progressBarColor = isInvoice ? "bg-[#16A34A]/40" : "bg-[#4361EE]/40";

  const title = type === "ticket" ? "Ticket Created" : "Invoice Created";
  const subtitle = type === "ticket"
    ? "Your repair ticket is now active and tracked."
    : "Your invoice is ready to send or print.";

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        />

        {/* ── Physics-Based ₹ Celebration Burst ── */}
        {/* Renders on a full-screen canvas behind/around the content */}
        <CelebrationBurst
          triggerDelay={280}
          particleCount={48}
          duration={3000}
        />

        {/* Content */}
        <div className="relative z-20 flex flex-col items-center px-6 text-center">
          {/* Success Circle with Checkmark */}
          <div className="relative">
            {/* Outer pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: pulseColor1 }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.6, 1.8], opacity: [0, 0.6, 0] }}
              transition={{ duration: 1.4, delay: 0.3, ease: "easeOut" }}
            />

            {/* Second pulse */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: pulseColor2 }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 2.0, 2.4], opacity: [0, 0.4, 0] }}
              transition={{ duration: 1.6, delay: 0.5, ease: "easeOut" }}
            />

            {/* Main circle — success icon */}
            <motion.div
              className="relative grid h-[88px] w-[88px] place-items-center rounded-full"
              style={{ background: accentGradient }}
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.1,
              }}
            >
              {/* Checkmark SVG */}
              <motion.svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                className="text-white"
              >
                <motion.path
                  d="M10 20.5L17 27.5L30 13.5"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { duration: 0.5, delay: 0.4, ease: [0.65, 0, 0.35, 1] },
                    opacity: { duration: 0.1, delay: 0.4 },
                  }}
                />
              </motion.svg>

              {/* Subtle inner glow */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: glowShadow }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              />
            </motion.div>
          </div>

          {/* Title */}
          <motion.h2
            className="mt-7 text-[22px] font-bold tracking-tight text-gray-900"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {title}
          </motion.h2>

          {/* ID Badge */}
          <motion.div
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full border ${badgeBorderColor} ${badgeBgColor} px-4 py-1.5`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={`h-2 w-2 rounded-full ${badgeDotColor} animate-pulse`} />
            <span className={`text-[13px] font-semibold ${badgeTextColor} tracking-wide font-mono`}>
              {displayId}
            </span>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="mt-3 max-w-[280px] text-[14px] leading-relaxed text-gray-500"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {subtitle}
          </motion.p>

          {/* Progress indicator — subtle line that fills as auto-advance approaches */}
          <motion.div
            className="mt-8 h-[2px] w-[120px] overflow-hidden rounded-full bg-gray-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
          >
            <motion.div
              className={`h-full rounded-full ${progressBarColor}`}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: Math.max(0.4, (autoAdvanceMs - 500) / 1000), delay: 0.5, ease: "linear" }}
            />
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
