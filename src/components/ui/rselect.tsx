"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

/* Premium RepairOX-themed select. Replaces native <select> in ticket
   creation forms. Supports optional search, consistent blue interaction
   states, and a styled menu (hover/selected highlighting). */
export function RSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable = false,
  menuWidth = "w-64",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  searchable?: boolean;
  menuWidth?: string;
  className?: string;
}) {
  const [q, setQ] = React.useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = searchable && q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  return (
    <Dropdown
      align="left"
      width={menuWidth}
      className="block w-full"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-card px-3.5 text-sm transition-all duration-150",
            open
              ? "border-[#4361EE] ring-2 ring-[#4361EE]/15"
              : "border-border hover:border-[#4361EE]/40 hover:bg-[#4361EE]/[0.03]",
            className
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <div>
          {searchable && (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-[13px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((o) => {
              const isSelected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setQ(""); close(); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    isSelected ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60"
                  )}
                >
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center", isSelected ? "text-[#4361EE]" : "opacity-0")}>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No options found</p>
            )}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
