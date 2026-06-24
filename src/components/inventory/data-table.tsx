"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, SlidersHorizontal, MoreHorizontal, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Eye, Inbox, X, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";

export type Column<T> = {
  key: string;
  header: string;
  /** value used for column search / sort; falls back to nothing if omitted */
  accessor?: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  headerClassName?: string;
  cellClassName?: string;
  /** can be toggled in the Show/Hide menu (default true) */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** participates in per-column search (default true when accessor present) */
  searchable?: boolean;
  /** used as the card title in mobile card view */
  primary?: boolean;
  minWidth?: number;
};

export type RowAction<T> = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: (row: T) => void;
  danger?: boolean;
};

export type BulkAction = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: (ids: string[]) => void;
  danger?: boolean;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable = false,
  pageSize = 8,
  loading = false,
  rowActions,
  onRowClick,
  bulkActions,
  emptyTitle = "Nothing here yet",
  emptyDescription = "No records match your current filters.",
  minTableWidth = 900,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  pageSize?: number;
  loading?: boolean;
  rowActions?: (row: T) => RowAction<T>[];
  onRowClick?: (row: T) => void;
  bulkActions?: BulkAction[];
  emptyTitle?: string;
  emptyDescription?: string;
  minTableWidth?: number;
}) {
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
  );
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [colSearch, setColSearch] = React.useState<Record<string, string>>({});

  const visibleColumns = columns.filter((c) => !hidden.has(c.key));
  const searchableCols = columns.filter((c) => c.accessor && c.searchable !== false);

  // apply per-column search
  const filtered = React.useMemo(() => {
    const active = Object.entries(colSearch).filter(([, v]) => v.trim());
    if (!active.length) return rows;
    return rows.filter((row) =>
      active.every(([key, q]) => {
        const col = columns.find((c) => c.key === key);
        if (!col?.accessor) return true;
        return String(col.accessor(row)).toLowerCase().includes(q.trim().toLowerCase());
      })
    );
  }, [rows, colSearch, columns]);

  // reset page when the result set shrinks below current page
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  React.useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [page, pageCount]);

  const start = page * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const pageIds = pageRows.map(rowKey);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const alignClass = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} ${filtered.length === 1 ? "record" : "records"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setColSearch({});
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
              searchOpen
                ? "border-[#4361EE] bg-[#EEF1FD] text-[#3347D6]"
                : "border-border bg-card text-zinc-600 hover:bg-muted"
            )}
          >
            <Search className="h-3.5 w-3.5" /> Column search
          </button>

          <Dropdown
            width="w-60"
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                  open ? "border-[#4361EE] bg-[#EEF1FD] text-[#3347D6]" : "border-border bg-card text-zinc-600 hover:bg-muted"
                )}
              >
                <Eye className="h-3.5 w-3.5" /> Columns
              </button>
            )}
          >
            {() => (
              <div className="max-h-72 overflow-y-auto">
                <MenuLabel>Show / hide columns</MenuLabel>
                {columns.map((c) => {
                  const isHidden = hidden.has(c.key);
                  const lockable = c.hideable === false;
                  return (
                    <button
                      key={c.key}
                      disabled={lockable}
                      onClick={() =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          next.has(c.key) ? next.delete(c.key) : next.add(c.key);
                          return next;
                        })
                      }
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                        lockable ? "cursor-not-allowed opacity-50" : "hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border",
                          !isHidden ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-border"
                        )}
                      >
                        {!isHidden && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{c.header}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Dropdown>
        </div>
      </div>

      {/* Bulk selection bar */}
      <AnimatePresence>
        {selectable && selected.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border bg-[#EEF1FD]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#3347D6]">
                <button onClick={() => setSelected(new Set())} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/60">
                  <X className="h-3.5 w-3.5" />
                </button>
                {selected.size} selected
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {bulkActions?.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => a.onClick([...selected])}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12px] font-medium transition hover:shadow-sm",
                      a.danger ? "border-rose-200 text-rose-600 hover:bg-rose-50" : "border-border text-zinc-700 hover:bg-muted"
                    )}
                  >
                    {a.icon && <a.icon className="h-3.5 w-3.5" />} {a.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───── Desktop table (md+) ───── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" style={{ minWidth: minTableWidth }}>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <Checkbox checked={allOnPageSelected} indeterminate={!allOnPageSelected && someOnPageSelected} onChange={toggleAllOnPage} aria-label="Select all" />
                </th>
              )}
              {visibleColumns.map((c) => (
                <th key={c.key} className={cn("px-3 py-3 font-semibold", alignClass(c.align), c.headerClassName)} style={c.minWidth ? { minWidth: c.minWidth } : undefined}>
                  {c.header}
                </th>
              ))}
              {rowActions && <th className="w-12 px-3 py-3" />}
            </tr>

            {/* Column search row */}
            <AnimatePresence initial={false}>
              {searchOpen && (
                <motion.tr
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-b border-border bg-card"
                >
                  {selectable && <td className="px-4 py-2" />}
                  {visibleColumns.map((c) => {
                    const can = c.accessor && c.searchable !== false;
                    return (
                      <td key={c.key} className="px-3 py-2">
                        {can ? (
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                            <input
                              value={colSearch[c.key] ?? ""}
                              onChange={(e) => setColSearch((p) => ({ ...p, [c.key]: e.target.value }))}
                              placeholder="Search"
                              className="h-8 w-full rounded-lg border border-border bg-card pl-7 pr-2 text-[12px] placeholder:text-muted-foreground/70 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/50"
                            />
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                  {rowActions && <td />}
                </motion.tr>
              )}
            </AnimatePresence>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i} className="border-b border-border/60">
                  {selectable && <td className="px-4 py-3.5"><div className="skeleton h-4 w-4 rounded" /></td>}
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-3 py-3.5"><div className="skeleton h-3.5 w-[70%] rounded" /></td>
                  ))}
                  {rowActions && <td className="px-3 py-3.5"><div className="skeleton h-4 w-4 rounded" /></td>}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const id = rowKey(row);
                const isSel = selected.has(id);
                return (
                  <motion.tr
                    key={id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2) }}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      onRowClick && "cursor-pointer",
                      isSel ? "bg-[#EEF1FD]/50" : "hover:bg-muted/40"
                    )}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSel} onChange={() => toggleRow(id)} aria-label="Select row" />
                      </td>
                    )}
                    {visibleColumns.map((c) => (
                      <td key={c.key} className={cn("px-3 py-3 align-middle", alignClass(c.align), c.cellClassName)}>
                        {c.render ? c.render(row) : c.accessor ? String(c.accessor(row)) : null}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu actions={rowActions(row)} row={row} />
                      </td>
                    )}
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ───── Mobile card view (< md) ───── */}
      <div className="divide-y divide-border md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 p-4">
              <div className="skeleton h-4 w-1/2 rounded" />
              <div className="skeleton h-3 w-3/4 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          ))
        ) : pageRows.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          pageRows.map((row, idx) => {
            const id = rowKey(row);
            const isSel = selected.has(id);
            const primary = visibleColumns.find((c) => c.primary) ?? visibleColumns[0];
            const rest = visibleColumns.filter((c) => c.key !== primary?.key).slice(0, 6);
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                onClick={() => onRowClick?.(row)}
                className={cn("p-4", isSel && "bg-[#EEF1FD]/50", onRowClick && "cursor-pointer")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {selectable && (
                      <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSel} onChange={() => toggleRow(id)} aria-label="Select row" />
                      </span>
                    )}
                    <div className="min-w-0 text-[14px] font-semibold">
                      {primary?.render ? primary.render(row) : primary?.accessor ? String(primary.accessor(row)) : null}
                    </div>
                  </div>
                  {rowActions && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <RowActionMenu actions={rowActions(row)} row={row} />
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  {rest.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{c.header}</dt>
                      <dd className="mt-0.5 truncate text-[13px]">
                        {c.render ? c.render(row) : c.accessor ? String(c.accessor(row)) : "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-3 sm:flex-row sm:p-4">
          <p className="text-[12px] text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{start + 1}</span>–
            <span className="font-semibold text-foreground">{Math.min(start + pageSize, filtered.length)}</span> of{" "}
            <span className="font-semibold text-foreground">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-1">
            <PagerBtn onClick={() => setPage(0)} disabled={page === 0}><ChevronsLeft className="h-4 w-4" /></PagerBtn>
            <PagerBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="h-4 w-4" /></PagerBtn>
            <div className="flex items-center gap-1">
              {pageNumbers(page, pageCount).map((p, i) =>
                p === -1 ? (
                  <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[12px] font-medium transition",
                      p === page ? "bg-[#4361EE] text-white shadow-sm" : "text-zinc-600 hover:bg-muted"
                    )}
                  >
                    {p + 1}
                  </button>
                )
              )}
            </div>
            <PagerBtn onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}><ChevronRight className="h-4 w-4" /></PagerBtn>
            <PagerBtn onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1}><ChevronsRight className="h-4 w-4" /></PagerBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function PagerBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-zinc-600 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RowActionMenu<T>({ actions, row }: { actions: RowAction<T>[]; row: T }) {
  if (!actions.length) return null;
  return (
    <Dropdown
      width="w-44"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Row actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          {actions.map((a) => (
            <MenuItem
              key={a.label}
              icon={a.icon}
              danger={a.danger}
              onClick={() => {
                a.onClick(row);
                close();
              }}
            >
              {a.label}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="mt-4 font-display text-base font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}

/* compact pager: first, around current, last with gaps */
function pageNumbers(current: number, count: number): number[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const pages = new Set<number>([0, count - 1, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < count).sort((a, b) => a - b);
  const out: number[] = [];
  let prev = -2;
  for (const p of sorted) {
    if (p - prev > 1) out.push(-1);
    out.push(p);
    prev = p;
  }
  return out;
}
