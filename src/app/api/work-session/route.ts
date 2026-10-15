import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import {
  resolveStaff,
  loadSessionWithBreaks,
  todayRangeFor,
  type AdminLike,
} from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/work-session — the caller's current OPEN session (if any) +
   today's sessions (self scope). All self-scoped via requireUser; the guard
   trigger + RLS re-enforce ownership.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const staff = await resolveStaff(admin, guard.user.id);
  if (!staff) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  // Open session (if any).
  const { data: openRow } = await admin
    .from("work_sessions")
    .select("*")
    .eq("staff_id", staff.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const openSession = openRow ? await loadSessionWithBreaks(admin, openRow) : null;

  // Today's sessions (self scope) — bounded to a wide window around today in
  // UTC; the client's engine attributes to local dates.
  const { from, to } = todayRangeFor();
  const { data: todayRows } = await admin
    .from("work_sessions")
    .select("*")
    .eq("staff_id", staff.id)
    .gte("started_at", from)
    .lte("started_at", to)
    .order("started_at", { ascending: true });

  const todaySessions = await Promise.all((todayRows ?? []).map((r: any) => loadSessionWithBreaks(admin, r)));

  return NextResponse.json({ ok: true, openSession, todaySessions });
}
