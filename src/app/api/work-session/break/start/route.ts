import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import { resolveStaff, loadSessionWithBreaks, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/work-session/break/start — start a break for the caller's open
   session. Relies on the guard (parent must be the caller's + open) and the
   one-open-break-per-session partial unique index. PG error codes map to
   friendly client errors.
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
    return NextResponse.json(
      { ok: false, error: "work_break_no_open_session" },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("work_session_breaks")
    .insert({ session_id: open.id, staff_id: staff.id, organization_id: staff.organization_id });

  if (error) {
    const code = (error as any).code;
    if (code === "23505") return NextResponse.json({ ok: false, error: "work_break_already_open" }, { status: 400 });
    if (code === "23514") return NextResponse.json({ ok: false, error: "work_break_no_open_session" }, { status: 400 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const { data: row } = await admin
    .from("work_sessions")
    .select("*")
    .eq("id", open.id)
    .maybeSingle();
  const session = row ? await loadSessionWithBreaks(admin, row) : null;
  return NextResponse.json({ ok: true, session });
}
