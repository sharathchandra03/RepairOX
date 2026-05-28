"use client";

import {
  Search, Bell, HelpCircle, MoreHorizontal, ChevronDown, Menu,
  ShoppingBag, ChevronRight, ArrowLeft,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { type ModuleId, navGroups } from "@/lib/mock-data";

const MODULE_META: Record<ModuleId, { label: string; color: string; bg: string }> = {
  crm:   { label: "CRM",         color: "text-[#4361EE]", bg: "bg-[#EEF1FD]" },
  field: { label: "Field Ops",   color: "text-emerald-700", bg: "bg-emerald-50" },
  leads: { label: "Lead Mgmt",   color: "text-violet-700",  bg: "bg-violet-50"  },
};

export function Topbar({
  onMenu,
  activeModule,
  setActiveModule,
}: {
  onMenu: () => void;
  activeModule: ModuleId;
  setActiveModule: (id: ModuleId) => void;
}) {
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const meta = MODULE_META[activeModule];

  function backToCRM() {
    setActiveModule("crm");
    router.push("/dashboard");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex h-[60px] items-center gap-3 px-4 sm:px-6">

        {/* Mobile menu */}
        <button
          onClick={onMenu}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Module breadcrumb — only shown on non-CRM modules */}
        {activeModule !== "crm" && (
          <div className="hidden lg:flex items-center gap-1.5 shrink-0">
            <button
              onClick={backToCRM}
              className="flex items-center gap-1.5 rounded-full border border-[#E5E9F8] bg-[#F5F7FF] px-3 py-1.5 text-[12px] font-semibold text-[#4361EE] hover:bg-[#EEF1FD] active:scale-95 transition-all"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to CRM
            </button>
            <ChevronRight className="h-3 w-3 text-zinc-300" />
            <span className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold",
              meta.bg, meta.color
            )}>
              {meta.label}
            </span>
          </div>
        )}

        {/* Search pill */}
        <div
          className={cn(
            "relative flex h-9 min-w-0 flex-1 max-w-[360px] items-center gap-2 rounded-full border px-3.5 transition-all duration-200",
            focused
              ? "border-[#4361EE]/40 bg-white shadow-[0_0_0_3px_rgba(67,97,238,0.12)]"
              : "border-border bg-slate-100/80 hover:bg-slate-100"
          )}
        >
          <Search className={cn("h-3.5 w-3.5 shrink-0 transition-colors", focused ? "text-[#4361EE]" : "text-zinc-400")} />
          <input
            placeholder="Search..."
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] text-zinc-800 placeholder:text-zinc-400 outline-none focus:outline-none focus:ring-0"
          />
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-zinc-200 sm:inline-flex">
            ⌘S
          </kbd>
        </div>

        <div className="flex-1" />

        {/* POS shortcut */}
        <Button
          variant="secondary"
          size="sm"
          className="hidden md:inline-flex gap-1.5 rounded-full h-9 px-4"
          onClick={() => router.push("/walk-in")}
        >
          <ShoppingBag className="h-3.5 w-3.5 text-brand-600" />
          <span className="font-semibold text-[13px]">POS</span>
        </Button>

        {/* Icon actions */}
        <div className="flex items-center gap-0.5">
          <button className="grid h-9 w-9 place-items-center rounded-xl text-zinc-400 hover:bg-muted hover:text-zinc-700 transition">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <button className="relative grid h-9 w-9 place-items-center rounded-xl text-zinc-400 hover:bg-muted hover:text-zinc-700 transition">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 inline-flex h-1.5 w-1.5 rounded-full bg-[#4361EE] animate-pulse-dot" />
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-xl text-zinc-400 hover:bg-muted hover:text-zinc-700 transition">
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>

        {/* Profile chip */}
        <button className="hidden md:flex items-center gap-2.5 rounded-full border border-border bg-card pl-1 pr-3 py-1 hover:bg-muted transition">
          <Avatar name="Shop Owner" size={30} />
          <div className="text-left leading-tight">
            <p className="text-[12px] font-semibold text-zinc-800">Kalai S.</p>
            <p className="text-[10px] text-muted-foreground">Team Account</p>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
