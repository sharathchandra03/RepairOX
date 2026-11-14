"use client";
/* RepairOX — collapse for a Field dashboard's control area (date strip, View by,
   Show, KPI cards). Work mode keeps only compact indicators + the shared blue
   WorkspaceCollapseBar, so the table gets the space. Children stay mounted, so
   filters and selections are never reset. Per-user, per-dashboard preference. */
import { AnimatePresence, motion } from "framer-motion";
import { WorkspaceCollapseBar } from "@/components/common/workspace-collapse-bar";
import { useWorkspaceCollapsed } from "@/hooks/use-workspace-collapsed";
import { usePermissions } from "@/lib/permissions-context";

export function CollapsibleControls({ workspaceKey, indicators, children }: {
  workspaceKey: string; indicators?: React.ReactNode; children: React.ReactNode;
}) {
  const { currentUser } = usePermissions();
  const ws = useWorkspaceCollapsed(workspaceKey, currentUser?.id);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[12px] text-muted-foreground">{ws.collapsed && indicators}</div>
        <WorkspaceCollapseBar collapsed={ws.collapsed} onToggle={ws.toggle} />
      </div>
      <AnimatePresence initial={false}>
        {!ws.collapsed && (
          <motion.div key="controls" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="-mt-1 space-y-5 overflow-hidden">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const IndicatorChip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] font-semibold text-foreground">{children}</span>
);
