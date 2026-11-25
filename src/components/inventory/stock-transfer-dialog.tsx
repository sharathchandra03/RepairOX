"use client";

/* Stock Transfer — create / edit a store-to-store transfer (one `transfer` inventory doc).
   From Store → To Store, a scrollable item grid (No · Item ID · Item Name · Current Qty ·
   Transfer Qty · Price · Comment · Actions), bulk Excel/CSV upload, Excel template download,
   optional FIFO price (cost-gated). Stock only moves on Dispatch / Receive (use-inventory-actions). */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, Download, FileUp, Plus, Search, Trash2 } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown } from "@/components/ui/dropdown";
import { Label, Select } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { toast } from "@/components/ui/toaster";
import { useInventoryScope } from "@/components/inventory/inv-ui";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { DOC_META, type DocLine, type InvDoc } from "@/lib/inventory-ops";
import { SPREADSHEET_ACCEPT, readSpreadsheetFileToCSV } from "@/lib/csv-utils";
import { downloadTransferTemplate, fifoUnitCost, findSourceItem, matchDestinationItem, parseTransferSheet } from "@/lib/stock-transfer-sheet";
import type { InventoryItem } from "@/lib/inventory-data";
import { cn, formatINR } from "@/lib/utils";

type Row = { key: string; itemId: string; toItemId: string; qty: string; comment: string };
let seq = 0;
const newKey = () => `r${Date.now()}-${seq++}`;
const blank = (): Row => ({ key: newKey(), itemId: "", toItemId: "", qty: "", comment: "" });

const TH = "px-4 py-4 text-center text-[12px] font-bold uppercase tracking-wider text-[#4361EE] bg-[#EEF1FD] whitespace-nowrap";
const cellInput = "h-[40px] w-full rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 disabled:bg-muted/50";

