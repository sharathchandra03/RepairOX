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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Package, Wrench, X, Plus, PackageSearch } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, formatINR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";

export function InventorySearchBox({
  onSelect,
  onClose,
  onAddInventory,
  kind,
  autoFocus = true,
  clearOnSelect = true,
  placeholder = "Search inventory by name, SKU, category, or HSN…",
}: {
  onSelect: (item: InventoryItem) => void;
  onClose?: () => void;
  /** When provided, an "+ Add Inventory" action shows in the empty state.
   *  The caller must gate this on CAP.inventory.create. */
  onAddInventory?: (searchTerm: string) => void;
  /** When set, restrict results to this Item Type (part or service). Lets the
   *  invoice Add Part / Add Service paths search their own kind only. */
  kind?: "part" | "service";
  autoFocus?: boolean;
  /** When true (default) picking a result clears the query so the dropdown
   *  collapses and the box is ready for the next search — the "search → pick →
   *  dropdown closes" behaviour. The box itself stays mounted for rapid
   *  multi-add; the caller controls that via onClose. */
  clearOnSelect?: boolean;
  placeholder?: string;
}) {
  const { inventory } = useStore();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Pick a result: notify the caller, then (by default) clear the query so the
  // results dropdown collapses immediately. Keeps focus so the user can type
  // the next item straight away.
  const pick = (item: InventoryItem) => {
    onSelect(item);
    if (clearOnSelect) {
      setQ("");
      setDebounced("");
      // Refocus the input on the next tick so rapid multi-add stays keyboard-driven.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // Anchor the floating dropdown to the input. Portalling to <body> keeps the
  // results from being clipped by an ancestor with overflow-hidden (e.g. the
  // rounded Inventory section card on the invoice/ticket forms).
  const anchorRef = useRef<HTMLDivElement>(null);
  // `placement` + `maxHeight` make the panel flip ABOVE the input when there
  // isn't enough room below (so it never runs off the bottom of the screen),
  // and cap its height to the space actually available in that direction.
  const [rect, setRect] = useState<
    | { left: number; top: number; width: number; placement: "below" | "above"; maxHeight: number }
    | null
  >(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const GAP = 6;        // gap between the input and the panel
  const MARGIN = 12;    // keep the panel this far from the viewport edge

  const measure = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP - MARGIN;
    const spaceAbove = r.top - GAP - MARGIN;
    // Prefer below; flip above only when below is too cramped AND above has more
    // room. Cap at a comfortable 360px so a tall list still scrolls internally.
    const preferAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const placement: "below" | "above" = preferAbove ? "above" : "below";
    const avail = placement === "above" ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(140, Math.min(360, avail));
    setRect({
      left: r.left,
      // For "above" we anchor the panel's BOTTOM to the input top via a CSS
      // transform (translateY(-100%)); `top` stays the input edge either way.
      top: placement === "above" ? r.top - GAP : r.bottom + GAP,
      width: r.width,
      placement,
      maxHeight,
    });
  };

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
        if (kind && item.kind !== kind) return false;
        return (
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          (item.hsnCode ? item.hsnCode.toLowerCase().includes(query) : false)
        );
      })
      .slice(0, 12);
  }, [inventory, query, kind]);

  const hasQuery = query.length >= 1;
  const noResults = hasQuery && results.length === 0;
  const open = results.length > 0 || noResults;

  // Keep the floating panel aligned to the input on open, scroll and resize.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Enter is a convenience: pick the first result if there is one.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      pick(results[0]);
    }
    if (e.key === "Escape" && onClose) onClose();
  };

  const panel =
    mounted && open && rect
      ? createPortal(
          <div
            data-inventory-search-panel="true"
            className="fixed z-[10050]"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              // When flipped above, anchor the panel's bottom to the input top.
              transform: rect.placement === "above" ? "translateY(-100%)" : undefined,
            }}
          >
            {results.length > 0 && (
              <div
                className="overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
                style={{ maxHeight: rect.maxHeight }}
              >
                {results.map((item) => {
                  const isService = item.kind === "service";
                  const available = item.currentStock - (item.reservedStock || 0);
                  const out = !isService && available <= 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      // Use onMouseDown so the pick fires before the input's
                      // blur / outside-click close logic can run.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(item);
                      }}
                      className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition last:border-0 hover:bg-indigo-50/50"
                    >
                      {/* Kind-differentiating icon: Part = blue Package,
                          Repair Service / Labour = amber Wrench. */}
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                          isService ? "bg-amber-100 text-amber-600" : "bg-[#EEF1FD] text-[#4361EE]",
                        )}
                        title={isService ? "Repair Service / Labour" : "Part / Product"}
                      >
                        {isService ? <Wrench className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          {/* Explicit kind tag so Part vs Service is unmistakable
                              even in the combined Item autocomplete. */}
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                              isService ? "bg-amber-100 text-amber-700" : "bg-[#EEF1FD] text-[#4361EE]",
                            )}
                          >
                            {isService ? "Service" : "Part"}
                          </span>
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {item.id} · {item.category}
                          {item.hsnCode && item.hsnCode !== "—" ? ` · HSN ${item.hsnCode}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">{formatINR(item.regularSellingPrice)}</p>
                        <span className={cn("text-[10px] font-medium", out ? "text-rose-500" : "text-muted-foreground")}>
                          {isService ? "Service" : out ? "Out of stock" : `Stock: ${available}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {noResults && (
              <div className="rounded-xl border border-border bg-card p-4 shadow-xl">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
                    <PackageSearch className="h-4 w-4" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    No inventory found for &ldquo;<span className="font-medium text-foreground">{debounced.trim()}</span>&rdquo;
                  </p>
                  {onAddInventory ? (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onAddInventory(debounced.trim());
                      }}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#4361EE] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3347D6]"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add to Inventory
                    </button>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Add it in the Inventory module first.</p>
                  )}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={anchorRef}>
      <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3 py-1.5 transition-colors focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/15">
        <Search className="h-4 w-4 shrink-0 text-[#4361EE]" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground focus:ring-0 focus-visible:shadow-none focus-visible:ring-0 focus-visible:outline-none"
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

      {panel}
    </div>
  );
}
