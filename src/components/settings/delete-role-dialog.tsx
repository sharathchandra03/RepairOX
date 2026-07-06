"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/input";
import type { RoleDef } from "@/lib/permissions";
import type { TeamMember } from "@/lib/mock-data";

/** Confirmation dialog for deleting a custom role. Mirrors the app's modal
 *  language (centered card, backdrop blur) rather than the side Drawer, since
 *  this is a single confirm/cancel decision, not a form to fill in.
 *
 *  If people are still assigned to the role, deletion is blocked until the
 *  administrator picks a role to move them to first — this is enforced by
 *  `deleteRole()` in the permissions context, not just the UI, so it holds
 *  even if this dialog is bypassed. */
export function DeleteRoleDialog({
  open,
  onClose,
  role,
  isBuiltIn,
  affectedMembers,
  otherRoles,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  role: RoleDef | null;
  /** True for roles from the built-in catalogue (vs. one created via "Add Role") — shown as an extra warning since these are the platform's defaults. */
  isBuiltIn?: boolean;
  affectedMembers: TeamMember[];
  otherRoles: RoleDef[];
  onConfirm: (reassignTo?: string) => void;
}) {
  const [reassignTo, setReassignTo] = useState(otherRoles[0]?.id ?? "");

  useEffect(() => {
    if (open) setReassignTo(otherRoles[0]?.id ?? "");
  }, [open, otherRoles]);

  const needsReassignment = affectedMembers.length > 0;

  return (
    <AnimatePresence>
      {open && role && (
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
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-zinc-900/10"
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
                Delete &quot;{role.label}&quot;?
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                This removes the role and its permission configuration. This can&apos;t be undone.
              </p>

              {isBuiltIn && (
                <p className="mt-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-zinc-600">
                  This is one of RepairOX&apos;s built-in roles. Deleting it removes it from every role picker across the app — it won&apos;t appear again unless re-created.
                </p>
              )}

              {needsReassignment && (
                <div className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-[12.5px] leading-relaxed text-amber-800">
                      {affectedMembers.length} {affectedMembers.length === 1 ? "person" : "people"} currently{" "}
                      {affectedMembers.length === 1 ? "has" : "have"} this role. Choose a role to move{" "}
                      {affectedMembers.length === 1 ? "them" : "them all"} to before deleting.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {affectedMembers.map((m) => (
                      <span
                        key={m.email}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 pr-2.5 text-[11.5px] font-medium ring-1 ring-inset ring-amber-200/70"
                      >
                        <Avatar name={m.name} size={18} />
                        {m.name}
                      </span>
                    ))}
                  </div>

                  {otherRoles.length > 0 ? (
                    <Select
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      options={otherRoles.map((r) => ({ label: r.label, value: r.id }))}
                    />
                  ) : (
                    <p className="text-[12px] font-medium text-rose-600">
                      No other role is available to reassign to. Create another role first.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-1.5"
                  disabled={needsReassignment && (!reassignTo || otherRoles.length === 0)}
                  onClick={() => onConfirm(needsReassignment ? reassignTo : undefined)}
                >
                  <Trash2 className="h-4 w-4" /> Delete role
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
