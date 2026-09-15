"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Global header Store Selector.

   Shows the CURRENT store context and lets authorized users switch between
   "All Shops" (consolidated reporting) and any individual store they can
   access. Purely presentational over useStoreContext(); switching triggers a
   store-scoped reload of every module (handled inside store.tsx).

   Design: a compact RepairOX pill (blue theme, soft borders, controlled
   shadow) that sits beside the module switcher without overpowering the
   header. Collapses to an icon-only pill on small screens.
   ────────────────────────────────────────────────────────────────────────── */

import { useRouter, usePathname } from "next/navigation";
import { Store, ChevronDown, Check, Building2, LayoutGrid } from "lucide-react";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { useStoreContext, ALL_SHOPS } from "@/lib/store-context";

export function StoreSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const onOwnerDashboard = pathname === "/owner" || pathname.startsWith("/owner/");
  const {
    stores,
    activeStore,
    isAllShops,
    canSwitchStores,
    canViewAllShops,
    ready,
    setActiveStore,
  } = useStoreContext();

  // Hide entirely until resolved, or when there is nothing to switch (a single
  // store and no All-Shops privilege) — a lone store needs no selector.
  if (!ready) return null;
  if (!canSwitchStores && !canViewAllShops) {
    // Single-store user: show a static, non-interactive context chip so they
    // always know which store they're in, without a switch affordance.
    const only = activeStore ?? stores[0];
    if (!only) return null;
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-[#E5E9F8] bg-[#F5F7FF] px-3 py-1.5 text-[12px] font-semibold text-[#3A4DBB]">
        <Store className="h-3.5 w-3.5" />
        <span className="max-w-[140px] truncate">{only.name}</span>
      </span>
    );
  }

  // On the Owner Dashboard the pill reads "Owner" to make the global context
  // obvious; otherwise it shows the active store or All Shops.
  const label = onOwnerDashboard
    ? "Owner Dashboard"
    : isAllShops
    ? "All Shops"
    : activeStore?.name ?? "Select store";

  return (
    <Dropdown
      align="left"
      width="w-72"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-label="Switch store"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all active:scale-95",
            onOwnerDashboard || isAllShops
              ? "bg-[#EEF1FD] text-[#3A4DBB]"
              : "bg-[#F5F7FF] text-[#3A4DBB]",
            open ? "border-[#B3BFF6]" : "border-[#E5E9F8] hover:border-[#B3BFF6]"
          )}
        >
          {isAllShops || onOwnerDashboard ? <Building2 className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Store context</MenuLabel>

          {canViewAllShops && (
            <MenuItem
              onClick={() => { setActiveStore(ALL_SHOPS); close(); }}
              className={isAllShops ? "bg-[#EEF1FD]" : ""}
            >
              <span className="flex flex-1 items-center justify-between">
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#4361EE]" />
                  <span>
                    <span className="block font-semibold">All Shops</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      Consolidated overview
                    </span>
                  </span>
                </span>
                {isAllShops && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
              </span>
            </MenuItem>
          )}

          {canViewAllShops && <div className="my-1 h-px bg-border" />}

          <div className="max-h-[280px] overflow-y-auto">
            {stores.map((s) => {
              const selected = !isAllShops && activeStore?.id === s.id;
              return (
                <MenuItem
                  key={s.id}
                  onClick={() => { setActiveStore(s.id); close(); }}
                  className={selected ? "bg-[#EEF1FD]" : ""}
                >
                  <span className="flex flex-1 items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                        {(s.code || s.name).slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-semibold">{s.name}</span>
                          {s.environment === "demo" && (
                            <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                              Demo
                            </span>
                          )}
                        </span>
                        {!s.isActive && (
                          <span className="block text-[11px] font-normal text-amber-600">Inactive</span>
                        )}
                      </span>
                    </span>
                    {selected && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
                  </span>
                </MenuItem>
              );
            })}
          </div>

          {canViewAllShops && (
            <>
              <div className="my-1 h-px bg-border" />
              <MenuItem
                onClick={() => { router.push("/owner"); close(); }}
                className={onOwnerDashboard ? "bg-[#EEF1FD]" : ""}
              >
                <span className="flex flex-1 items-center justify-between">
                  <span className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-[#4361EE]" />
                    <span className="font-semibold">Owner Dashboard</span>
                  </span>
                  {onOwnerDashboard && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
                </span>
              </MenuItem>
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}
