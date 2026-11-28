"use client";
/* ──────────────────────────────────────────────────────────────────────────
   AdminSidebar — the dedicated sidebar for the Admin Hub (Employees +
   Accounts). Same idea and look as the Inventory sidebar: the main RepairOX
   sidebar is swapped out on these pages (see app-shell.tsx) and the "Main menu"
   pill brings it back.
   With only two sections it is always fully open — every page of both sections
   is listed at once, no accordion and no icon-only mode.
   Sections + pages + permissions come from `expandableNavGroups.shop`.
   ────────────────────────────────────────────────────────────────────────── */
import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { ThinScroll } from "@/components/layout/thin-scroll";
import { ICON_ANIM, ICONS } from "@/components/layout/sidebar";
import { expandableNavGroups } from "@/lib/mock-data";
import { usePermissions } from "@/lib/permissions-context";

/* Same hover treatment + --chrome-* colours as the main / Inventory sidebars, so
   Settings → System → Preferences themes it too. */
const ROW_BASE = "group relative transition-[background-color,box-shadow,transform] duration-200 transform-gpu hover:-translate-y-0.5 motion-reduce:transform-none";
const ROW_HOVER = "text-white hover:bg-white/15 hover:ring-1 hover:ring-inset hover:ring-white/25 hover:shadow-[0_8px_18px_-10px_rgba(10,20,50,0.55)] hover:text-white";
const LABEL = "font-semibold [text-shadow:0_1px_1px_rgba(15,23,55,0.35)]";
const HOVER_LINE = "pointer-events-none absolute origin-left scale-x-0 rounded-full bg-[color:var(--chrome-line)] transition-transform duration-300 ease-out group-hover:scale-x-100";

function itemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { can, getVisibilityByHref } = usePermissions();

  const sections = useMemo(() => {
    const ok = (perm?: string | string[]) =>
      !perm || (Array.isArray(perm) ? perm.some((k) => can(k as never)) : can(perm as never));
    return (expandableNavGroups.shop ?? [])
      .filter((g) => ok(g.permission))
      .map((g) => ({
        ...g,
        children: g.children.filter((c) => ok(c.permission) && getVisibilityByHref(c.href) !== "hidden"),
      }))
      .filter((g) => g.children.length > 0);
  }, [can, getVisibilityByHref]);

  return (
    <aside
      className="rox-sidebar rox-sidebar-expanded z-30 hidden h-full w-[256px] shrink-0 flex-col overflow-hidden border-r-2 border-[color:var(--chrome-side-border)] bg-gradient-to-b from-[color:var(--chrome-side-from)] via-[color:var(--chrome-side-via)] to-[color:var(--chrome-side-to)] text-white shadow-[4px_0_14px_-8px_rgba(30,40,80,0.45)] lg:flex"
      data-admin-sidebar
    >
      {/* Logo */}
      <div className="flex shrink-0 items-center px-4 pb-3 pt-6">
        <Link href="/dashboard" className="shrink-0 overflow-hidden">
          <Logo onDark className="text-white" />
        </Link>
      </div>

      {/* Back to the main RepairOX menu */}
      <div className="shrink-0 px-4 pb-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="group flex h-9 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[color:var(--chrome-accent)] bg-[#2B3553] px-4 text-[13px] font-semibold text-white shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-accent)_18%,transparent)] transition hover:bg-[#1B2238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <ArrowLeft className="rox-back-arrow h-4 w-4 shrink-0" />
          <span>Main menu</span>
        </button>
      </div>

      {/* Both sections, always open */}
      <ThinScroll className="px-3 pb-3">
        {sections.map((g) => {
          return (
            <section key={g.id} className="mb-4">
              {/* Same group heading as the main sidebar (INVENTORY / ADMINISTRATION / GENERAL) */}
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-[#E3E8FF] select-none">{g.label}</p>
              <ul className="space-y-0.5">
                {g.children.map((it) => {
                  const active = itemActive(pathname, it.href);
                  const Icon = ICONS[it.icon];
                  return (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className={cn(ROW_BASE, "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", active ? "rox-nav-active text-white" : ROW_HOVER)}
                      >
                        {active && (
                          <motion.span
                            layoutId="admin-sidebar-active"
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-[color:var(--chrome-pill-from)] to-[color:var(--chrome-pill-to)] shadow-[0_8px_20px_-8px_rgba(67,97,238,0.7)]"
                            transition={{ type: "spring", stiffness: 380, damping: 30 }}
                          />
                        )}
                        {!active && <span className={cn(HOVER_LINE, "bottom-1 left-3 right-3 h-0.5")} />}
                        <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
                          {Icon && <Icon className={cn(ICON_ANIM, "h-[18px] w-[18px]")} />}
                        </span>
                        <span className={cn("relative flex-1 truncate", LABEL)}>{it.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </ThinScroll>
    </aside>
  );
}
