"use client";

/* ──────────────────────────────────────────────────────────────────────────
   TableUtilityBar — the RepairOX standard for the "Store filter + Search"
   utility group that sits in the RIGHT-SIDE utility area above a list/table.

   REPAIROX TABLE UTILITY BAR STANDARD
   ───────────────────────────────────
   Whenever a list/table page supports store filtering AND search, the Store
   filter and Search must appear together in a consistent, right-aligned utility
   area, in a fixed order:

        LEFT (module-specific)                    RIGHT (this component)
        [All][Today][Yesterday]…      [ All Stores ▼ ]  [ 🔍 Search… ]

     • Order is ALWAYS Store → Search. Never reversed between modules.
     • Store + Search share the same height (34px), vertical centre, gap and
       subtle RepairOX-blue border, so they read as ONE unified group.
     • The Store control is compact (min-width); Search absorbs the remaining
       horizontal space.
     • Responsive: the group wraps as a unit and, when very narrow, stacks
       vertically preserving Store → Search order.

   This is the shared primitive — do NOT reimplement Store+Search per module.
   Only the search `placeholder` (and the wired data handlers) change per page.

   Usage:
     <TableUtilityBar
       storeValue={storeIds}           // string[]  ([] = All Stores)
       onStoreChange={setStoreIds}
       searchValue={q}
       onSearchChange={setQ}
       searchPlaceholder="Search tickets…"
       left={<SegmentedTabs … />}       // optional module-specific left content
     />
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { Search } from "lucide-react";
import { StoreMultiSelect } from "@/components/common/store-multi-select";
import { cn } from "@/lib/utils";

export function TableUtilityBar({
  storeValue,
  onStoreChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  /** Optional module-specific controls rendered on the LEFT (e.g. status tabs). */
  left,
  /** Extra classes for the outer row. */
  className,
  /** Extra classes for the search wrapper (e.g. to cap its width). */
  searchClassName = "w-full sm:w-56 lg:w-64",
  /** Hide the store control entirely (e.g. a non-store-scoped CRM list). */
  hideStore = false,
}: {
  storeValue: string[];
  onStoreChange: (ids: string[]) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  left?: React.ReactNode;
  className?: string;
  searchClassName?: string;
  hideStore?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className
      )}
    >
      {left ? <div className="min-w-0 flex-1">{left}</div> : <div className="hidden lg:block" />}

      {/* RIGHT-SIDE utility area — Store first, Search second. Shares one gap so
          the two controls read as a single unified group and stay vertically
          centred. Wraps as a unit; stacks Store↑ / Search↓ when very narrow. */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        {!hideStore && (
          <StoreMultiSelect value={storeValue} onChange={onStoreChange} />
        )}
        <TableSearch
          value={searchValue}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className={searchClassName}
        />
      </div>
    </div>
  );
}

/** The standardized search box used across every list/table page. Same height,
 *  radius, icon position, typography, subtle RepairOX-blue border + focus ring.
 *  Only the placeholder changes per module. */
export function TableSearch({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-[34px] w-full rounded-xl border border-[#4361EE]/60 bg-card pl-9 pr-3 text-[13px] outline-none transition-all duration-150",
          "placeholder:text-muted-foreground hover:border-[#4361EE]/80",
          "focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
        )}
      />
    </div>
  );
}
