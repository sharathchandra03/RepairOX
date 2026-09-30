"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — shared Inventory live-search control.

   An ERP/CRM-style command search over the Inventory Master. The user focuses
   the field and types; matching items appear immediately (debounced), with no
   "Search" button. Selecting a result is how an EXISTING inventory item becomes
   an invoice/ticket LINE ITEM — it never creates or mutates a master record.

   • Reads useStore().inventory, which is already scoped to the active store
     (branch_id via the store context) — so results respect multi-store scope.
   • Searches structured fields: item name, item id / SKU, category, HSN.
   • Shows name · id · category, selling price, and live availability (stock −
     reserved) with an out-of-stock flag (never silently bypasses stock state).
   • Empty result → a clean "no inventory found" state with an optional
     "+ Add Inventory" action (shown only when the caller passes onAddInventory,
     which the caller gates on CAP.inventory.create).

   This is the ONE inventory picker — reuse it wherever an inventory line item
   is added (invoice, ticket, POS) rather than duplicating the pattern.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Package, X, Plus, PackageSearch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { cn, formatINR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";

export function InventorySearchBox({
  onSelect,
  onClose,
  onAddInventory,
  autoFocus = true,
  placeholder = "Search inventory by name, SKU, category, or HSN…",
}: {
  onSelect: (item: InventoryItem) => void;
  onClose?: () => void;
  /** When provided, an "+ Add Inventory" action shows in the empty state.
   *  The caller must gate this on CAP.inventory.create. */
  onAddInventory?: (searchTerm: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { inventory } = useStore();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce the query so we don't recompute on every keystroke — the ERP feel
  // is "type → results settle", not a web search page.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  const query = debounced.trim().toLowerCase();
  const results = useMemo(() => {
    if (query.length < 1) return [];
    return inventory
      .filter((item) => {
        if (!item.active) return false;
        return (
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          (item.hsnCode ? item.hsnCode.toLowerCase().includes(query) : false)
        );
      })
      .slice(0, 12);
  }, [inventory, query]);

  const hasQuery = query.length >= 1;
  const noResults = hasQuery && results.length === 0;

  // Enter is a convenience: pick the first result if there is one.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      onSelect(results[0]);
    }
    if (e.key === "Escape" && onClose) onClose();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-input bg-card p-2.5 transition-colors focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/15">
        <Search className="h-4 w-4 shrink-0 text-[#4361EE]" />
        <Input
          value={q}
          onChange={(e: any) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-9 flex-1 border-0 bg-transparent shadow-none focus:ring-0"
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[300px] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
          {results.map((item) => {
            const available = item.currentStock - (item.reservedStock || 0);
            const out = item.type === "Product" && available <= 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition last:border-0 hover:bg-indigo-50/50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                  <Package className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {item.id} · {item.category}
                    {item.hsnCode && item.hsnCode !== "—" ? ` · HSN ${item.hsnCode}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatINR(item.regularSellingPrice)}</p>
                  <span className={cn("text-[10px] font-medium", out ? "text-rose-500" : "text-muted-foreground")}>
                    {item.type === "Service" ? "Service" : out ? "Out of stock" : `Stock: ${available}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {noResults && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-xl border border-border bg-card p-4 shadow-xl">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
              <PackageSearch className="h-4 w-4" />
            </span>
            <p className="text-sm text-muted-foreground">
              No inventory found for &ldquo;<span className="font-medium text-foreground">{debounced.trim()}</span>&rdquo;
            </p>
            {onAddInventory && (
              <button
                type="button"
                onClick={() => onAddInventory(debounced.trim())}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#4361EE] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3347D6]"
              >
                <Plus className="h-3.5 w-3.5" /> Add Inventory
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
