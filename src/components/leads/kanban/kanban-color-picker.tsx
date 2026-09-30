"use client";

/* Compact controlled color picker for boards + columns. Uses the RepairOX
   Kanban palette (KANBAN_COLORS) — never arbitrary CSS colors. */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { KANBAN_COLORS, type KanbanColor } from "@/lib/lead-kanban";

export function KanbanColorPicker({
  value,
  onChange,
  size = 20,
}: {
  value: KanbanColor;
  onChange: (color: KanbanColor) => void;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {KANBAN_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          title={c.label}
          onClick={() => onChange(c.key)}
          style={{ width: size, height: size }}
          className={cn(
            "grid place-items-center rounded-full transition",
            c.dot,
            value === c.key ? "ring-2 ring-offset-2 ring-zinc-400" : "hover:scale-110",
          )}
        >
          {value === c.key && <Check className="h-3 w-3 text-white" />}
        </button>
      ))}
    </div>
  );
}
