"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Demo Mode Banner

   A subtle, always-visible indicator shown when the signed-in user is in a
   demo-flagged role. Communicates that data is sandboxed and won't affect
   production. Includes a "Reset" action for quick cleanup.
   ────────────────────────────────────────────────────────────────────────── */

import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, RotateCcw, Info } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";

export function DemoBanner() {
  const { isDemoMode, resetDemo, role } = usePermissions();

  return (
    <AnimatePresence initial={false}>
      {isDemoMode && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-violet-200/60 bg-[linear-gradient(90deg,#f5f3ff_0%,#ede9fe_50%,#f5f3ff_100%)] px-4 py-2 sm:px-6">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-600 text-white shadow-sm">
              <FlaskConical className="h-3.5 w-3.5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[12.5px] font-bold leading-tight text-violet-800">
                Demo Workspace
                <span className="hidden sm:inline text-[11.5px] font-medium text-violet-600/70">
                  · All changes are isolated from production data
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[10.5px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                <Info className="h-3 w-3" />
                Sandbox Mode
              </span>
              <button
                onClick={resetDemo}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50 active:scale-95"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
