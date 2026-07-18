"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { WORKSPACES } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Org-level switch: which of the 3 modules this business has enabled at all.
 *  This is separate from per-role permissions (Settings → Permissions) — a
 *  module disabled here disappears for every role, regardless of what
 *  they're individually granted. Lets RepairOX be sold to a business that
 *  only runs, say, Shop Management, without any redesign. */
export default function WorkspaceAccessPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    leads: true, shop: true, operations: true,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Module Access"
        title="Module Access"
        subtitle="Turn entire modules on or off for this business — independent of individual role permissions."
      />

      <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
        <p className="text-[12.5px] leading-relaxed text-[#3347D6]">
          A business may run one, two, or all three modules. Disabling a module here hides it for
          every role — even Master Shop Owner — until it's switched back on.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {WORKSPACES.map((w, i) => (
          <motion.div
            key={w.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i }}
            className="rounded-2xl border border-border bg-card p-5 shadow-card"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", w.bg, w.color)}>
                  {w.label}
                </span>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-zinc-600">{w.tagline}</p>
              </div>
              <button
                role="switch"
                aria-checked={enabled[w.id]}
                onClick={() => setEnabled((e) => ({ ...e, [w.id]: !e[w.id] }))}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  enabled[w.id] ? "bg-[#4361EE]" : "bg-zinc-200"
                )}
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                  style={{ left: enabled[w.id] ? "22px" : "2px" }}
                />
              </button>
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <Badge tone={enabled[w.id] ? "success" : "neutral"} dot={enabled[w.id]}>
                {enabled[w.id] ? "Enabled for this business" : "Disabled"}
              </Badge>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
