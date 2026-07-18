"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3, ChevronLeft, ChevronRight,
  LogOut, CalendarDays, UserPlus, Map, BookUser, Package, Wrench,
  ClipboardCheck, Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { navItems, navGroups, type NavItem as NavItemDef } from "@/lib/mock-data";
import { Avatar } from "@/components/ui/avatar";
import { CURRENT_USER, type WorkspaceId } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3, Map, BookUser, Package,
  Wrench, ClipboardCheck, Truck,
};

/* Nav item — icon always centred in collapsed mode, no overflow */
function NavItem({ item, collapsed, pathname }: {
  item: NavItemDef;
  collapsed: boolean;
  pathname: string;
}) {
  const Icon = ICONS[item.icon] ?? Home;
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ overflow: "hidden" }}
    >
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex items-center rounded-xl text-sm font-medium transition-colors",
          collapsed ? "justify-center px-0 py-2.5 mx-1" : "gap-3 px-3 py-2.5",
          active ? "text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active"
            className="absolute inset-0 rounded-xl bg-[#4361EE] shadow-[0_8px_24px_-8px_rgba(67,97,238,0.45)]"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <Icon className={cn("h-[18px] w-[18px]", active ? "text-white" : "text-zinc-400 group-hover:text-zinc-700")} />
        </span>
        {!collapsed && (
          <span className="relative whitespace-nowrap">{item.label}</span>
        )}
      </Link>
    </motion.li>
  );
}

