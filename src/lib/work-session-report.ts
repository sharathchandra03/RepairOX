/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Work Session owner-report + HR/payroll export row-builder.

   ONE shared row-builder for the owner "Sales Agent Productivity" report AND
   the HR/payroll export. It consumes the SAME pure-engine summary over the SAME
   raw rows with the SAME nowMs / staleMs the on-screen report used — so the
   exported counts/totals are provably identical to the on-screen values
   (export == on-screen by construction).

   NOTE: work-session / export data is attendance & productivity data only — it
   is NOT official leave/payroll data by itself.
   ────────────────────────────────────────────────────────────────────────── */

import {
  type WorkSessionRecord,
  summarize,
  formatHm,
  toDecimalHours,
} from "@/lib/work-session";

export interface ReportAgent {
  staffId: string;
  name: string;
  avatarUrl?: string | null;
  branchId: string | null;
  storeName?: string | null;
}

export interface AgentSummaryRow {
  agent: ReportAgent;
  totalElapsedMs: number;
  totalBreakMs: number;
  totalNetMs: number;
  workdays: number;
  sessionCount: number;
  completedCount: number;
  interruptedCount: number;
}

/** Group raw session rows by staff id. */
export function groupByAgent(sessions: WorkSessionRecord[]): Map<string, WorkSessionRecord[]> {
  const map = new Map<string, WorkSessionRecord[]>();
  for (const s of sessions) {
    const arr = map.get(s.staffId) ?? [];
    arr.push(s);
    map.set(s.staffId, arr);
  }
  return map;
}

/** Per-agent summary rows — the SAME derivation the on-screen cards + table
 *  use (one engine pass, one nowMs/staleMs). */
export function buildAgentSummaries(
  agents: ReportAgent[],
  sessions: WorkSessionRecord[],
  nowMs: number,
  staleMs: number,
  tz: string,
): AgentSummaryRow[] {
  const byAgent = groupByAgent(sessions);
  return agents
    .map((agent) => {
      const agentSessions = byAgent.get(agent.staffId) ?? [];
      const sum = summarize(agentSessions, nowMs, staleMs, tz);
      return {
        agent,
        totalElapsedMs: sum.totalElapsedMs,
        totalBreakMs: sum.totalBreakMs,
        totalNetMs: sum.totalNetMs,
        workdays: sum.workdays,
        sessionCount: sum.sessionCount,
        completedCount: sum.completedCount,
        interruptedCount: sum.interruptedCount,
      };
    });
  // Returns one summary per agent (including zero-session agents); callers
  // decide whether to filter (the export keeps only agents with sessions).
}

/** HR/payroll export rows — one row per Sales Agent for the selected period.
 *  Consumes buildAgentSummaries (the same engine pass). Returns { headers, rows }
 *  for both downloadXLSX (Excel) and toCSV/downloadCSV (CSV). */
export function buildAttendanceExportRows(
  agents: ReportAgent[],
  sessions: WorkSessionRecord[],
  nowMs: number,
  staleMs: number,
  tz: string,
  periodLabel: string,
): { headers: string[]; rows: (string | number)[][] } {
  const summaries = buildAgentSummaries(agents, sessions, nowMs, staleMs, tz)
    // Export is one row per agent WITH sessions in the period (payroll relevance).
    .filter((r) => r.sessionCount > 0);

  const headers = [
    "Sales Agent",
    "Staff ID",
    "Store",
    "Period",
    "Workdays with Sessions",
    "Total Session (Hh Mm)",
    "Total Break (Hh Mm)",
    "Net Productive (Hh Mm)",
    "Net Productive (hours)",
    "Completed Sessions",
    "Needs Review / Interrupted",
  ];

  const rows: (string | number)[][] = summaries.map((r) => [
    r.agent.name,
    r.agent.staffId,
    r.agent.storeName ?? (r.agent.branchId ? "" : "Org-wide"),
    periodLabel,
    r.workdays,
    formatHm(r.totalElapsedMs),
    formatHm(r.totalBreakMs),
    formatHm(r.totalNetMs),
    toDecimalHours(r.totalNetMs),
    r.completedCount,
    r.interruptedCount,
  ]);

  return { headers, rows };
}
