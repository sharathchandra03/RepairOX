import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import { resolveStaff, loadSessionWithBreaks, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/work-session/start — idempotent auto-start.

   1. SELECT the caller's existing open session → resume if found.
   2. Else INSERT a new session.
   3. On 23505 (a concurrent race hit the one-open-per-staff unique index) →
      re-SELECT the now-existing open session and resume.
   Server-stamps all timestamps (now()); the guard forces staff_id + org/branch.
   ────────────────────────────────────────────────────────────────────────── */

async function openSessionFor(admin: AdminLike, staffId: string) {
  const { data } = await admin
    .from("work_sessions")
    .select("*")
    .eq("staff_id", staffId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const staff = await resolveStaff(admin, guard.user.id);
  if (!staff) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  // 1. Resume an existing open session. Refresh last_seen_at = now() so a
  //    session that had gone stale (interrupted / "Needs Review") immediately
  //    reads as live again — otherwise deriveStatus would re-flag it
  //    interrupted on the very next render (the "resume for 1s then stop"
  //    glitch). Clearing an interrupted status keeps the row consistent.
  const existing = await openSessionFor(admin, staff.id);
  if (existing) {
    const { data: refreshed } = await admin
      .from("work_sessions")
      .update({ last_seen_at: new Date().toISOString(), status: "open" })
      .eq("id", existing.id)
      .is("ended_at", null)
      .select("*")
      .maybeSingle();
    const session = await loadSessionWithBreaks(admin, refreshed ?? existing);
    return NextResponse.json({ ok: true, session, resumed: true });
  }

  // 2. Insert a fresh open session. The guard re-stamps staff_id/org/branch.
  const { data: inserted, error } = await admin
    .from("work_sessions")
    .insert({
      staff_id: staff.id,
      organization_id: staff.organization_id,
      branch_id: staff.branch_id,
      status: "open",
      source: "web",
    })
    .select("*")
    .single();

  if (error) {
    // 3. Concurrent race → the open session already exists; resume it.
    if ((error as any).code === "23505") {
      const now = await openSessionFor(admin, staff.id);
      if (now) {
        const { data: refreshed } = await admin
          .from("work_sessions")
          .update({ last_seen_at: new Date().toISOString(), status: "open" })
          .eq("id", now.id)
          .is("ended_at", null)
          .select("*")
          .maybeSingle();
        const session = await loadSessionWithBreaks(admin, refreshed ?? now);
        return NextResponse.json({ ok: true, session, resumed: true });
      }
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const session = await loadSessionWithBreaks(admin, inserted);
  return NextResponse.json({ ok: true, session, resumed: false });
}
