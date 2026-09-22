"use client";

/* ──────────────────────────────────────────────────────────────────────────
   StoreMultiSelect — the RepairOX standard store filter for list/table pages.

   This is the permission-aware, multi-select replacement for the older
   single-value <StoreFilter>. It lives in the shared TableUtilityBar (right
   side of the utility row) so the Store control sits in the SAME place on every
   module (Tickets, Invoices, Walk-In, Field, Leads, …).

   Behaviour
   ─────────
     • Multi-store users (can enter All Shops — resolved from the CENTRAL
       `multi_store_access` capability via useStoreContext().canViewAllShops)
       get a checkbox dropdown:
         [✓] All Stores
         [ ] Koramangala
         [ ] Indiranagar   …
       Selecting "All Stores" = the org-wide authorized scope (value = []).
       Ticking specific stores narrows the query to exactly those stores.
       Ticking every store normalises back to "All Stores".
     • Single-store users (no multi-store access) see a static, non-interactive
       store chip — no dropdown, no unauthorized store names. The interface
       stays clean and their store context is implied.

   Value model
   ───────────
     value: string[]  — selected branch ids. EMPTY array = "All Stores" (the
     full authorized scope). The parent filters rows with `matchesStoreSelection`.

   Security
   ────────
     Options come ONLY from useStoreContext().stores, which is already scoped to
     the user's authorized stores (org + membership + role + RLS). We never list
     a store the user can't access. Hiding the control is convenience, not
     security — the server routes + RLS remain the real enforcement.

   Default persistence
   ───────────────────
     Multi-store users can save their current selection as the default that is
     restored on their next visit (persisted per-user in localStorage). This is
     the "default multi-store selector saved in Kiro" behaviour.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { Check, ChevronDown, Store as StoreIcon } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { Checkbox } from "@/components/ui/checkbox";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { cn } from "@/lib/utils";

const DEFAULT_PREFIX = "repairox-store-multiselect-default::";

/** Read the saved default store selection for the signed-in user. */
function readSavedDefault(userId: string | null | undefined): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DEFAULT_PREFIX}${userId ?? "anon"}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : null;
  } catch {
    return null;
  }
}

/** Persist (or clear) the default store selection for the signed-in user. */
function writeSavedDefault(userId: string | null | undefined, ids: string[] | null): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${DEFAULT_PREFIX}${userId ?? "anon"}`;
    if (ids === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function StoreMultiSelect({
  value,
  onChange,
  className,
  /** min-width class for the trigger — compact, never excessively wide. */
  width = "min-w-[150px]",
}: {
  /** Selected branch ids. EMPTY array = "All Stores" (full authorized scope). */
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  width?: string;
}) {
  const { stores, canViewAllShops } = useStoreContext();
  const { currentUser } = usePermissions();

  // Restore the user's saved default selection ONCE on mount (multi-store only).
  const restoredRef = React.useRef(false);
  React.useEffect(() => {
    if (restoredRef.current) return;
    if (!canViewAllShops || stores.length <= 1) return;
    restoredRef.current = true;
    const saved = readSavedDefault(currentUser?.id);
    if (saved && saved.length > 0) {
      // Keep only ids the user is still authorized to see.
      const valid = saved.filter((id) => stores.some((s) => s.id === id));
      if (valid.length > 0 && value.length === 0) onChange(valid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAllShops, stores, currentUser?.id]);

  // ── Single-store / no multi-store access → static store chip. ──
  // No dropdown, no other store names. The user's store context is implied.
  if (!canViewAllShops || stores.length <= 1) {
    const only = stores[0];
    if (!only) return null;
    return (
      <div
        className={cn(
          "flex h-[34px] shrink-0 items-center gap-2 rounded-xl border border-[#4361EE]/60 bg-card px-3 text-[13px] font-medium text-foreground",
          width,
          className
        )}
        title={only.name}
      >
        <StoreIcon className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
        <span className="truncate">{only.name}</span>
      </div>
    );
  }

  const allSelected = value.length === 0;
  const total = stores.length;

  // Compact summary label — never a long inline list.
  const summary = (() => {
    if (allSelected || value.length === total) return "All Stores";
    if (value.length === 1) {
      const s = stores.find((x) => x.id === value[0]);
      return s?.name ?? "1 Store";
    }
    // 2 selected → "A + 1 more"; more → "N Stores".
    const first = stores.find((x) => x.id === value[0]);
    if (value.length === 2 && first) return `${first.name} + 1 more`;
    if (first && first.name.length <= 12) return `${first.name} + ${value.length - 1} more`;
    return `${value.length} Stores`;
  })();

  const toggleStore = (id: string) => {
    const set = new Set(value.length === 0 ? [] : value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = Array.from(set);
    // Normalise "every store ticked" back to All Stores (empty scope).
    if (next.length === 0 || next.length === total) onChange([]);
    else onChange(next);
  };

  const selectAll = () => onChange([]); // empty = org-wide authorized scope

  const saveDefault = () => writeSavedDefault(currentUser?.id, value);
  const clearDefault = () => writeSavedDefault(currentUser?.id, null);

  return (
    <Dropdown
      align="left"
      width="w-60"
      className={cn("block shrink-0", width, className)}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-[34px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all duration-150",
            open
              ? "border-[#4361EE] ring-2 ring-[#4361EE]/15"
              : "border-[#4361EE]/60 hover:border-[#4361EE]/80"
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate text-left">
            <StoreIcon className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
            <span className={cn("truncate", allSelected && "text-muted-foreground")}>{summary}</span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col">
          {/* All Stores — resets to the full authorized org-wide scope. */}
          <button
            type="button"
            onClick={() => { selectAll(); }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
              allSelected ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60"
            )}
          >
            <Checkbox checked={allSelected} onChange={() => selectAll()} aria-label="All Stores" />
            <span className="truncate">All Stores</span>
          </button>

          <div className="my-1 h-px bg-border" />

          <div className="max-h-[240px] overflow-y-auto overscroll-contain">
            {stores.map((s) => {
              const checked = !allSelected && value.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleStore(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    checked ? "bg-[#EEF1FD]/70 font-medium text-foreground" : "hover:bg-[#EEF1FD]/60"
                  )}
                >
                  <Checkbox checked={checked} onChange={() => toggleStore(s.id)} aria-label={s.name} />
                  <span className="truncate">{s.code ? `${s.name} (${s.code})` : s.name}</span>
                </button>
              );
            })}
          </div>

          {/* Footer — save the current selection as the personal default, or
              clear it. Lets a multi-store user pin their working set. */}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border px-2.5 pt-2">
            <button
              type="button"
              onClick={() => { saveDefault(); close(); }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]/60"
            >
              <Check className="h-3 w-3" /> Save as default
            </button>
            <button
              type="button"
              onClick={() => { clearDefault(); selectAll(); }}
              className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </Dropdown>
  );
}

/** Filter rows by the multi-store selection. EMPTY selection = keep everything
 *  (the full authorized scope). Otherwise keep rows whose branchId is selected.
 *  Rows with a null/undefined branchId (org-wide records) are kept only when no
 *  specific stores are selected, matching the single-select `filterByStore`. */
export function matchesStoreSelection(
  branchId: string | null | undefined,
  selected: string[]
): boolean {
  if (!selected || selected.length === 0) return true;
  return !!branchId && selected.includes(branchId);
}
