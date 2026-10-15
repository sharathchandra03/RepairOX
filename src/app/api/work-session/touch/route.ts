import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import { resolveStaff, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/work-session/touch — the liveness heartbeat keeping last_seen_at
   fresh for interrupted detection.

   Runs exactly:
     update public.work_sessions set last_seen_at = now()
      where staff_id = <caller> and ended_at is null;

   The `ended_at is null` predicate makes this a GUARANTEED NO-OP on a
   completed/absent session → it never trips the work_session_locked guard, and
   returns 200 / { session: null } when there is no open session. Client-
   debounced to one call per HEARTBEAT_MS (~60s). The realtime subscription MUST
   suppress the resulting last_seen_at/updated_at-only change (no refetch).
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const staff = await resolveStaff(admin, guard.user.id);
  if (!staff) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  const { data } = await admin
    .from("work_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("staff_id", staff.id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();

  return NextResponse.json({ ok: true, session: data ?? null });
}
