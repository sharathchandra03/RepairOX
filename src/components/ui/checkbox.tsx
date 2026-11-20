"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onChange(!checked);
      }}
      data-state={indeterminate ? "mixed" : checked ? "checked" : "unchecked"}
      className={cn(
        "rox-checkbox relative grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-[background-color,border-color,box-shadow] duration-200",
        checked || indeterminate
          ? "border-[#4361EE] bg-[#4361EE] text-white"
          : "border-zinc-400 bg-card hover:border-[#8DA0F2]",
        disabled && "cursor-not-allowed opacity-50 hover:border-zinc-400",
        className
      )}
    >
      {indeterminate ? (
        <svg viewBox="0 0 16 16" className="rox-checkbox-mark h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
          <path d="M3.5 8h9" className="rox-checkbox-dash" pathLength={1} />
        </svg>
      ) : checked ? (
        <svg viewBox="0 0 16 16" className="rox-checkbox-mark h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5l3.2 3.2L13 4.8" className="rox-checkbox-tick" pathLength={1} />
        </svg>
      ) : null}
    </button>
  );
}
