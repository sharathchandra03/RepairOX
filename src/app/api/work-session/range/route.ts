import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import { resolveStaff, rowToRecord, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/work-session/range?from=ISO&to=ISO — the caller's OWN sessions
   (with breaks) overlapping the given range. Self-scoped via requireUser; feeds
   the My Productivity page, which runs the pure engine over the returned rows.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const staff = await resolveStaff(admin, guard.user.id);
  if (!staff) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const fromISO = searchParams.get("from");
  const toISO = searchParams.get("to");

  let q = admin.from("work_sessions").select("*").eq("staff_id", staff.id);
  // Overlap: started before `to`, and (open OR ended after `from`). We widen
  // the started_at lower bound to catch sessions that started before `from` but
  // ended within range.
  if (toISO) q = q.lte("started_at", toISO);
  const { data: rows, error } = await q.order("started_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const fromMs = fromISO ? new Date(fromISO).getTime() : -Infinity;
  const toMs = toISO ? new Date(toISO).getTime() : Infinity;
  const overlapping = (rows ?? []).filter((r: any) => {
    const start = new Date(r.started_at).getTime();
    const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
    return end >= fromMs && start <= toMs;
  });

  const sessionIds = overlapping.map((r: any) => r.id);
  const breaksById: Record<string, any[]> = {};
  if (sessionIds.length) {
    const { data: breakRows } = await admin
      .from("work_session_breaks")
      .select("id, session_id, started_at, ended_at")
      .in("session_id", sessionIds)
      .order("started_at", { ascending: true });
    for (const b of breakRows ?? []) (breaksById[b.session_id] ??= []).push(b);
  }

  const sessions = overlapping.map((r: any) => rowToRecord(r, breaksById[r.id] ?? []));
  return NextResponse.json({ ok: true, sessions });
}
