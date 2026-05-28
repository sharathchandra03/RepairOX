"use client";

import { motion } from "framer-motion";
import { ArrowUpDown, SlidersHorizontal, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  showFilters = false,
  dateLabel,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  showFilters?: boolean;
  dateLabel?: string;
  className?: string;
}) {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div>
        {eyebrow && <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{eyebrow}</p>}
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display mt-0.5 text-3xl font-extrabold tracking-tight md:text-[2rem]"
        >
          {title}
        </motion.h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground uppercase tracking-wide">
          {subtitle ?? formatted}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {showFilters && (
          <>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-muted transition">
              <ArrowUpDown className="h-3.5 w-3.5" /> Sort By
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-muted transition">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filter By
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-muted transition">
              <CalendarDays className="h-3.5 w-3.5" />
              {dateLabel ?? formatted}
            </button>
          </>
        )}
        {actions && actions}
      </div>
    </div>
  );
}
