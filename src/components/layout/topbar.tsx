"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, ChevronDown, Bell, LayoutGrid, ShoppingBag,
  Headphones, Menu, Sparkles,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const [focused, setFocused] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          onClick={onMenu}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Search */}
        <div
          className={cn(
            "relative flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3.5 transition duration-200",
            focused
              ? "bg-card shadow-[0_0_0_3px_rgba(244,63,94,0.18)]"
              : "bg-zinc-100/80 hover:bg-zinc-100"
          )}
        >
          <Search className={cn("h-4 w-4 shrink-0 transition-colors", focused ? "text-brand-600" : "text-zinc-500")} />
          <input
            placeholder="Search tickets, customers, devices, parts…"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-500 outline-none focus:outline-none focus:ring-0"
          />
          <kbd className="ml-2 hidden shrink-0 items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-200 sm:inline-flex">
            ⌘<span className="font-semibold">K</span>
          </kbd>
        </div>

        {/* Quick add */}
        <button
          className="hidden h-11 w-11 shrink-0 grid place-items-center rounded-2xl brand-gradient text-white shadow-glow transition hover:scale-[1.04] active:scale-95 sm:grid"
          aria-label="Quick add"
        >
          <Plus className="h-4 w-4" />
        </button>

        {/* POS */}
        <Button variant="secondary" size="md" className="hidden md:inline-flex gap-2 rounded-2xl">
          <ShoppingBag className="h-4 w-4 text-brand-600" />
          <span className="font-semibold">POS</span>
        </Button>

        {/* Support */}
        <button className="hidden md:inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted">
          <Headphones className="h-4 w-4 text-brand-600" />
          Contact Support
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {/* Notifications */}
        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-card animate-pulse-dot" />
        </button>

        {/* App grid */}
        <button className="hidden h-10 w-10 grid place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted md:grid">
          <LayoutGrid className="h-4 w-4" />
        </button>

        {/* Profile */}
        <div className="hidden md:flex items-center gap-2 rounded-2xl border border-border bg-card pl-3 pr-2 py-1">
          <div className="text-right leading-tight">
            <p className="text-xs font-semibold">Shop Owner</p>
            <p className="text-[10px] text-muted-foreground">abc@gmail.com</p>
          </div>
          <Avatar name="Shop Owner" size={32} />
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Subtle ambient gradient under topbar */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </header>
  );
}
