"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Sales Agent Productivity (owner / manager report).

   Analysis ONLY — the selected agent is an analytical subject; the caller's
   session / user / role / grants / store scope NEVER change (no impersonation,
   modeled on Agent Intelligence). Gated by CAP.workSession.viewTeam/viewAll.

   Data comes from POST /api/work-session/report (RAW, scope-constrained rows —
   no server math). The page captures ONE nowMs per render + the shared
   STALE_MS and feeds every row through the single pure engine for the summary
   cards, the daily table, AND the HR/payroll export — so export == on-screen.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { Clock, Users, FileSpreadsheet, FileText, RefreshCw, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DetailHero, SummaryCard } from "@/components/common/detail-page";
import { Reveal } from "@/components/common/reveal";
import {
  RoxTableCard,
  RoxTableHead,
  RoxHeadRow,
  RoxTableRow,
  RoxTableCell,
  RoxTableFooter,
  useRoxStickyHeader,
} from "@/components/ui/rox-table";
import { Pagination } from "@/components/ui/pagination";
import { StoreMultiSelect, matchesStoreSelection } from "@/components/common/store-multi-select";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { SegmentedTabs } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { useStoreSettings } from "@/lib/store-settings";
import { allow, CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { downloadXLSX, downloadCSV, toCSV } from "@/lib/csv-utils";
import {
  STALE_MS,
  type WorkSessionRecord,
  summarize,
  dailyBuckets,
  localDateKey,
  localDateStartMs,
  formatHm,
  toDecimalHours,
} from "@/lib/work-session";
import {
  type ReportAgent,
  buildAgentSummaries,
  buildAttendanceExportRows,
} from "@/lib/work-session-report";

const MS_DAY = 24 * 60 * 60 * 1000;

/* Period presets that drive the calendar range. "all" = all time (no date
   constraint); today/week/month/year snap the from/to to the corresponding
   local window; "custom" opens the shared calendar range picker. */
type PeriodKey = "all" | "today" | "week" | "month" | "year" | "custom";

const PERIOD_OPTIONS: { label: string; value: PeriodKey }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
  { label: "Custom", value: "custom" },
];

/** Compute the [from, to) ISO range (half-open, `to` exclusive end-of-day) for
 *  a period preset, in the org tz. "all" and "custom" return null — "all"
 *  clears the date constraint; "custom" keeps whatever the calendar holds. */
function periodRange(period: PeriodKey, nowMs: number, tz: string): { from: string; to: string } | null {
  if (period === "all" || period === "custom") return null;
  const todayKey = localDateKey(nowMs, tz);
  const todayStart = localDateStartMs(todayKey, tz);
  // `to` is exclusive: start of tomorrow (local).
  const to = new Date(localDateStartMs(localDateKey(todayStart + MS_DAY + MS_DAY / 2, tz), tz)).toISOString();

  if (period === "today") {
    return { from: new Date(todayStart).toISOString(), to };
  }
  if (period === "week") {
    // Monday-based local week start, matching the engine's week buckets.
    const [y, m, d] = todayKey.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = (dow + 6) % 7;
    const mondayKey = localDateKey(todayStart - mondayOffset * MS_DAY + MS_DAY / 2, tz);
    return { from: new Date(localDateStartMs(mondayKey, tz)).toISOString(), to };
  }
  if (period === "month") {
    const monthStartKey = `${todayKey.slice(0, 7)}-01`;
    return { from: new Date(localDateStartMs(monthStartKey, tz)).toISOString(), to };
  }
  // year
  const yearStartKey = `${todayKey.slice(0, 4)}-01-01`;
  return { from: new Date(localDateStartMs(yearStartKey, tz)).toISOString(), to };
}

interface ReportResponse {
  ok: boolean;
  agents: ReportAgent[];
  sessions: WorkSessionRecord[];
  storeNameById: Record<string, string>;
}

