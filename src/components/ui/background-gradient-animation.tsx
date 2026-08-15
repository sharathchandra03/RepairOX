"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Aceternity-style Background Gradient Animation — RepairOX themed.
 *
 * Renders slow-moving, heavily-blurred gradient blobs behind content.
 * Uses pure CSS keyframes for GPU-friendly animation with zero React re-renders.
 * Respects prefers-reduced-motion by pausing all animations.
 */
export function BackgroundGradientAnimation({
  className,
  children,
  containerClassName,
  interactive = false,
}: {
  className?: string;
  children?: React.ReactNode;
  containerClassName?: string;
  interactive?: boolean;
}) {
  const interactiveRef = useRef<HTMLDivElement>(null);
  const [curX, setCurX] = useState(0);
  const [curY, setCurY] = useState(0);
  const [tgX, setTgX] = useState(0);
  const [tgY, setTgY] = useState(0);

  useEffect(() => {
    if (!interactive) return;
    function move() {
      setCurX((prev) => prev + (tgX - prev) / 20);
      setCurY((prev) => prev + (tgY - prev) / 20);
      if (interactiveRef.current) {
        interactiveRef.current.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`;
      }
      requestAnimationFrame(move);
    }
    move();
  }, [tgX, tgY]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTgX(event.clientX - rect.left - rect.width / 2);
    setTgY(event.clientY - rect.top - rect.height / 2);
  };

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden",
        containerClassName
      )}
      onMouseMove={handleMouseMove}
    >
      {/* SVG filter for heavy blur — more performant than CSS blur on multiple elements */}
      <svg className="hidden">
        <defs>
          <filter id="repairox-blur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Gradient container with blurred blobs */}
      <div
        className={cn(
          "gradients-container pointer-events-none absolute inset-0 opacity-[0.25] dark:opacity-[0.18]",
          "motion-reduce:!opacity-0",
          className
        )}
        style={{ filter: "url(#repairox-blur) blur(40px)" }}
      >
        {/* Blob 1 — Brand blue, vertical movement */}
        <div
          className={cn(
            "absolute left-[calc(50%-250px)] top-[calc(50%-250px)]",
            "h-[500px] w-[500px] rounded-full",
            "bg-[radial-gradient(circle_at_center,_#4361EE_0%,_transparent_70%)]",
            "animate-gradient-first"
          )}
        />

        {/* Blob 2 — Deep indigo, circular movement */}
        <div
          className={cn(
            "absolute left-[calc(50%-200px)] top-[calc(50%-200px)]",
            "h-[400px] w-[400px] rounded-full",
            "bg-[radial-gradient(circle_at_center,_#1E2B8A_0%,_transparent_70%)]",
            "animate-gradient-second"
          )}
        />

        {/* Blob 3 — Soft blue, slow circular */}
        <div
          className={cn(
            "absolute left-[calc(50%-300px)] top-[calc(50%-300px)]",
            "h-[600px] w-[600px] rounded-full",
            "bg-[radial-gradient(circle_at_center,_#B3BFF6_0%,_transparent_70%)]",
            "animate-gradient-third"
          )}
        />

        {/* Blob 4 — Light cyan-blue, horizontal movement */}
        <div
          className={cn(
            "absolute left-[calc(50%-200px)] top-[calc(50%-200px)]",
            "h-[400px] w-[400px] rounded-full",
            "bg-[radial-gradient(circle_at_center,_#D9DFFA_0%,_transparent_70%)]",
            "animate-gradient-fourth"
          )}
        />

        {/* Blob 5 — Very pale blue / white ambient, circular */}
        <div
          className={cn(
            "absolute left-[calc(50%-250px)] top-[calc(50%-250px)]",
            "h-[500px] w-[500px] rounded-full",
            "bg-[radial-gradient(circle_at_center,_#EEF1FD_0%,_transparent_70%)]",
            "animate-gradient-fifth"
          )}
        />

        {/* Interactive blob (optional — follows cursor subtly) */}
        {interactive && (
          <div
            ref={interactiveRef}
            className={cn(
              "absolute left-[calc(50%-250px)] top-[calc(50%-250px)]",
              "h-[500px] w-[500px] rounded-full opacity-50",
              "bg-[radial-gradient(circle_at_center,_#6780EE_0%,_transparent_70%)]"
            )}
          />
        )}
      </div>

      {/* Content layer */}
      {children}
    </div>
  );
}
