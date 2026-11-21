"use client";

/* Inventory → Serial / IMEI Units: track individual high-value units (phones,
   logic boards, refurbished devices) from receipt to the ticket they were
   installed in, and through vendor RMA. */

import { useMemo, useState } from "react";
import { Package, Plus, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { Label, Select } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { SERIAL_STATUS_LABEL, type Serial, type SerialStatus } from "@/lib/inventory-ops";
import type { InventoryItem } from "@/lib/inventory-data";

const STATUSES = Object.keys(SERIAL_STATUS_LABEL) as SerialStatus[];
const field = "mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";

export default function SerialsPage() {
  const { serials, saveSerials, removeSerial } = useInventoryOps();
  const { inventory } = useInventoryScope();
  const { can } = usePermissions();
  const canEdit = allow(can, CAP.inventory.adjust);
  const [tab, setTab] = useState<"all" | SerialStatus>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [text, setText] = useState("");
  const [vendor, setVendor] = useState("");
  const [saving, setSaving] = useState(false);

  const nameOf = useMemo(() => new Map(inventory.map((i) => [i.id, i.name])), [inventory]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return serials.filter((s) => (tab === "all" || s.status === tab) && (!q || `${s.serial} ${s.itemId} ${nameOf.get(s.itemId) ?? ""} ${s.ticketId} ${s.vendor}`.toLowerCase().includes(q)));
  }, [serials, tab, query, nameOf]);

  const parsed = useMemo(() => [...new Set(text.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))], [text]);
  const existing = useMemo(() => new Set(serials.map((s) => s.serial.toLowerCase())), [serials]);
  const dupes = parsed.filter((p) => existing.has(p.toLowerCase()));

  function reset() { setItem(null); setText(""); setVendor(""); }

  async function add() {
    if (!item || parsed.length === 0 || dupes.length > 0 || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const ok = await saveSerials(parsed.map((serial) => ({ id: crypto.randomUUID(), itemId: item.id, serial, status: "in_stock" as const, ticketId: "", vendor: vendor.trim(), receivedDoc: "", notes: "", createdAt: now })));
    setSaving(false);
    if (ok) { toast.success(`${parsed.length} serial${parsed.length === 1 ? "" : "s"} added`); setOpen(false); reset(); }
  }

  const update = (s: Serial, patch: Partial<Serial>) => saveSerials([{ ...s, ...patch }]);

  const columns: InvColumn<Serial>[] = [
    { key: "serial", header: "Serial / IMEI", render: (s) => <span className="font-mono text-[12.5px] font-semibold">{s.serial}</span> },
    { key: "item", grow: true, header: "Item", render: (s) => <div className="min-w-0"><p className="truncate font-medium" title={nameOf.get(s.itemId)}>{nameOf.get(s.itemId) ?? "Unknown item"}</p><p className="truncate text-[11.5px] text-muted-foreground">{s.itemId}</p></div> },
    {
      key: "status", min: 130, header: "Status", render: (s) => canEdit
        ? <div onClick={(e) => e.stopPropagation()}><Select className="h-[30px]" value={s.status} onChange={(e) => update(s, { status: e.target.value as SerialStatus })} options={STATUSES.map((k) => ({ label: SERIAL_STATUS_LABEL[k], value: k }))} /></div>
        : <span>{SERIAL_STATUS_LABEL[s.status]}</span>,
    },
    {
      key: "ticket", header: "Installed in ticket", render: (s) => canEdit
        ? <input defaultValue={s.ticketId} placeholder="—" onClick={(e) => e.stopPropagation()} onBlur={(e) => e.target.value !== s.ticketId && update(s, { ticketId: e.target.value.trim(), status: e.target.value.trim() && s.status === "in_stock" ? "installed" : s.status })} className="h-[30px] w-full rounded-lg border border-input bg-card px-2 text-[13px] outline-none focus:border-[#4361EE]" />
        : <span>{s.ticketId || "—"}</span>,
    },
    { key: "vendor", header: "Vendor", render: (s) => <span className="block truncate text-muted-foreground">{s.vendor || "—"}</span> },
    { key: "act", header: "", align: "right", render: (s) => canEdit && s.status === "in_stock" ? <button aria-label="Delete serial" onClick={(e) => { e.stopPropagation(); void removeSerial(s.id); }} className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button> : null },
  ];

  const count = (st: SerialStatus) => serials.filter((s) => s.status === st).length;

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={Smartphone}
        title="Serial / IMEI Units"
        subtitle="Track individual units from receipt to the repair they were used in"
        actions={<Can permission={CAP.inventory.adjust}><Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add Serials</Button></Can>}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs value={tab} onChange={setTab} options={[{ value: "all", label: `All (${serials.length})` }, ...STATUSES.map((k) => ({ value: k, label: `${SERIAL_STATUS_LABEL[k]} (${count(k)})` }))]} />
        <TableSearch value={query} onChange={setQuery} placeholder="Search units by serial, item, ticket or vendor…" animatedPrefix="Search by " animatedWords={["serial / IMEI", "item name", "ticket", "vendor"]} className="w-full sm:w-64" />
      </div>
      <InvTable columns={columns} rows={rows} rowKey={(s) => s.id} resetKey={`${tab}|${query}`} itemLabel="unit" emptyTitle="No serial units yet" emptyHint="Add the serial numbers or IMEIs of high-value parts as they arrive." />

      <RoxCenteredForm
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Add Serial / IMEI Units"
        subtitle="One serial per line (or comma separated)"
        icon={Smartphone}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button><Button onClick={add} disabled={!item || parsed.length === 0 || dupes.length > 0 || saving}>{saving ? "Saving…" : `Add ${parsed.length || ""} unit${parsed.length === 1 ? "" : "s"}`}</Button></div>}
      >
        <div className="space-y-4">
          <div>
            <Label>Item *</Label>
            {item ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-input px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5"><Package className="h-4 w-4 shrink-0 text-[#4361EE]" /><p className="truncate text-[13.5px] font-semibold">{item.name}</p></div>
                <button onClick={() => setItem(null)} className="text-[12px] font-semibold text-[#4361EE] hover:underline">Change</button>
              </div>
            ) : <div className="mt-1.5"><InventorySearchBox kind="part" onSelect={setItem} placeholder="Search the part by name or SKU…" /></div>}
          </div>
          <div>
            <Label>Serial numbers / IMEIs *</Label>
            <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 font-mono text-[12.5px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
            <p className="mt-1 text-[12px] text-muted-foreground">{parsed.length} unique serial{parsed.length === 1 ? "" : "s"} found{dupes.length > 0 && <span className="text-rose-600"> · already registered: {dupes.slice(0, 3).join(", ")}{dupes.length > 3 ? "…" : ""}</span>}</p>
          </div>
          <div><Label>Vendor (optional)</Label><input className={field} value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
        </div>
      </RoxCenteredForm>
    </div>
  );
}
