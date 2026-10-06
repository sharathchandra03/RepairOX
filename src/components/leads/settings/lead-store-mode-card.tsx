"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Management Store Mode section.

   SELF-CONTAINED: reads from useStoreSettings(), writes immediately on change
   (no external draft/Save dependency). This means it works wherever it's
   placed — Store Information page, a standalone page, or any future location —
   and the two lead-specific fields (lead_store_mode, default_lead_store_id) are
   written independently so a missing-column error never takes down the whole
   Store page's save.

   Controls how Lead Management operates for the whole organization:

     ○ Single Store  — all Leads are managed from one designated store, EVEN IF
                       the business runs multiple shops (the iFix "central sales
                       desk" scenario). Requires a Default Lead Store.
     ○ Multi-Store   — Leads are managed across multiple authorized stores.

   This is INDEPENDENT of the global Shop Management multi-store setup.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Store, Building2, Check, AlertTriangle, Info, ChevronDown, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import Link from "next/link";
import { toast } from "@/components/ui/toaster";
import { useStoreSettings } from "@/lib/store-settings";
import { useStoreContext } from "@/lib/store-context";
import type { LeadStoreMode } from "@/lib/lead-store-mode";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { cn } from "@/lib/utils";

export function LeadStoreModeSection({ canEdit = true }: { canEdit?: boolean }) {
  const { settings, updateSettings } = useStoreSettings();
  const { stores, canViewAllShops } = useStoreContext();
  const { mode, defaultStoreId, defaultStore, singleStoreInactive } = useLeadStoreMode();

  const [pending, setPending] = useState<{ mode: LeadStoreMode; defaultStoreId: string } | null>(null);

  const activeStores = useMemo(
    () => [...stores].sort((a, b) => Number(b.isActive) - Number(a.isActive)),
    [stores],
  );
  const multiShopBusiness = stores.length > 1;

  const beginSwitch = (next: LeadStoreMode) => {
    if (!canEdit || next === mode) return;
    if (next === "single") {
      const seed = defaultStoreId || activeStores.find((s) => s.isActive)?.id || activeStores[0]?.id || "";
      setPending({ mode: "single", defaultStoreId: seed });
    } else {
      setPending({ mode: "multi", defaultStoreId: "" });
    }
  };

  const confirmSwitch = () => {
    if (!pending) return;
    if (pending.mode === "single") {
      updateSettings({ leadStoreMode: "single", defaultLeadStoreId: pending.defaultStoreId });
      const nm = stores.find((s) => s.id === pending.defaultStoreId)?.name || "the selected store";
      toast.success("Lead Management set to Single Store", {
        description: `New leads are assigned to ${nm}. Existing leads unchanged.`,
      });
    } else {
      updateSettings({ leadStoreMode: "multi" });
      toast.success("Lead Management set to Multi-Store", {
        description: "Authorized users can now select from permitted stores. Existing leads unchanged.",
      });
    }
    setPending(null);
  };

  const changeDefaultStore = (storeId: string) => {
    if (!canEdit || storeId === defaultStoreId) return;
    updateSettings({ defaultLeadStoreId: storeId });
    const nm = stores.find((s) => s.id === storeId)?.name || "the selected store";
    toast.success("Default Lead Store updated", {
      description: `New leads will be assigned to ${nm}. Existing leads keep their current store.`,
    });
  };

  const pendingDefaultName = pending?.mode === "single"
    ? stores.find((s) => s.id === pending.defaultStoreId)?.name || "the selected store"
    : "";

  return (
    <div className="space-y-4">
      {/* Explainer: multi-shop + single-store leads = fully supported. */}
      {multiShopBusiness && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#B3BFF6]/60 bg-[#EEF1FD]/40 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
          <p className="text-[12px] leading-relaxed text-[#3A4DBB]">
            This only controls <span className="font-semibold">Lead Management</span>. Your {stores.length} shops
            in Shop Management stay unchanged. You can run all leads from a single store (like a
            central sales desk) while tickets, invoices and field jobs happen at any shop.
          </p>
        </div>
      )}

      {/* Mode options */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeOption
          active={mode === "single"}
          disabled={!canEdit}
          icon={<Store className="h-4 w-4" />}
          title="Single Store"
          description={multiShopBusiness
            ? "All leads are managed from one store — even with multiple shops."
            : "All leads are managed from one designated store."}
          onClick={() => beginSwitch("single")}
        />
        <ModeOption
          active={mode === "multi"}
          disabled={!canEdit}
          icon={<Building2 className="h-4 w-4" />}
          title="Multi-Store"
          description="Leads are managed across multiple authorized stores, each user within their own scope."
          onClick={() => beginSwitch("multi")}
        />
      </div>

      {/* Single mode: Default Lead Store */}
      {mode === "single" && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Default Lead Store
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Dropdown
              align="left"
              width="w-64"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={canEdit ? toggle : undefined}
                  disabled={!canEdit}
                  className={cn(
                    "inline-flex h-[38px] items-center gap-2 rounded-xl border bg-card px-3 text-[13px] font-semibold text-zinc-700 transition",
                    canEdit ? "border-input hover:border-[#4361EE]/50" : "cursor-default border-border opacity-80",
                    open && "border-[#4361EE] ring-2 ring-[#4361EE]/15",
                  )}
                >
                  <Store className="h-3.5 w-3.5 text-[#4361EE]" />
                  <span className="max-w-[180px] truncate">{defaultStore?.name || "Select a store…"}</span>
                  {canEdit && <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}
            >
              {(close) => (
                <div className="max-h-[280px] overflow-y-auto py-0.5">
                  {activeStores.map((s) => (
                    <MenuItem
                      key={s.id}
                      onClick={() => { changeDefaultStore(s.id); close(); }}
                      className={s.id === defaultStoreId ? "bg-[#EEF1FD]" : ""}
                    >
                      <span className="flex flex-1 items-center justify-between gap-2">
                        <span className="font-semibold">{s.name}</span>
                        {s.id === defaultStoreId && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
                      </span>
                    </MenuItem>
                  ))}
                </div>
              )}
            </Dropdown>
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              All new leads go to this store automatically.
            </p>
          </div>

          {!defaultStoreId && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Select a Default Lead Store — leads cannot be created until one is set.</span>
            </div>
          )}
          {singleStoreInactive && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>The selected Lead Store is inactive. Choose an active store to resume lead creation.</span>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Changing this only affects <span className="font-medium">new</span> leads. Existing leads keep their current store.
      </p>

      {/* ── Multi-Store: per-user store access explanation ── */}
      {mode === "multi" && (
        <div className="space-y-3">
          {/* Your authorized stores */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                <Store className="h-3.5 w-3.5" />
              </span>
              <p className="text-[12px] font-semibold text-foreground">
                {canViewAllShops
                  ? `You have access to all ${stores.length} stores`
                  : `Your authorized stores (${stores.length})`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stores.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    s.isActive
                      ? "border-[#4361EE]/20 bg-[#EEF1FD]/50 text-[#3A4DBB]"
                      : "border-zinc-200 bg-zinc-50 text-zinc-400",
                  )}
                >
                  {s.name}
                  {!s.isActive && <span className="text-[9px]">(Inactive)</span>}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Each user can only create and view leads in the stores they&apos;re authorized to access.
            </p>
          </div>

          {/* How-to for owners — grant store access */}
          {canEdit && (
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
              <div className="text-[12px] text-muted-foreground">
                <p className="font-semibold text-foreground">Granting store access to users</p>
                <p className="mt-1 leading-relaxed">
                  To let a user work leads in more than one store, assign them additional stores in{" "}
                  <Link href="/settings/roles-permissions" className="font-semibold text-[#4361EE] hover:underline">
                    Roles &amp; Permissions
                  </Link>{" "}
                  (click a user → Change Store) or in{" "}
                  <Link href="/settings/store/configuration" className="font-semibold text-[#4361EE] hover:underline">
                    Store Configuration
                  </Link>{" "}
                  (open a store → People With Access). To give full access to all stores, grant the
                  <span className="mx-1 rounded bg-[#EEF1FD] px-1.5 py-0.5 font-semibold text-[#3A4DBB]">Multi-Store Access</span>
                  permission in their role.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirmSwitch}
        title={pending?.mode === "single" ? "Switch to Single Store?" : "Switch to Multi-Store?"}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        danger={false}
        description={
          pending?.mode === "single"
            ? `Existing leads will not change. All new leads will go to ${pendingDefaultName}.`
            : "New leads will let authorized users select from their permitted stores. Existing leads will not change."
        }
      />
    </div>
  );
}

/* Also export LeadStoreModeCard as a standalone settings card (for standalone use). */
export { LeadStoreModeSection as LeadStoreModeCard };

function ModeOption({
  active, disabled, icon, title, description, onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition",
        active ? "border-[#4361EE] bg-[#EEF1FD]/50 ring-1 ring-[#4361EE]/20" : "border-border bg-background",
        !disabled && !active && "hover:border-[#4361EE]/40",
        disabled && "cursor-default opacity-80",
      )}
    >
      <span className={cn(
        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
        active ? "bg-[#4361EE] text-white" : "bg-[#EEF1FD] text-[#4361EE]",
      )}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-foreground">{title}</span>
          {active && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
        </span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
