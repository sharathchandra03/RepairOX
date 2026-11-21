"use client";

/* Inventory → Ticket Reservations: parts planned on open tickets that are not
   yet consumed. Derived live from tickets (planned part lines) — nothing stored.
   Flags SKUs whose reserved stock on the item master disagrees with the tickets,
   and reservations sitting on tickets that are already finished. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Lock, PackageCheck } from "lucide-react";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { ToneChip, fmtDate } from "@/components/inventory/doc-ui";
import { useStore } from "@/lib/store";
import { STATUS_LABEL, type TicketStatus } from "@/lib/mock-data";

type Row = { key: string; ticketId: string; customer: string; ticketStatus: TicketStatus; itemId: string; name: string; qty: number; created: string; stale: boolean; };
const DONE: TicketStatus[] = ["repaired", "repaired_collected", "return", "return_collected"];

export default function ReservationsPage() {
  const { tickets } = useStore();
  const { inventory } = useInventoryScope();
  const [tab, setTab] = useState<"all" | "stale">("all");
  const [query, setQuery] = useState("");

  const all = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const t of tickets) {
      const lines = [...(t.parts ?? []), ...(t.devices ?? []).flatMap((d) => d.parts ?? [])];
      lines.forEach((p, i) => {
        if (p.status !== "planned" || !p.inventoryId) return;
        out.push({ key: `${t.id}-${p.inventoryId}-${i}`, ticketId: t.id, customer: t.customer, ticketStatus: t.status, itemId: p.inventoryId, name: p.name, qty: p.qty, created: t.createdAt, stale: DONE.includes(t.status) });
      });
    }
    return out;
  }, [tickets]);

  const mismatches = useMemo(() => {
    const sum = new Map<string, number>();
    all.forEach((r) => sum.set(r.itemId, (sum.get(r.itemId) ?? 0) + r.qty));
    return inventory.filter((i) => (i.reservedStock ?? 0) !== (sum.get(i.id) ?? 0) && ((i.reservedStock ?? 0) > 0 || sum.has(i.id)));
  }, [all, inventory]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => (tab === "all" || r.stale) && (!q || `${r.ticketId} ${r.customer} ${r.name} ${r.itemId}`.toLowerCase().includes(q)));
  }, [all, tab, query]);

  const columns: InvColumn<Row>[] = [
    { key: "ticket", header: "Ticket", render: (r) => <Link href={`/tickets/${r.ticketId}`} className="font-semibold text-[#4361EE] hover:underline" onClick={(e) => e.stopPropagation()}>{r.ticketId}</Link> },
    { key: "customer", header: "Customer", render: (r) => <span className="block truncate" title={r.customer}>{r.customer}</span> },
    { key: "part", grow: true, header: "Reserved part", render: (r) => <div className="min-w-0"><p className="truncate font-medium" title={r.name}>{r.name}</p><p className="truncate text-[11.5px] text-muted-foreground">{r.itemId}</p></div> },
    { key: "qty", header: "Qty", align: "right", render: (r) => <span className="font-semibold tabular-nums">{r.qty}</span> },
    { key: "date", header: "Ticket date", render: (r) => <span className="text-muted-foreground">{fmtDate(r.created)}</span> },
    { key: "status", min: 130, header: "Ticket status", render: (r) => <ToneChip tone={r.stale ? "danger" : "info"} label={r.stale ? `${STATUS_LABEL[r.ticketStatus]} · release?` : STATUS_LABEL[r.ticketStatus]} /> },
  ];

  const stale = all.filter((r) => r.stale).length;

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader icon={Lock} title="Ticket Reservations" subtitle="Parts held for open tickets. Held units are not available to sell." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InvKpi label="Active reservations" value={all.length} icon={Lock} tone="brand" hint={`${all.reduce((s, r) => s + r.qty, 0)} units held`} />
        <InvKpi label="On finished tickets" value={stale} icon={PackageCheck} tone="amber" hint={stale ? "Consume or release these" : "None"} hintTone={stale ? "danger" : "success"} />
        <InvKpi label="Stock records out of step" value={mismatches.length} icon={AlertTriangle} tone="rose" hint={mismatches.length ? mismatches.slice(0, 2).map((m) => m.name).join(", ") : "Reserved stock matches tickets"} hintTone={mismatches.length ? "danger" : "success"} />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs value={tab} onChange={setTab} options={[{ value: "all", label: `All (${all.length})` }, { value: "stale", label: `On finished tickets (${stale})` }]} />
        <TableSearch value={query} onChange={setQuery} placeholder="Search reservations by ticket, customer or part…" animatedPrefix="Search by " animatedWords={["ticket", "customer", "part name", "SKU"]} className="w-full sm:w-64" />
      </div>
      <InvTable columns={columns} rows={rows} rowKey={(r) => r.key} resetKey={`${tab}|${query}`} itemLabel="reservation" emptyTitle="No parts reserved" emptyHint="Parts planned on open tickets appear here." />
    </div>
  );
}
