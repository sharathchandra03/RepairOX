"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3, ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { navItems } from "@/lib/mock-data";
import { Avatar } from "@/components/ui/avatar";

const ICONS = {
  Home, Ticket, FileText, Boxes, Users, Recycle, ClipboardList,
  Store, Wallet, Settings, BarChart3,
} as const;

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border bg-card lg:flex",
        "transition-[width] duration-300 ease-out",
        collapsed ? "w-[78px]" : "w-[244px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <Link href="/dashboard" className="overflow-hidden">
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
          className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active ? "text-white" : "text-zinc-700 hover:bg-muted"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl brand-gradient shadow-glow"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative inline-flex h-5 w-5 items-center justify-center">
                    <Icon className={cn("h-[18px] w-[18px]", active ? "text-white" : "text-zinc-500 group-hover:text-foreground")} />
                  </span>
                  <AnimatePresence initial={false}>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -6 }}
                        transition={{ duration: 0.18 }}
                        className="relative whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="m-3 rounded-2xl border border-border bg-gradient-to-b from-muted/60 to-card p-3">
        <div className="flex items-center gap-3">
          <Avatar name="Shop Owner" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm font-semibold leading-tight">Shop Owner</p>
                <p className="truncate text-[11px] text-muted-foreground">abc@gmail.com</p>
              </motion.div>
            )}
          </AnimatePresence>
          <button className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Mobile drawer */
export function MobileSidebar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const pathname = usePathname();
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
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-card lg:hidden"
          >
            <div className="flex items-center justify-between px-4 pt-5 pb-4">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <nav className="px-3">
              <ul className="space-y-0.5">
                {navItems.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                          active ? "brand-gradient text-white" : "text-zinc-700 hover:bg-muted"
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
