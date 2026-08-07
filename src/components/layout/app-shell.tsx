"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { navGroups } from "@/lib/mock-data";
import { expandableNavGroups } from "@/lib/mock-data";
import { type WorkspaceId } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";
import { PreviewBanner } from "@/components/common/preview-banner";
import { DemoBanner } from "@/components/common/demo-banner";
import { InternalChat } from "@/components/common/internal-chat";
import { ReportContextProvider, workspaceToModule, moduleToWorkspace } from "@/lib/reports/report-context";
import type { ReportModuleId } from "@/lib/reports/types";
import { ComingSoonPage } from "@/components/common/coming-soon";
import { getComingSoonContentByHref, FEATURE_BY_HREF } from "@/lib/feature-visibility";
import { resetDemoData } from "@/lib/demo-mode";

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
  // Also check expandable nav groups (Employees, Accounts sub-pages)
  const expandEntries = Object.entries(expandableNavGroups) as [WorkspaceId, { children: { href: string }[] }[]][];
  for (const [id, groups] of expandEntries) {
    for (const g of groups) {
      if (g.children.some((child) => pathname === child.href || pathname.startsWith(child.href + "/"))) {
        return id;
      }
    }
  }
  return null;
}

/** Route-level feature visibility gate. Intercepts direct navigation to
 *  routes marked as "coming_soon" (shows the premium Coming Soon page inline)
 *  or "hidden" (redirects to dashboard). Passes through for "visible". */
function FeatureGate({ pathname, getVisibilityByHref, router, children }: {
  pathname: string;
  getVisibilityByHref: (href: string) => "visible" | "coming_soon" | "hidden";
  router: ReturnType<typeof useRouter>;
  children: React.ReactNode;
}) {
  // Skip gate for the coming-soon page itself, login, workspaces, and other meta routes
  const skipPaths = ["/coming-soon", "/login", "/workspaces", "/roles-permissions"];
  if (skipPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return <>{children}</>;
  }

  // Find the best matching feature for this pathname.
  // Try exact match first, then check if it's a sub-route of a known feature.
  let visibility = getVisibilityByHref(pathname);

  // If no exact match in the registry, check parent paths
  if (visibility === "visible" && !FEATURE_BY_HREF[pathname]) {
    // Walk up the path to find a parent that might be gated
    const segments = pathname.split("/").filter(Boolean);
    for (let i = segments.length - 1; i >= 1; i--) {
      const parentPath = "/" + segments.slice(0, i).join("/");
      if (FEATURE_BY_HREF[parentPath]) {
        visibility = getVisibilityByHref(parentPath);
        break;
      }
    }
  }

  if (visibility === "hidden") {
    // Redirect to dashboard for hidden features
    router.replace("/dashboard");
    return <div className="h-[60vh]" />;
  }

  if (visibility === "coming_soon") {
    // Show the Coming Soon page inline (no redirect needed)
    const content = getComingSoonContentByHref(pathname);
    return <ComingSoonPage content={content} />;
  }

  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const { allowedWorkspaces: allowed, currentUser, authReady, getVisibilityByHref, isDemoMode } = usePermissions();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(allowed[0]?.id ?? "shop");
  const pathname = usePathname();
  const router = useRouter();

  // Route guard — once the session is restored, bounce anyone who isn't
  // signed in back to the login screen. Access is centrally controlled.
  useEffect(() => {
    if (authReady && !currentUser) router.replace("/login");
  }, [authReady, currentUser, router]);

  // Demo auto-refresh: after a demo user logs in, the login function sets a flag.
  // Once the app-shell mounts with the session active, we do one hard reload
  // to ensure all providers load with fresh seed data.
  useEffect(() => {
    if (!authReady || !currentUser || !isDemoMode) return;
    if (typeof window === "undefined") return;
    const flag = localStorage.getItem("repairox-demo-needs-reload");
    if (flag) {
      localStorage.removeItem("repairox-demo-needs-reload");
      window.location.reload();
    }
  }, [authReady, currentUser, isDemoMode]);

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

  // Bidirectional sync: when the report context scope changes, update workspace.
  const handleReportScopeChange = useCallback((mod: ReportModuleId) => {
    const ws = moduleToWorkspace(mod);
    if (ws !== activeWorkspace) setActiveWorkspace(ws);
  }, [activeWorkspace]);

  // Hold rendering until we know who (if anyone) is signed in — avoids a flash
  // of app content before the guard above redirects an unauthenticated user.
  if (!authReady || !currentUser) {
    return <div className="h-screen bg-[hsl(var(--background))]" />;
  }

  return (
    <ReportContextProvider
      externalScope={workspaceToModule(activeWorkspace)}
      onScopeChange={handleReportScopeChange}
    >
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--background))]">
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
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-20">
          <PreviewBanner />
          <DemoBanner />
          <Topbar
            onMenu={() => setOpen(true)}
            activeWorkspace={activeWorkspace}
            setActiveWorkspace={setActiveWorkspace}
          />
        </div>
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0 flex-1 px-4 pt-2 pb-4 sm:px-6 lg:px-8"
        >
          <FeatureGate pathname={pathname} getVisibilityByHref={getVisibilityByHref} router={router}>
            {children}
          </FeatureGate>
        </motion.main>
      </div>
      <InternalChat />
    </div>
    </ReportContextProvider>
  );
}
