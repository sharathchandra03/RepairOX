import "server-only";
import type { WorkSessionRecord, BreakInterval } from "@/lib/work-session";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Work Session SERVER helpers (shared by the self + owner routes).

   DB-row ↔ engine-record mapping, caller-staff resolution and range helpers.
   All timestamps are server-authoritative (now()); the DB-row shape maps to
   the pure engine's WorkSessionRecord so the client runs the one engine.
   ────────────────────────────────────────────────────────────────────────── */

// A minimal structural type for the service-role Supabase client. We only use
// the chainable query builder, so `any` here keeps us decoupled from the exact
// generated types while staying confined to server code.
export type AdminLike = any;

export interface StaffRow {
  id: string;
  organization_id: string | null;
  branch_id: string | null;
}

export async function resolveStaff(admin: AdminLike, authUserId: string): Promise<StaffRow | null> {
  const { data } = await admin
    .from("staff")
    .select("id, organization_id, branch_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return (data as StaffRow | null) ?? null;
}

/** Map a work_sessions DB row + its break rows into the engine record. */
export function rowToRecord(row: any, breakRows: any[]): WorkSessionRecord {
  const breaks: BreakInterval[] = (breakRows ?? [])
    .slice()
    .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
    .map((b) => ({
      startedAt: b.started_at,
      endedAt: b.ended_at ?? null,
    }));
  return {
    id: row.id,
    staffId: row.staff_id,
    branchId: row.branch_id ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    status: row.status,
    breaks,
    lastSeenAt: row.last_seen_at,
  };
}

/** Load a single session row's breaks and return the engine record. */
export async function loadSessionWithBreaks(admin: AdminLike, row: any): Promise<WorkSessionRecord> {
  const { data: breaks } = await admin
    .from("work_session_breaks")
    .select("id, started_at, ended_at")
    .eq("session_id", row.id)
    .order("started_at", { ascending: true });
  return rowToRecord(row, breaks ?? []);
}

/** A wide UTC window around "today" so the client can attribute to local
 *  dates in any timezone (±1 day covers all IANA offsets). */
export function todayRangeFor(nowMs = Date.now()): { from: string; to: string } {
  const from = new Date(nowMs - 36 * 60 * 60 * 1000).toISOString();
  const to = new Date(nowMs + 12 * 60 * 60 * 1000).toISOString();
  return { from, to };
}
