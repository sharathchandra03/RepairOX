"use client";
/* RepairOX — Field Management header search. Replaces the Tickets-scoped
   UniversalSearch while the Field workspace is active; it searches Field trips
   (Pickup & Drop) with the SAME matcher as the table (matchesFieldSearch), over
   the already store/RLS-scoped trips. Read-only; opening a result goes to the
   full trip page. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Truck, ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useField } from "@/lib/field-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { resolveFieldRow } from "@/lib/field-resolve";
import { matchesFieldSearch } from "@/lib/field-table";
import { FIELD_STATUS_LABEL, FIELD_STATUS_TONE } from "@/lib/field-data";

const PLACEHOLDER = "Search trips by Trip ID, customer, phone, device or Ninja…";
const MAX = 6;

export function FieldSearch() {
  const router = useRouter();
  const { jobs } = useField();
  const { tickets, invoices, customers } = useStore();
  const { stores } = useStoreContext();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim();

  const src = useMemo(() => ({ tickets, invoices, customers }), [tickets, invoices, customers]);
  const hits = useMemo(() => {
    if (q.length < 2) return { rows: [], total: 0 };
    const all = jobs.filter((j) => {
      const store = stores.find((s) => s.id === j.branchId) ?? stores.find((s) => s.name === j.branch);
      return matchesFieldSearch(q, j, resolveFieldRow(j, src), { storeName: store?.name });
    });
    return { rows: all.slice(0, MAX), total: all.length };
  }, [q, jobs, stores, src]);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, []);
  useEffect(() => { setActive(-1); }, [q]);

  const go = (href: string) => { router.push(href); setOpen(false); setQuery(""); };
  const viewAll = () => q && go(`/field?q=${encodeURIComponent(q)}`);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); if (query) setQuery(""); else { setOpen(false); input.current?.blur(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((p) => (hits.rows.length ? (p + 1) % hits.rows.length : -1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((p) => (hits.rows.length ? (p <= 0 ? hits.rows.length - 1 : p - 1) : -1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (active >= 0 && hits.rows[active]) go(`/field/${hits.rows[active].id}`); else viewAll(); }
  };
  const show = open && q.length > 0;

  return (
    <div ref={box} className="relative w-[400px] max-w-[34vw] min-w-[280px] shrink-0">
      <div className={cn("relative flex h-9 items-center rounded-full border transition-all duration-200", open ? "border-[#4361EE]/40 bg-white shadow-[0_0_0_3px_rgba(67,97,238,0.10)]" : "border-border bg-slate-100/80 hover:bg-slate-100")}>
        <span className={cn("flex shrink-0 items-center gap-1 rounded-l-full border-r py-1.5 pl-3 pr-2 text-[11px] font-semibold", open ? "border-[#4361EE]/20 bg-[#4361EE]/5 text-[#4361EE]" : "border-border text-zinc-500")}>
          <Truck className="h-3 w-3" /><span className="hidden sm:inline">Trips</span>
        </span>
        <Search className={cn("ml-2 h-3.5 w-3.5 shrink-0", open ? "text-[#4361EE]" : "text-zinc-400")} />
        <input ref={input} value={query} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder={PLACEHOLDER} autoComplete="off" spellCheck={false} role="combobox" aria-expanded={show} aria-autocomplete="list"
          aria-label="Search field trips by Trip ID, customer, phone, device or Ninja"
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-zinc-800 outline-none placeholder:text-zinc-400 focus:outline-none focus:ring-0" />
        {query && <button type="button" onClick={() => { setQuery(""); input.current?.focus(); }} className="mr-2 grid h-5 w-5 place-items-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600" aria-label="Clear search"><X className="h-3 w-3" /></button>}
      </div>
      {show && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 min-w-[min(520px,92vw)] overflow-hidden rounded-2xl border border-border bg-white shadow-xl shadow-black/10">
          {q.length < 2 ? <p className="px-4 py-6 text-center text-[12px] text-zinc-500">Type at least 2 characters.</p>
            : hits.rows.length === 0 ? <p className="px-4 py-6 text-center text-[12.5px] text-zinc-500">No trips match “{q}”.</p>
            : (
              <>
                <ul className="max-h-[360px] overflow-y-auto py-1">
                  {hits.rows.map((j, i) => (
                    <li key={j.id}>
                      <button onMouseEnter={() => setActive(i)} onClick={() => go(`/field/${j.id}`)}
                        className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition", i === active ? "bg-[#EEF1FD]" : "hover:bg-muted/50")}>
                        <span className="w-[74px] shrink-0 text-[12px] font-bold tabular-nums text-[#4361EE]">{j.jobNo}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{j.customer || "Customer"}{j.phone ? <span className="font-normal text-muted-foreground"> · {j.phone}</span> : null}</span>
                          <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{j.device || "Device"}{j.ninjaName ? ` · ${j.ninjaName}` : ""}</span>
                        </span>
                        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[j.status])}>{FIELD_STATUS_LABEL[j.status]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button onClick={viewAll} className="flex w-full items-center justify-between border-t border-border bg-zinc-50/90 px-4 py-2.5 text-[12px] font-semibold text-[#4361EE] hover:bg-[#EEF1FD]">
                  <span>View all {hits.total} in Pickup &amp; Drop</span><ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
        </div>
      )}
    </div>
  );
}