function startOfMonthISO(nowMs: number): string {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export default function AgentProductivityPage() {
  const { can, apiFetch } = usePermissions();
  const { settings } = useStoreSettings();
  const { stores } = useStoreContext();
  const tz = settings.timeZone || "Asia/Kolkata";

  const canView = allow(can, CAP.workSession.viewTeam);
  const canExport = allow(can, CAP.workSession.viewAll);

  const [nowMs] = useState(() => Date.now()); // ONE nowMs per report render
  const [agentFilter, setAgentFilter] = useState<string[]>([]); // [] = All Sales Agents; else specific staffIds
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [fromISO, setFromISO] = useState<string>(() => startOfMonthISO(Date.now()));
  const [toISO, setToISO] = useState<string>(() => new Date(Date.now() + MS_DAY).toISOString());
  // Custom-range calendar state ("YYYY-MM-DD", local). Only used when the
  // period preset is "custom"; the shared DateRangePicker opens on selection.
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  // Apply a period preset. today/week/month/year snap the calendar range;
  // "all" clears the date constraint (all-time); "custom" opens the calendar.
  const applyPeriod = (p: PeriodKey) => {
    setPeriod(p);
    const range = periodRange(p, nowMs, tz);
    if (range) {
      setFromISO(range.from);
      setToISO(range.to);
    } else if (p === "all") {
      // All-time: no date constraint (the API treats empty from/to as all).
      setFromISO("");
      setToISO("");
    } else if (p === "custom") {
      // Seed the API range from any custom range already chosen.
      setFromISO(customFrom ? `${customFrom}T00:00:00.000Z` : "");
      setToISO(customTo ? `${customTo}T23:59:59.999Z` : "");
    }
  };

  // Shared calendar edits (local "YYYY-MM-DD"). Editing the range forces the
  // "custom" preset and recomputes the API from/to.
  const onCustomFromChange = (v: string) => {
    setPeriod("custom");
    setCustomFrom(v);
    setFromISO(v ? `${v}T00:00:00.000Z` : "");
  };
  const onCustomToChange = (v: string) => {
    setPeriod("custom");
    setCustomTo(v);
    setToISO(v ? `${v}T23:59:59.999Z` : "");
  };
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ReportResponse | null>(null);
  const [detailAgent, setDetailAgent] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { theadTop } = useRoxStickyHeader();

  const load = useMemo(
    () => async () => {
      if (!canView) return;
      setLoading(true);
      try {
        const res = await apiFetch("/api/work-session/report", {
          method: "POST",
          body: JSON.stringify({
            agentIds: agentFilter, // [] = all authorized agents; else specific staffIds
            storeIds: storeFilter,
            from: fromISO || null, // null/empty = all-time (no lower bound)
            to: toISO || null,
          }),
        });
        if (res.ok && res.json?.ok) {
          setResp(res.json as ReportResponse);
        } else {
          toast.error(res.json?.error ?? "Could not load the report.");
        }
      } finally {
        setLoading(false);
      }
    },
    [canView, apiFetch, agentFilter, storeFilter, fromISO, toISO],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const agents = resp?.agents ?? [];
  const allSessions = resp?.sessions ?? [];

  // Apply the client store filter on top (the server already scoped by auth).
  const sessions = useMemo(
    () => allSessions.filter((s) => matchesStoreSelection(s.branchId ?? undefined, storeFilter)),
    [allSessions, storeFilter],
  );

  // The agent list the report is actually about (All, or the selected subset).
  const scopedAgents = useMemo(
    () => (agentFilter.length === 0 ? agents : agents.filter((a) => agentFilter.includes(a.staffId))),
    [agents, agentFilter],
  );

  // Owner summary (sum / avg / count) — the one engine pass.
  const summary = useMemo(() => summarize(sessions, nowMs, STALE_MS, tz), [sessions, nowMs, tz]);
  const avgNetPerWorkday = summary.workdays > 0 ? summary.totalNetMs / summary.workdays : 0;

  // ONE row per agent, aggregated over the WHOLE selected period (the same
  // engine pass the summary cards + export use). No day-by-day repetition — a
  // single Ullas row for the range, whether the range is one day or a year.
  // The per-day story lives behind "View Details".
  const agentRows = useMemo(() => {
    return buildAgentSummaries(scopedAgents, sessions, nowMs, STALE_MS, tz)
      // Keep only agents who actually worked in the selected period.
      .filter((r) => r.sessionCount > 0)
      .sort((a, b) => b.totalNetMs - a.totalNetMs || a.agent.name.localeCompare(b.agent.name));
  }, [scopedAgents, sessions, nowMs, tz]);

  useEffect(() => setPage(1), [agentFilter, storeFilter, fromISO, toISO]);

  const totalPages = Math.max(1, Math.ceil(agentRows.length / pageSize));
  const paged = agentRows.slice((page - 1) * pageSize, page * pageSize);

  const multiStore = stores.length > 1;
  const storeById = useMemo(() => {
    const m = new Map<string, (typeof stores)[number]>();
    for (const s of stores) m.set(s.id, s);
    return m;
  }, [stores]);
  const periodLabel =
    fromISO || toISO
      ? `${fromISO ? localDateKey(new Date(fromISO).getTime(), tz) : "Start"} → ${toISO ? localDateKey(new Date(toISO).getTime() - 1, tz) : "Today"}`
      : "All time";

  // Per-agent detail (View Details within the owner's own session).
  const detailRows = useMemo(() => {
    if (!detailAgent) return [];
    const agentSessions = sessions.filter((s) => s.staffId === detailAgent);
    return dailyBuckets(agentSessions, tz, nowMs, STALE_MS);
  }, [detailAgent, sessions, tz, nowMs]);

  /* ── Export (Excel primary + CSV) from ONE shared row-builder ── */
  function buildRows() {
    return buildAttendanceExportRows(scopedAgents, sessions, nowMs, STALE_MS, tz, periodLabel);
  }
  async function onExcel() {
    const { headers, rows } = buildRows();
    try {
      await downloadXLSX(`agent-productivity-${localDateKey(nowMs, tz)}.xlsx`, headers, rows, "Productivity");
    } catch {
      toast.error("Could not generate the Excel file. Please try again.");
    }
  }
  function onCsv() {
    const { headers, rows } = buildRows();
    downloadCSV(`agent-productivity-${localDateKey(nowMs, tz)}.csv`, toCSV(headers, rows));
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-foreground">Sales Agent Productivity</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to view the team productivity report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      {/* Hero + summary */}
      <DetailHero>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Leads / Performance / Agent Productivity
            </p>
            <h1 className="mt-1 text-xl font-bold text-foreground">Sales Agent Productivity</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Work sessions, breaks and net productive time by agent — attendance &amp; productivity
              data only (not official payroll). Analysis only; no impersonation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-muted"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </button>
            {canExport && (
              <Dropdown
                align="right"
                width="w-52"
                trigger={({ toggle, open }) => (
                  <button
                    onClick={toggle}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#4361EE] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3550d8]"
                  >
                    Export <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem icon={FileSpreadsheet} onClick={() => { void onExcel(); close(); }}>
                      Excel (.xlsx)
                    </MenuItem>
                    <MenuItem icon={FileText} onClick={() => { onCsv(); close(); }}>
                      CSV (.csv)
                    </MenuItem>
                  </>
                )}
              </Dropdown>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Net Hours (sum)" value={formatHm(summary.totalNetMs)} tone="text-emerald-600" />
          <SummaryCard label="Avg Net / Workday (avg)" value={formatHm(avgNetPerWorkday)} />
          <SummaryCard label="Sessions (count)" value={summary.sessionCount} />
          <SummaryCard label="Needs Review (count)" value={summary.interruptedCount} tone={summary.interruptedCount ? "text-rose-600" : undefined} />
        </div>
      </DetailHero>

      {/* Period strip — All / Today / Week / Month / Year / Custom. Clicking a
          preset snaps the range and recomputes every metric for that window.
          "All" clears the date constraint; "Custom" opens the shared calendar. */}
      <Reveal>
        <div className="flex max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs size="sm" options={PERIOD_OPTIONS} value={period} onChange={(v) => applyPeriod(v as PeriodKey)} />
        </div>
      </Reveal>

      {/* Filters — agent selector (left) + store (right) */}
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <Users className="h-4 w-4" /> Agent
            </span>
            <AgentMultiSelect agents={agents} value={agentFilter} onChange={setAgentFilter} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StoreMultiSelect value={storeFilter} onChange={setStoreFilter} />
          </div>
        </div>
      </Reveal>

      {/* Shared calendar range — opens when the "Custom" preset is selected. */}
      <DateRangePicker
        open={period === "custom"}
        from={customFrom}
        to={customTo}
        onFromChange={onCustomFromChange}
        onToChange={onCustomToChange}
      />

      {/* Daily comparison table */}
      <RoxTableCard>
        {/* All columns share an equal proportional width so spacing is uniform
            across the row (Store shown only in multi-store views). */}
        <colgroup>
          {multiStore && <col className="w-[11.11%]" />}
          <col className="w-[11.11%]" />
          <col className="w-[11.11%]" />
          <col className="w-[11.11%]" />
          <col className="w-[11.11%]" />
          <col className="w-[11.11%]" />
          <col className="w-[11.11%]" />
          <col className="w-[11.11%]" />
          <col className="w-[11.11%]" />
        </colgroup>
        <RoxTableHead top={theadTop}>
          <RoxHeadRow>
            {multiStore && <th className="px-3 py-4 text-[#4361EE]">Store</th>}
            <th className="px-3 py-4 text-[#4361EE]">Agent</th>
            <th className="px-3 py-4 text-right text-[#4361EE]">Workdays</th>
            <th className="px-3 py-4 text-right text-[#4361EE]">Session</th>
            <th className="px-3 py-4 text-right text-[#4361EE]">Break</th>
            <th className="px-3 py-4 text-right text-[#4361EE]">Net</th>
            <th className="px-3 py-4 text-right text-[#4361EE]">Sessions</th>
            <th className="px-3 py-4 text-right text-[#4361EE]">Review</th>
            <th className="px-3 py-4 text-right text-[#4361EE]">Details</th>
          </RoxHeadRow>
        </RoxTableHead>
        <tbody>
          {paged.length === 0 ? (
            <tr>
              <RoxTableCell className="px-3 py-10 text-center text-[13px] text-muted-foreground" colSpan={multiStore ? 9 : 8}>
                {loading ? "Loading…" : "No work sessions for this filter."}
              </RoxTableCell>
            </tr>
          ) : (
            paged.map((r) => (
              <RoxTableRow key={r.agent.staffId}>
                {multiStore && (
                  <RoxTableCell className="px-3 py-4">
                    <StoreContextCell store={r.agent.branchId ? storeById.get(r.agent.branchId) ?? null : null} />
                  </RoxTableCell>
                )}
                <RoxTableCell className="px-3 py-4 font-semibold text-foreground">{r.agent.name}</RoxTableCell>
                <RoxTableCell className="px-3 py-4 text-right tabular-nums">{r.workdays}</RoxTableCell>
                <RoxTableCell className="px-3 py-4 text-right tabular-nums">{formatHm(r.totalElapsedMs)}</RoxTableCell>
                <RoxTableCell className="px-3 py-4 text-right tabular-nums">{formatHm(r.totalBreakMs)}</RoxTableCell>
                <RoxTableCell className="px-3 py-4 text-right font-semibold text-emerald-600 tabular-nums">{formatHm(r.totalNetMs)}</RoxTableCell>
                <RoxTableCell className="px-3 py-4 text-right tabular-nums">{r.sessionCount}</RoxTableCell>
                <RoxTableCell className={cn("px-3 py-4 text-right tabular-nums", r.interruptedCount && "font-semibold text-rose-600")}>
                  {r.interruptedCount}
                </RoxTableCell>
                <RoxTableCell className="px-3 py-4 text-right">
                  <button
                    onClick={() => setDetailAgent(r.agent.staffId)}
                    className="text-[11px] font-medium text-[#4361EE] hover:underline"
                  >
                    View Details
                  </button>
                </RoxTableCell>
              </RoxTableRow>
            ))
          )}
        </tbody>
        <RoxTableFooter>
          <span className="text-[11px] text-muted-foreground">{agentRows.length} agents</span>
        </RoxTableFooter>
      </RoxTableCard>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={agentRows.length}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        itemLabel="agent"
      />

      {/* Per-agent detail (within the owner's own session — no identity change). */}
      {detailAgent && (
        <Reveal>
          <div className="rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-card sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
                <Clock className="h-4 w-4 text-[#4361EE]" />
                {agents.find((a) => a.staffId === detailAgent)?.name ?? "Agent"} — Daily Breakdown
              </h2>
              <button onClick={() => setDetailAgent(null)} className="text-[12px] font-medium text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
            {detailRows.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted-foreground">No sessions in range.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/60">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Session</th>
                      <th className="px-3 py-2 text-right">Break</th>
                      <th className="px-3 py-2 text-right">Net (Hh Mm)</th>
                      <th className="px-3 py-2 text-right">Net (hrs)</th>
                      <th className="px-3 py-2 text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{d.date}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatHm(d.elapsedMs)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatHm(d.breakMs)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600 tabular-nums">{formatHm(d.netMs)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{toDecimalHours(d.netMs)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", d.interruptedCount && "font-semibold text-rose-600")}>{d.interruptedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Reveal>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   AgentMultiSelect — checkbox multi-select for the agent filter.

   Mirrors StoreMultiSelect's look + behaviour exactly (shared Dropdown +
   Checkbox, brand-blue styling, portalled panel). Value is string[] of staff
   ids; an EMPTY array means "All Sales Agents" (the full authorized set).
   Ticking every agent normalises back to All.
   ────────────────────────────────────────────────────────────────────────── */
function AgentMultiSelect({
  agents,
  value,
  onChange,
}: {
  agents: ReportAgent[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const allSelected = value.length === 0;
  const total = agents.length;

  const summary = (() => {
    if (allSelected || value.length === total) return "All Sales Agents";
    if (value.length === 1) {
      const a = agents.find((x) => x.staffId === value[0]);
      return a?.name ?? "1 Agent";
    }
    const first = agents.find((x) => x.staffId === value[0]);
    if (first && first.name.length <= 12) return `${first.name} + ${value.length - 1} more`;
    return `${value.length} Agents`;
  })();

  const toggleAgent = (id: string) => {
    const set = new Set(allSelected ? [] : value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = Array.from(set);
    if (next.length === 0 || next.length === total) onChange([]);
    else onChange(next);
  };

  const selectAll = () => onChange([]);

  return (
    <Dropdown
      align="left"
      width="w-60"
      className="block shrink-0 min-w-[190px]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-[34px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all duration-150",
            open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-input hover:border-[#4361EE]/40",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate text-left">
            <Users className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
            <span className={cn("truncate", allSelected && "text-muted-foreground")}>{summary}</span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col">
          {total === 0 ? (
            <p className="px-2.5 py-6 text-center text-[12px] text-muted-foreground">
              No sales agents available.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={selectAll}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  allSelected ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60",
                )}
              >
                <Checkbox checked={allSelected} onChange={selectAll} aria-label="All Sales Agents" />
                <span className="truncate">All Sales Agents</span>
              </button>

              <div className="my-1 h-px bg-border" />

              <div className="max-h-[240px] overflow-y-auto overscroll-contain">
                {agents.map((a) => {
                  const checked = !allSelected && value.includes(a.staffId);
                  return (
                    <button
                      key={a.staffId}
                      type="button"
                      onClick={() => toggleAgent(a.staffId)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                        checked ? "bg-[#EEF1FD]/70 font-medium text-foreground" : "hover:bg-[#EEF1FD]/60",
                      )}
                    >
                      <Checkbox checked={checked} onChange={() => toggleAgent(a.staffId)} aria-label={a.name} />
                      <span className="truncate">{a.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Dropdown>
  );
}
