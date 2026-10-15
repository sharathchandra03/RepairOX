import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { resolveStaff, loadSessionWithBreaks, type AdminLike } from "@/lib/work-session-server";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/work-session/correct — append-only correction of a completed /
   interrupted session. Gated by CAP.workSession.correct keys.

   Captures the current session + breaks into a work_session_events.previous
   snapshot, applies the new values, logs a `correction` event with a MANDATORY
   reason + actor_staff_id. Original values are never destroyed.

   Body: { sessionId, reason, startedAt?, endedAt?, status? }
   ────────────────────────────────────────────────────────────────────────── */

const CORRECT_KEYS = ["work_sessions_correct", "manage_attendance"];

export async function POST(req: Request) {
  const guard = await requirePermission(req, CORRECT_KEYS);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!sessionId) return NextResponse.json({ ok: false, error: "Missing session id." }, { status: 400 });
  if (!reason) return NextResponse.json({ ok: false, error: "A reason is required." }, { status: 400 });

  const actor = await resolveStaff(admin, guard.user.id);
  if (!actor) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  const { data: current } = await admin
    .from("work_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!current) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });

  const { data: curBreaks } = await admin
    .from("work_session_breaks")
    .select("id, started_at, ended_at")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: true });

  // Snapshot the original values (never destroyed).
  const previous = {
    started_at: current.started_at,
    ended_at: current.ended_at,
    status: current.status,
    end_reason: current.end_reason,
    breaks: (curBreaks ?? []).map((b: any) => ({ started_at: b.started_at, ended_at: b.ended_at })),
  };

  const patch: Record<string, unknown> = { end_reason: "correction" };
  if (typeof body.startedAt === "string") patch.started_at = body.startedAt;
  if (typeof body.endedAt === "string") patch.ended_at = body.endedAt;
  if (typeof body.status === "string") patch.status = body.status;

  const { data: updated, error } = await admin
    .from("work_sessions")
    .update(patch)
    .eq("id", sessionId)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!updated) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });

  // Log the append-only correction event with the mandatory reason + snapshot.
  await admin.from("work_session_events").insert({
    organization_id: current.organization_id,
    // Denormalized from the parent session so the correction event is
    // store-scoped for RLS, matching the trigger-stamped events.
    branch_id: current.branch_id,
    session_id: sessionId,
    staff_id: current.staff_id,
    kind: "correction",
    actor_staff_id: actor.id,
    reason,
    previous,
  });

  const session = await loadSessionWithBreaks(admin, updated);
  return NextResponse.json({ ok: true, session });
}
