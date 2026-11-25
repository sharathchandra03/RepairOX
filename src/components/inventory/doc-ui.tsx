"use client";

/* Generic list page + create dialog for every inventory workflow document
   (PO, GRN, vendor return, transfer, stock count, old part, warranty claim).
   Behaviour per type comes from DOC_META (lib/inventory-ops.ts). */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, FileEdit, Package, Plus, Trash2, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { DOC_META, docUnits, docValue, type DocLine, type DocType, type Tone } from "@/lib/inventory-ops";
import { cn, formatINR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";

const TONE: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function ToneChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span title={label} className={cn("flex h-7 w-full min-w-0 items-center justify-center rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", TONE[tone])}>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* Who may create each document type (UI gate; RLS is the real boundary). */
function canCreateType(can: ReturnType<typeof usePermissions>["can"], type: DocType): boolean {
  if (type === "purchase_order" || type === "grn" || type === "vendor_return") return allow(can, CAP.inventory.purchase);
  if (type === "transfer") return allow(can, CAP.inventory.transfer);
  return allow(can, CAP.inventory.adjust);
}

/* ── List page ──────────────────────────────────────────────────────────── */
export function DocListPage({
  type, icon, subtitle, createLabel, createHref,
}: {
  type: DocType;
  /** Open a full-page editor instead of the quick create dialog. */
  createHref?: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle: string;
  createLabel: string;
}) {
  const meta = DOC_META[type];
  const router = useRouter();
  const { can } = usePermissions();
  const { docsOfType, ready } = useInventoryOps();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const all = docsOfType(type);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((d) => (tab === "all" || d.status === tab) && (!q || `${d.id} ${d.party} ${d.ref} ${d.lines.map((l) => l.name).join(" ")}`.toLowerCase().includes(q)));
  }, [all, tab, query]);

  type Doc = (typeof all)[number];
  const isPo = type === "purchase_order";
  const expectedOf = (d: Doc) => (typeof d.data.expectedDate === "string" ? d.data.expectedDate : "");
  const isOpenPo = (d: Doc) => d.status === "sent" || d.status === "partial";
  const isLate = (d: Doc) => isOpenPo(d) && !!expectedOf(d) && new Date(expectedOf(d)).getTime() < Date.now();
  const receivedPct = (d: Doc) => {
    const q = d.lines.reduce((n, l) => n + (l.qty || 0), 0);
    const r = d.lines.reduce((n, l) => n + Math.min(l.received ?? 0, l.qty || 0), 0);
    return q > 0 ? Math.round((r / q) * 100) : 0;
  };
  const columns: InvColumn<Doc>[] = [
    { key: "id", pct: 9, header: meta.label, render: (d) => <Link href={`/inventory/docs/${d.id}`} onClick={(e) => e.stopPropagation()} className="font-bold text-[#4361EE] hover:underline">{d.id}</Link> },
    { key: "date", pct: 10, header: "Date", render: (d) => <span className="text-muted-foreground">{fmtDate(d.createdAt)}</span> },
    { key: "party", pct: 19, header: meta.partyLabel, render: (d) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[11px] font-bold text-[#4361EE]">{(d.party || "?").trim().charAt(0).toUpperCase()}</span>
        <span className="block truncate font-semibold" title={d.party}>{d.party || "—"}</span>
      </div>
    ) },
    { key: "items", pct: 22, header: "Items", render: (d) => {
      const first = d.lines[0]?.name ?? "—";
      return (
        <div className="min-w-0" title={d.lines.map((l) => l.name).join(", ")}>
          <p className="truncate text-[13.5px] font-medium">{first}{d.lines.length > 1 && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">+{d.lines.length - 1}</span>}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{d.lines.length} item{d.lines.length === 1 ? "" : "s"} · {docUnits(d)} units</p>
        </div>
      );
    } },
    ...(isPo ? [
      { key: "expected", pct: 10, header: "Expected", render: (d: Doc) => {
        const e = expectedOf(d);
        if (!e) return <span className="text-muted-foreground">—</span>;
        const late = isLate(d);
        return <span className={cn("font-medium", late ? "text-rose-600" : "text-muted-foreground")}>{fmtDate(e)}{late && <span className="block text-[10.5px] font-semibold uppercase">Overdue</span>}</span>;
      } },
      { key: "recv", pct: 9, header: "Received", align: "center" as const, render: (d: Doc) => {
        const p = receivedPct(d);
        return (
          <div className="mx-auto flex max-w-[84px] items-center gap-2" title={`${p}% received`}>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", p >= 100 ? "bg-emerald-500" : "bg-[#4361EE]")} style={{ width: `${p}%` }} /></span>
            <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{p}%</span>
          </div>
        );
      } },
    ] : []),
    ...(meta.hasCost ? [{ key: "value", pct: 10, header: "Value", align: "right" as const, render: (d: Doc) => <span className="font-bold tabular-nums">{formatINR(docValue(d))}</span> }] : []),
    { key: "by", pct: 10, header: "Created by", render: (d) => <span className="block truncate text-muted-foreground">{d.createdBy || "—"}</span> },
    { key: "status", pct: 11, header: "Status", align: "center", render: (d) => { const s = meta.statuses[d.status]; return <ToneChip tone={s?.tone ?? "neutral"} label={s?.label ?? d.status} />; } },
  ];
  const nDraft = all.filter((d) => d.status === "draft").length;
  const nOpen = all.filter(isOpenPo).length;
  const nLate = all.filter(isLate).length;
  const openValue = all.filter((d) => d.status === "draft" || isOpenPo(d)).reduce((n, d) => n + docValue(d), 0);
  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={icon}
        title={meta.plural}
        subtitle={subtitle}
        actions={canCreateType(can, type) ? <Button className="gap-2" onClick={() => (createHref ? router.push(createHref) : setOpen(true))}><Plus className="h-4 w-4" />{createLabel}</Button> : undefined}
      />
      {isPo && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InvKpi label="Draft orders" value={nDraft} icon={FileEdit} tone="brand" hint="Not yet sent to vendor" />
          <InvKpi label="Awaiting delivery" value={nOpen} icon={Truck} tone="sky" hint="Sent or partially received" />
          <InvKpi label="Overdue" value={nLate} icon={AlarmClock} tone={nLate ? "rose" : "emerald"} hint={nLate ? "Past expected date" : "Nothing late"} hintTone={nLate ? "danger" : "success"} />
          <InvKpi label="Open order value" value={formatINR(openValue)} icon={Wallet} tone="violet" hint="Draft + awaiting delivery" />
        </div>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs
          value={tab}
          onChange={setTab}
          options={[{ value: "all", label: `All (${all.length})` }, ...Object.entries(meta.statuses).map(([k, s]) => ({ value: k, label: `${s.label} (${all.filter((d) => d.status === k).length})` }))]}
        />
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder={`Search ${meta.plural.toLowerCase()} by number, ${meta.partyLabel.toLowerCase()} or item…`}
          animatedPrefix="Search by "
          animatedWords={["document number", meta.partyLabel.toLowerCase(), "item name"]}
          className="w-full sm:w-80"
        />
      </div>
      <InvTable
        fill
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        onRowClick={(d) => router.push(`/inventory/docs/${d.id}`)}
        resetKey={`${tab}|${query}`}
        emptyTitle={ready ? `No ${meta.plural.toLowerCase()} yet` : "Loading…"}
        emptyHint={ready ? `Use “${createLabel}” to add the first one.` : undefined}
        itemLabel={meta.label.toLowerCase()}
      />
      <DocCreateDialog type={type} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/* ── Create dialog ──────────────────────────────────────────────────────── */
const RETURN_REASONS = ["Dead on arrival", "Defective", "Wrong item", "Excess / not needed", "Damaged in transit"];

export function DocCreateDialog({ type, open, onClose }: { type: DocType; open: boolean; onClose: () => void }) {
  const meta = DOC_META[type];
  const router = useRouter();
  const { vendors } = useInventoryOps();
  const { createDoc } = useInventoryActions();
  const { inventory, stockItems, canViewCost } = useInventoryScope();
  const { stores } = useStoreContext();

  const [party, setParty] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DocLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [locFilter, setLocFilter] = useState("all");

  const vendorParty = type === "purchase_order" || type === "grn" || type === "vendor_return" || type === "warranty_claim";
  const storeNames = useMemo(() => [...new Set([...stores.map((s) => s.name), ...inventory.map((i) => i.store).filter(Boolean)])].sort(), [stores, inventory]);
  const locations = useMemo(() => [...new Set(stockItems.map((i) => i.store).filter(Boolean))].sort(), [stockItems]);

  function reset() { setParty(""); setRef(""); setNotes(""); setLines([]); setLocFilter("all"); }
  function close() { reset(); onClose(); }

  function addItem(it: InventoryItem) {
    if (lines.some((l) => l.itemId === it.id)) { toast.error(`${it.name} is already in the list`); return; }
    const base: DocLine = { itemId: it.id, name: it.name, qty: 1 };
    if (meta.hasCost) base.unitCost = canViewCost ? it.costPrice ?? 0 : 0;
    if (type === "vendor_return") base.reason = RETURN_REASONS[0];
    if (type === "transfer") base.toItemId = it.id;
    setLines((p) => [...p, base]);
  }
  const patch = (i: number, v: Partial<DocLine>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...v } : l)));

  function loadForCount() {
    const src = stockItems.filter((i) => locFilter === "all" || i.store === locFilter);
    if (src.length === 0) { toast.error("No items in that location"); return; }
    setLines(src.map((i) => ({ itemId: i.id, name: i.name, qty: 0, system: i.currentStock, counted: undefined })));
    setParty(locFilter === "all" ? "All locations" : locFilter);
  }

  const partyNeeded = vendorParty || type === "transfer" || type === "stock_count";
  const linesOk = lines.length > 0 && lines.every((l) => (type === "stock_count" ? true : Number.isInteger(l.qty) && l.qty > 0));
  const canSave = linesOk && (!partyNeeded || party.trim() !== "") && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const doc = await createDoc(type, { party: party.trim(), ref: ref.trim(), lines, data: notes.trim() ? { notes: notes.trim() } : {} });
      if (doc) { toast.success(`${doc.id} created`); close(); router.push(`/inventory/docs/${doc.id}`); }
    } finally { setSaving(false); }
  }

  const numInput = "h-[32px] w-full rounded-lg border border-input bg-card px-2 text-right text-[13px] tabular-nums outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";

  return (
    <RoxCenteredForm
      open={open}
      onClose={close}
      title={`New ${meta.label}`}
      subtitle="Add the items, then review the document before it moves any stock"
      icon={Package}
      width="max-w-3xl"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={!canSave}>{saving ? "Saving…" : "Create"}</Button></div>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>{meta.partyLabel}{partyNeeded ? " *" : ""}</Label>
            {vendorParty ? (
              vendors.length > 0 ? (
                <Select className="mt-1.5 h-[34px]" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Select vendor" options={vendors.filter((v) => v.active).map((v) => ({ label: v.name, value: v.name }))} />
              ) : (
                <p className="mt-1.5 rounded-xl border border-dashed border-input px-3 py-2 text-[12.5px] text-muted-foreground">No vendors yet. <Link href="/inventory/vendors" className="font-semibold text-[#4361EE] hover:underline">Add a vendor</Link> first.</p>
              )
            ) : type === "transfer" ? (
              <Select className="mt-1.5 h-[34px]" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Destination store" options={storeNames.map((s) => ({ label: s, value: s }))} />
            ) : type === "stock_count" ? (
              <Select className="mt-1.5 h-[34px]" value={locFilter} onChange={(e) => setLocFilter(e.target.value)} options={[{ label: "All locations", value: "all" }, ...locations.map((l) => ({ label: l, value: l }))]} />
            ) : (
              <input value={party} onChange={(e) => setParty(e.target.value)} placeholder={type === "old_part" ? "Ticket id (e.g. TKT-0012)" : "Optional"} className="mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
            )}
          </div>
          <div>
            <Label>{type === "warranty_claim" ? "Original ticket" : type === "grn" ? "Linked PO" : "Reference / note"}</Label>
            <input value={type === "stock_count" ? notes : ref} onChange={(e) => (type === "stock_count" ? setNotes(e.target.value) : setRef(e.target.value))} placeholder="Optional" className="mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
          </div>
        </div>

        {type === "stock_count" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-[12.5px] text-muted-foreground">Snapshot every item in the selected location. You enter the counted quantities on the next screen.</p>
            <Button variant="outline" size="sm" onClick={loadForCount}>Load items ({stockItems.filter((i) => locFilter === "all" || i.store === locFilter).length})</Button>
          </div>
        ) : (
          <div>
            <Label>Add item</Label>
            <div className="mt-1.5"><InventorySearchBox kind="part" onSelect={addItem} placeholder="Search a part by name, SKU or category…" /></div>
          </div>
        )}

        {lines.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="bg-[#EEF1FD] text-left text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
                  <th className="px-3 py-2.5">Item</th>
                  {type === "stock_count" ? <th className="w-[90px] px-3 py-2.5 text-right">System</th> : <th className="w-[80px] px-3 py-2.5 text-right">Qty</th>}
                  {meta.hasCost && <th className="w-[110px] px-3 py-2.5 text-right">Unit cost</th>}
                  {type === "vendor_return" && <th className="w-[170px] px-3 py-2.5">Reason</th>}
                  {type === "transfer" && <th className="w-[180px] px-3 py-2.5">Destination item</th>}
                  <th className="w-[40px]" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.itemId} className="border-t border-border">
                    <td className="truncate px-3 py-2 font-medium" title={l.name}>{l.name}<span className="block truncate text-[11px] font-normal text-muted-foreground">{l.itemId}</span></td>
                    {type === "stock_count"
                      ? <td className="px-3 py-2 text-right tabular-nums">{l.system}</td>
                      : <td className="px-3 py-2"><input type="number" min={1} step={1} value={l.qty} onChange={(e) => patch(i, { qty: Number(e.target.value) })} className={numInput} /></td>}
                    {meta.hasCost && <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.unitCost ?? 0} onChange={(e) => patch(i, { unitCost: Number(e.target.value) })} className={numInput} /></td>}
                    {type === "vendor_return" && <td className="px-3 py-2"><Select className="h-[32px]" value={l.reason ?? RETURN_REASONS[0]} onChange={(e) => patch(i, { reason: e.target.value })} options={RETURN_REASONS.map((r) => ({ label: r, value: r }))} /></td>}
                    {type === "transfer" && (
                      <td className="px-3 py-2">
                        <Select className="h-[32px]" value={l.toItemId ?? l.itemId} onChange={(e) => patch(i, { toItemId: e.target.value })}
                          options={[{ label: "Same item", value: l.itemId }, ...inventory.filter((x) => x.id !== l.itemId && x.name === l.name).map((x) => ({ label: `${x.store || x.id}`, value: x.id }))]} />
                      </td>
                    )}
                    <td className="px-2 py-2 text-right"><button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove line" className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {type !== "stock_count" && (
          <div>
            <Label>Notes</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
          </div>
        )}
      </div>
    </RoxCenteredForm>
  );
}
