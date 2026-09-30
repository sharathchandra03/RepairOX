"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Add Inventory modal (centered).

   Opens the CANONICAL Inventory Master create form (InventoryItemFields) inside
   the shared RoxCenteredForm shell so a new Inventory Master record can be
   created WITHOUT leaving the Create Invoice flow. It persists through the same
   DB-first path as the Inventory module (useStore().addInventoryItem) — there
   is no invoice-only inventory record. On success it returns the created
   InventoryItem so the caller can optionally add it as an invoice line item.

   This modal is DISTINCT from adding an invoice line item:
     • Add Inventory (this modal)  → creates a canonical Inventory Master item.
     • Search Inventory / Add Line → bills an existing item / a service on the
       invoice (handled by the invoice flow, not here).

   Gate the trigger with CAP.inventory.create per the permission-matrix steering.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import type { InventoryItem } from "@/lib/inventory-data";
import {
  InventoryItemFields,
  emptyInventoryForm,
  validateInventoryForm,
  buildInventoryItem,
  type InventoryFormValues,
} from "@/components/inventory/inventory-item-form";

export function AddInventoryModal({
  open,
  onClose,
  onCreated,
  /** Prefill the item name (e.g. the term the user just searched for). */
  initialName,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful create with the persisted item, so the caller can
   *  add it as an invoice line item. */
  onCreated?: (item: InventoryItem) => void;
  initialName?: string;
}) {
  const { can } = usePermissions();
  const { addInventoryItem } = useStore();
  const canCreate = allow(can, CAP.inventory.create);

  const [values, setValues] = useState<InventoryFormValues>(() => ({ ...emptyInventoryForm(), name: initialName ?? "" }));
  const [saving, setSaving] = useState(false);

  // Re-seed the form whenever the modal (re)opens so a fresh search term
  // prefills the name and stale input never leaks between opens.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setValues({ ...emptyInventoryForm(), name: initialName ?? "" });
  }

  const patch = (p: Partial<InventoryFormValues>) => setValues((v) => ({ ...v, ...p }));

  async function handleSave() {
    if (saving) return; // guard against double submit
    const err = validateInventoryForm(values);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const item = buildInventoryItem(values);
      await addInventoryItem(item);
      toast.success(`${item.name} added to Inventory Master`);
      onCreated?.(item);
      onClose();
    } catch (e) {
      toast.error("Couldn't create inventory item. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RoxCenteredForm
      open={open}
      onClose={onClose}
      title="Add Inventory"
      subtitle="Create a new item in the Inventory Master"
      icon={PackagePlus}
      width="max-w-2xl"
      canEdit={canCreate}
      readOnlyNote="You don't have permission to create inventory items. Ask an administrator for the Create Item permission."
      readOnlyFooter={<Button variant="outline" onClick={onClose}>Close</Button>}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save to Inventory"}
          </Button>
        </>
      }
    >
      <InventoryItemFields values={values} onChange={patch} />
    </RoxCenteredForm>
  );
}
