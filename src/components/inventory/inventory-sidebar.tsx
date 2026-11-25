"use client";

/* ──────────────────────────────────────────────────────────────────────────
   InventorySidebar — the dedicated sidebar shown on every /inventory page.
   The main RepairOX sidebar is swapped out (see app-shell.tsx); the user gets
   back to it with the "Main menu" pill at the top.

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
import { useStore } from "@/lib/store";
import { isStockItem, stockStatus } from "@/lib/inventory-analytics";
import { usePermissions } from "@/lib/permissions-context";
import { ICON_ANIM } from "@/components/layout/sidebar";
import { INVENTORY_NAV, sectionForPath, type InvNavItem } from "@/lib/inventory-nav";

/* Hover treatment is IDENTICAL to the main sidebar (lift, frosted ring, soft shadow, sliding line,
   tilting icon) and every colour comes from the same --chrome-* variables, so whatever is saved in
   Settings → System → Preferences applies here too. */
const ROW_BASE = "group relative transition-[background-color,box-shadow,transform] duration-200 transform-gpu hover:-translate-y-0.5 motion-reduce:transform-none";
const ROW_HOVER = "text-white hover:bg-white/15 hover:ring-1 hover:ring-inset hover:ring-white/25 hover:shadow-[0_8px_18px_-10px_rgba(10,20,50,0.55)] hover:text-white";
const LABEL = "font-semibold [text-shadow:0_1px_1px_rgba(15,23,55,0.35)]";
const HOVER_LINE = "pointer-events-none absolute origin-left scale-x-0 rounded-full bg-[color:var(--chrome-line)] transition-transform duration-300 ease-out group-hover:scale-x-100";

const COLLAPSE_KEY = "repairox-inventory-sidebar-collapsed";

function itemActive(pathname: string, href: string): boolean {
  return href === "/inventory" ? pathname === "/inventory" : pathname === href || pathname.startsWith(href + "/");
}

function AlertChip({ out, total, active, dot }: { out: number; total: number; active?: boolean; dot?: boolean }) {
  if (total <= 0) return null;
  const tone = out > 0 ? "bg-rose-500 text-white" : "bg-amber-400 text-amber-950";
  const title = out > 0 ? `${out} out of stock · ${total - out} low` : `${total} low on stock`;
  if (dot) return <span title={title} className={cn("absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold leading-none ring-2 ring-[color:var(--chrome-side-from)]", tone)}>{total > 99 ? "99+" : total}</span>;
  return (
    <span title={title} className={cn("relative ml-auto inline-flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums leading-none shadow-sm", tone, active && "ring-1 ring-white/70")}>
      {out > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/40 motion-reduce:hidden" />}
      <span className="relative">{total > 99 ? "99+" : total}</span>
    </span>
  );
}
export function InventorySidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const { inventory } = useStore();
  /* Live low-stock numbers for the sidebar chip: red when anything is out of stock, amber when only low. */
  const stockAlert = useMemo(() => {
    let out = 0, low = 0;
    for (const i of inventory) {
      if (!isStockItem(i)) continue;
      const st = stockStatus(i);
      if (st === "out") out++; else if (st === "low") low++;
    }
    return { out, low, total: out + low };
  }, [inventory]);
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
        "rox-sidebar z-30 hidden h-full shrink-0 flex-col overflow-hidden border-r-2 border-[color:var(--chrome-side-border)] bg-gradient-to-b from-[color:var(--chrome-side-from)] via-[color:var(--chrome-side-via)] to-[color:var(--chrome-side-to)] text-white shadow-[4px_0_14px_-8px_rgba(30,40,80,0.45)] lg:flex",
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
        <motion.button
          onClick={() => toggleCollapsed(!collapsed)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          aria-label={collapsed ? "Expand inventory menu" : "Collapse inventory menu"}
          className="rox-chrome-keep group relative grid h-[28.2px] w-[28.2px] shrink-0 place-items-center rounded-full bg-gradient-to-r from-[color:var(--chrome-pill-from)] to-[color:var(--chrome-pill-to)] text-[color:var(--chrome-pill-text)] transition-transform"
        >
          {/* Soft blue outer glow, same as the main sidebar toggle */}
          <span className="pointer-events-none absolute -inset-[1.5px] rounded-full ring-[1.5px] ring-[color:var(--chrome-pill-to)] opacity-60 animate-[glow-pulse_2.5s_ease-in-out_infinite]" />
          {collapsed ? (
            <span className="relative z-10 flex items-center -space-x-2 arrow-nudge-right">
              <ChevronRight className="h-3.5 w-3.5" />
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="relative z-10 flex items-center -space-x-2 arrow-nudge-left">
              <ChevronLeft className="h-3.5 w-3.5" />
              <ChevronLeft className="h-3.5 w-3.5" />
            </span>
          )}
        </motion.button>
      </div>

      {/* Back to the main RepairOX menu */}
      <div className={cn("shrink-0 pb-3", collapsed ? "px-3" : "px-4")}>
        <SidebarTooltip label="Back to main menu" enabled={collapsed}>
          <button
            onClick={() => router.push("/dashboard")}
            className={cn(
              "group flex h-9 items-center justify-center gap-2 rounded-full border-[1.5px] border-[color:var(--chrome-accent)] bg-[#2B3553] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-accent)_18%,transparent)] text-[13px] font-semibold text-white transition hover:bg-[#1B2238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
              collapsed ? "mx-auto w-10 px-0" : "w-full px-4"
            )}
          >
            <ArrowLeft className="rox-back-arrow h-4 w-4 shrink-0" />
            {!collapsed && <span>Main menu</span>}
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
                        ROW_BASE, "mx-auto grid h-10 w-10 place-items-center rounded-xl",
                        hasActive ? "rox-nav-active bg-gradient-to-r from-[color:var(--chrome-pill-from)] to-[color:var(--chrome-pill-to)] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.7)]" : ROW_HOVER
                      )}
                      aria-label={s.label}
                    >
                      <SecIcon className={cn(ICON_ANIM, "h-[18px] w-[18px]")} />
                      {s.items.some((it) => it.badge === "lowStock") && <AlertChip out={stockAlert.out} total={stockAlert.total} dot />}
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
                  className={cn(ROW_BASE, "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium", ROW_HOVER)}
                >
                  <span className={cn(HOVER_LINE, "bottom-1 left-3 right-3 h-0.5")} />
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center"><SecIcon className={cn(ICON_ANIM, "h-[18px] w-[18px]")} /></span>
                  <span className={cn("flex-1 truncate", LABEL)}>{s.label}{hasActive && !open && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--chrome-line)] align-middle" />}</span>
                  {!open && s.items.some((it) => it.badge === "lowStock") && <AlertChip out={stockAlert.out} total={stockAlert.total} />}
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
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
                              className={cn(ROW_BASE, "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium", active ? "rox-nav-active text-white" : ROW_HOVER)}
                            >
                              {active && (
                                <motion.span
                                  layoutId="inventory-sidebar-active"
                                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-[color:var(--chrome-pill-from)] to-[color:var(--chrome-pill-to)] shadow-[0_8px_20px_-8px_rgba(67,97,238,0.7)]"
                                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                              )}
                              {!active && <span className={cn(HOVER_LINE, "bottom-0.5 left-2.5 right-2.5 h-0.5")} />}
                              <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"><Icon className={cn(ICON_ANIM, "h-[15px] w-[15px]")} /></span>
                              <span className={cn("relative flex-1 truncate", LABEL)}>{it.label}</span>
                              {it.badge === "lowStock" && <AlertChip out={stockAlert.out} total={stockAlert.total} active={active} />}
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
