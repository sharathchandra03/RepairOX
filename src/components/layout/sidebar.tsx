"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3, ChevronLeft, ChevronRight,
  CalendarDays, UserPlus, Map, BookUser, Package, Wrench,
  ClipboardCheck, Truck, Receipt, Activity, ChevronDown,
  UsersRound, BookOpen, Landmark, FolderTree, Banknote, WalletCards, ShieldCheck,
  IndianRupee, ReceiptIndianRupee,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { ThinScroll } from "@/components/layout/thin-scroll";
import { navItems, navGroups, expandableNavGroups, type NavItem as NavItemDef, type ExpandableNavGroup } from "@/lib/mock-data";
import { type WorkspaceId } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";
import { type VisibilityMode } from "@/lib/feature-visibility";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3, Map, BookUser, Package,
  Wrench, ClipboardCheck, Truck, Receipt, Activity,
  UsersRound, BookOpen, Landmark, FolderTree, Banknote, WalletCards, ShieldCheck,
  IndianRupee, ReceiptIndianRupee,
};

/* Nav item — icon always centred in collapsed mode, no overflow */
function NavItem({ item, collapsed, pathname, comingSoon }: {
  item: NavItemDef;
  collapsed: boolean;
  pathname: string;
  comingSoon?: boolean;
}) {
  const Icon = ICONS[item.icon] ?? Home;
  const href = comingSoon ? `/coming-soon?from=${encodeURIComponent(item.href)}` : item.href;
  // Exact match for module root pages (e.g. /operations, /lead-management) to
  // avoid them staying "active" when a sibling sub-route like /operations/reports is open.
  const isModuleRoot = item.href === "/operations" || item.href === "/lead-management" || item.href === "/dashboard";
  const active = !comingSoon && (isModuleRoot
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/"));
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
        href={href}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group relative flex items-center rounded-xl text-sm font-medium transition-colors",
          collapsed ? "justify-center px-0 py-2.5 mx-1" : "gap-3 px-3 py-2.5",
          active ? "text-white" : comingSoon ? "text-slate-400 hover:bg-slate-50 hover:text-slate-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active"
            className="absolute inset-0 rounded-xl bg-[#4361EE] shadow-[0_8px_24px_-8px_rgba(67,97,238,0.45)]"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        {/* Hover underline — sweeps in from the left and stays while hovered */}
        {!active && !collapsed && (
          <span className="pointer-events-none absolute bottom-1 left-3 right-3 h-0.5 origin-left scale-x-0 rounded-full bg-[#4361EE] transition-transform duration-300 ease-out group-hover:scale-x-100" />
        )}
        <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <Icon className={cn("h-[18px] w-[18px]", active ? "text-white" : comingSoon ? "text-zinc-300" : "text-zinc-400 group-hover:text-zinc-700")} />
        </span>
        {!collapsed && (
          <span className="relative flex items-center gap-2 whitespace-nowrap">
            {item.label}
            {comingSoon && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600 ring-1 ring-inset ring-amber-200">
                Soon
              </span>
            )}
          </span>
        )}
      </Link>
    </motion.li>
  );
}

