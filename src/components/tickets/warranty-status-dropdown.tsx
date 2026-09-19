"use client";

/**
 * WarrantyStatusPillDropdown — inline warranty-claim status control.
 *
 * The warranty counterpart to StatusPillDropdown (inline-status-dropdown.tsx).
 * A Warranty record's lifecycle (Open → In Progress → Completed → Rejected) is
 * DELIBERATELY separate from the device repair status and from warranty
 * eligibility (spec §23/§24), so it has its own small menu with its own tone
 * vocabulary — no invoice / "Repaired & Collected" business rules apply.
 *
 * Rendered as a coloured pill button that opens a portal-positioned menu of the
 * four claim statuses. Calls `onSelect(next)` when the user picks one; the
 * mutation (updateTicket) is owned by the caller.
 */

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  WARRANTY_STATUS_LABEL, WARRANTY_STATUS_TONE, WARRANTY_STATUS_OPTIONS,
  type WarrantyStatus,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function WarrantyStatusPillDropdown({
  status,
  onSelect,
  size = "md",
  ariaLabel,
}: {
  status: WarrantyStatus;
  onSelect: (status: WarrantyStatus) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < 260;
      setPos({ top: dropUp ? rect.top : rect.bottom + 6, left: rect.left, dropUp });
    }
    setOpen(!open);
  };

  const pillSize = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";

  return (
    <div className="relative flex justify-start" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label={ariaLabel ? `${ariaLabel} — warranty status: ${WARRANTY_STATUS_LABEL[status]}` : `Warranty status: ${WARRANTY_STATUS_LABEL[status]}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap cursor-pointer transition hover:shadow-sm",
          pillSize,
          WARRANTY_STATUS_TONE[status],
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {WARRANTY_STATUS_LABEL[status]}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "fixed",
                top: pos.dropUp ? undefined : pos.top,
                bottom: pos.dropUp ? (window.innerHeight - pos.top + 6) : undefined,
                left: pos.left,
              }}
              className="z-[70] w-[180px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              {WARRANTY_STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { onSelect(s.value); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition",
                    status === s.value ? "bg-indigo-50 text-[#4361EE]" : "hover:bg-zinc-50 text-foreground",
                  )}
                >
                  <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 ring-inset", WARRANTY_STATUS_TONE[s.value])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  </span>
                  {s.label}
                  {status === s.value && <span className="ml-auto text-[9px] font-semibold text-[#4361EE]">✓</span>}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
