"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Input } from "@/components/ui/input";

/**
 * Shared Date Range picker used by BOTH Tickets and Invoices when the
 * "Custom" quick-date option is selected. This is the single source of truth
 * for the custom Start Date / End Date UI — do not create a second picker.
 */
export function DateRangePicker({
  open,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  open: boolean;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformOrigin: "top" }}
          className="overflow-hidden"
        >
          <div className="flex items-end gap-4 pt-0.5">
            <div className="max-w-[340px] space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date Range
              </label>
              <div className="flex items-center gap-2 h-11">
                <Input
                  type="date"
                  value={from}
                  onChange={(e: any) => onFromChange(e.target.value)}
                  className="!h-11 !rounded-xl !text-sm"
                />
                <span className="text-xs text-muted-foreground shrink-0">to</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e: any) => onToChange(e.target.value)}
                  className="!h-11 !rounded-xl !text-sm"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
