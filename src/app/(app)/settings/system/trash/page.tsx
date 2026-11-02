"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Settings → System → Trash Bin

   One place for everything that was deleted — Tickets, Invoices, Walk-Ins and
   Leads — separated by type, showing WHO created and WHO deleted each record
   and WHEN, with permission-gated restore.

   Access:  settings_trash_view  (open + see)   settings_trash_restore (restore)
            Both OFF by default for every role (owners via full_access).
   Data:    Supabase mode → GET/POST /api/trash (server-scoped to the caller's
            organization + stores).  Local mode → localStorage tombstones.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ticket as TicketIcon, FileText, Footprints, Users, Trash2, RotateCcw, RefreshCw, X,
} from "lucide-react";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { RequireCapability } from "@/components/common/require-capability";
import { TableSearch } from "@/components/common/table-utility-bar";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/components/ui/toaster";
import {
  RoxTableHead, RoxHeadRow, RoxTableRow, RoxTableCell,
} from "@/components/ui/rox-table";
import { ActiveFiltersBar, type AppliedFilter } from "@/components/ui/rox-filter";
import { usePermissions } from "@/lib/permissions-context";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { useLeads } from "@/lib/leads-context";
import { allow, CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import {
  TRASH_KINDS, TRASH_KIND_META, EMPTY_TRASH_COUNTS, formatTrashDate,
  readLocalTrash, removeLocalTombstone,
  type TrashItem, type TrashKind, type TrashCounts,
} from "@/lib/trash";

type RangeKey = "all" | "today" | "7d" | "30d" | "custom";

const KIND_ICON: Record<TrashKind, React.ComponentType<{ className?: string }>> = {
  ticket: TicketIcon, invoice: FileText, walkin: Footprints, lead: Users,
};

/* Restrained semantic accent per type (icon chip + active frame only). */
const KIND_TONE: Record<TrashKind, { chip: string; active: string }> = {
  ticket:  { chip: "bg-[#EEF1FD] text-[#4361EE]",   active: "border-[#4361EE]/60 ring-2 ring-[#4361EE]/15" },
  invoice: { chip: "bg-emerald-50 text-emerald-600", active: "border-emerald-400 ring-2 ring-emerald-200/60" },
  walkin:  { chip: "bg-violet-50 text-violet-600",   active: "border-violet-400 ring-2 ring-violet-200/60" },
  lead:    { chip: "bg-amber-50 text-amber-600",     active: "border-amber-400 ring-2 ring-amber-200/60" },
};

const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "Custom", value: "custom" },
];

const RANGE_LABEL: Record<RangeKey, string> = {
  all: "All time", today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", custom: "Custom range",
};

function rangeBounds(range: RangeKey, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  if (range === "today") {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return { from: d.toISOString(), to: null };
  }
  if (range === "7d") return { from: new Date(now.getTime() - 7 * 864e5).toISOString(), to: null };
  if (range === "30d") return { from: new Date(now.getTime() - 30 * 864e5).toISOString(), to: null };
  if (range === "custom") {
    const f = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const t = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
    return { from: f && !Number.isNaN(f.getTime()) ? f.toISOString() : null, to: t && !Number.isNaN(t.getTime()) ? t.toISOString() : null };
  }
  return { from: null, to: null };
}

const money = (n: number | null) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const prettyStatus = (s: string) =>
  s ? s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

export default function TrashBinPage() {
  return (
    <RequireCapability
      anyOf={CAP.settings.trashView}
      title="Trash Bin is restricted"
      description="Your role doesn't include Trash Bin access. Ask an administrator to grant it in Settings → Roles & Permissions."
    >
      <TrashBinInner />
    </RequireCapability>
  );
}

