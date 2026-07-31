"use client";

import { useEffect, useRef, useCallback } from "react";

/* ─── Premium Physics-Based ₹ Celebration Burst ──────────────────────── */
/*
 * A reusable celebration animation that creates a radial burst of ₹ symbols
 * with realistic physics: gravity, drag, wind, rotation, and natural falling.
 *
 * Uses a canvas element for GPU-accelerated rendering. Automatically cleans
 * up after animation completes (~3s).
 *
 * Props:
 *  - triggerDelay: ms before burst fires (default 250ms, after success icon scales in)
 *  - particleCount: number of ₹ symbols (default 45)
 *  - duration: total animation lifespan in ms (default 3000)
 *  - className: optional className for the canvas container
 */

type CelebrationBurstProps = {
  triggerDelay?: number;
  particleCount?: number;
  duration?: number;
  className?: string;
};

/* ─── Physics Constants ──────────────────────────────────────────────── */

const GRAVITY = 980; // px/s² — natural Earth-like gravity
const DRAG = 0.97; // velocity multiplier per frame (air resistance)
const WIND_VARIANCE = 40; // max horizontal wind force (px/s²)
const MIN_BURST_SPEED = 320; // min initial velocity (px/s)
const MAX_BURST_SPEED = 700; // max initial velocity (px/s)

/* ─── Color Palette (RepairOX branding) ──────────────────────────────── */

const COLORS = [
  "#4361EE", // primary indigo
  "#3A56D4", // deeper indigo
  "#6366F1", // violet-indigo
  "#818CF8", // lighter indigo
  "#3B82F6", // blue
  "#60A5FA", // light blue
  "#10B981", // emerald
  "#34D399", // light emerald
  "#A5B4FC", // pale indigo (depth layer)
  "#C7D2FE", // very light indigo (far away)
];

/* ─── Particle Type ──────────────────────────────────────────────────── */

type Particle = {
  x: number;
  y: number;
  vx: number; // velocity x (px/s)
  vy: number; // velocity y (px/s)
  rotation: number; // current rotation (radians)
  rotationSpeed: number; // radians/s
  size: number; // font size
  color: string;
  opacity: number;
  windForce: number; // per-particle wind offset
  blur: number; // 0 = sharp, 1+ = blurry (depth)
  layer: number; // 0 = behind, 1 = middle, 2 = foreground
  life: number; // remaining life (0–1)
  decay: number; // life decay rate per second
};

/* ─── Utility ────────────────────────────────────────────────────────── */

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function generateParticles(count: number, cx: number, cy: number): Particle[] {
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    // Radial burst: random angle, random speed
    const angle = rand(0, Math.PI * 2);
    const speed = rand(MIN_BURST_SPEED, MAX_BURST_SPEED);

    // Depth layer assignment (creates parallax-like depth)
    const layerRoll = Math.random();
    const layer = layerRoll < 0.25 ? 0 : layerRoll < 0.7 ? 1 : 2;

    // Size varies by layer (further = smaller)
    const baseSize = layer === 0 ? rand(10, 14) : layer === 1 ? rand(14, 20) : rand(18, 26);

    // Blur for depth (background particles slightly blurred)
    const blur = layer === 0 ? rand(0.8, 1.5) : layer === 2 ? rand(0, 0.3) : 0;

    // Opacity varies for depth
    const opacity = layer === 0 ? rand(0.4, 0.65) : layer === 1 ? rand(0.7, 0.9) : rand(0.85, 1.0);

    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed * (layer === 0 ? 0.6 : layer === 2 ? 1.2 : 1.0),
      vy: Math.sin(angle) * speed * (layer === 0 ? 0.6 : layer === 2 ? 1.2 : 1.0),
      rotation: rand(0, Math.PI * 2),
      rotationSpeed: rand(-8, 8), // radians/s — some spin fast, some slow
      size: baseSize,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity,
      windForce: rand(-WIND_VARIANCE, WIND_VARIANCE),
      blur,
      layer,
      life: 1,
      decay: rand(0.28, 0.45), // particles die over ~2.2–3.5s
    });
  }

  return particles;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function CelebrationBurst({
  triggerDelay = 250,
  particleCount = 45,
  duration = 3000,
  className = "",
}: CelebrationBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const startedRef = useRef(false);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = performance.now();
    let elapsed = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05); // cap dt to avoid jumps
      lastTime = now;
      elapsed += dt * 1000;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const dpr = window.devicePixelRatio || 1;
      let allDead = true;

      // Sort by layer so background renders first
      const sorted = [...particlesRef.current].sort((a, b) => a.layer - b.layer);

      for (const p of sorted) {
        if (p.life <= 0) continue;
        allDead = false;

        // Physics update
        p.vy += GRAVITY * dt; // gravity pulls down
        p.vx += p.windForce * dt; // slight wind drift
        p.vx *= DRAG; // air drag
        p.vy *= DRAG;

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.rotation += p.rotationSpeed * dt;

        // Life decay (fade out naturally)
        p.life -= p.decay * dt;
        if (p.life < 0) p.life = 0;

        // Render the ₹ symbol
        const currentOpacity = p.opacity * p.life;
        if (currentOpacity <= 0.01) continue;

        ctx.save();
        ctx.globalAlpha = currentOpacity;
        ctx.translate(p.x * dpr, p.y * dpr);
        ctx.rotate(p.rotation);

        // Apply blur for depth effect
        if (p.blur > 0.3) {
          ctx.filter = `blur(${p.blur * dpr}px)`;
        }

        ctx.font = `bold ${p.size * dpr}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = p.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("₹", 0, 0);

        ctx.restore();
      }

      // Continue or stop
      if (!allDead && elapsed < duration + 1000) {
        animRef.current = requestAnimationFrame(loop);
      }
    };

    animRef.current = requestAnimationFrame(loop);
  }, [duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;

    // Set canvas to full size of container with DPR scaling
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    resize();

    // Trigger the burst after delay
    const timer = setTimeout(() => {
      startedRef.current = true;
      resize();

      // Burst origin — slightly above center to align with the success icon
      const cx = canvas.getBoundingClientRect().width / 2;
      const cy = canvas.getBoundingClientRect().height * 0.38;

      particlesRef.current = generateParticles(particleCount, cx, cy);
      animate();
    }, triggerDelay);

    return () => {
      clearTimeout(timer);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [triggerDelay, particleCount, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-10 ${className}`}
      aria-hidden="true"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
