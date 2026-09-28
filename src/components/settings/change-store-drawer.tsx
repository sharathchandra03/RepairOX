
import { useEffect, useMemo, useState } from "react";
import { Store, Home, ArrowRight, Check } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import type { StoreBranch } from "@/lib/store-context";

/** "Change store" drawer — RELOCATES a team member to a different HOME store.
 *  The user then operates in the NEW store's data; records they already own in
 *  the old store keep their original store (a store-change audit records the
 *  move). Mirrors the ChangeRoleDrawer pattern. Only stores the caller is
 *  authorized for are offered (the server re-checks scope + org). */
export function ChangeStoreDrawer({
  open,
  onClose,
  memberName,
  currentStoreId,
  currentStoreName,
  stores,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  memberName: string;
  /** The member's current home store id (may be null in local/demo mode). */
  currentStoreId: string | null;
  currentStoreName: string | null;
  /** Stores the caller can assign (from useStoreContext().stores). */
  stores: StoreBranch[];
  onConfirm: (storeId: string) => void;
}) {
  // Only active stores are valid relocation targets.
  const options = useMemo(
    () => stores.filter((s) => s.isActive),
    [stores],
  );

  const [storeId, setStoreId] = useState(currentStoreId ?? options[0]?.id ?? "");

  // Re-seed the draft whenever a different member's drawer opens.
  useEffect(() => {
    if (open) setStoreId(currentStoreId ?? options[0]?.id ?? "");
  }, [open, currentStoreId, options]);

  const target = options.find((s) => s.id === storeId) ?? null;
  const changed = !!storeId && storeId !== currentStoreId;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={Store}
      title="Change Store"
      subtitle={memberName}
      footer={
        <Button className="w-full gap-1.5" disabled={!changed} onClick={() => storeId && onConfirm(storeId)}>
          <Check className="h-4 w-4" /> Relocate to store
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Current → new preview */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Current store</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-semibold">
              <Home className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
              {currentStoreName || "—"}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">New store</p>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-[#4361EE]">{target?.name ?? "—"}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="change-store-select">Assign home store</Label>
          <Select
            id="change-store-select"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            options={options.map((s) => ({ label: s.code ? `${s.name} (${s.code})` : s.name, value: s.id }))}
          />
          {options.length === 0 && (
            <p className="text-[12px] text-muted-foreground">No stores available to assign.</p>
          )}
        </div>

        <p className="rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD]/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#3347D6]">
          This relocates {memberName} to the new store. They&apos;ll start seeing the
          new store&apos;s data and stop seeing the old store&apos;s. Records they
          already own in the old store are unchanged, and this move is recorded in
          their store history.
        </p>
      </div>
    </Drawer>
  );
}
