"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Kanban card NOTE COLOR picker (personal, digital sticky note).

   A compact swatch row (incl. Default/neutral) used inside the card's ••• menu.
   Selecting a swatch applies instantly (no confirm button) and persists via the
   per-user Kanban state. Keyboard accessible (each swatch is a real button with
   an aria-label + title). This is a PERSONAL visual attribute only — it never
   changes any Lead business data.
   ────────────────────────────────────────────────────────────────────────── */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTE_COLORS, type NoteColor } from "@/lib/lead-kanban";

export function NoteColorPicker({
  value,
  onChange,
  size = 22,
}: {
  value: NoteColor;
  onChange: (color: NoteColor) => void;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Note color">
      {NOTE_COLORS.map((c) => {
        const selected = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            title={c.label}
            aria-label={c.label}
            aria-pressed={selected}
            onClick={() => onChange(c.key)}
            style={{ width: size, height: size }}
            className={cn(
              "grid place-items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE] focus-visible:ring-offset-2",
              c.dot,
              selected ? "ring-2 ring-offset-2 ring-zinc-500" : "hover:scale-110",
            )}
          >
            {selected && <Check className={cn("h-3 w-3", c.key === "default" ? "text-zinc-500" : "text-zinc-700")} />}
          </button>
        );
      })}
    </div>
  );
}
