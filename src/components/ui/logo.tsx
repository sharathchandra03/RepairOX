"use client";

import { cn } from "@/lib/utils";
import { StoreLogo } from "@/components/ui/store-logo";

export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <StoreLogo size={34} />
      {!mark && (
        <span className="font-display text-[17px] font-semibold tracking-tight">
          Repair<span className="brand-gradient-text">OX</span>
        </span>
      )}
    </span>
  );
}
