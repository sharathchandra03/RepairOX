"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Eye } from "lucide-react";
import {
  RoxTableCard, RoxTableHead, RoxHeadRow, RoxTableRow, RoxTableCell, useRoxStickyHeader,
} from "@/components/ui/rox-table";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatINR } from "@/lib/utils";
import { sortRoster, type AgentRosterRow, type RosterSortKey } from "@/lib/lead-sales-book";
import type { SalesAgent } from "@/lib/sales-agents";

/* Agent roster / workload table (owner). Replaces the ranking cards with a
   reconciled, sortable table. The active sort column is always visible — no
   hidden composite score. */

const COLS: { key: RosterSortKey | "agent" | "actions"; label: string; sortable: boolean; align?: "right"; hint?: string }[] = [
  { key: "agent", label: "Agent", sortable: false },
  { key: "activeLeads", label: "Active", sortable: true, align: "right", hint: "Open leads (not won/lost)" },
  { key: "qualified", label: "Qualified", sortable: true, align: "right" },
  { key: "won", label: "Won", sortable: true, align: "right" },
  { key: "revenueNet", label: "Net Revenue", sortable: true, align: "right", hint: "Finalized invoices − succeeded refunds" },
  { key: "tickets", label: "Tickets", sortable: true, align: "right" },
  { key: "invoices", label: "Invoices", sortable: true, align: "right" },
  { key: "overdueFollowUps", label: "Overdue", sortable: true, align: "right" },
  { key: "noNextAction", label: "No action", sortable: true, align: "right", hint: "Open leads with no scheduled follow-up" },
  { key: "stalled", label: "Stalled", sortable: true, align: "right" },
  { key: "actions", label: "", sortable: false },
];

export function AgentRoster({
  rows,
  agents,
  buildAnalysisHref,
  onSelectAgent,
  selectedAgentIds,
}: {
  rows: AgentRosterRow[];
  agents: SalesAgent[];
  buildAnalysisHref: (agentId: string) => string;
  /** Toggle an agent in/out of the owner's multi-select scope. */
  onSelectAgent: (agentId: string) => void;
  /** Agents currently in scope. EMPTY = whole team (nothing highlighted). */
  selectedAgentIds: string[];
}) {
  const { wrapRef, theadTop } = useRoxStickyHeader();
  const [sortKey, setSortKey] = useState<RosterSortKey>("revenueNet");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const selectedSet = new Set(selectedAgentIds);

  const sorted = sortRoster(rows, sortKey, dir);

  const toggleSort = (key: RosterSortKey) => {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setDir("desc"); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Agent Roster</h2>
          <p className="text-[11px] text-muted-foreground">Sorted by <span className="font-semibold text-foreground">{COLS.find((c) => c.key === sortKey)?.label}</span> ({dir}). Every column reconciles to real lead records — no composite score.</p>
        </div>
      </div>
      <div ref={wrapRef} />
      <RoxTableCard>
        <colgroup>
          <col style={{ width: "22%" }} />
          {COLS.slice(1, -1).map((c) => <col key={c.key} style={{ width: c.key === "revenueNet" ? 130 : 92 }} />)}
          <col style={{ width: 150 }} />
        </colgroup>
        <RoxTableHead top={theadTop}>
          <RoxHeadRow>
            {COLS.map((c) => (
              <th key={c.key} className={cn("rox-table-cell", c.align === "right" && "text-right")} title={c.hint}>
                {c.sortable ? (
                  <button type="button" onClick={() => toggleSort(c.key as RosterSortKey)} className={cn("inline-flex items-center gap-1 transition hover:text-white/80", c.align === "right" && "flex-row-reverse")}>
                    {c.label}
                    {sortKey === c.key && (dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                  </button>
                ) : c.label}
              </th>
            ))}
          </RoxHeadRow>
        </RoxTableHead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={COLS.length} className="px-5 py-14 text-center text-[13px] text-muted-foreground">No authorized Sales Agents match the selected filters.</td></tr>
          ) : (
            sorted.map((r, i) => {
              const agent = agentById.get(r.agentId);
              const selected = selectedSet.has(r.agentId);
              return (
                <RoxTableRow key={r.agentId} selected={selected} onClick={() => onSelectAgent(r.agentId)} className="cursor-pointer">
                  <RoxTableCell>
                    <span className="flex items-center gap-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      <Avatar name={agent?.name || r.agentId} src={agent?.avatarUrl} size={30} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-foreground">{agent?.name || r.agentId}</span>
                        <span className="block truncate text-[10.5px] text-muted-foreground">{agent?.roleLabel || "Sales Agent"} · {r.totalLeads} total</span>
                      </span>
                    </span>
                  </RoxTableCell>
                  <Num>{r.activeLeads}</Num>
                  <Num>{r.qualified}</Num>
                  <Num>{r.won}</Num>
                  <RoxTableCell className="text-right tabular-nums text-[13px] font-bold text-emerald-700">{formatINR(r.revenueNet)}</RoxTableCell>
                  <Num>{r.tickets}</Num>
                  <Num>{r.invoices}</Num>
                  <Num tone={r.overdueFollowUps ? "text-[#B42318] font-semibold" : undefined}>{r.overdueFollowUps}</Num>
                  <Num tone={r.noNextAction ? "text-amber-700" : undefined}>{r.noNextAction}</Num>
                  <Num tone={r.stalled ? "text-amber-700" : undefined}>{r.stalled}</Num>
                  <RoxTableCell>
                    <span className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Link href={buildAnalysisHref(r.agentId)} className="inline-flex items-center gap-1 rounded-lg border border-[#B3BFF6] bg-[#EEF1FD]/55 px-2 py-1 text-[11px] font-semibold text-[#3A4DBB] transition hover:bg-[#EEF1FD]" title="Evidence-based analysis">
                        Analysis <ArrowRight className="h-3 w-3" />
                      </Link>
                      <Link href={`/leads/list?viewAs=${encodeURIComponent(r.agentId)}`} className="inline-flex items-center rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-zinc-600 transition hover:bg-muted" title="Read-only workspace">
                        <Eye className="h-3 w-3" />
                      </Link>
                    </span>
                  </RoxTableCell>
                </RoxTableRow>
              );
            })
          )}
        </tbody>
      </RoxTableCard>
    </div>
  );
}

function Num({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <RoxTableCell className={cn("text-right tabular-nums text-[13px] font-semibold text-foreground", tone)}>{children}</RoxTableCell>;
}