/* Workspace switcher pill row — only shows workspaces the active role can access */
function WorkspaceSwitcher({ active, collapsed, onChange, allowed }: {
  active: WorkspaceId;
  collapsed: boolean;
  onChange: (id: WorkspaceId) => void;
  allowed: ReturnType<typeof usePermissions>["allowedWorkspaces"];
}) {
  if (allowed.length <= 1) return null; // single-workspace users never see a switcher

  if (collapsed) {
    return (
      <div className="mx-auto mb-3 flex flex-col items-center gap-1 px-1">
        {allowed.map((w) => (
          <button
            key={w.id}
            title={w.label}
            onClick={() => onChange(w.id)}
            className={cn(
              "h-8 w-8 rounded-lg text-[10px] font-bold transition",
              active === w.id
                ? "bg-[#4361EE] text-white"
                : "bg-muted text-zinc-500 hover:bg-slate-100"
            )}
          >
            {w.short}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="mx-3 mb-4 flex items-center gap-1 rounded-xl bg-muted p-1">
      {allowed.map((w) => (
        <button
          key={w.id}
          title={w.label}
          onClick={() => onChange(w.id)}
          className={cn(
            "flex-1 truncate rounded-lg px-1.5 py-1.5 text-[11.5px] font-semibold leading-tight transition",
            active === w.id
              ? "bg-[#4361EE] text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          {w.navLabel ?? w.label}
        </button>
      ))}
    </div>
  );
}

export function Sidebar({ collapsed, setCollapsed, activeWorkspace, setActiveWorkspace }: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  activeWorkspace: WorkspaceId;
  setActiveWorkspace: (id: WorkspaceId) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { can, allowedWorkspaces, role, isPreviewing } = usePermissions();
  const itemMap = Object.fromEntries(navItems.map((n) => [n.href, n]));
  const groups = navGroups[activeWorkspace];
  const visibleItem = (item: NavItemDef | undefined): item is NavItemDef =>
    !!item && (!item.permission || (Array.isArray(item.permission) ? item.permission.some(can) : can(item.permission)));

  function handleWorkspaceChange(id: WorkspaceId) {
    setActiveWorkspace(id);
    router.push(navGroups[id][0]?.items[0] ?? "/dashboard");
  }

  return (
    <aside
      className={cn(
        "z-30 hidden h-full shrink-0 flex-col border-r border-border bg-card lg:flex",
        "transition-[width] duration-300 ease-out overflow-hidden",
        collapsed ? "w-[72px]" : "w-[256px]"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={cn(
        "flex items-center pt-6 pb-4 shrink-0",
        collapsed ? "flex-col gap-3 px-2" : "justify-between px-4"
      )}>
        <Link href="/dashboard" className="overflow-hidden shrink-0">
          <AnimatePresence initial={false} mode="wait">
            {collapsed ? (
              <motion.div key="m" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <Logo mark />
              </motion.div>
            ) : (
              <motion.div key="f" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <Logo />
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher active={activeWorkspace} collapsed={collapsed} onChange={handleWorkspaceChange} allowed={allowedWorkspaces} />

      {/* Grouped nav — scrollable middle zone, filtered live by the active role's permissions */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {groups.map((group) => {
          const items = group.items.map((href) => itemMap[href]).filter(visibleItem);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <NavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          );
        })}
      </nav>

      {/* CTA card — hidden when collapsed to prevent clipping */}
      {!collapsed && (
        <div className="mx-3 mb-3 shrink-0 rounded-2xl bg-[#4361EE] p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="h-4 w-4 opacity-80" />
            <p className="text-sm font-bold leading-tight">RepairOX Pro</p>
          </div>
          <p className="text-[11px] leading-snug opacity-75 mb-3">
            Unlock advanced reports, multi-branch & API access.
          </p>
          <button className="w-full rounded-xl bg-white/20 hover:bg-white/30 transition px-3 py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" /> Upgrade Plan
          </button>
        </div>
      )}

      {/* Profile footer — centred avatar only when collapsed. Role label reflects
          whichever role is currently driving the UI (real admin, or the role
          being previewed) so the sidebar never looks out of sync with itself. */}
      <div className={cn(
        "mx-3 mb-3 shrink-0 rounded-2xl border shadow-[0_1px_4px_0_rgba(20,30,80,0.06)] transition-colors",
        isPreviewing ? "border-[#B3BFF6] bg-[#F5F7FF]" : "border-border bg-card",
        collapsed ? "flex justify-center p-2" : "p-3"
      )}>
        {collapsed ? (
          <Avatar name={isPreviewing ? role.label : CURRENT_USER.name} size={36} />
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={isPreviewing ? role.label : CURRENT_USER.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                {isPreviewing ? role.label : CURRENT_USER.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {isPreviewing ? "Previewing this role" : CURRENT_USER.email}
              </p>
            </div>
            <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Mobile drawer */
export function MobileSidebar({ open, setOpen, activeWorkspace, setActiveWorkspace }: {
  open: boolean;
  setOpen: (v: boolean) => void;
  activeWorkspace: WorkspaceId;
  setActiveWorkspace: (id: WorkspaceId) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { can, allowedWorkspaces: allowed } = usePermissions();
  const itemMap = Object.fromEntries(navItems.map((n) => [n.href, n]));
  const groups = navGroups[activeWorkspace];
  const visibleItem = (item: NavItemDef | undefined): item is NavItemDef =>
    !!item && (!item.permission || (Array.isArray(item.permission) ? item.permission.some(can) : can(item.permission)));

  function handleWorkspaceChange(id: WorkspaceId) {
    setActiveWorkspace(id);
    router.push(navGroups[id][0]?.items[0] ?? "/dashboard");
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
            onClick={() => setOpen(false)}
          />
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-card lg:hidden overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 pt-5 pb-4 shrink-0">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            {/* Workspace switcher */}
            {allowed.length > 1 && (
              <div className="mx-3 mb-4 flex items-center gap-1 rounded-xl bg-muted p-1 shrink-0">
                {allowed.map((w) => (
                  <button
                    key={w.id}
                    title={w.label}
                    onClick={() => handleWorkspaceChange(w.id)}
                    className={cn(
                      "flex-1 truncate rounded-lg px-1.5 py-1.5 text-[11.5px] font-semibold leading-tight transition",
                      activeWorkspace === w.id
                        ? "bg-[#4361EE] text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    {w.navLabel ?? w.label}
                  </button>
                ))}
              </div>
            )}

            <nav className="flex-1 overflow-y-auto px-3 pb-2">
              {groups.map((group) => {
                const items = group.items.map((href) => itemMap[href]).filter(visibleItem);
                if (items.length === 0) return null;
                return (
                  <div key={group.label} className="mb-4">
                    <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {items.map((item) => {
                        const Icon = ICONS[item.icon] ?? Home;
                        const active = pathname === item.href;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={() => setOpen(false)}
                              className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                                active ? "bg-[#4361EE] text-white" : "text-zinc-600 hover:bg-muted"
                              )}
                            >
                              <Icon className="h-[18px] w-[18px] shrink-0" />
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>

            <div className="mx-3 mb-3 shrink-0 rounded-2xl bg-[#4361EE] p-4 text-white">
              <p className="text-sm font-bold mb-1">RepairOX Pro</p>
              <p className="text-[11px] opacity-75 mb-3">Unlock advanced reports & multi-branch.</p>
              <button className="w-full rounded-xl bg-white/20 hover:bg-white/30 transition px-3 py-1.5 text-xs font-semibold">
                Upgrade Plan
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
