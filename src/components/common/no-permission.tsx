"use client";

import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

/** Shown in place of a page/form the active role isn't granted access to —
 *  e.g. a direct link to "Add Item" while previewing a role without the
 *  `create` permission. Matches the existing card/shadow/motion language so
 *  it reads as a natural CRM state, not an error screen. */
export function NoPermission({
  title = "You don't have access to this page",
  subtitle = "Ask an administrator to grant the required permission, or switch to a role that has it.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Access restricted" title="Not Available" />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-card"
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <p className="text-base font-semibold">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      </motion.div>
    </div>
  );
}
