import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/dashboard-preferences — Load the signed-in user's saved preference
       for a given section AND store. Pass ?section=kpi_cards (default) and
       ?store=<branchId> ("all"/omitted = the consolidated All-Shops bucket).
   POST /api/dashboard-preferences — Save card order and/or monthly target for
       the user, PER STORE.
       Body: { section?, store?, cardOrder?: string[], monthlyTarget?: number }

   Storage: `dashboard_preferences` table in Supabase (per user, per section,
   PER STORE). Schema (after migration 0026):
     id             uuid (PK)
     auth_user_id   uuid  (FK → auth.users.id)
     section        text  (e.g. "kpi_cards", "grid_layout", "monthly_target")
     store_id       uuid  (FK → branches.id; NULL = All-Shops bucket)
     card_order     text[]
     monthly_target numeric
     updated_at     timestamptz
   Unique per (auth_user_id, section, coalesce(store_id, <zero-uuid>)).

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

  // Determine which section to load (default: kpi_cards for backwards compat)
  // and which store (branch) this preference belongs to. ?store=<branchId>
  // scopes the preference per store; omitting it (or "all") = the consolidated
  // All-Shops bucket (store_id NULL).
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section") || "kpi_cards";
  const storeParam = searchParams.get("store");
  const storeId = storeParam && storeParam !== "all" ? storeParam : null;

  let query = admin
    .from("dashboard_preferences")
    .select("section, card_order, monthly_target, store_id, updated_at")
    .eq("auth_user_id", auth.user.id)
    .eq("section", section);
  query = storeId ? query.eq("store_id", storeId) : query.is("store_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    preferences: data
      ? {
          section: data.section,
          cardOrder: data.card_order,
          monthlyTarget: data.monthly_target,
          storeId: data.store_id,
          updatedAt: data.updated_at,
        }
      : null,
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
  const monthlyTarget = body.monthlyTarget;
  const section = typeof body.section === "string" && body.section.length > 0 ? body.section : "kpi_cards";
  const storeRaw = typeof body.store === "string" ? body.store : null;
  const storeId = storeRaw && storeRaw !== "all" ? storeRaw : null;

  const hasCardOrder = cardOrder !== undefined;
  const hasTarget = monthlyTarget !== undefined;

  if (hasCardOrder && (!Array.isArray(cardOrder) || !cardOrder.every((id: unknown) => typeof id === "string"))) {
    return NextResponse.json({ ok: false, error: "cardOrder must be an array of strings." }, { status: 400 });
  }
  if (hasTarget && !(typeof monthlyTarget === "number" && monthlyTarget > 0)) {
    return NextResponse.json({ ok: false, error: "monthlyTarget must be a positive number." }, { status: 400 });
  }
  if (!hasCardOrder && !hasTarget) {
    return NextResponse.json({ ok: false, error: "Nothing to save (provide cardOrder and/or monthlyTarget)." }, { status: 400 });
  }

  // Find the existing per-user/section/store row (store_id NULL = All-Shops).
  let findQuery = admin
    .from("dashboard_preferences")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .eq("section", section);
  findQuery = storeId ? findQuery.eq("store_id", storeId) : findQuery.is("store_id", null);
  const { data: existing } = await findQuery.maybeSingle();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (hasCardOrder) patch.card_order = cardOrder;
  if (hasTarget) patch.monthly_target = monthlyTarget;

  let error;
  if (existing?.id) {
    ({ error } = await admin.from("dashboard_preferences").update(patch).eq("id", existing.id));
  } else {
    ({ error } = await admin.from("dashboard_preferences").insert({
      auth_user_id: auth.user.id,
      section,
      store_id: storeId,
      ...patch,
    }));
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