/** Searchable item picker; `show` decides whether the trigger shows the Item ID or the Item Name. */
function ItemCombo({ value, items, show, onPick, disabled, taken }: {
  value: string; items: InventoryItem[]; show: "id" | "name"; onPick: (i: InventoryItem) => void; disabled?: boolean; taken: Set<string>;
}) {
  const [q, setQ] = useState("");
  const cur = items.find((i) => i.id === value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? items.filter((i) => `${i.id} ${i.name} ${i.itemCode ?? ""} ${i.barcode ?? ""} ${i.category}`.toLowerCase().includes(s)) : items).slice(0, 80);
  }, [items, q]);
  return (
    <Dropdown
      width="w-[22rem]"
      className="block w-full"
      align="left"
      trigger={({ toggle, open }) => (
        <button type="button" disabled={disabled} onClick={toggle} title={cur ? `${cur.id} · ${cur.name}` : undefined}
          className={cn("flex h-[40px] w-full items-center justify-between gap-2 rounded-lg border bg-card px-2.5 text-left text-[13px] transition disabled:cursor-not-allowed disabled:bg-muted/50",
            open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-input hover:border-[#4361EE]/40")}>
          <span className={cn("truncate", !cur && "text-muted-foreground")}>{cur ? (show === "id" ? cur.id : cur.name) : "Select"}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by item ID, name or category…"
              className="h-9 w-full rounded-lg border border-input bg-card pl-8 pr-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {list.map((i) => {
              const used = taken.has(i.id) && i.id !== value;
              return (
                <button key={i.id} type="button" disabled={used} onClick={() => { onPick(i); setQ(""); close(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD] disabled:cursor-not-allowed disabled:opacity-45">
                  <Check className={cn("h-3.5 w-3.5 shrink-0 text-[#4361EE]", value === i.id ? "opacity-100" : "opacity-0")} strokeWidth={3} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{i.id} · {i.category}{used ? " · already added" : ""}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">{i.currentStock} {i.uom}</span>
                </button>
              );
            })}
            {list.length === 0 && <p className="px-2.5 py-4 text-center text-[12px] text-muted-foreground">No results found</p>}
          </div>
        </div>
      )}
    </Dropdown>
  );
}

export function StockTransferDialog({ open, onClose, editDoc }: { open: boolean; onClose: () => void; editDoc?: InvDoc | null }) {
  const { stockItems, canViewCost } = useInventoryScope();
  const { inventoryStockLayers } = useStore();
  const { stores } = useStoreContext();
  const { saveDoc } = useInventoryOps();
  const { createDoc, runAction } = useInventoryActions();

  const [fromStore, setFromStore] = useState("");
  const [toStore, setToStore] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [notes, setNotes] = useState("");
  const [fifo, setFifo] = useState(true);
  const [uploadIssues, setUploadIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState<"" | "save" | "now">("");
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const storeNames = useMemo(() => [...new Set([...stores.map((s) => s.name), ...stockItems.map((i) => i.store).filter(Boolean)])].sort(), [stores, stockItems]);
  const srcItems = useMemo(() => stockItems.filter((i) => i.store === fromStore && i.active !== false), [stockItems, fromStore]);
  const destItems = useMemo(() => stockItems.filter((i) => i.store === toStore), [stockItems, toStore]);
  const byId = useMemo(() => new Map(stockItems.map((i) => [i.id, i])), [stockItems]);
  const resolveDest = (src: InventoryItem | undefined, to: string) => (src && to ? matchDestinationItem(src, stockItems.filter((i) => i.store === to))?.id ?? "" : "");

  /* initialise on open (create or edit) */
  useEffect(() => {
    if (!open) return;
    setUploadIssues([]); setSaving("");
    if (editDoc) {
      const first = byId.get(editDoc.lines[0]?.itemId ?? "");
      setFromStore(typeof editDoc.data.fromStore === "string" && editDoc.data.fromStore ? editDoc.data.fromStore : first?.store ?? "");
      setToStore(editDoc.party);
      setNotes(typeof editDoc.data.notes === "string" ? editDoc.data.notes : "");
      setRows(editDoc.lines.map((l) => ({ key: newKey(), itemId: l.itemId, toItemId: l.toItemId ?? "", qty: String(l.qty), comment: l.comment ?? "" })));
    } else {
      setFromStore(storeNames.length === 1 ? storeNames[0] : "");
      setToStore(""); setNotes(""); setRows([blank()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editDoc?.id]);

  function changeFrom(v: string) {
    if (v === fromStore) return;
    if (rows.some((r) => r.itemId)) toast.info("Items cleared. They belong to the previous From Store.");
    setFromStore(v); setRows([blank()]); setUploadIssues([]);
  }
  function changeTo(v: string) {
    setToStore(v);
    setRows((p) => p.map((r) => (r.itemId ? { ...r, toItemId: resolveDest(byId.get(r.itemId), v) } : r)));
  }
  function swapStores() {
    if (!fromStore && !toStore) return;
    const f = fromStore, t = toStore;
    setFromStore(t); setToStore(f); setRows([blank()]); setUploadIssues([]);
  }
  const patch = (key: string, v: Partial<Row>) => setRows((p) => p.map((r) => (r.key === key ? { ...r, ...v } : r)));
  function pick(key: string, it: InventoryItem) {
    patch(key, { itemId: it.id, toItemId: resolveDest(it, toStore), qty: "" });
  }
  function addRow() {
    setRows((p) => [...p, blank()]);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!fromStore) { toast.error("Choose the From Store first, so the sheet can be matched to its items"); return; }
    try {
      const { rows: sheet, issues } = parseTransferSheet(await readSpreadsheetFileToCSV(file));
      const out: Row[] = [];
      const problems = [...issues];
      for (const s of sheet) {
        const it = findSourceItem(srcItems, s);
        if (!it) { problems.push(`Row ${s.row}: “${s.itemId || s.name}” was not found in ${fromStore}.`); continue; }
        const at = out.find((o) => o.itemId === it.id);
        if (at) { at.qty = String(Number(at.qty) + s.qty); if (s.comment && !at.comment) at.comment = s.comment; continue; }
        out.push({ key: newKey(), itemId: it.id, toItemId: resolveDest(it, toStore), qty: String(s.qty), comment: s.comment });
      }
      setUploadIssues(problems);
      if (out.length > 0) {
        setRows((p) => {
          const existing = p.filter((r) => r.itemId && !out.some((o) => o.itemId === r.itemId));
          return [...existing, ...out];
        });
        toast.success(`${out.length} item${out.length === 1 ? "" : "s"} loaded from ${file.name}`);
      } else if (problems.length === 0) toast.error("Nothing to import");
    } catch (e) {
      toast.error(`Couldn't read the file: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  const filled = rows.filter((r) => r.itemId);
  const taken = useMemo(() => new Set(rows.map((r) => r.itemId).filter(Boolean)), [rows]);
  const priceOf = (r: Row): number => {
    const it = byId.get(r.itemId);
    if (!it) return 0;
    const base = it.costPrice ?? 0;
    return fifo ? fifoUnitCost(it.id, Number(r.qty) || 1, it.currentStock, inventoryStockLayers, base) : base;
  };
  const totalUnits = filled.reduce((n, r) => n + (Number(r.qty) || 0), 0);
  const totalValue = filled.reduce((n, r) => n + (Number(r.qty) || 0) * priceOf(r), 0);

  const blockers = useMemo(() => {
    const b: string[] = [];
    if (!fromStore) b.push("Choose the From Store");
    if (!toStore) b.push("Choose the To Store");
    if (fromStore && toStore && fromStore === toStore) b.push("From and To store must be different");
    if (filled.length === 0) b.push("Add at least one item");
    for (const r of filled) {
      const it = byId.get(r.itemId); const q = Number(r.qty);
      if (!it) continue;
      if (!Number.isInteger(q) || q <= 0) b.push(`${it.name}: enter a whole transfer quantity`);
      else if (q > it.currentStock) b.push(`${it.name}: only ${it.currentStock} ${it.uom} on hand`);
      if (toStore && fromStore !== toStore && !r.toItemId) b.push(`${it.name}: not set up in ${toStore}. Add the item to that store first`);
    }
    return b;
  }, [fromStore, toStore, filled, byId]);
  const canSave = blockers.length === 0 && !saving;

  function buildLines(): DocLine[] {
    return filled.map((r) => {
      const it = byId.get(r.itemId)!;
      return { itemId: it.id, name: it.name, qty: Number(r.qty), toItemId: r.toItemId || it.id, uom: it.uom, ...(r.comment.trim() ? { comment: r.comment.trim() } : {}) };
    });
  }

  async function submit(transferNow: boolean) {
    if (!canSave) return;
    setSaving(transferNow ? "now" : "save");
    try {
      const lines = buildLines();
      const data = { ...(editDoc?.data ?? {}), fromStore, ...(notes.trim() ? { notes: notes.trim() } : {}) };
      if (!notes.trim()) delete (data as Record<string, unknown>).notes;
      let doc: InvDoc | null;
      if (editDoc) {
        doc = { ...editDoc, party: toStore, lines, data };
        if (!(await saveDoc(doc))) return;
      } else {
        doc = await createDoc("transfer", { party: toStore, lines, data });
        if (!doc) return;
      }
      if (transferNow) {
        const dispatch = DOC_META.transfer.actions(doc.status).find((a) => a.effect === "out");
        if (dispatch && !(await runAction(doc, dispatch))) { toast.error(`${doc.id} saved, but dispatch failed. Open it to retry.`); onClose(); return; }
        const inTransit = { ...doc, status: "in_transit" };
        const receive = DOC_META.transfer.actions("in_transit")[0];
        if (!(await runAction(inTransit, receive))) { toast.error(`${doc.id} was dispatched but not received. Receive it from the transfer list.`); onClose(); return; }
      } else toast.success(`${doc.id} ${editDoc ? "updated" : "created"}`);
      onClose();
    } finally { setSaving(""); }
  }

  const colSpanEmpty = canViewCost ? 8 : 7;

  return (
    <RoxCenteredForm
      open={open}
      onClose={onClose}
      title={editDoc ? `Edit ${editDoc.id}` : "Stock Transfer"}
      subtitle="Move stock from one store to another, one item at a time or in bulk from a sheet"
      icon={ArrowLeftRight}
      width="max-w-6xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted-foreground">
            <b className="text-foreground">{filled.length}</b> item{filled.length === 1 ? "" : "s"} · <b className="text-foreground">{totalUnits}</b> units
            {canViewCost && <> · value <b className="text-foreground">{formatINR(totalValue)}</b></>}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="outline" onClick={() => submit(false)} disabled={!canSave}>{saving === "save" ? "Saving…" : editDoc ? "Save changes" : "Save as requested"}</Button>
            <Button onClick={() => submit(true)} disabled={!canSave}>{saving === "now" ? "Transferring…" : "Save & transfer now"}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* stores */}
        <div className="flex flex-wrap items-end gap-5">
          <div className="w-64">
            <Label>From Store *</Label>
            <Select className="mt-1.5 h-[40px]" value={fromStore} onChange={(e) => changeFrom(e.target.value)} placeholder="Select store" options={storeNames.map((s) => ({ label: s, value: s }))} />
          </div>
          <button type="button" onClick={swapStores} title="Swap stores" aria-label="Swap stores"
            className="mb-0.5 grid h-8 w-8 place-items-center rounded-full border border-input bg-card text-[#4361EE] transition hover:bg-[#EEF1FD]">
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <div className="w-64">
            <Label>To Store *</Label>
            <Select className="mt-1.5 h-[40px]" value={toStore} onChange={(e) => changeTo(e.target.value)} placeholder="Select store" options={storeNames.filter((s) => s !== fromStore).map((s) => ({ label: s, value: s }))} />
          </div>
          {canViewCost && (
            <div className="ml-auto flex items-center gap-2 pb-1.5 text-[13px] font-medium">
              <Checkbox checked={fifo} onChange={setFifo} aria-label="Use FIFO price" />
              <span>Use FIFO price</span>
              <InfoHint content="Price is the estimated FIFO cost of the units being moved, from the stock ledger. It may vary with quantity. Untick to use each item's latest cost price." />
            </div>
          )}
        </div>

        {/* transfer details bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 px-5 py-3.5">
          <p className="text-[13px] font-bold">Transfer Details</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadTransferTemplate(fromStore, srcItems)}>
              <Download className="h-3.5 w-3.5" />Download Template
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => (fromStore ? fileRef.current?.click() : toast.error("Choose the From Store first"))}>
              <FileUp className="h-3.5 w-3.5" />Upload Template
            </Button>
            <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>

        {uploadIssues.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" />{uploadIssues.length} row{uploadIssues.length === 1 ? "" : "s"} skipped from the upload</p>
              <button type="button" onClick={() => setUploadIssues([])} className="text-[12px] font-medium underline">Dismiss</button>
            </div>
            <ul className="mt-1.5 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-5">{uploadIssues.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}

        {/* item grid (scrolls inside its frame) */}
        <div ref={scrollRef} className="max-h-[420px] overflow-auto rounded-xl border border-border rox-grid-scroll">
          <table className="w-full min-w-[1180px] table-fixed text-[13px]">
            <colgroup>
              <col className="w-[64px]" /><col className="w-[190px]" /><col className="min-w-[260px]" /><col className="w-[170px]" />
              <col className="w-[180px]" />{canViewCost && <col className="w-[130px]" />}<col className="w-[240px]" /><col className="w-[90px]" />
            </colgroup>
            <thead className="sticky top-0 z-[2]">
              <tr>
                <th className={TH}>No.</th><th className={TH}>Item ID</th><th className={TH}>Item Name</th>
                <th className={TH}>Current Quantity</th><th className={TH}>Transfer Quantity</th>
                {canViewCost && <th className={TH}>Price</th>}
                <th className={TH}>Comment</th><th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const it = byId.get(r.itemId);
                const q = Number(r.qty);
                const over = !!it && q > it.currentStock;
                const noDest = !!it && !!toStore && toStore !== fromStore && !r.toItemId;
                return (
                  <tr key={r.key} className="border-t border-border align-top">
                    <td className="px-3 py-5 text-center font-semibold tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-4"><ItemCombo show="id" value={r.itemId} items={srcItems} taken={taken} disabled={!fromStore} onPick={(i) => pick(r.key, i)} /></td>
                    <td className="px-3 py-4">
                      <ItemCombo show="name" value={r.itemId} items={srcItems} taken={taken} disabled={!fromStore} onPick={(i) => pick(r.key, i)} />
                      {noDest && <p className="mt-1 text-[11px] font-medium text-rose-600">Not set up in {toStore}</p>}
                      {it && !noDest && r.toItemId && toStore && <p className="mt-1 truncate text-[11px] text-emerald-600">Matched in {toStore}</p>}
                    </td>
                    <td className="px-3 py-4"><div className="flex h-[40px] items-center justify-between rounded-lg border border-input bg-muted/50 px-2.5 tabular-nums"><span>{it ? it.currentStock : 0}</span><span className="text-[11px] text-muted-foreground">{it?.uom || "UOM"}</span></div></td>
                    <td className="px-3 py-4">
                      <div className={cn("flex h-[40px] items-center rounded-lg border bg-card px-2.5 transition focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/15", over ? "border-rose-400" : "border-input")}>
                        <input type="number" min={1} step={1} inputMode="numeric" disabled={!it} value={r.qty} placeholder="0" onChange={(e) => patch(r.key, { qty: e.target.value })} aria-label={`Transfer quantity for row ${idx + 1}`}
                          className="w-full min-w-0 bg-transparent text-[13px] tabular-nums outline-none disabled:cursor-not-allowed" />
                        <span className="ml-1 text-[11px] text-muted-foreground">{it?.uom || "UOM"}</span>
                      </div>
                      {over && <p className="mt-1 text-[11px] font-medium text-rose-600">Only {it!.currentStock} available</p>}
                    </td>
                    {canViewCost && <td className="px-3 py-4"><div className="flex h-[40px] items-center justify-end rounded-lg border border-input bg-muted/50 px-2.5 tabular-nums text-muted-foreground">{it ? formatINR(priceOf(r)) : 0}</div></td>}
                    <td className="px-3 py-4"><input className={cellInput} value={r.comment} disabled={!it} placeholder="Add a comment" onChange={(e) => patch(r.key, { comment: e.target.value })} aria-label={`Comment for row ${idx + 1}`} /></td>
                    <td className="px-3 py-4 text-center">
                      <button type="button" aria-label={`Remove row ${idx + 1}`} title="Remove" onClick={() => setRows((p) => (p.length === 1 ? [blank()] : p.filter((x) => x.key !== r.key)))}
                        className="grid h-[40px] w-full place-items-center rounded-lg text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={colSpanEmpty} className="py-8 text-center text-muted-foreground">No items</td></tr>}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addRow} disabled={!fromStore} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#4361EE] hover:underline disabled:cursor-not-allowed disabled:opacity-50">
          <Plus className="h-4 w-4" />Add Item
        </button>

        <div>
          <Label>Add a Comment Here</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Add a comment"
            className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
        </div>

        {blockers.length > 0 && filled.length > 0 && (
          <ul className="list-disc space-y-1 rounded-xl border border-rose-200 bg-rose-50 px-8 py-2.5 text-[12.5px] text-rose-700">
            {blockers.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}
            {blockers.length > 5 && <li>and {blockers.length - 5} more</li>}
          </ul>
        )}
      </div>
    </RoxCenteredForm>
  );
}
