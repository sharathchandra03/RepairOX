"use client";

/* Stock Transfer — store-to-store transfers (create, bulk upload, edit, dispatch, receive)
   plus the read-only Movement ledger of every stock in/out. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpToLine, CircleCheck, Download, Eye, Pencil, Plus, RotateCcw,
  SlidersHorizontal, Store, Truck, MoreHorizontal, PackageCheck, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { SegmentedTabs } from "@/components/ui/tabs";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { ToneChip, fmtDate } from "@/components/inventory/doc-ui";
import { StockTransferDialog } from "@/components/inventory/stock-transfer-dialog";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import { CAP, allow } from "@/lib/capabilities";
import { DOC_META, docUnits, type DocAction, type InvDoc, type Tone } from "@/lib/inventory-ops";
import { downloadTransferTemplate } from "@/lib/stock-transfer-sheet";
import { MOVEMENT_STATUS_LABEL, MOVEMENT_STATUS_TONE, type MovementType, type StockMovement } from "@/lib/inventory-data";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

const META = DOC_META.transfer;
const TYPE_ICON: Record<MovementType, React.ComponentType<{ className?: string }>> = {
  Transfer: ArrowLeftRight, Inward: ArrowDownToLine, Outward: ArrowUpToLine, Adjustment: SlidersHorizontal, Return: RotateCcw,
};
const TYPE_TONE: Record<MovementType, Tone> = { Transfer: "info", Inward: "success", Outward: "warning", Adjustment: "violet", Return: "neutral" };
const MOVEMENT_TONE: Record<string, Tone> = { success: "success", info: "info", neutral: "neutral", danger: "danger", warning: "warning", violet: "violet" };
const ACTION_ICON: Record<string, React.ComponentType<{ className?: string }>> = { in_transit: Truck, received: PackageCheck, cancelled: Ban };

function StoreChip({ name, tone }: { name: string; tone: "from" | "to" }) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-semibold ring-1 ring-inset", tone === "from" ? "bg-zinc-50 text-zinc-700 ring-zinc-200" : "bg-[#EEF1FD] text-[#4361EE] ring-[#4361EE]/20")}>
      <Store className="h-3.5 w-3.5 shrink-0" /><span className="truncate" title={name}>{name || "—"}</span>
    </span>
  );
}

export default function StockTransferPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const { docsOfType, ready } = useInventoryOps();
  const { runAction } = useInventoryActions();
  const { stockMovements } = useStore();
  const { stockItems } = useInventoryScope();
  const canTransfer = allow(can, CAP.inventory.transfer);

  const [view, setView] = useState("transfers");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [mType, setMType] = useState("all");
  const [dialog, setDialog] = useState<{ open: boolean; doc: InvDoc | null }>({ open: false, doc: null });
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<{ doc: InvDoc; action: DocAction } | null>(null);

  const transfers = docsOfType("transfer");
  const storeOfItem = useMemo(() => new Map(stockItems.map((i) => [i.id, i.store])), [stockItems]);
  const fromOf = (d: InvDoc) => (typeof d.data.fromStore === "string" && d.data.fromStore ? d.data.fromStore : storeOfItem.get(d.lines[0]?.itemId ?? "") ?? "");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transfers.filter((d) => (tab === "all" || d.status === tab) &&
      (!q || `${d.id} ${d.party} ${fromOf(d)} ${d.createdBy} ${d.lines.map((l) => `${l.name} ${l.itemId}`).join(" ")}`.toLowerCase().includes(q)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, tab, query, storeOfItem]);

  const count = (s: string) => transfers.filter((d) => d.status === s).length;
  const unitsMoving = transfers.filter((d) => d.status === "in_transit").reduce((n, d) => n + docUnits(d), 0);

  async function act(d: InvDoc, a: DocAction) {
    if (busy) return;
    setBusy(`${d.id}:${a.to}`);
    try { await runAction(d, a); } finally { setBusy(""); }
  }

  function confirmCopy(d: InvDoc, a: DocAction) {
    const units = docUnits(d), n = d.lines.length, from = fromOf(d) || "the source store", to = d.party || "the destination store";
    const things = `${n} item${n === 1 ? "" : "s"} (${units} unit${units === 1 ? "" : "s"})`;
    if (a.to === "in_transit") return { title: `Dispatch ${d.id}?`, label: "Dispatch", danger: false, text: `${things} will be removed from ${from} stock now and marked in transit to ${to}. The destination stock increases only when you receive it.` };
    if (a.to === "received") return { title: `Receive ${d.id}?`, label: "Receive", danger: false, text: `${things} will be added to ${to} stock and the transfer will be completed.` };
    return { title: `Cancel ${d.id}?`, label: "Cancel transfer", danger: true, text: "No stock has moved yet, so inventory stays as it is. This can't be undone." };
  }
  const cc = confirm ? confirmCopy(confirm.doc, confirm.action) : null;

  const columns: InvColumn<InvDoc>[] = [
    { key: "id", pct: 9, header: "Transfer", render: (d) => <Link href={`/inventory/docs/${d.id}`} onClick={(e) => e.stopPropagation()} className="font-bold text-[#4361EE] hover:underline">{d.id}</Link> },
    { key: "route", pct: 22, header: "From → To", align: "center", render: (d) => (
      <div className="mx-auto w-fit max-w-full space-y-1.5">
        <div className="flex items-center gap-2"><span className="w-8 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From</span><StoreChip name={fromOf(d)} tone="from" /></div>
        <div className="flex items-center gap-2"><span className="w-8 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To</span><StoreChip name={d.party} tone="to" /></div>
      </div>
    ) },
    { key: "items", pct: 20, header: "Items", render: (d) => {
      const first = d.lines[0]?.name ?? "—";
      return (
        <div className="min-w-0" title={d.lines.map((l) => `${l.name} × ${l.qty}`).join("\n")}>
          <p className="truncate text-[13.5px] font-medium">{first}{d.lines.length > 1 && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">+{d.lines.length - 1}</span>}</p>
          <p className="text-[11.5px] text-muted-foreground">{d.lines.length} item{d.lines.length === 1 ? "" : "s"} · {docUnits(d)} units</p>
        </div>
      );
    } },
    { key: "date", pct: 10, header: "Date", render: (d) => <span className="text-muted-foreground">{fmtDate(d.createdAt)}</span> },
    { key: "by", pct: 10, header: "Created by", render: (d) => <span className="block truncate text-muted-foreground">{d.createdBy || "—"}</span> },
    { key: "status", pct: 11, header: "Status", align: "center", render: (d) => { const s = META.statuses[d.status]; return <ToneChip tone={s?.tone ?? "neutral"} label={s?.label ?? d.status} />; } },
    { key: "actions", pct: 18, header: <span className="pr-12">Actions</span>, align: "center", render: (d) => {
      const acts = canTransfer ? META.actions(d.status) : [];
      const main = acts.find((a) => a.tone !== "danger");
      const cancel = acts.find((a) => a.tone === "danger");
      const MainIcon = main ? ACTION_ICON[main.to] ?? CircleCheck : CircleCheck;
      return (
        <div className="flex items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
          <span className="flex w-[124px] justify-center">
            {main && (
              <Button size="sm" disabled={!!busy} className="h-9 w-full gap-1.5 px-3" onClick={() => setConfirm({ doc: d, action: main })}>
                <MainIcon className="h-4 w-4" />{main.to === "in_transit" ? "Dispatch" : "Receive"}
              </Button>
            )}
            {!main && <span className="self-center text-[12px] font-medium text-muted-foreground" title="No actions available for this status">N/A</span>}
          </span>
          <Dropdown width="w-48" align="right"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} aria-label={`More actions for ${d.id}`} title="More actions"
                className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD] hover:text-[#4361EE]">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}>
            {(close) => (
              <>
                <MenuItem icon={Eye} onClick={() => { close(); router.push(`/inventory/docs/${d.id}`); }}>View transfer</MenuItem>
                {canTransfer && d.status === "requested" && <MenuItem icon={Pencil} onClick={() => { close(); setDialog({ open: true, doc: d }); }}>Edit transfer</MenuItem>}
                {cancel && <MenuItem icon={Ban} danger onClick={() => { close(); setConfirm({ doc: d, action: cancel }); }}>Cancel transfer</MenuItem>}
              </>
            )}
          </Dropdown>
        </div>
      );
    } },
  ];

  /* ── Movement ledger ── */
  const ledger = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stockMovements.filter((m) => (mType === "all" || m.type === mType) && (!q || `${m.docNumber} ${m.fromStore} ${m.toStore} ${m.user}`.toLowerCase().includes(q)));
  }, [stockMovements, mType, query]);
  const ledgerCols: InvColumn<StockMovement>[] = [
    { key: "doc", min: 130, header: "Document", render: (m) => <span className="font-mono text-[12.5px] font-semibold">{m.docNumber}</span> },
    { key: "type", min: 140, header: "Type", render: (m) => { const I = TYPE_ICON[m.type]; return <span className="inline-flex"><span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold"><I className="h-3 w-3" />{m.type}</span></span>; } },
    { key: "route", grow: true, min: 300, header: "From → To", render: (m) => <div className="flex items-center gap-2"><StoreChip name={m.fromStore} tone="from" /><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /><StoreChip name={m.toStore} tone="to" /></div> },
    { key: "qty", align: "right", header: "Units", render: (m) => <span className="font-bold tabular-nums">{m.items}</span> },
    { key: "date", header: "Date", render: (m) => <span className="text-muted-foreground">{m.date}</span> },
    { key: "user", max: 150, header: "User", render: (m) => <span className="block truncate text-muted-foreground">{m.user || "—"}</span> },
    { key: "status", min: 120, header: "Status", align: "center", render: (m) => <ToneChip tone={MOVEMENT_TONE[MOVEMENT_STATUS_TONE[m.status]] ?? "neutral"} label={MOVEMENT_STATUS_LABEL[m.status]} /> },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={ArrowLeftRight}
        title="Stock Transfer"
        subtitle="Move stock between stores, singly or in bulk from an Excel / CSV sheet."
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => downloadTransferTemplate("", [])}><Download className="h-4 w-4" />Download Template</Button>
            {canTransfer && <Button className="gap-2" onClick={() => setDialog({ open: true, doc: null })}><Plus className="h-4 w-4" />New Stock Transfer</Button>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InvKpi label="Requested" value={count("requested")} icon={ArrowLeftRight} tone="amber" hint="Waiting to be dispatched" />
        <InvKpi label="In transit" value={count("in_transit")} icon={Truck} tone="sky" hint={`${unitsMoving} units on the way`} />
        <InvKpi label="Received" value={count("received")} icon={PackageCheck} tone="emerald" hint="Completed transfers" hintTone="success" />
        <InvKpi label="Movements logged" value={stockMovements.length} icon={SlidersHorizontal} tone="violet" hint="In the movement ledger" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs size="sm" value={view} onChange={(v) => { setView(v); setQuery(""); }}
            options={[{ label: "Transfers", value: "transfers" }, { label: "Movement ledger", value: "ledger" }]} />
          {view === "transfers" ? (
            <StatusTabs value={tab} onChange={setTab}
              options={[{ value: "all", label: `All (${transfers.length})` }, ...Object.entries(META.statuses).map(([k, s]) => ({ value: k, label: `${s.label} (${count(k)})` }))]} />
          ) : (
            <StatusTabs value={mType} onChange={setMType}
              options={[{ value: "all", label: "All" }, ...(["Transfer", "Inward", "Outward", "Adjustment", "Return"] as const).map((t) => ({ value: t, label: t }))]} />
          )}
        </div>
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder={view === "transfers" ? "Search transfers by number, store, item or user…" : "Search movements by document, store or user…"}
          animatedPrefix="Search by "
          animatedWords={view === "transfers" ? ["transfer number", "store", "item name", "user"] : ["document number", "store", "user"]}
          className="w-full sm:w-80"
        />
      </div>
      {view === "transfers" ? (
        <InvTable fill minWidth={1120} columns={columns} rows={rows} rowKey={(d) => d.id} onRowClick={(d) => router.push(`/inventory/docs/${d.id}`)}
          resetKey={`${tab}|${query}`} itemLabel="transfer"
          emptyTitle={ready ? "No stock transfers yet" : "Loading…"} emptyHint={ready ? "Use “New Stock Transfer” to move stock between stores." : undefined} />
      ) : (
        <InvTable columns={ledgerCols} rows={ledger} rowKey={(m) => `${m.docNumber}|${m.date}|${m.type}|${m.items}`}
          resetKey={`${mType}|${query}`} itemLabel="movement"
          emptyTitle="No movements found" emptyHint="Every stock in, out and transfer is logged here automatically. The ledger is read-only to keep the audit trail intact." />
      )}
      <ConfirmDialog
        open={!!confirm}
        title={cc?.title}
        description={cc?.text}
        confirmLabel={cc?.label}
        danger={cc?.danger}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { const c = confirm; setConfirm(null); if (c) await act(c.doc, c.action); }}
      />
      <StockTransferDialog open={dialog.open} editDoc={dialog.doc} onClose={() => setDialog({ open: false, doc: null })} />
    </div>
  );
}