/* Expandable nav group — collapsible section with children */
function ExpandableNavSection({ group, collapsed, pathname }: {
  group: ExpandableNavGroup;
  collapsed: boolean;
  pathname: string;
}) {
  const Icon = ICONS[group.icon] ?? Home;
  // Auto-expand if any child is active
  const childActive = group.children.some(
    (child) => pathname === child.href || pathname.startsWith(child.href + "/")
  );
  const [expanded, setExpanded] = useState(childActive);

  // Keep expanded in sync when navigating
  if (childActive && !expanded) {
    setExpanded(true);
  }

  if (collapsed) {
    // In collapsed mode, show just the parent icon with a tooltip
    return (
      <li>
        <button
          title={group.label}
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "group relative flex w-full items-center justify-center rounded-xl py-2.5 mx-1 text-sm font-medium transition-colors",
            childActive ? "text-[#4361EE]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
            <Icon className={cn("h-[18px] w-[18px]", childActive ? "text-[#4361EE]" : "text-zinc-400 group-hover:text-zinc-700")} />
          </span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          childActive ? "text-[#4361EE]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        {/* Hover underline — sweeps in from the left */}
        {!childActive && (
          <span className="pointer-events-none absolute bottom-1 left-3 right-3 h-0.5 origin-left scale-x-0 rounded-full bg-[#4361EE] transition-transform duration-300 ease-out group-hover:scale-x-100" />
        )}
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <Icon className={cn("h-[18px] w-[18px]", childActive ? "text-[#4361EE]" : "text-zinc-400 group-hover:text-zinc-700")} />
        </span>
        <span className="flex-1 whitespace-nowrap text-left">{group.label}</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
        >
          <ChevronDown className={cn("h-3.5 w-3.5", childActive ? "text-[#4361EE]" : "text-zinc-400")} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden pl-4 space-y-0.5"
          >
            {group.children.map((child) => {
              const ChildIcon = ICONS[child.icon] ?? Home;
              const active = pathname === child.href || pathname.startsWith(child.href + "/");
              return (
                <motion.li
                  key={child.href}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Link
                    href={child.href}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-[#EEF1FD] text-[#4361EE]"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {/* Hover underline — sweeps in from the left */}
                    {!active && (
                      <span className="pointer-events-none absolute bottom-0.5 left-2.5 right-2.5 h-0.5 origin-left scale-x-0 rounded-full bg-[#4361EE] transition-transform duration-300 ease-out group-hover:scale-x-100" />
                    )}
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                      <ChildIcon className={cn("h-[15px] w-[15px]", active ? "text-[#4361EE]" : "text-zinc-400 group-hover:text-zinc-600")} />
                    </span>
                    <span className="whitespace-nowrap">{child.label}</span>
                    {active && (
                      <motion.span
                        layoutId="sidebar-child-active"
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-[#4361EE]"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </Link>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
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
    const WORKSPACE_ICONS: Record<WorkspaceId, React.ComponentType<{ className?: string }>> = {
      shop: Store,
      leads: UsersRound,
      operations: Truck,
    };
    return (
      <div className="mx-auto mb-3 flex flex-col items-center gap-1 px-1">
        {allowed.map((w) => {
          const Icon = WORKSPACE_ICONS[w.id];
          return (
            <button
              key={w.id}
              title={w.label}
              onClick={() => onChange(w.id)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition",
                active === w.id
                  ? "bg-[#4361EE] text-white"
                  : "bg-muted text-zinc-500 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
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
  const { can, allowedWorkspaces, role, isPreviewing, getVisibilityByHref } = usePermissions();
  const itemMap = Object.fromEntries(navItems.map((n) => [n.href, n]));
  const groups = navGroups[activeWorkspace];
  const expandableGroups = expandableNavGroups[activeWorkspace] ?? [];
  const visibleItem = (item: NavItemDef | undefined): item is NavItemDef =>
    !!item && (!item.permission || (Array.isArray(item.permission) ? item.permission.some(can) : can(item.permission)));
  const visibleExpandableGroup = (group: ExpandableNavGroup): boolean =>
    !group.permission || (Array.isArray(group.permission) ? group.permission.some(can) : can(group.permission));

  /** Check feature visibility — "hidden" items are excluded entirely. */
  const featureVisible = (href: string): boolean => getVisibilityByHref(href) !== "hidden";
  /** Check if an item is "coming_soon". */
  const isComingSoon = (href: string): boolean => getVisibilityByHref(href) === "coming_soon";

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
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="group relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-r from-[#4361EE] to-[#6366F1] text-white transition-transform"
          aria-label="Toggle sidebar"
        >
          {/* Soft blue outer glow, matching the POS button */}
          <span className="pointer-events-none absolute -inset-[1.5px] rounded-full ring-[1.5px] ring-[#4361EE]/40 animate-[glow-pulse_2.5s_ease-in-out_infinite]" />
          {collapsed ? (
            <ChevronRight className="relative z-10 h-3.5 w-3.5 arrow-nudge-right" />
          ) : (
            <ChevronLeft className="relative z-10 h-3.5 w-3.5 arrow-nudge-left" />
          )}
        </motion.button>
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher active={activeWorkspace} collapsed={collapsed} onChange={handleWorkspaceChange} allowed={allowedWorkspaces} />

      {/* Grouped nav — scrollable middle zone, filtered live by the active role's permissions */}
      <ThinScroll className="px-3 pb-2">
        {groups.map((group) => {
          const items = group.items.map((href) => itemMap[href]).filter(visibleItem).filter((item) => featureVisible(item.href));
          // For ADMINISTRATION group, also render expandable groups
          const isAdminGroup = group.label === "ADMINISTRATION";
          const visibleExpandables = isAdminGroup
            ? expandableGroups.filter(visibleExpandableGroup).filter((eg) =>
                eg.children.some((c) => visibleItem(c) && featureVisible(c.href))
              )
            : [];

          if (items.length === 0 && visibleExpandables.length === 0) return null;
          return (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {/* Expandable groups (Employees, Accounts) come first in Administration */}
                {visibleExpandables.map((eg) => (
                  <ExpandableNavSection
                    key={eg.id}
                    group={{
                      ...eg,
                      children: eg.children.filter(visibleItem).filter((c) => featureVisible(c.href)),
                    }}
                    collapsed={collapsed}
                    pathname={pathname}
                  />
                ))}
                {/* Regular flat nav items */}
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <NavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} comingSoon={isComingSoon(item.href)} />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          );
        })}
      </ThinScroll>


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
  const { can, allowedWorkspaces: allowed, getVisibilityByHref } = usePermissions();
  const itemMap = Object.fromEntries(navItems.map((n) => [n.href, n]));
  const groups = navGroups[activeWorkspace];
  const expandableGroups = expandableNavGroups[activeWorkspace] ?? [];
  const visibleItem = (item: NavItemDef | undefined): item is NavItemDef =>
    !!item && (!item.permission || (Array.isArray(item.permission) ? item.permission.some(can) : can(item.permission)));
  const visibleExpandableGroup = (group: ExpandableNavGroup): boolean =>
    !group.permission || (Array.isArray(group.permission) ? group.permission.some(can) : can(group.permission));

  const featureVisible = (href: string): boolean => getVisibilityByHref(href) !== "hidden";
  const isComingSoon = (href: string): boolean => getVisibilityByHref(href) === "coming_soon";

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
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px] lg:hidden"
          />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-card lg:hidden"
          >
            {/* Logo */}
            <div className="flex items-center justify-between px-4 pt-6 pb-4">
              <Link href="/dashboard" onClick={() => setOpen(false)}>
                <Logo />
              </Link>
              <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted transition">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Workspace switcher */}
            <WorkspaceSwitcher active={activeWorkspace} collapsed={false} onChange={handleWorkspaceChange} allowed={allowed} />

            {/* Nav */}
            <ThinScroll className="px-3 pb-4">
              {groups.map((group) => {
                const items = group.items.map((href) => itemMap[href]).filter(visibleItem).filter((item) => featureVisible(item.href));
                const isAdminGroup = group.label === "ADMINISTRATION";
                const visibleExpandables = isAdminGroup
                  ? expandableGroups.filter(visibleExpandableGroup).filter((eg) =>
                      eg.children.some((c) => visibleItem(c) && featureVisible(c.href))
                    )
                  : [];

                if (items.length === 0 && visibleExpandables.length === 0) return null;
                return (
                  <div key={group.label} className="mb-4">
                    <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {visibleExpandables.map((eg) => (
                        <ExpandableNavSection
                          key={eg.id}
                          group={{
                            ...eg,
                            children: eg.children.filter(visibleItem).filter((c) => featureVisible(c.href)),
                          }}
                          collapsed={false}
                          pathname={pathname}
                        />
                      ))}
                      <AnimatePresence initial={false}>
                        {items.map((item) => (
                          <NavItem key={item.href} item={item} collapsed={false} pathname={pathname} comingSoon={isComingSoon(item.href)} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                );
              })}
            </ThinScroll>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
