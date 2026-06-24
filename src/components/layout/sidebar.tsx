"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3, ChevronLeft, ChevronRight,
  LogOut, CalendarDays, UserPlus, Map, BookUser, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { navItems, navGroups, modules, type ModuleId } from "@/lib/mock-data";
import { Avatar } from "@/components/ui/avatar";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3, Map, BookUser, Package,
};

/* Nav item — icon always centred in collapsed mode, no overflow */
function NavItem({ item, collapsed, pathname }: {
  item: { href: string; label: string; icon: string };
  collapsed: boolean;
  pathname: string;
}) {
  const Icon = ICONS[item.icon] ?? Home;
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <li>
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
    </li>
  );
}

/* Module switcher pill row */
function ModuleSwitcher({ active, collapsed, onChange }: {
  active: ModuleId;
  collapsed: boolean;
  onChange: (id: ModuleId) => void;
}) {
  if (collapsed) {
    return (
      <div className="mx-auto mb-3 flex flex-col items-center gap-1 px-1">
        {modules.map((m) => (
          <button
            key={m.id}
            title={m.label}
            onClick={() => onChange(m.id)}
            className={cn(
              "h-8 w-8 rounded-lg text-[10px] font-bold transition",
              active === m.id
                ? "bg-[#4361EE] text-white"
                : "bg-muted text-zinc-500 hover:bg-slate-100"
            )}
          >
            {m.short}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="mx-3 mb-4 flex items-center gap-1 rounded-xl bg-muted p-1">
      {modules.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition",
            active === m.id
              ? "bg-[#4361EE] text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function Sidebar({ collapsed, setCollapsed, activeModule, setActiveModule }: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const itemMap = Object.fromEntries(navItems.map((n) => [n.href, n]));
  const groups = navGroups[activeModule];

  function handleModuleChange(id: ModuleId) {
    setActiveModule(id);
    const dest = id === "crm" ? "/dashboard" : (navGroups[id][0]?.items[0] ?? "/dashboard");
    router.push(dest);
  }

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border bg-card lg:flex",
        "transition-[width] duration-300 ease-out overflow-hidden", /* overflow-hidden fixes clipping */
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

      {/* Module switcher */}
      <ModuleSwitcher active={activeModule} collapsed={collapsed} onChange={handleModuleChange} />

      {/* Grouped nav — scrollable middle zone */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items
                .map((href) => itemMap[href])
                .filter(Boolean)
                .map((item) => (
                  <NavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
                ))}
            </ul>
          </div>
        ))}
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

      {/* Profile footer — centred avatar only when collapsed */}
      <div className={cn(
        "mx-3 mb-3 shrink-0 rounded-2xl border border-border bg-card shadow-[0_1px_4px_0_rgba(20,30,80,0.06)]",
        collapsed ? "flex justify-center p-2" : "p-3"
      )}>
        {collapsed ? (
          <Avatar name="Shop Owner" size={36} />
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name="Shop Owner" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">Shop Owner</p>
              <p className="truncate text-[11px] text-muted-foreground">abc@gmail.com</p>
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
export function MobileSidebar({ open, setOpen, activeModule, setActiveModule }: {
  open: boolean;
  setOpen: (v: boolean) => void;
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const itemMap = Object.fromEntries(navItems.map((n) => [n.href, n]));
  const groups = navGroups[activeModule];

  function handleModuleChange(id: ModuleId) {
    setActiveModule(id);
    const dest = id === "crm" ? "/dashboard" : (navGroups[id][0]?.items[0] ?? "/dashboard");
    router.push(dest);
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

            {/* Module switcher */}
            <div className="mx-3 mb-4 flex items-center gap-1 rounded-xl bg-muted p-1 shrink-0">
              {modules.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModuleChange(m.id)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[12px] font-semibold transition",
                    activeModule === m.id
                      ? "bg-[#4361EE] text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-800"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <nav className="flex-1 overflow-y-auto px-3 pb-2">
              {groups.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items
                      .map((href) => itemMap[href])
                      .filter(Boolean)
                      .map((item) => {
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
              ))}
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
