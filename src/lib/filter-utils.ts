/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Design System v2 — Filter helpers.

   Bridges the shared `PinnableFilterDef` (select-style filters used by the
   Walk-In / Ticket / Invoice advanced panels) to the canonical removable
   `AppliedFilter` chips (see docs/REPAIROX-DESIGN-SYSTEM.md §3g), so every
   applied filter gets an individual × without each page re-deriving it.
   ────────────────────────────────────────────────────────────────────────── */

import type { AppliedFilter } from "@/components/ui/rox-filter";
import type { PinnableFilterDef } from "@/components/tickets/pinned-filter-bar";

/** A filter value counts as "not applied" (neutral) for these sentinels. */
const NEUTRAL_VALUES = new Set(["", "all", "any"]);

/**
 * Map a list of select-style `PinnableFilterDef`s to removable `AppliedFilter`
 * chips. A filter is "applied" when its value is not neutral. Clearing a chip
 * resets the filter to its neutral value — the first option's value (typically
 * "All …"), falling back to the first NEUTRAL sentinel found in its options,
 * else "all".
 */
export function pinnableToApplied(filters: PinnableFilterDef[]): AppliedFilter[] {
  const out: AppliedFilter[] = [];
  for (const f of filters) {
    if (NEUTRAL_VALUES.has(f.value)) continue;
    const selected = f.options?.find((o) => o.value === f.value);
    // Prefer the first option's value as the reset target (usually "All …");
    // otherwise the first neutral sentinel present; otherwise "all".
    const neutral =
      f.options?.[0]?.value ??
      f.options?.find((o) => NEUTRAL_VALUES.has(o.value))?.value ??
      "all";
    out.push({
      id: f.id,
      label: f.label,
      value: selected?.label ?? f.value,
      onClear: () => f.onChange(neutral),
    });
  }
  return out;
}
