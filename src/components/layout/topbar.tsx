"use client";

import {
  Search, Bell, HelpCircle, MoreHorizontal, ChevronDown, Menu,
  ShoppingBag, Check, LayoutGrid,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { navGroups } from "@/lib/mock-data";
import {
  CURRENT_USER,
  WORKSPACE_MAP, type WorkspaceId,
} from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";
import { Can } from "@/components/common/can";

export function Topbar({
  onMenu,
  activeWorkspace,
  setActiveWorkspace,
}: {
  onMenu: () => void;
  activeWorkspace: WorkspaceId;
  setActiveWorkspace: (id: WorkspaceId) => void;
}) {
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const meta = WORKSPACE_MAP[activeWorkspace];
  const { allowedWorkspaces: allowed, role, isPreviewing } = usePermissions();

  function switchWorkspace(id: WorkspaceId) {
    setActiveWorkspace(id);
    router.push(navGroups[id][0]?.items[0] ?? "/dashboard");
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-[60px] items-center gap-3 px-4 sm:px-6">

        {/* Mobile menu */}
        <button
          onClick={onMenu}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Workspace switcher — dropdown when the role has access to more than one */}
        <div className="hidden lg:flex items-center shrink-0">
          {allowed.length > 1 ? (
            <Dropdown
              align="left"
              width="w-64"
              trigger={({ open, toggle }) => (
                <button
                  onClick={toggle}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-95",
                    meta.bg, meta.color,
                    open ? "border-[#B3BFF6]" : "border-transparent hover:border-[#E5E9F8]"
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {meta.label}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>Switch workspace</MenuLabel>
                  {allowed.map((w) => (
                    <MenuItem
                      key={w.id}
                      onClick={() => { switchWorkspace(w.id); close(); }}
                      className={w.id === activeWorkspace ? "bg-muted" : ""}
                    >
                      <span className="flex flex-1 items-center justify-between">
                        <span>
                          <span className="block font-semibold">{w.label}</span>
                          <span className="block text-[11px] font-normal text-muted-foreground">{w.tagline}</span>
                        </span>
                        {w.id === activeWorkspace && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
                      </span>
                    </MenuItem>
                  ))}
                  <div className="my-1 h-px bg-border" />
                  <MenuItem icon={LayoutGrid} onClick={() => { router.push("/workspaces"); close(); }}>
                    All workspaces
                  </MenuItem>
                </>
              )}
            </Dropdown>
          ) : (
            <span className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold", meta.bg, meta.color)}>
              {meta.label}
            </span>
          )}
        </div>

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

        {/* POS shortcut — only for roles allowed to transact at the counter */}
        <Can permission="use_pos">
          <Button
            variant="secondary"
            size="sm"
            className="hidden md:inline-flex gap-1.5 rounded-full h-9 px-4"
            onClick={() => router.push("/walk-in")}
          >
            <ShoppingBag className="h-3.5 w-3.5 text-brand-600" />
            <span className="font-semibold text-[13px]">POS</span>
          </Button>
        </Can>

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

        {/* Profile chip — shows the previewed role's label while previewing, without touching the real admin identity */}
        <button
          className={cn(
            "hidden md:flex items-center gap-2.5 rounded-full border pl-1 pr-3 py-1 transition",
            isPreviewing ? "border-[#B3BFF6] bg-[#F5F7FF]" : "border-border bg-card hover:bg-muted"
          )}
        >
          <Avatar name={CURRENT_USER.name} size={30} />
          <div className="text-left leading-tight">
            <p className="text-[12px] font-semibold text-zinc-800">{CURRENT_USER.name}</p>
            <p className="text-[10px] text-muted-foreground">{role.label}</p>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
