"use client";

/* Inventory → Vendors: supplier master used by Purchase Orders, GRNs, vendor
   returns and warranty claims. */

import { useMemo, useState } from "react";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { Label } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvPageHeader } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import type { Vendor } from "@/lib/inventory-ops";
import { cn } from "@/lib/utils";

const blank = (id: string): Vendor => ({ id, name: "", contactPerson: "", phone: "", email: "", gstNumber: "", address: "", paymentTerms: "", leadTimeDays: undefined, notes: "", active: true });
const field = "mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";

export default function VendorsPage() {
  const { vendors, docs, saveVendor, newVendorId } = useInventoryOps();
  const { can } = usePermissions();
  const canManage = allow(can, CAP.inventory.vendors);
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);

  const openPos = useMemo(() => {
    const m = new Map<string, number>();
    docs.filter((d) => d.type === "purchase_order" && (d.status === "sent" || d.status === "partial")).forEach((d) => m.set(d.party, (m.get(d.party) ?? 0) + 1));
    return m;
  }, [docs]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter((v) => !q || `${v.name} ${v.contactPerson} ${v.phone} ${v.email} ${v.gstNumber}`.toLowerCase().includes(q));
  }, [vendors, query]);

  async function save() {
    if (!edit || !edit.name.trim() || saving) return;
    setSaving(true);
    const ok = await saveVendor({ ...edit, name: edit.name.trim() });
    setSaving(false);
    if (ok) { toast.success(`${edit.name.trim()} saved`); setEdit(null); }
  }

  const set = (p: Partial<Vendor>) => setEdit((v) => (v ? { ...v, ...p } : v));

  const columns: InvColumn<Vendor>[] = [
    { key: "name", grow: true, header: "Vendor", render: (v) => <div className="min-w-0"><p className="truncate font-semibold" title={v.name}>{v.name}</p><p className="truncate text-[11.5px] text-muted-foreground">{v.id}{v.gstNumber ? ` · GST ${v.gstNumber}` : ""}</p></div> },
    { key: "contact", header: "Contact", render: (v) => <span className="block truncate" title={v.contactPerson}>{v.contactPerson || "—"}</span> },
    { key: "phone", header: "Phone / Email", render: (v) => <div className="min-w-0"><p className="truncate">{v.phone || "—"}</p><p className="truncate text-[11.5px] text-muted-foreground">{v.email}</p></div> },
    { key: "terms", header: "Payment terms", render: (v) => <span className="block truncate text-muted-foreground">{v.paymentTerms || "—"}</span> },
    { key: "lead", header: "Lead time", align: "right", render: (v) => <span className="tabular-nums text-muted-foreground">{v.leadTimeDays != null ? `${v.leadTimeDays} d` : "—"}</span> },
    { key: "po", header: "Open POs", align: "right", render: (v) => <span className="font-semibold tabular-nums">{openPos.get(v.name) ?? 0}</span> },
    { key: "status", min: 130, header: "Status", render: (v) => <span className={cn("flex h-7 w-full items-center justify-center rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", v.active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200")}>{v.active ? "Active" : "Inactive"}</span> },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={Truck}
        title="Vendors"
        subtitle="Suppliers you buy parts from"
        actions={<Can permission={CAP.inventory.vendors}><Button className="gap-2" onClick={() => setEdit(blank(newVendorId()))}><Plus className="h-4 w-4" />Add Vendor</Button></Can>}
      />
      <div className="flex justify-end">
        <TableSearch value={query} onChange={setQuery} placeholder="Search vendors by name, contact, phone, email or GST…" animatedPrefix="Search by " animatedWords={["vendor name", "contact", "phone", "GST number"]} className="w-full sm:w-72" />
      </div>
      <InvTable
        columns={columns} rows={rows} rowKey={(v) => v.id} itemLabel="vendor"
        onRowClick={canManage ? (v) => setEdit(v) : undefined}
        emptyTitle="No vendors yet" emptyHint="Add your first vendor to start raising purchase orders."
        resetKey={query}
      />

      <RoxCenteredForm
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && vendors.some((v) => v.id === edit.id) ? "Edit Vendor" : "Add Vendor"}
        subtitle={edit?.id}
        icon={Truck}
        canEdit={canManage}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={!edit?.name.trim() || saving}>{saving ? "Saving…" : "Save"}</Button></div>}
      >
        {edit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Vendor name *</Label><input className={field} value={edit.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div><Label>Contact person</Label><input className={field} value={edit.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} /></div>
            <div><Label>Phone</Label><input className={field} value={edit.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
            <div><Label>Email</Label><input className={field} value={edit.email} onChange={(e) => set({ email: e.target.value })} /></div>
            <div><Label>GST number</Label><input className={field} value={edit.gstNumber} onChange={(e) => set({ gstNumber: e.target.value })} /></div>
            <div><Label>Payment terms</Label><input className={field} placeholder="e.g. Net 15" value={edit.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} /></div>
            <div><Label>Lead time (days)</Label><input type="number" min={0} className={field} value={edit.leadTimeDays ?? ""} onChange={(e) => set({ leadTimeDays: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
            <div className="sm:col-span-2"><Label>Address</Label><input className={field} value={edit.address} onChange={(e) => set({ address: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Notes</Label><textarea rows={2} className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" value={edit.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-[13px] sm:col-span-2"><Checkbox checked={edit.active} onChange={(v) => set({ active: v })} aria-label="Active vendor" />Active vendor</label>
          </div>
        )}
      </RoxCenteredForm>
    </div>
  );
}
