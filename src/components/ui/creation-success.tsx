"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Creation Success Animation ─────────────────────────────────────── */
/*
 * A premium, UPI-style success animation shown after ticket/invoice creation.
 * Includes a subtle celebration burst — professional, not flashy.
 *
 * Props:
 *  - type: "ticket" | "invoice"
 *  - id: the created document ID (e.g. "T-1234" or "INV001")
 *  - onComplete: callback when animation finishes and user should move on
 *  - autoAdvanceMs: time before auto-advance (default 3200ms)
 */

type CreationSuccessProps = {
  type: "ticket" | "invoice";
  id: string;
  onComplete: () => void;
  autoAdvanceMs?: number;
};

/* ─── Celebration Particle Data ──────────────────────────────────────── */

type Particle = {
  id: number;
  angle: number;   // degrees from center
  distance: number; // how far to travel (px)
  size: number;     // dot size
  color: string;
  delay: number;    // animation delay
  duration: number; // animation duration
};

function generateParticles(count: number): Particle[] {
  const colors = [
    "#4361EE", "#6366F1", "#818CF8", "#A5B4FC", // blues/indigos
    "#3B82F6", "#60A5FA", "#93C5FD",            // lighter blues
    "#E0E7FF", "#C7D2FE",                        // very subtle lavenders
  ];
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      angle: (360 / count) * i + (Math.random() * 20 - 10),
      distance: 60 + Math.random() * 80,
      size: 3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: 0.3 + Math.random() * 0.15,
      duration: 0.6 + Math.random() * 0.3,
    });
  }
  return particles;
}

/* ─── Sparkle Line Data ──────────────────────────────────────────────── */

type SparkLine = {
  id: number;
  angle: number;
  length: number;
  delay: number;
};

function generateSparkLines(count: number): SparkLine[] {
  const lines: SparkLine[] = [];
  for (let i = 0; i < count; i++) {
    lines.push({
      id: i,
      angle: (360 / count) * i + (Math.random() * 15 - 7.5),
      length: 20 + Math.random() * 16,
      delay: 0.35 + Math.random() * 0.1,
    });
  }
  return lines;
}

/* ─── Main Component ─────────────────────────────────────────────────── */

export function CreationSuccess({ type, id, onComplete, autoAdvanceMs = 3200 }: CreationSuccessProps) {
  const [phase, setPhase] = useState<"animate" | "done">("animate");

  // Generate particles once (stable across renders)
  const particles = useMemo(() => generateParticles(14), []);
  const sparkLines = useMemo(() => generateSparkLines(8), []);

  // Auto-advance after the animation plays
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, autoAdvanceMs);
    return () => clearTimeout(timer);
  }, [autoAdvanceMs, onComplete]);

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

        {/* Content */}
        <div className="relative flex flex-col items-center px-6 text-center">
          {/* Success Circle with Checkmark + Celebration */}
          <div className="relative">
            {/* ── Celebration Particles ── */}
            {particles.map((p) => {
              const rad = (p.angle * Math.PI) / 180;
              const x = Math.cos(rad) * p.distance;
              const y = Math.sin(rad) * p.distance;
              return (
                <motion.div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                    left: "50%",
                    top: "50%",
                    marginLeft: -p.size / 2,
                    marginTop: -p.size / 2,
                  }}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                  animate={{
                    x: [0, x * 0.6, x],
                    y: [0, y * 0.6, y],
                    scale: [0, 1.2, 0],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              );
            })}

            {/* ── Spark Lines (short radial strokes) ── */}
            {sparkLines.map((s) => {
              const rad = (s.angle * Math.PI) / 180;
              const startDist = 52;
              const x1 = Math.cos(rad) * startDist;
              const y1 = Math.sin(rad) * startDist;
              return (
                <motion.div
                  key={`sl-${s.id}`}
                  className="absolute"
                  style={{
                    width: s.length,
                    height: 2,
                    borderRadius: 1,
                    background: "linear-gradient(90deg, #4361EE, transparent)",
                    left: "50%",
                    top: "50%",
                    transformOrigin: "left center",
                    rotate: `${s.angle}deg`,
                  }}
                  initial={{ x: x1 * 0.3, y: y1 * 0.3, scaleX: 0, opacity: 0 }}
                  animate={{
                    x: [x1 * 0.3, x1],
                    y: [y1 * 0.3, y1],
                    scaleX: [0, 1, 0],
                    opacity: [0, 0.7, 0],
                  }}
                  transition={{
                    duration: 0.5,
                    delay: s.delay,
                    ease: "easeOut",
                  }}
                />
              );
            })}

            {/* Outer pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: "rgba(67, 97, 238, 0.08)" }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.6, 1.8], opacity: [0, 0.6, 0] }}
              transition={{ duration: 1.4, delay: 0.3, ease: "easeOut" }}
            />

            {/* Second pulse */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: "rgba(67, 97, 238, 0.05)" }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 2.0, 2.4], opacity: [0, 0.4, 0] }}
              transition={{ duration: 1.6, delay: 0.5, ease: "easeOut" }}
            />

            {/* Main circle */}
            <motion.div
              className="relative grid h-[88px] w-[88px] place-items-center rounded-full"
              style={{ background: "linear-gradient(135deg, #4361EE 0%, #3A56D4 100%)" }}
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
                style={{ boxShadow: "0 0 40px rgba(67, 97, 238, 0.3), 0 8px 32px -8px rgba(67, 97, 238, 0.4)" }}
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
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F8] bg-[#F7FAFF] px-4 py-1.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="h-2 w-2 rounded-full bg-[#4361EE] animate-pulse" />
            <span className="text-[13px] font-semibold text-[#4361EE] tracking-wide font-mono">
              {id}
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
              className="h-full rounded-full bg-[#4361EE]/40"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: (autoAdvanceMs - 1000) / 1000, delay: 1.0, ease: "linear" }}
            />
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
