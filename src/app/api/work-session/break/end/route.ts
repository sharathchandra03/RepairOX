import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import { resolveStaff, loadSessionWithBreaks, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/work-session/break/end — close the caller's active break at now().
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

  if (!open) {
    return NextResponse.json({ ok: false, error: "work_break_not_active" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("work_session_breaks")
    .update({ ended_at: new Date().toISOString() })
    .eq("session_id", open.id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!updated) return NextResponse.json({ ok: false, error: "work_break_not_active" }, { status: 400 });

  const { data: row } = await admin.from("work_sessions").select("*").eq("id", open.id).maybeSingle();
  const session = row ? await loadSessionWithBreaks(admin, row) : null;
  return NextResponse.json({ ok: true, session });
}
