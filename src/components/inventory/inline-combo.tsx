"use client";

import * as React from "react";
import { ChevronDown, Check, Plus, Search } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

/* Select with inline creation — pick an existing option or create a new one
   without leaving the page (used for Category & Unit of Measurement). */
export function InlineCombo({
  value,
  onChange,
  options,
  onCreate,
  placeholder = "Select…",
  createLabel = "Create",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  onCreate: (name: string) => void;
  placeholder?: string;
  createLabel?: string;
}) {
  const [q, setQ] = React.useState("");
  const filtered = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
  const exactExists = options.some((o) => o.toLowerCase() === q.trim().toLowerCase());

  return (
    <Dropdown
      width="w-[var(--combo-w,100%)]"
      className="block w-full"
      panelClassName="w-full min-w-[14rem]"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-card px-3.5 text-sm transition",
            open ? "border-brand-400 ring-2 ring-brand-200/50" : "border-border hover:bg-muted/40"
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search or create…"
              className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/50"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setQ(""); close(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-muted"
              >
                <span className={cn("grid h-4 w-4 place-items-center", value === o ? "text-[#4361EE]" : "opacity-0")}>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span className="truncate">{o}</span>
              </button>
            ))}
            {filtered.length === 0 && q.trim() === "" && (
              <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No options yet</p>
            )}
          </div>
          {q.trim() && !exactExists && (
            <button
              type="button"
              onClick={() => { onCreate(q.trim()); onChange(q.trim()); setQ(""); close(); }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-2.5 py-2 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]"
            >
              <Plus className="h-3.5 w-3.5" /> {createLabel} “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}
