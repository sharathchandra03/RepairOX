"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import type { TeamMember } from "@/lib/mock-data";

/** Confirmation dialog for removing a team member's login entirely — used
 *  for both existing seeded members and anyone invited afterwards, since
 *  both live in the same shared `team` list in the permissions context. */
export function DeleteMemberDialog({
  open,
  onClose,
  member,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  member: TeamMember | null;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && member && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/55 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-zinc-900/10"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition hover:bg-muted hover:text-zinc-900"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-6 sm:p-7">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                <Trash2 className="h-5 w-5" />
              </span>
              <h2 className="font-display mt-4 text-lg font-bold tracking-tight">
                Remove this team member?
              </h2>

              <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
                <Avatar name={member.name} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold leading-tight">{member.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                </div>
              </div>

              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                They&apos;ll immediately lose their RepairOX login and all workspace access. This can&apos;t be undone.
              </p>

              <div className="mt-6 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="destructive" className="flex-1 gap-1.5" onClick={onConfirm}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