function TrashBinInner() {
  const { can, apiFetch } = usePermissions();
  const store = useStore();
  const leadsCtx = useLeads();
  const canRestore = allow(can, CAP.settings.trashRestore);
  const dbMode = isSupabaseConfigured;

  const [kind, setKind] = useState<TrashKind>("ticket");
  const [range, setRange] = useState<RangeKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [storeId, setStoreId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [items, setItems] = useState<TrashItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<TrashCounts>(EMPTY_TRASH_COUNTS);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [restoring, setRestoring] = useState(false);

  const reqSeq = useRef(0);
  // Instant tab/filter switching: results are cached per query and shown
  // immediately while a fresh copy loads in the background.
  type Snapshot = { items: TrashItem[]; total: number; counts: TrashCounts | null; stores: { id: string; name: string }[] };
  const cacheRef = useRef<Map<string, Snapshot>>(new Map());

  // Debounce the search box; reset to page 1 whenever any filter changes.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [kind, range, customFrom, customTo, debounced, storeId, pageSize]);

  const bounds = useMemo(() => rangeBounds(range, customFrom, customTo), [range, customFrom, customTo]);

  const queryString = useCallback((k: TrashKind, withCounts: boolean) => {
    const params = new URLSearchParams({ kind: k, page: String(page), pageSize: String(pageSize) });
    if (debounced) params.set("q", debounced);
    if (storeId) params.set("store", storeId);
    if (bounds.from) params.set("from", bounds.from);
    if (bounds.to) params.set("to", bounds.to);
    if (!withCounts) params.set("counts", "0");
    return params;
  }, [page, pageSize, debounced, storeId, bounds]);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setError(null);
    try {
      if (dbMode) {
        const key = queryString(kind, false).toString();
        const cached = cacheRef.current.get(key);
        if (cached) {
          // Show the last known result instantly, then refresh quietly.
          setItems(cached.items); setTotal(cached.total); setStores(cached.stores);
          if (cached.counts) setCounts(cached.counts);
          setLoading(false);
        } else {
          setItems([]); setTotal(0);
          setLoading(true);
        }
        const res = await apiFetch(`/api/trash?${queryString(kind, true).toString()}`, { method: "GET" });
        if (seq !== reqSeq.current) return;
        if (!res.ok || !res.json?.ok) {
          setError(res.json?.error ?? "Could not load the Trash Bin.");
          setItems([]); setTotal(0);
          return;
        }
        const snap: Snapshot = {
          items: res.json.items as TrashItem[], total: res.json.total as number,
          counts: res.json.counts as TrashCounts, stores: res.json.stores as { id: string; name: string }[],
        };
        cacheRef.current.set(key, snap);
        setItems(snap.items); setTotal(snap.total); setCounts(snap.counts as TrashCounts); setStores(snap.stores);

        // Warm the other three tabs in the background so switching is instant.
        for (const other of TRASH_KINDS) {
          if (other.kind === kind) continue;
          const okey = queryString(other.kind, false).toString();
          if (cacheRef.current.has(okey)) continue;
          void apiFetch(`/api/trash?${queryString(other.kind, false).toString()}`, { method: "GET" }).then((r) => {
            if (r.ok && r.json?.ok) {
              cacheRef.current.set(okey, {
                items: r.json.items as TrashItem[], total: r.json.total as number,
                counts: null, stores: r.json.stores as { id: string; name: string }[],
              });
            }
          });
        }
      } else {
        setLoading(true);
        // Local mode: tombstones in localStorage, filtered the same way.
        const all = readLocalTrash();
        const inRange = (t: { deletedAt: string }) =>
          (!bounds.from || t.deletedAt >= bounds.from) && (!bounds.to || t.deletedAt <= bounds.to);
        const base = all.filter((t) => inRange(t) && (!storeId || t.branchId === storeId));
        const q = debounced.toLowerCase();
        const mine = base.filter((t) => t.kind === kind && (!q || `${t.ref} ${t.title} ${t.subtitle}`.toLowerCase().includes(q)));
        setCounts({
          ticket: base.filter((t) => t.kind === "ticket").length,
          invoice: base.filter((t) => t.kind === "invoice").length,
          walkin: base.filter((t) => t.kind === "walkin").length,
          lead: base.filter((t) => t.kind === "lead").length,
        });
        setTotal(mine.length);
        setItems(mine.slice((page - 1) * pageSize, page * pageSize));
        setStores([]);
      }
    } catch {
      if (seq === reqSeq.current) setError("Could not load the Trash Bin. Check your connection and try again.");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [dbMode, apiFetch, kind, page, pageSize, debounced, storeId, bounds, queryString]);

  useEffect(() => { void load(); }, [load]);

  /* ── Restore ─────────────────────────────────────────────────────────── */
  const doRestore = useCallback(async (ids: string[]) => {
    if (!canRestore || ids.length === 0) return;
    setRestoring(true);
    try {
      const noun = TRASH_KIND_META[kind].noun;
      if (dbMode) {
        const res = await apiFetch("/api/trash", { method: "POST", body: JSON.stringify({ kind, ids }) });
        if (!res.ok || !res.json?.ok) {
          toast.error("Could not restore", { description: res.json?.error ?? "Please try again." });
          return;
        }
        const n = (res.json.restored as string[]).length;
        toast.success(`Restored ${n} ${noun}${n === 1 ? "" : "s"}`);
      } else {
        let n = 0;
        for (const t of readLocalTrash().filter((x) => x.kind === kind && ids.includes(x.id))) {
          if (kind === "lead") leadsCtx.restoreTrashedLead(t.record as any);
          else store.restoreTrashed(kind, t.record);
          removeLocalTombstone(kind, t.id);
          n++;
        }
        toast.success(`Restored ${n} ${noun}${n === 1 ? "" : "s"}`);
      }
      setSelected(new Set());
      cacheRef.current.clear();
      await load();
    } finally {
      setRestoring(false);
      setConfirmIds(null);
    }
  }, [canRestore, dbMode, apiFetch, kind, leadsCtx, store, load]);

  /* ── Selection (over the visible page only) ──────────────────────────── */
  const pageIds = useMemo(() => items.map((i) => i.id), [items]);
  const selectedInView = pageIds.filter((id) => selected.has(id));
  const allSelected = pageIds.length > 0 && selectedInView.length === pageIds.length;
  const someSelected = selectedInView.length > 0;
  const toggleOne = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelected) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id));
      return n;
    });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showStoreCol = stores.length > 1;
  const meta = TRASH_KIND_META[kind];
  const totalAll = counts.ticket + counts.invoice + counts.walkin + counts.lead;
  const activeFilters: AppliedFilter[] = [];
  if (range !== "all") activeFilters.push({ id: "range", label: "Deleted", value: RANGE_LABEL[range], onClear: () => setRange("all") });
  if (storeId) activeFilters.push({ id: "store", label: "Store", value: stores.find((s) => s.id === storeId)?.name ?? "Store", onClear: () => setStoreId("") });
  if (debounced) activeFilters.push({ id: "q", label: "Search", value: debounced, onClear: () => setSearch("") });

  const colCount = 6 + (canRestore ? 2 : 0) + (showStoreCol ? 1 : 0);

  return (
    <div className="space-y-5">
      <SettingsBreadcrumb items={[{ label: "System" }, { label: "Trash Bin" }]} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight">Trash Bin</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              Everything deleted from Tickets, Invoices, Walk-Ins and Leads is kept here, with who created it and who
              deleted it. {canRestore ? "Restore a record and it returns exactly as it was." : "You can view deleted records but not restore them."}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { cacheRef.current.clear(); void load(); }} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

      {/* Type separation — each card is a tab */}
      <div role="tablist" aria-label="Deleted record type" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TRASH_KINDS.map((k) => {
          const Icon = KIND_ICON[k.kind];
          const active = kind === k.kind;
          return (
            <button
              key={k.kind}
              role="tab"
              aria-selected={active}
              onClick={() => setKind(k.kind)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 bg-card p-4 text-left shadow-card transition hover:border-[#4361EE]/30",
                active ? KIND_TONE[k.kind].active : "border-zinc-200",
              )}
            >
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", KIND_TONE[k.kind].chip)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</span>
                <span className="block font-display text-2xl font-extrabold tabular-nums leading-tight text-foreground">{counts[k.kind]}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" options={RANGE_OPTIONS} value={range} onChange={(v) => setRange(v as RangeKey)} />
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {showStoreCol && (
            <Select
              className="h-[34px] min-w-[170px]"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              options={[{ label: "All Stores", value: "" }, ...stores.map((s) => ({ label: s.name, value: s.id }))]}
            />
          )}
          <TableSearch
            value={search}
            onChange={setSearch}
            className="w-full sm:w-[300px]"
            placeholder={`Search deleted ${meta.noun}s by number, name, phone or device…`}
            animatedPrefix="Search by "
            animatedWords={["number", "customer name", "phone", "device"]}
          />
        </div>
      </div>

      <DateRangePicker
        open={range === "custom"}
        from={customFrom}
        to={customTo}
        onFromChange={setCustomFrom}
        onToChange={setCustomTo}
      />

      <ActiveFiltersBar
        filters={activeFilters}
        onClearAll={() => { setRange("all"); setStoreId(""); setSearch(""); }}
      />

      {/* Bulk bar */}
      {canRestore && someSelected && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD] px-4 py-2.5">
          <span className="rounded-full bg-[#4361EE] px-2.5 py-0.5 text-[11px] font-bold text-white">{selectedInView.length} selected</span>
          <Button size="sm" onClick={() => setConfirmIds(selectedInView)}>
            <RotateCcw className="h-3.5 w-3.5" /> Restore selected
          </Button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] font-semibold text-[#4361EE] hover:underline">Clear</button>
        </div>
      )}

      {/* Table */}
      {/* The table scrolls inside its own bounded box and the header pins to the
          top of THAT box (sticky top-0) — independent of the page / Settings
          pane scroll, so the header can never float over rows. */}
      <div className="rox-table-card shadow-card">
       <div className="rox-grid-scroll max-h-[calc(100vh-340px)] min-h-[320px] overflow-auto">
        <table className="trash-table w-full table-fixed border-separate border-spacing-0 text-[14px]">
        <colgroup>
          {canRestore && <col style={{ width: 48 }} />}
          <col style={{ width: "26%" }} />
          {showStoreCol && <col style={{ width: "12%" }} />}
          <col style={{ width: 130 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "19%" }} />
          {canRestore && <col style={{ width: 130 }} />}
        </colgroup>
        <RoxTableHead className="!static">
          <RoxHeadRow>
            {canRestore && (
              <th className="trash-th rox-table-cell">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={toggleAll}
                  aria-label={`Select all deleted ${meta.noun}s on this page`}
                />
              </th>
            )}
            <th className="trash-th rox-table-cell">{meta.refLabel}</th>
            {showStoreCol && <th className="trash-th rox-table-cell">Store</th>}
            <th className="trash-th rox-table-cell">Status</th>
            <th className="trash-th rox-table-cell">Value</th>
            <th className="trash-th rox-table-cell">Created by</th>
            <th className="trash-th rox-table-cell">Deleted by</th>
            {canRestore && <th className="trash-th rox-table-cell text-right">Action</th>}
          </RoxHeadRow>
        </RoxTableHead>
        <tbody>
          {loading && items.length === 0 ? (
            Array.from({ length: 5 }).map((_, i) => (
              <RoxTableRow key={`sk-${i}`}>
                <RoxTableCell colSpan={colCount}><div className="h-4 w-1/3 animate-pulse rounded bg-muted" /></RoxTableCell>
              </RoxTableRow>
            ))
          ) : error ? (
            <RoxTableRow>
              <RoxTableCell colSpan={colCount} className="text-center">
                <p className="text-sm font-semibold text-rose-600">{error}</p>
                <button onClick={() => void load()} className="mt-1 text-[12px] font-semibold text-[#4361EE] hover:underline">Try again</button>
              </RoxTableCell>
            </RoxTableRow>
          ) : items.length === 0 ? (
            <RoxTableRow className="hover:bg-transparent">
              <RoxTableCell colSpan={colCount} className="py-12 text-center">
                <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Trash2 className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {activeFilters.length ? `No deleted ${meta.noun}s match these filters` : `No deleted ${meta.noun}s`}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {activeFilters.length
                    ? "Clear a filter to see more."
                    : totalAll > 0 ? "Other record types have deleted items — pick another tab above." : "Anything you delete will show up here."}
                </p>
              </RoxTableCell>
            </RoxTableRow>
          ) : (
            items.map((it) => (
              <RoxTableRow key={`${it.kind}-${it.id}`} selected={selected.has(it.id)}>
                {canRestore && (
                  <RoxTableCell>
                    <Checkbox checked={selected.has(it.id)} onChange={() => toggleOne(it.id)} aria-label={`Select ${it.ref}`} />
                  </RoxTableCell>
                )}
                <RoxTableCell>
                  <p className="truncate text-[14px] font-bold text-foreground" title={it.ref}>{it.ref}</p>
                  <p className="truncate text-[13px] text-foreground/80" title={it.title}>{it.title}</p>
                  {it.subtitle && <p className="truncate text-[12px] text-muted-foreground" title={it.subtitle}>{it.subtitle}</p>}
                </RoxTableCell>
                {showStoreCol && (
                  <RoxTableCell>
                    <span className="block truncate text-[13px] font-bold text-slate-900" title={it.storeName ?? ""}>{it.storeName ?? "—"}</span>
                  </RoxTableCell>
                )}
                <RoxTableCell>
                  <span className="flex h-7 w-full min-w-0 items-center rounded-full bg-zinc-100 px-2.5 text-[11px] font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
                    <span className="truncate" title={prettyStatus(it.status)}>{prettyStatus(it.status)}</span>
                  </span>
                </RoxTableCell>
                <RoxTableCell className="tabular-nums text-[14px] font-semibold">{money(it.amount)}</RoxTableCell>
                <RoxTableCell>
                  <PersonCell name={it.createdByName} when={it.createdAt} />
                </RoxTableCell>
                <RoxTableCell>
                  <PersonCell name={it.deletedByName} when={it.deletedAt} danger unknownHint="Deleted before deletions were tracked" />
                </RoxTableCell>
                {canRestore && (
                  <RoxTableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setConfirmIds([it.id])} disabled={restoring}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </Button>
                  </RoxTableCell>
                )}
              </RoxTableRow>
            ))
          )}
        </tbody>
        </table>
       </div>
      </div>

      {/* Detached pagination footer */}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={total}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        itemLabel={`deleted ${meta.noun}`}
      />

      <ConfirmDialog
        open={!!confirmIds}
        onClose={() => setConfirmIds(null)}
        onConfirm={() => { if (confirmIds) void doRestore(confirmIds); }}
        title={confirmIds && confirmIds.length > 1 ? `Restore ${confirmIds.length} ${meta.noun}s?` : `Restore this ${meta.noun}?`}
        description={`${confirmIds && confirmIds.length > 1 ? "They'll" : "It'll"} go back to ${meta.label} exactly as ${confirmIds && confirmIds.length > 1 ? "they were" : "it was"} before deletion.`}
        confirmLabel="Restore"
        danger={false}
      />
    </div>
  );
}

/** Avatar + name over a date line. Unknown person → muted "Unknown". */
function PersonCell({
  name, when, danger, unknownHint,
}: { name: string | null; when: string | null; danger?: boolean; unknownHint?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {name ? (
        <Avatar name={name} size={30} />
      ) : (
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">?</span>
      )}
      <div className="min-w-0">
        <p
          className={cn("truncate text-[13px] font-semibold", name ? "text-foreground" : "text-muted-foreground")}
          title={name ?? unknownHint ?? "Unknown"}
        >
          {name ?? "Unknown"}
        </p>
        <p className={cn("truncate text-[11px]", danger ? "text-rose-600" : "text-muted-foreground")}>{formatTrashDate(when)}</p>
      </div>
    </div>
  );
}
