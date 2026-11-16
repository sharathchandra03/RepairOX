"use client";
/* Mobile inventory browser, shared by the Stock tab (browse) and the invoice builder (pick).
   Live search over the store-scoped Inventory Master, an "available only" switch and a category
   sheet. No tables: each item is a tappable card with price and a plain stock state. */
import { useEffect, useMemo, useState } from "react";
import { Boxes, PackageSearch, Search, SlidersHorizontal, Wrench, X } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { useStore } from "@/lib/store";
import type { InventoryItem } from "@/lib/inventory-data";
import { availableQty, isService, searchStock, sellPrice, stockState, STOCK_LABEL, STOCK_TONE } from "@/lib/ninja/stock";
import { useNinja } from "@/lib/ninja/ninja-context";
import { AppliedChip, Btn, Empty, Pill, Sheet, Skeleton, inputCls } from "./ui";

export function StockCard({ item, onClick, action }: { item: InventoryItem; onClick?: () => void; action?: React.ReactNode }) {
  const s = stockState(item);
  const Icon = isService(item) ? Wrench : Boxes;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgba(20,30,80,0.05),0_12px_24px_-20px_rgba(20,30,80,0.4)] ring-1 ring-slate-200/80">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${isService(item) ? "bg-sky-50 text-sky-600" : "bg-[#EEF1FD] text-[#4361EE]"}`}><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold leading-tight text-slate-900">{item.name}</span>
          <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-500">{[item.category, item.id].filter(Boolean).join(" · ")}</span>
          <span className="mt-1.5 flex items-center gap-2">
            <Pill tone={STOCK_TONE[s]}>{s === "service" ? "Service" : s === "out" ? "Out of stock" : `${availableQty(item)} ${s === "low" ? "left" : "in stock"}`}</Pill>
          </span>
        </span>
        <span className="shrink-0 text-right"><span className="block text-[16px] font-extrabold tabular-nums text-slate-900">{formatINR(sellPrice(item))}</span>{item.uom ? <span className="text-[11px] font-semibold text-slate-400">per {item.uom}</span> : null}</span>
      </button>
      {action}
    </div>
  );
}

export function StockBrowser({ onPick, pickLabel = "Add", autoFocus }: { onPick?: (i: InventoryItem) => void; pickLabel?: string; autoFocus?: boolean }) {
  const { inventory } = useStore();
  const { track } = useNinja();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [avail, setAvail] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<InventoryItem | null>(null);
  const items = useMemo(() => inventory.filter((i) => i.active !== false), [inventory]);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const list = useMemo(() => searchStock(items, q)
    .filter((i) => !cat || i.category === cat)
    .filter((i) => !avail || isService(i) || availableQty(i) > 0)
    .sort((a, b) => a.name.localeCompare(b.name)), [items, q, cat, avail]);

  useEffect(() => {
    if (!q.trim()) return;
    const h = setTimeout(() => track({ kind: "stock_search", screen: "stock", payload: { length: q.trim().length, results: list.length } }), 900);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const show = (i: InventoryItem) => { setOpen(i); track({ kind: "stock_item_viewed", screen: "stock", payload: { sku: i.id, state: stockState(i) } }); };
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part, SKU or category" className={`${inputCls} pl-12 pr-12`} />
        {q ? <button aria-label="Clear" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-slate-400 active:bg-slate-100"><X className="h-5 w-5" /></button> : null}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setSheet(true)} className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-white text-[13.5px] font-bold text-slate-700 ring-1 ring-inset ring-slate-300 active:bg-slate-50"><SlidersHorizontal className="h-4 w-4" />Category</button>
        <button role="switch" aria-checked={avail} onClick={() => setAvail((a) => !a)}
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold ring-1 ring-inset transition ${avail ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-700 ring-slate-300"}`}>In stock only</button>
      </div>
      {cat || avail ? (
        <div className="flex flex-wrap gap-2">
          {cat ? <AppliedChip onRemove={() => setCat("")}>{cat}</AppliedChip> : null}
          {avail ? <AppliedChip onRemove={() => setAvail(false)}>In stock only</AppliedChip> : null}
        </div>
      ) : null}
      <p className="px-1 text-[12px] font-semibold text-slate-400">{list.length} item{list.length === 1 ? "" : "s"}</p>
      {items.length === 0 ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        : list.length === 0 ? <Empty icon={<PackageSearch className="h-7 w-7" />} title="No items found" body="Try a shorter name, or clear the filters." />
        : <div className="space-y-2.5">{list.slice(0, 80).map((i) => (
            <StockCard key={i.id} item={i} onClick={() => show(i)}
              action={onPick ? <button onClick={() => onPick(i)} disabled={!isService(i) && availableQty(i) <= 0} className="grid min-h-[44px] shrink-0 place-items-center rounded-xl bg-[#4361EE] px-3.5 text-[13px] font-extrabold text-white active:bg-[#3450D8] disabled:bg-slate-200 disabled:text-slate-400">{pickLabel}</button> : undefined} />
          ))}{list.length > 80 ? <p className="py-2 text-center text-[12px] font-semibold text-slate-400">Showing the first 80. Search to narrow down.</p> : null}</div>}

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Category">
        <div className="space-y-1.5 pb-2">
          {["", ...cats].map((c) => (
            <button key={c || "all"} onClick={() => { setCat(c); setSheet(false); }}
              className={`flex min-h-[50px] w-full items-center justify-between rounded-xl px-4 text-left text-[14.5px] font-bold ring-1 ring-inset ${cat === c ? "bg-[#EEF1FD] text-[#3450D8] ring-[#4361EE]/40" : "bg-white text-slate-700 ring-slate-200"}`}>
              {c || "All categories"}<span className="text-[12px] font-semibold text-slate-400">{c ? items.filter((i) => i.category === c).length : items.length}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? "Item"}
        footer={open && onPick ? <Btn className="w-full" disabled={!isService(open) && availableQty(open) <= 0} onClick={() => { onPick(open); setOpen(null); }}>{pickLabel} to invoice</Btn> : undefined}>
        {open ? (
          <div className="space-y-3 pb-2">
            <div className="flex items-center gap-2"><Pill tone={STOCK_TONE[stockState(open)]}>{STOCK_LABEL[stockState(open)]}</Pill>{open.category ? <Pill>{open.category}</Pill> : null}</div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                ["Price", formatINR(sellPrice(open))],
                ["MRP", open.mrp ? formatINR(open.mrp) : "—"],
                ["Available", isService(open) ? "Not tracked" : `${availableQty(open)} ${open.uom || ""}`.trim()],
                ["Reserved", isService(open) ? "—" : String(open.reservedStock || 0)],
                ["GST", open.tax ? `${open.tax}%` : "—"],
                ["HSN / SAC", open.hsnCode || "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3"><p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{k}</p><p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">{v}</p></div>
              ))}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600"><span className="font-bold text-slate-800">SKU</span> {open.id}{open.brandModel ? <><br /><span className="font-bold text-slate-800">Fits</span> {open.brandModel}</> : null}{open.description ? <><br />{open.description}</> : null}</div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
