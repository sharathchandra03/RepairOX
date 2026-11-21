"use client";

/* Inventory → Loss / Damage: record stock written off (damaged, lost, defective,
   used for testing, theft) and review the history.

   A write-off is a `write_off` inventory document. Posting it removes the units
   from stock atomically (cost layers depleted) and logs an Adjustment movement.
   Older write-offs recorded as bare `WO-` movements are still listed. */

import { useMemo, useState } from "react";
import { ShieldAlert, Plus, Package, PackageX, CalendarDays, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { Label, Select } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, useInventoryScope } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useStore } from "@/lib/store";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import Link from "next/link";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import {
  isWriteOff, parseMovementDate, WRITE_OFF_REASONS, writeOffReason, availableStock,
} from "@/lib/inventory-analytics";
import type { InventoryItem } from "@/lib/inventory-data";

type Row = { id: string; date: string; ts: number; location: string; reason: string; units: number; by: string; href?: string };

export default function LossDamagePage() {
  const { stockMovements } = useStore();
  const { docsOfType } = useInventoryOps();
  const { writeOff } = useInventoryActions();
  const { can } = usePermissions();
  const { canEdit } = useInventoryScope();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<string>(WRITE_OFF_REASONS[0]);
  const [saving, setSaving] = useState(false);

  const [note, setNote] = useState("");
  const docs = docsOfType("write_off");
  const rows = useMemo<Row[]>(() => {
    const fromDocs: Row[] = docs.map((d) => ({
      id: d.id, date: d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-IN") : "", ts: new Date(d.createdAt).getTime() || 0,
      location: String(d.data.location ?? ""), reason: d.party || "Other", units: d.lines.reduce((s, l) => s + l.qty, 0), by: d.createdBy, href: `/inventory/docs/${d.id}`,
    }));
    const covered = new Set(docs.map((d) => d.id));
    const legacy: Row[] = stockMovements.filter(isWriteOff).filter((m) => !covered.has(m.docNumber.split("/")[0])).map((m) => ({
      id: m.docNumber, date: m.date, ts: parseMovementDate(m.date)?.getTime() ?? 0, location: m.fromStore, reason: writeOffReason(m), units: m.items, by: m.user,
    }));
    return [...fromDocs, ...legacy].sort((a, b) => b.ts - a.ts);
  }, [docs, stockMovements]);
  const kpi = useMemo(() => {
    const since = Date.now() - 30 * 86_400_000;
    let units30 = 0;
    const byReason = new Map<string, number>();
    for (const m of rows) {
      if (m.ts >= since) units30 += m.units;
      byReason.set(m.reason, (byReason.get(m.reason) ?? 0) + m.units);
    }
    const top = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0];
    return { units30, entries: rows.length, top };
  }, [rows]);

  const n = Number(qty);
  const qtyOk = Number.isInteger(n) && n > 0 && !!item && n <= Math.max(item.currentStock, 0);

  function reset() { setItem(null); setQty("1"); setReason(WRITE_OFF_REASONS[0]); setNote(""); }

  async function save() {
    if (!item || !qtyOk || saving || !allow(can, CAP.inventory.adjust)) return;
    setSaving(true);
    try {
      if (await writeOff(item.id, n, reason, note.trim())) {
        toast.success(`${n} × ${item.name} written off`);
        setOpen(false);
        reset();
      }
    } finally {
      setSaving(false);
    }
  }

  const columns: InvColumn<Row>[] = [
    { key: "doc", header: "Document", render: (r) => r.href ? <Link href={r.href} className="font-semibold text-[#4361EE] hover:underline" onClick={(e) => e.stopPropagation()}>{r.id}</Link> : <span className="font-semibold">{r.id}</span> },
    { key: "date", header: "Date", render: (r) => <span className="text-muted-foreground">{r.date || "—"}</span> },
    { key: "loc", grow: true, header: "Location", render: (r) => <span className="block truncate" title={r.location}>{r.location || "—"}</span> },
    { key: "reason", header: "Reason", render: (r) => <span className="inline-flex h-7 items-center rounded-full bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">{r.reason}</span> },
    { key: "units", header: "Units", align: "right", render: (r) => <span className="font-bold tabular-nums text-rose-600">−{r.units}</span> },
    { key: "by", header: "Recorded By", render: (r) => <span className="block truncate text-muted-foreground">{r.by || "—"}</span> },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={ShieldAlert}
        title="Loss / Damage"
        subtitle="Write off damaged, lost or defective stock with a reason"
        actions={
          <Can permission={CAP.inventory.adjust}>
            <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Record Write-off</Button>
          </Can>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InvKpi label="Units written off (30 days)" value={kpi.units30} icon={PackageX} tone="rose" />
        <InvKpi label="Write-off entries" value={kpi.entries} icon={ListChecks} tone="brand" />
        <InvKpi label="Top reason" value={kpi.top ? kpi.top[0] : "—"} hint={kpi.top ? `${kpi.top[1]} units` : "No write-offs yet"} icon={CalendarDays} tone="amber" />
      </div>

      <InvTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyTitle="No write-offs recorded" emptyHint="Damaged or lost stock you record here appears in this history." itemLabel="write-off" />

      <RoxCenteredForm
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Record Write-off"
        subtitle="Lowers on-hand stock and logs the reason"
        icon={ShieldAlert}
        canEdit={canEdit}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={save} disabled={!qtyOk || saving}>{saving ? "Saving…" : "Write off"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Item</Label>
            {item ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-input px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Package className="h-4 w-4 shrink-0 text-[#4361EE]" />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">{item.name}</p>
                    <p className="text-[11.5px] text-muted-foreground">{item.id} · On hand {item.currentStock} · Available {availableStock(item)}</p>
                  </div>
                </div>
                <button onClick={() => setItem(null)} className="text-[12px] font-semibold text-[#4361EE] hover:underline">Change</button>
              </div>
            ) : (
              <div className="mt-1.5">
                <InventorySearchBox kind="part" onSelect={setItem} placeholder="Search the part to write off by name, SKU or category…" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity</Label>
              <input
                type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)}
                className="mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
              />
              {item && !qtyOk && <p className="mt-1 text-[11.5px] text-rose-600">Enter 1 – {Math.max(item.currentStock, 0)} units.</p>}
            </div>
            <div>
              <Label>Reason</Label>
              <Select className="mt-1.5 h-[34px]" value={reason} onChange={(e) => setReason(e.target.value)} options={WRITE_OFF_REASONS.map((r) => ({ label: r, value: r }))} />
            </div>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
          </div>
        </div>
      </RoxCenteredForm>
    </div>
  );
}
