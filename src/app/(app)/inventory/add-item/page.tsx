"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Save, Plus, Package, Wrench, Tag, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NoPermission } from "@/components/common/no-permission";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import { formatINR } from "@/lib/utils";
import {
  InventoryItemFields,
  emptyInventoryForm,
  inventoryFormFromItem,
  validateInventoryForm,
  buildInventoryItem,
  inventoryUpdateFromForm,
  type InventoryFormValues,
} from "@/components/inventory/inventory-item-form";

export default function AddItemPage() {
  const { can } = usePermissions();
  const { addInventoryItem, updateInventoryItem, inventory } = useStore();
  const params = useSearchParams();
  const editId = params.get("edit");
  const editItem = editId ? inventory.find((i) => i.id === editId) : null;
  const isEdit = !!editItem;

  const [values, setValues] = useState<InventoryFormValues>(() => emptyInventoryForm());
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Populate form values when editing an existing item (opening fields are not
  // re-editable on edit — see inventoryFormFromItem).
  useEffect(() => {
    if (editItem && !hydrated) {
      setValues(inventoryFormFromItem(editItem));
      setHydrated(true);
    }
  }, [editItem, hydrated]);

  const set = (patch: Partial<InventoryFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const isService = values.kind === "service";

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  function save(addNew: boolean) {
    const err = validateInventoryForm(values);
    if (err) { flashToast(err); return; }

    if (isEdit && editId) {
      const { patch, cost } = inventoryUpdateFromForm(values);
      updateInventoryItem(editId, patch, { cost });
      flashToast("Item updated successfully");
      return;
    }

    // Create: opening stock flows ONLY through `opening = {qty, unitCost}` →
    // ledger layer (this is the sole opening-stock entry surface). No synthetic
    // cost, no raw currentStock write.
    const { item, cost, opening } = buildInventoryItem(values);
    addInventoryItem(item, { cost, opening });

    flashToast(addNew ? "Item saved — ready for the next one" : "Item saved successfully");
    if (addNew) {
      setValues(emptyInventoryForm());
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Creating a NEW item needs create/manage_inventory; EDITING an existing item
  // needs edit_item/manage_inventory.
  const canCreateItem = can("create") || can("create_item") || can("manage_inventory");
  const canEditItem = can("edit") || can("edit_item") || can("manage_inventory");
  const canUse = isEdit ? canEditItem : canCreateItem;
  if (!canUse) {
    return (
      <NoPermission
        title={isEdit ? "You can't edit this item" : "You don't have permission to create items"}
        subtitle="Ask an administrator to grant the matching Inventory permission in Settings → Roles & Permissions."
      />
    );
  }

  const previewPrice = isService ? values.serviceCharge : values.sellingPrice;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory Management"
        title={isEdit ? "Edit Item" : "Add Item"}
        subtitle={isEdit ? `Editing ${editItem?.name || editId}` : "Create a part/product or repair service with pricing, cost and stock controls."}
        actions={
          <>
            <Link href="/inventory/item-master">
              <Button variant="ghost" size="sm" className="gap-1.5 rounded-full">
                <ArrowLeft className="h-3.5 w-3.5" /> Item Master
              </Button>
            </Link>
            {!isEdit && (
              <Button variant="secondary" size="sm" className="gap-1.5 rounded-full" onClick={() => save(true)}>
                <Plus className="h-3.5 w-3.5" /> Save &amp; Add New
              </Button>
            )}
            <Button size="sm" className="gap-1.5 rounded-full" onClick={() => save(false)}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_330px]">
        {/* ── Form column — the shared canonical field set ── */}
        <div className="space-y-5">
          <InventoryItemFields values={values} onChange={set} canEdit={canUse} />
        </div>

        {/* ── Live preview rail ── */}
        <div className="lg:sticky lg:top-[76px] lg:self-start">
          <div className="rounded-2xl border border-border bg-card shadow-card">
            <div className="border-b border-border px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live Preview</p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/50">
                  {isService ? <Wrench className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold">{values.name || "New item"}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {(isService ? values.serviceCode : values.itemCode) || "Code — auto on save"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone={isService ? "violet" : "info"}>{isService ? "Repair Service / Labour" : "Part / Product"}</Badge>
                {values.category && <Badge tone="brand"><Tag className="h-3 w-3" />{values.category}</Badge>}
              </div>

              <dl className="mt-4 space-y-2.5 text-[13px]">
                <PreviewRow label={isService ? "Service charge" : "Selling price"} value={previewPrice ? formatINR(Number(previewPrice)) : "—"} />
                <PreviewRow label="Tax" value={`${values.tax}%`} />
                <PreviewRow label={isService ? "Billing basis" : "UOM"} value={values.uom} />
                {!isService && values.trackStock && <PreviewRow label="Opening qty" value={values.currentStock || "0"} />}
              </dl>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#B3BFF6]/60 bg-[#EEF1FD]/60 p-4">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Tip: Cost Price stays internal and never prints on the customer document. Set realistic min/max levels to unlock low-stock alerts and reorder recommendations.
            </p>
          </div>
        </div>
      </div>

      {/* Success toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-emerald-200 bg-white px-4 py-2.5 shadow-[0_12px_40px_-12px_rgba(16,185,129,0.45)]"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-[13px] font-semibold text-foreground">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tnum">{value}</dd>
    </div>
  );
}
