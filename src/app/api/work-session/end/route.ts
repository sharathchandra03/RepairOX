import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import { resolveStaff, loadSessionWithBreaks, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/work-session/end — close the open session (called BEFORE auth
   logout). In one logical step: close any active break at now(), then set the
   session ended_at=now(), status='completed', end_reason='logout'.
   Idempotent-ish: no open session → returns ok with session:null.
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const staff = await resolveStaff(admin, guard.user.id);
  if (!staff) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  const { data: open } = await admin
    .from("work_sessions")
    .select("id")
    .eq("staff_id", staff.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) return NextResponse.json({ ok: true, session: null });

  const now = new Date().toISOString();

  // Close any active break at the same timestamp.
  await admin
    .from("work_session_breaks")
    .update({ ended_at: now })
    .eq("session_id", open.id)
    .is("ended_at", null);

  const { data: closed, error } = await admin
    .from("work_sessions")
    .update({ ended_at: now, status: "completed", end_reason: "logout" })
    .eq("id", open.id)
    .is("ended_at", null)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!closed) return NextResponse.json({ ok: true, session: null });

  const session = await loadSessionWithBreaks(admin, closed);
  return NextResponse.json({ ok: true, session });
}
