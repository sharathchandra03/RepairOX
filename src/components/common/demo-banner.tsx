"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Demo Mode Banner

   A subtle, always-visible indicator shown when the signed-in user is in a
   demo-flagged role. Communicates that data is sandboxed and won't affect
   production. Includes a "Reset" action for quick cleanup.
   ────────────────────────────────────────────────────────────────────────── */

import { FlaskConical, RotateCcw } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";

export function DemoBanner() {
  const { isDemoMode, resetDemo } = usePermissions();

  if (!isDemoMode) return null;

  return (
    <div className="border-b border-violet-200/60 bg-[linear-gradient(90deg,#f5f3ff_0%,#ede9fe_50%,#f5f3ff_100%)]">
      <div className="flex items-center gap-2.5 px-4 py-1.5 sm:px-6">
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-violet-600" />
        <p className="min-w-0 flex-1 text-[11.5px] font-semibold text-violet-700">
          Demo Workspace
          <span className="hidden sm:inline font-normal text-violet-500"> · Isolated from production</span>
        </p>
        <button
          onClick={resetDemo}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-white/80 px-2.5 py-1 text-[10.5px] font-semibold text-violet-600 transition hover:bg-violet-50 active:scale-95"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
    </div>
  );
}
