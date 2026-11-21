"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TabsProps {
  options: { label: React.ReactNode; value: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Stretch to the full width and share it equally between the options (few options, lots of room). */
  fill?: boolean;
  /** Accent theme. "amber" is used by the Follow-ups workspace (#F59E0C). */
  accent?: "blue" | "amber";
}
export function SegmentedTabs({ options, value, onChange, className, size = "md", accent = "blue", fill = false }: TabsProps) {
  const amber = accent === "amber";
  return (
    <div
      role="tablist"
      className={cn(
        "relative items-center rounded-full border bg-muted p-1",
        fill ? "flex w-full" : "inline-flex",
        amber ? "border-[#F59E0C]/70" : "border-[#4361EE]/60",
        size === "sm" ? "text-[11px]" : size === "lg" ? "text-[15px]" : "text-sm",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center rounded-full font-medium transition-colors whitespace-nowrap",
              size === "sm" ? "px-2.5 py-1" : size === "lg" ? "px-5 py-2.5 font-semibold" : "px-4 py-1.5",
              fill && "min-w-0 flex-1",
              active ? "text-white" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={`pill-${options.map((x) => x.value).join("-")}`}
                className={cn(
                  "absolute inset-0 rounded-full",
                  amber
                    ? "bg-[#F59E0C] shadow-[0_6px_20px_-8px_rgba(245,158,12,0.55)]"
                    : "bg-[#4361EE] shadow-[0_6px_20px_-8px_rgba(67,97,238,0.50)]",
                )}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
