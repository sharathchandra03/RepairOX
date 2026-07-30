import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/dashboard-preferences — Load the signed-in user's KPI card order.
   POST /api/dashboard-preferences — Save a new card order for the user.

   Storage: `dashboard_preferences` table in Supabase.
   Schema:
     id           uuid (PK, default gen_random_uuid())
     auth_user_id uuid (unique, FK → auth.users.id)
     section      text (e.g. "kpi_cards")
     card_order   text[] (ordered card IDs)
     updated_at   timestamptz (default now())

   Falls back gracefully when Supabase is not configured (the client layer
   uses localStorage in that case, so this route is only hit in Supabase mode).
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

  // Verify session
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  const { data, error } = await admin
    .from("dashboard_preferences")
    .select("section, card_order, updated_at")
    .eq("auth_user_id", auth.user.id)
    .eq("section", "kpi_cards")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    preferences: data ? { section: data.section, cardOrder: data.card_order, updatedAt: data.updated_at } : null,
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

  // Verify session
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const cardOrder = body.cardOrder;

  if (!Array.isArray(cardOrder) || cardOrder.length === 0 || !cardOrder.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json({ ok: false, error: "cardOrder must be a non-empty array of strings." }, { status: 400 });
  }

  // Upsert — one row per user per section
  const { error } = await admin
    .from("dashboard_preferences")
    .upsert(
      {
        auth_user_id: auth.user.id,
        section: "kpi_cards",
        card_order: cardOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "auth_user_id,section" }
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
