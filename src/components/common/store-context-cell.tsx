"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX Design System v2 — SHARED STORE-CONTEXT CELL
   ────────────────────────────────────────────────────────────────────────
   A single, reusable way to render a store's IDENTITY (code avatar + name)
   inside any multi-store table row. It is the canonical "which store does this
   record belong to?" affordance for the consolidated All-Shops views.

   It shows a store's identity as text only — NO avatar, NO code label — just
   the store NAME in strong, dark, larger/bolder type so the owner can identify
   a row's store at a glance.

   Data-driven ONLY: pass the authoritative store row (resolved from
   Ticket.store_id → Store via useStoreContext().getStore). Never derive the
   store from an ID prefix, the current selection, the URL, or the customer.

   Reuse this in Tickets first, then Invoice / Walk-In / Lead / Field / Reports
   when those tables go multi-store.
   ────────────────────────────────────────────────────────────────────────── */

import type { StoreBranch } from "@/lib/store-context";
import { cn } from "@/lib/utils";

export type StoreContextCellMode = "stacked" | "inline";

export function StoreContextCell({
  store,
  mode = "stacked",
  className,
}: {
  /** Authoritative store row (Ticket.store_id → Store). Null = unresolved. */
  store: Pick<StoreBranch, "id" | "name" | "code"> | null | undefined;
  /** "stacked" = default table cell; "inline" = dense contexts (chips/mobile). */
  mode?: StoreContextCellMode;
  className?: string;
}) {
  // Unresolved store → neutral em-dash fallback (never invent an identity).
  if (!store) {
    return <span className={cn("text-[14px] text-muted-foreground", className)}>—</span>;
  }

  // Store NAME only — larger + bolder than the surrounding row text so it reads
  // as the primary identifier. Inline mode stays a touch smaller for density.
  return (
    <span
      className={cn(
        "block min-w-0 truncate font-bold text-slate-900",
        mode === "inline" ? "text-[12px]" : "text-[13px] leading-tight",
        className,
      )}
      title={store.name}
    >
      {store.name}
    </span>
  );
}
