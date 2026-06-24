"use client";

import { motion } from "framer-motion";
import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

/* Temporary placeholder for inventory sections that are built in later phases.
   Keeps navigation functional and on-brand until the screen lands. */
export function SectionStub({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Inventory Management" title={title} subtitle={subtitle} />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 p-16 text-center shadow-card"
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60">
          <Hammer className="h-6 w-6" />
        </span>
        <p className="mt-4 font-display text-lg font-bold">Coming up next</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This screen is being crafted in the next implementation phase with the same premium standards as the Inventory Dashboard.
        </p>
      </motion.div>
    </div>
  );
}
