"use client";

import * as React from "react";
import { ChevronDown, Users } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { SalesAgent } from "@/lib/sales-agents";

/* AgentMultiSelect — the owner's multi-select agent scope control for the Sales
   Book. Mirrors the RepairOX StoreMultiSelect pattern (checkbox dropdown, brand
   styling, compact summary). EMPTY selection = "All authorized Sales Agents"
   (the full team). Options come ONLY from the already-authorized, store-scoped
   agent directory the caller passes in — never a wider list. */

export function AgentMultiSelect({
  agents,
  value,
  onChange,
  className,
  width = "min-w-[240px]",
}: {
  /** The eligible, store-scoped Sales Agent directory (authorized set only). */
  agents: SalesAgent[];
  /** Selected agent ids. EMPTY = all authorized agents (the whole team). */
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  width?: string;
}) {
  const total = agents.length;
  const allSelected = value.length === 0 || value.length === total;

  const summary = (() => {
    if (allSelected) return `All authorized Sales Agents (${total})`;
    if (value.length === 1) return agents.find((a) => a.id === value[0])?.name ?? "1 agent";
    const first = agents.find((a) => a.id === value[0]);
    if (first && first.name.length <= 14) return `${first.name} + ${value.length - 1} more`;
    return `${value.length} agents selected`;
  })();

  const toggle = (id: string) => {
    const set = new Set(value.length === 0 ? [] : value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = Array.from(set);
    // Normalise "every agent ticked" back to All (empty scope).
    if (next.length === 0 || next.length === total) onChange([]);
    else onChange(next);
  };
  const selectAll = () => onChange([]);

  return (
    <Dropdown
      align="left"
      width="w-72"
      className={cn("block", width, className)}
      trigger={({ open, toggle: t }) => (
        <button
          type="button"
          onClick={t}
          className={cn(
            "flex h-[36px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all duration-150",
            open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-input hover:border-[#4361EE]/40",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate text-left">
            <Users className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
            <span className={cn("truncate", allSelected && "text-muted-foreground")}>{summary}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={selectAll}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
              allSelected ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60",
            )}
          >
            <Checkbox checked={allSelected} onChange={selectAll} aria-label="All authorized Sales Agents" />
            <span className="truncate">All authorized Sales Agents</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{total}</span>
          </button>

          <div className="my-1 h-px bg-border" />

          {agents.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No authorized Sales Agents for this scope.</p>
          ) : (
            <div className="max-h-[260px] overflow-y-auto overscroll-contain">
              {agents.map((a) => {
                const checked = !allSelected && value.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                      checked ? "bg-[#EEF1FD]/70 font-medium text-foreground" : "hover:bg-[#EEF1FD]/60",
                    )}
                  >
                    <Checkbox checked={checked} onChange={() => toggle(a.id)} aria-label={a.name} />
                    <Avatar name={a.name} src={a.avatarUrl} size={22} />
                    <span className="truncate">{a.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!allSelected && (
            <div className="mt-1 flex items-center justify-between gap-2 border-t border-border px-2.5 pt-2">
              <span className="text-[11px] text-muted-foreground">{value.length} of {total} selected</span>
              <button type="button" onClick={selectAll} className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">Reset</button>
            </div>
          )}
        </div>
      )}
    </Dropdown>
  );
}
