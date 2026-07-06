"use client";

import { useEffect, useState } from "react";
import { Sidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { navGroups } from "@/lib/mock-data";
import { type WorkspaceId } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";
import { PreviewBanner } from "@/components/common/preview-banner";

/** Resolve which workspace a given pathname belongs to, based on navGroups. */
function workspaceForPath(pathname: string): WorkspaceId | null {
  const entries = Object.entries(navGroups) as [WorkspaceId, { items: string[] }[]][];
  for (const [id, groups] of entries) {
    for (const g of groups) {
      if (g.items.some((href) => pathname === href || pathname.startsWith(href + "/"))) {
        return id;
      }
    }
  }
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const { allowedWorkspaces: allowed } = usePermissions();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(allowed[0]?.id ?? "shop");
  const pathname = usePathname();

  // Keep the active workspace in sync with the current route (e.g. deep links, back/forward nav)
  useEffect(() => {
    const resolved = workspaceForPath(pathname);
    if (resolved && resolved !== activeWorkspace) setActiveWorkspace(resolved);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the active workspace disappears (e.g. previewing a role without access,
  // or a permission edit revokes it), snap to the first workspace still allowed.
  useEffect(() => {
    if (allowed.length > 0 && !allowed.some((w) => w.id === activeWorkspace)) {
      setActiveWorkspace(allowed[0].id);
    }
  }, [allowed, activeWorkspace]);

  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        activeWorkspace={activeWorkspace}
        setActiveWorkspace={setActiveWorkspace}
      />
      <MobileSidebar
        open={open}
        setOpen={setOpen}
        activeWorkspace={activeWorkspace}
        setActiveWorkspace={setActiveWorkspace}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20">
          <PreviewBanner />
          <Topbar
            onMenu={() => setOpen(true)}
            activeWorkspace={activeWorkspace}
            setActiveWorkspace={setActiveWorkspace}
          />
        </div>
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
