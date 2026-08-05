"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

/* Premium RepairOX-themed select. Replaces native <select> in ticket
   creation forms. Supports optional search, consistent blue interaction
   states, styled menu (hover/selected highlighting), and creatable mode
   (add new items inline via onAddNew callback).
   
   Dropdown has a fixed max-height and is always scrollable so content
   remains visible regardless of list length. */
export function RSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchable = false,
  menuWidth,
  className,
  onAddNew,
  addLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  searchable?: boolean;
  /** Tailwind width class for the menu panel. Defaults to full trigger width. */
  menuWidth?: string;
  className?: string;
  /** When provided, enables creatable mode — shows "+ Add" option at bottom when query doesn't match exactly. */
  onAddNew?: (name: string) => void;
  /** Custom label for the add-new button. Use "{name}" as placeholder for the query text. Defaults to '+ Add "{name}"'. */
  addLabel?: string;
}) {
  const [q, setQ] = React.useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = searchable && q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  // Determine whether to show the "Add New" action
  const trimmedQ = q.trim();
  const exactMatch = trimmedQ
    ? options.some((o) => o.label.toLowerCase() === trimmedQ.toLowerCase())
    : true;
  // Show add-new when: onAddNew provided AND (user typed something that doesn't match, OR list is empty and user typed)
  const showAddNew = !!onAddNew && searchable && trimmedQ && !exactMatch;
  // Also show add-new when list is completely empty (no options at all) and onAddNew is provided
  const showAddNewEmpty = !!onAddNew && options.length === 0 && !trimmedQ;

  return (
    <Dropdown
      align="left"
      width={menuWidth || "w-72"}
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
        <div className="flex flex-col">
          {searchable && (
            <div className="relative mb-1.5 shrink-0">
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
          <div className="max-h-[200px] min-h-[40px] overflow-y-auto overscroll-contain">
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
            {filtered.length === 0 && !showAddNew && !showAddNewEmpty && (
              <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No options found</p>
            )}
            {filtered.length === 0 && showAddNewEmpty && (
              <p className="px-2.5 py-2 text-center text-[12px] text-muted-foreground">No items yet. Type to add one.</p>
            )}
          </div>
          {(showAddNew || showAddNewEmpty) && (
            <button
              type="button"
              onClick={() => { onAddNew!(trimmedQ || ""); setQ(""); close(); }}
              disabled={!trimmedQ && !showAddNewEmpty}
              className="flex w-full items-center gap-2 border-t border-border px-2.5 py-2.5 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]/60 transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{trimmedQ ? (addLabel ? addLabel.replace("{name}", trimmedQ) : `Add "${trimmedQ}"`) : "Add New"}</span>
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}
