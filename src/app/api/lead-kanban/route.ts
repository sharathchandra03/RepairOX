import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET  /api/lead-kanban  — Load the signed-in user's PERSONAL Kanban state.
   POST /api/lead-kanban  — Save the signed-in user's PERSONAL Kanban state.
       Body: { state: KanbanState }

   The Lead Kanban (boards → columns → ordered card placements + personal note
   colors) is a PERSONAL per-user resource. It needs authentication only — NOT
   a permission key — so this route simply verifies the session and scopes
   every query to the authenticated user (auth.user.id). Storage is the
   `lead_kanban_boards` table (one JSONB `state` blob per user, migration 0062).

   Mirrors app/src/app/api/dashboard-preferences/route.ts (service-role client,
   token verification, per-user scoping). Falls back gracefully — the client
   layer uses localStorage when Supabase is not configured, so this route is
   only hit in Supabase mode.
   ────────────────────────────────────────────────────────────────────────── */

function extractToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
}

export async function GET(req: Request) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server not configured." }, { status: 500 });
  }

  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  const { data, error } = await admin
    .from("lead_kanban_boards")
    .select("state, updated_at")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // state is null when the user has no saved board yet → the client seeds a
  // default board on first use and the next save creates the row.
  return NextResponse.json({
    ok: true,
    state: data?.state ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function POST(req: Request) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server not configured." }, { status: 500 });
  }

  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const state = body.state;

  // Minimal shape validation — the client owns the full shape, but we reject
  // obviously malformed payloads so a bad request can't blank the row.
  if (!state || typeof state !== "object" || !Array.isArray((state as any).boards)) {
    return NextResponse.json({ ok: false, error: "state must be a KanbanState with a boards array." }, { status: 400 });
  }

  // Resolve the caller's org for the optional housekeeping tag (best-effort).
  const { data: staff } = await admin
    .from("staff")
    .select("organization_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  // Find-then-update/insert keyed by auth_user_id (one row per user).
  const { data: existing } = await admin
    .from("lead_kanban_boards")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  const now = new Date().toISOString();
  let error;
  if (existing?.id) {
    ({ error } = await admin
      .from("lead_kanban_boards")
      .update({ state, updated_at: now })
      .eq("id", existing.id));
  } else {
    ({ error } = await admin.from("lead_kanban_boards").insert({
      auth_user_id: auth.user.id,
      organization_id: staff?.organization_id ?? null,
      state,
      updated_at: now,
    }));
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
