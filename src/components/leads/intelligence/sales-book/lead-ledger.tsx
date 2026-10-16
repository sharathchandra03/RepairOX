"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Lock, Search } from "lucide-react";
import {
  RoxTableCard, RoxTableHead, RoxHeadRow, RoxTableRow, RoxTableCell, RoxTableFooter, useRoxStickyHeader,
} from "@/components/ui/rox-table";
import { Pagination } from "@/components/ui/pagination";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatINR } from "@/lib/utils";
import {
  LEDGER_VIEWS, LEAD_STAGE_LABEL, LEAD_MODE_LABEL,
  type LeadLedgerRow, type LeadLedgerRow as Row, type LedgerViewKey, type LeadStage,
} from "@/lib/lead-sales-book";
import type { StoreBranch } from "@/lib/store-context";

const STAGE_TONE: Record<LeadStage, string> = {
  new: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  qualified: "bg-violet-50 text-violet-700 ring-violet-200",
  won: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  lost: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};
const FU_TONE: Record<Row["followUpState"], string> = {
  none: "text-zinc-400",
  Pending: "text-amber-700",
  Due: "text-[#C0392B]",
  Overdue: "text-[#B42318] font-semibold",
};

export function LeadLedger({
  rows,
  view,
  onViewChange,
  multiStore,
  getStore,
  onOpenLead,
}: {
  /** The full agent/team-scoped ledger (views filter it). */
  rows: LeadLedgerRow[];
  view: LedgerViewKey;
  onViewChange: (v: LedgerViewKey) => void;
  multiStore: boolean;
  getStore: (id: string) => Pick<StoreBranch, "id" | "name" | "code"> | null | undefined;
  onOpenLead: (leadId: string) => void;
}) {
  const { wrapRef, theadTop } = useRoxStickyHeader();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const activeView = LEDGER_VIEWS.find((v) => v.key === view) ?? LEDGER_VIEWS[0];

  const filtered = useMemo(() => {
    const base = rows.filter(activeView.predicate);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      r.name.toLowerCase().includes(q)
      || r.leadNo.toLowerCase().includes(q)
      || (r.agentName || "").toLowerCase().includes(q)
      || (r.source || "").toLowerCase().includes(q)
      || (r.region || "").toLowerCase().includes(q)
      || (r.ticketNo || "").toLowerCase().includes(q)
      || (r.invoiceNo || "").toLowerCase().includes(q),
    );
  }, [rows, activeView, query]);

  // Reset to page 1 whenever the dataset changes.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-5">
      <div ref={wrapRef} className="sticky z-[6] flex flex-col gap-3 rounded-t-xl bg-[var(--background)] pb-1 xl:flex-row xl:items-center xl:justify-between" style={{ top: 60 }}>
        <div className="min-w-0 max-w-full overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex w-max gap-1 rounded-xl border border-border bg-muted p-1">
            {LEDGER_VIEWS.map((v) => {
              const count = rows.filter(v.predicate).length;
              const active = v.key === view;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => { onViewChange(v.key); resetPage(); }}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold transition",
                    active ? "bg-[#4361EE] text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label} <span className={cn("tabular-nums", active ? "text-white/80" : "text-muted-foreground/70")}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="relative shrink-0 sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); resetPage(); }}
            placeholder="Search lead, customer, agent, ticket…"
            className="h-[34px] w-full rounded-xl border border-[#4361EE]/30 bg-card pl-9 pr-3 text-[13px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
          />
        </div>
      </div>

      <RoxTableCard>
        {/* Proportional widths that sum to 100% so every column is evenly spaced
            and the row fills the table with no trailing dead-space. The %s are
            re-normalised by the browser when the Store column is present. */}
        <colgroup>
          {multiStore && <col style={{ width: "10%" }} />}
          <col style={{ width: "10%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: 52 }} />
        </colgroup>
        <RoxTableHead top={theadTop}>
          <RoxHeadRow>
            {multiStore && <th className="rox-table-cell">Store</th>}
            <th className="rox-table-cell">Lead</th>
            <th className="rox-table-cell">Customer</th>
            <th className="rox-table-cell">Agent</th>
            <th className="rox-table-cell">Stage</th>
            <th className="rox-table-cell">Mode</th>
            <th className="rox-table-cell">Source</th>
            <th className="rox-table-cell text-right">Value</th>
            <th className="rox-table-cell whitespace-nowrap text-right">Revenue (Net)</th>
            <th className="rox-table-cell text-center">Next Follow-up</th>
            <th className="rox-table-cell" />
          </RoxHeadRow>
        </RoxTableHead>
        <tbody>
          {paged.length === 0 ? (
            <tr>
              <td colSpan={multiStore ? 11 : 10} className="px-5 py-16 text-center text-[13px] text-muted-foreground">
                {rows.length === 0
                  ? "No leads in this scope for the selected period and filters."
                  : "No leads match this view and search."}
              </td>
            </tr>
          ) : (
            paged.map((r) => (
              <RoxTableRow
                key={r.leadId}
                onClick={() => onOpenLead(r.leadId)}
                className="cursor-pointer"
                tint={r.followUpState === "Overdue" ? "bg-rose-50/40 hover:bg-rose-50/70" : undefined}
              >
                {multiStore && <RoxTableCell><StoreContextCell store={getStore(r.branchId)} /></RoxTableCell>}
                <RoxTableCell>
                  <span className="block text-[13px] font-bold text-[#4361EE]">{r.leadNo}</span>
                  <span className="block text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                </RoxTableCell>
                <RoxTableCell>
                  <span className="block truncate text-[13px] font-semibold text-foreground">{r.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.actionLabel}</span>
                </RoxTableCell>
                <RoxTableCell>
                  <span className="flex items-center gap-1.5">
                    <Avatar name={r.agentName || "—"} size={22} />
                    <span className="truncate text-[12px] text-foreground">{r.agentName || "Unassigned"}</span>
                  </span>
                </RoxTableCell>
                <RoxTableCell>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STAGE_TONE[r.stage])}>
                    {LEAD_STAGE_LABEL[r.stage]}
                  </span>
                </RoxTableCell>
                <RoxTableCell><span className="block truncate text-[12px] text-foreground">{LEAD_MODE_LABEL[r.mode]}</span></RoxTableCell>
                <RoxTableCell><span className="block truncate text-[12px] text-foreground">{r.source || "—"}</span></RoxTableCell>
                <RoxTableCell className="whitespace-nowrap text-right tabular-nums text-[12.5px] text-foreground">{formatINR(r.expectedValue)}</RoxTableCell>
                <RoxTableCell className="whitespace-nowrap text-right tabular-nums text-[12.5px] font-semibold text-emerald-700">
                  {r.revenueGross > 0 ? formatINR(r.revenueNet) : <span className="text-zinc-400">—</span>}
                </RoxTableCell>
                <RoxTableCell className="text-center">
                  {r.nextFollowUpAt ? (
                    <span className="block">
                      <span className="block text-[12px] text-foreground">{new Date(r.nextFollowUpAt).toLocaleDateString()}</span>
                      {(r.followUpState === "Overdue" || r.followUpState === "Due") && (
                        <span className={cn("block text-[10.5px] font-semibold", FU_TONE[r.followUpState])}>
                          {r.followUpState === "Overdue" ? "Overdue" : "Due today"}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[12px] text-zinc-400">None</span>
                  )}
                </RoxTableCell>
                <RoxTableCell><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></RoxTableCell>
              </RoxTableRow>
            ))
          )}
        </tbody>
      </RoxTableCard>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filtered.length}
        itemLabel="lead"
        pageSize={pageSize}
        onPageSizeChange={(s) => { setPageSize(s); resetPage(); }}
      />
    </div>
  );
}
