"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Settings → Store → Numbering

   Lets the person operating a store set the ALPHABETIC PREFIX on their own
   document IDs — e.g. "KOR" → KOR-T-0001 (tickets), KOR-INV001 (invoices),
   KOR-WK-001 (walk-ins). Only the prefix changes; the numeric sequence stays
   per-store and continues normally, and the Owner (All Shops) sees the same
   prefixed IDs. Saves to the store's own branch_settings row so it never
   affects another store.

   Shown only when operating INSIDE a specific store (not in All Shops mode).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/settings-page";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";

/** Sanitize a prefix to uppercase letters/digits (no spaces or dashes). */
function clean(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function StoreNumberingSection() {
  const { can } = usePermissions();
  const { activeStore, isAllShops, activePrefixes, saveActivePrefixes, ready } = useStoreContext();

  const [ticket, setTicket] = useState("");
  const [invoice, setInvoice] = useState("");
  const [walkin, setWalkin] = useState("");
  const [field, setField] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync local fields when the active store / its prefixes load or change.
  useEffect(() => {
    setTicket(activePrefixes.ticket ?? "");
    setInvoice(activePrefixes.invoice ?? "");
    setWalkin(activePrefixes.walkin ?? "");
    setField(activePrefixes.field ?? "");
  }, [activePrefixes.ticket, activePrefixes.invoice, activePrefixes.walkin, activePrefixes.field, activeStore?.id]);

  if (!ready) return null;

  // Only meaningful inside a specific store. In All Shops mode, guide the user.
  if (isAllShops || !activeStore) {
    return (
      <SettingsSection title="Document Numbering" description="Per-store ID prefixes" icon={Hash}>
        <p className="text-[13px] text-muted-foreground">
          Select a specific store in the header (instead of <span className="font-medium">All Shops</span>) to set that store&apos;s ticket, invoice, walk-in and field-job ID prefixes.
        </p>
      </SettingsSection>
    );
  }

  // Store users need settings permission to edit numbering.
  const canEdit = can("manage_settings") || can("manage_branches") || can("full_access");

  async function save() {
    setSaving(true);
    const res = await saveActivePrefixes({
      ticket: clean(ticket) || null,
      invoice: clean(invoice) || null,
      walkin: clean(walkin) || null,
      field: clean(field) || null,
    });
    setSaving(false);
    if (res.ok) toast.success("Numbering prefixes saved");
    else toast.error(res.error ?? "Could not save prefixes");
  }

  const preview = (p: string, tail: string) => `${clean(p) ? clean(p) + "-" : ""}${tail}`;

  return (
    <SettingsSection
      title="Document Numbering"
      description={`Set ${activeStore.name}'s ID prefixes — the numeric sequence stays the same`}
      icon={Hash}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="tk-prefix">Ticket prefix</Label>
          <Input id="tk-prefix" value={ticket} disabled={!canEdit}
            onChange={(e) => setTicket(clean(e.target.value))} placeholder="e.g. KOR" />
          <p className="text-[11px] text-muted-foreground">Preview: <span className="font-semibold text-[#3A4DBB]">{preview(ticket, "T-0001")}</span></p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-prefix">Invoice prefix</Label>
          <Input id="inv-prefix" value={invoice} disabled={!canEdit}
            onChange={(e) => setInvoice(clean(e.target.value))} placeholder="e.g. KOR" />
          <p className="text-[11px] text-muted-foreground">Preview: <span className="font-semibold text-[#3A4DBB]">{preview(invoice, "INV001")}</span></p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wk-prefix">Walk-In prefix</Label>
          <Input id="wk-prefix" value={walkin} disabled={!canEdit}
            onChange={(e) => setWalkin(clean(e.target.value))} placeholder="e.g. KOR" />
          <p className="text-[11px] text-muted-foreground">Preview: <span className="font-semibold text-[#3A4DBB]">{preview(walkin, "WK-001")}</span></p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fj-prefix">Field Job prefix</Label>
          <Input id="fj-prefix" value={field} disabled={!canEdit}
            onChange={(e) => setField(clean(e.target.value))} placeholder="e.g. KOR" />
          <p className="text-[11px] text-muted-foreground">Preview: <span className="font-semibold text-[#3A4DBB]">{preview(field, "FJ-001")}</span></p>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-[#EEF1FD] px-3 py-2 text-[12px] text-[#3A4DBB]">
        Only the letters in front change. Existing numbers keep their sequence, and new records in this store continue from where the sequence left off.
      </div>

      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={saving}>Save prefixes</Button>
        </div>
      )}
    </SettingsSection>
  );
}
