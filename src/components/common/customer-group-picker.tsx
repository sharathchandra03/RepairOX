"use client";

/**
 * Multi-select, tag-style picker for assigning a customer to one or more
 * Customer Groups. A customer may belong to MANY groups — this never limits to
 * a single selection. Reads the group catalogue from the store; only active
 * groups are offered, but already-assigned archived groups stay selected so
 * historical memberships aren't silently dropped.
 */

import { useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { groupToneClasses } from "@/lib/customer-data";

export function CustomerGroupPicker({
  value,
  onChange,
  disabled = false,
  emptyHint = "No groups configured yet. Create them in Settings → Customers → Customer Groups.",
}: {
  value: string[];
  onChange: (groupIds: string[]) => void;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const { customerGroups } = useStore();

  // Offer active groups plus any already-selected (even if archived).
  const options = useMemo(() => {
    const selected = new Set(value);
    return [...customerGroups]
      .filter((g) => g.active || selected.has(g.id))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  }, [customerGroups, value]);

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((g) => g !== id) : [...value, id]);
  };

  if (options.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((g) => {
        const active = value.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(g.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition",
              active ? groupToneClasses(g.color) : "bg-muted text-muted-foreground ring-border hover:ring-zinc-300",
              disabled && "cursor-not-allowed opacity-60"
            )}
            title={g.description || g.name}
          >
            {active && <Check className="h-3 w-3" />}
            {g.name}
            {!g.active && <span className="text-[9px] opacity-70">(archived)</span>}
          </button>
        );
      })}
    </div>
  );
}
