"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Eye, ShieldCheck, X } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { resolveGrantedKeys } from "@/lib/permissions-context";
import { Badge } from "@/components/ui/badge";

/** Subtle, premium "you're previewing" strip — shown app-wide while an
 *  administrator is viewing the CRM as another role. Sits above the
 *  Topbar so it never shifts page content or the sidebar. */
export function PreviewBanner() {
  const { isPreviewing, role, grants, exitPreview } = usePermissions();

  return (
    <AnimatePresence initial={false}>
      {isPreviewing && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-[#B3BFF6]/50 bg-[linear-gradient(90deg,#EEF1FD_0%,#F5F7FF_60%,#EEF1FD_100%)] px-4 py-2.5 sm:px-6">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg brand-gradient text-white shadow-glow">
              <Eye className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-bold leading-tight text-[#3347D6]">
                Preview Mode
                <span className="hidden sm:inline text-[12px] font-medium text-[#3347D6]/70">
                  · Viewing current configuration for
                </span>
              </p>
              <p className="flex items-center gap-1.5 text-[12px] text-[#3347D6]/80">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="font-semibold text-zinc-800">{role.label}</span>
                <Badge tone="brand" className="ml-1">
                  {resolveGrantedKeys(grants, role.id).size}/{ALL_PERMISSIONS.length} capabilities · Current saved settings
                </Badge>
              </p>
            </div>

            <button
              onClick={exitPreview}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#B3BFF6] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#3347D6] shadow-sm transition hover:bg-[#EEF1FD] active:scale-95"
            >
              <X className="h-3.5 w-3.5" /> Exit Preview
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
