"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TabsProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  size?: "sm" | "md";
}
export function SegmentedTabs({ options, value, onChange, className, size = "md" }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex items-center rounded-full border border-border bg-muted p-1",
        size === "sm" ? "text-xs" : "text-sm",
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
              "relative z-10 inline-flex items-center justify-center rounded-full px-3.5 py-1.5 font-medium transition-colors",
              size === "md" && "px-4 py-1.5",
              active ? "text-white" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={`pill-${options.map((x) => x.value).join("-")}`}
                className="absolute inset-0 rounded-full brand-gradient shadow-glow"
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
