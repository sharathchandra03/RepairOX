"use client";

/* ──────────────────────────────────────────────────────────────────────────
   InventorySidebar — the dedicated sidebar shown on every /inventory page.
   The main RepairOX sidebar is swapped out (see app-shell.tsx); the user gets
   back to it with the "RepairOX menu" pill at the top.

   • Sections are collapsible (accordion — only the active section is open) so a
     long module stays short.
   • Collapsed (icon-only) mode shows the section icons with the shared
     SidebarTooltip; clicking one expands the sidebar on that section.
   • The menu search filters every item across all sections.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { ThinScroll } from "@/components/layout/thin-scroll";
import { SidebarTooltip } from "@/components/layout/sidebar-tooltip";
import { usePermissions } from "@/lib/permissions-context";
import { INVENTORY_NAV, sectionForPath, type InvNavItem } from "@/lib/inventory-nav";

const COLLAPSE_KEY = "repairox-inventory-sidebar-collapsed";

function itemActive(pathname: string, href: string): boolean {
  return href === "/inventory" ? pathname === "/inventory" : pathname === href || pathname.startsWith(href + "/");
}

export function InventorySidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => sectionForPath(pathname) ?? "overview");

  // Remember the user's collapsed preference.
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = (v: boolean) => {
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };

  // Keep the active section open when the route changes (deep links, back/forward).
  useEffect(() => {
    const id = sectionForPath(pathname);
    if (id) setOpenId(id);
  }, [pathname]);

  const visible = (it: InvNavItem) => !it.permission || it.permission.some((k) => can(k as never));

  const q = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      INVENTORY_NAV.map((s) => ({
        ...s,
        items: s.items.filter((it) => visible(it) && (!q || it.label.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))),
      })).filter((s) => s.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, can]
  );

  return (
    <aside
      className={cn(
        "rox-sidebar z-30 hidden h-full shrink-0 flex-col overflow-hidden border-r-2 border-[#33406B] bg-gradient-to-b from-[#4D5C8C] via-[#455383] to-[#3C4977] text-white shadow-[4px_0_14px_-8px_rgba(30,40,80,0.45)] lg:flex",
        "[transition:width_300ms_cubic-bezier(0.4,0,0.2,1)] [will-change:width]",
        collapsed ? "w-[72px]" : "rox-sidebar-expanded w-[256px]"
      )}
      data-inventory-sidebar
    >
      {/* Logo + collapse */}
      <div className={cn("flex shrink-0 items-center pb-3 pt-6", collapsed ? "flex-col gap-3 px-2" : "justify-between px-4")}>
        <Link href="/inventory" className="shrink-0 overflow-hidden">
          {collapsed ? <Logo mark /> : <Logo onDark className="text-white" />}
        </Link>
        <button
          onClick={() => toggleCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand inventory menu" : "Collapse inventory menu"}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-r from-[#6F87FF] to-[#4F6BF5] text-white transition-transform hover:scale-105 active:scale-95"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Back to the main RepairOX menu */}
      <div className={cn("shrink-0 pb-3", collapsed ? "px-3" : "px-4")}>
        <SidebarTooltip label="Back to RepairOX menu" enabled={collapsed}>
          <button
            onClick={() => router.push("/dashboard")}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-full border border-white/30 bg-[#2B3553] text-[13px] font-semibold text-white transition hover:bg-[#1B2238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
              collapsed ? "mx-auto w-10 px-0" : "w-full px-4"
            )}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!collapsed && <span>RepairOX menu</span>}
          </button>
        </SidebarTooltip>
      </div>

      {/* Module identity + search */}
      {!collapsed && (
        <div className="shrink-0 px-4 pb-3">
          <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-[#E3E8FF]">Inventory</p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search inventory menu…"
              aria-label="Search inventory menu"
              className="h-9 w-full rounded-xl border border-white/20 bg-white/10 pl-9 pr-8 text-[13px] text-white placeholder:text-white/55 outline-none transition focus:border-white/50 focus:bg-white/15"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <ThinScroll className={cn("pb-3", collapsed ? "px-2" : "px-3")}>
        {sections.length === 0 && !collapsed && (
          <p className="px-3 py-6 text-center text-[12px] text-white/70">No menu item matches “{query}”.</p>
        )}
        <ul className="space-y-1">
          {sections.map((s) => {
            const SecIcon = s.icon;
            const hasActive = s.items.some((it) => itemActive(pathname, it.href));
            const open = !collapsed && (!!q || openId === s.id);

            if (collapsed) {
              return (
                <li key={s.id}>
                  <SidebarTooltip label={s.label} enabled>
                    <button
                      onClick={() => { toggleCollapsed(false); setOpenId(s.id); }}
                      className={cn(
                        "mx-auto grid h-10 w-10 place-items-center rounded-xl transition",
                        hasActive ? "bg-gradient-to-r from-[#6F87FF] to-[#4F6BF5] shadow-[0_8px_20px_-8px_rgba(67,97,238,0.7)]" : "hover:bg-white/15"
                      )}
                      aria-label={s.label}
                    >
                      <SecIcon className="h-[18px] w-[18px]" />
                    </button>
                  </SidebarTooltip>
                </li>
              );
            }

            return (
              <li key={s.id}>
                <button
                  onClick={() => setOpenId(open && !q ? null : s.id)}
                  aria-expanded={open}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/15",
                    hasActive && !open && "bg-white/10"
                  )}
                >
                  <SecIcon className="h-[18px] w-[18px] shrink-0" />
                  <span className="flex-1 truncate">{s.label}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/70 transition-transform", open && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="ml-[22px] overflow-hidden border-l border-white/20 pl-2"
                    >
                      {s.items.map((it) => {
                        const active = itemActive(pathname, it.href);
                        const Icon = it.icon;
                        return (
                          <li key={it.href} className="py-0.5">
                            <Link
                              href={it.href}
                              className={cn(
                                "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                                active ? "text-white" : "text-white/85 hover:bg-white/12 hover:text-white"
                              )}
                            >
                              {active && (
                                <motion.span
                                  layoutId="inventory-sidebar-active"
                                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#6F87FF] to-[#4F6BF5] shadow-[0_8px_20px_-8px_rgba(67,97,238,0.7)]"
                                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                              )}
                              <Icon className="relative h-4 w-4 shrink-0" />
                              <span className="relative flex-1 truncate">{it.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </ThinScroll>
    </aside>
  );
}
