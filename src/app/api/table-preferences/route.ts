import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET  /api/table-preferences?table=<tableKey>
        — Load the signed-in user's PERSONAL layout for one table.
   POST /api/table-preferences
        Body: { tableKey: string, columnOrder?: string[] | null,
                frozenColumns?: string[] | null, visibleColumns?: string[] | null }
        — Save (upsert) the signed-in user's PERSONAL layout for one table.

   A table's column ORDER + FROZEN selection are PERSONAL per-user presentation
   preferences (design-system "Personal Table Layout Standard"). This route
   needs authentication only — NOT a permission key — and SCOPES every query to
   the authenticated user (auth.user.id), so a user can only ever read/write
   their OWN row. The user_id is derived from the verified session token and is
   NEVER taken from the request body — a caller cannot forge another user's
   preferences by changing a payload field (spec rule #83).

   Storage: `user_table_preferences` (one row per (auth_user_id, table_key),
   migration 0066). Mirrors app/src/app/api/lead-kanban/route.ts (service-role
   client, token verification, per-user scoping). In local (no-Supabase) mode
   the client layer uses localStorage and never hits this route.
   ────────────────────────────────────────────────────────────────────────── */

function extractToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
}

/** Normalize an incoming value to a string[] of stable ids, or null. Rejects
 *  anything that isn't an array of strings so a malformed payload can't corrupt
 *  the stored preference. */
function cleanIdList(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string");
  return out;
}

export async function GET(req: Request) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const tableKey = new URL(req.url).searchParams.get("table")?.trim();
  if (!tableKey) return NextResponse.json({ ok: false, error: "Missing table key." }, { status: 400 });

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
    .from("user_table_preferences")
    .select("column_order, frozen_columns, visible_columns, updated_at")
    .eq("auth_user_id", auth.user.id)
    .eq("table_key", tableKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Any field is null when the user has no saved value yet → the client falls
  // back to the canonical default and the next save creates/updates the row.
  return NextResponse.json({
    ok: true,
    columnOrder: data?.column_order ?? null,
    frozenColumns: data?.frozen_columns ?? null,
    visibleColumns: data?.visible_columns ?? null,
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
  const tableKey = typeof body.tableKey === "string" ? body.tableKey.trim() : "";
  if (!tableKey) return NextResponse.json({ ok: false, error: "Missing tableKey." }, { status: 400 });

  // Only the preference fields that were actually sent are written, so a
  // column-order save never clobbers the frozen-columns value and vice-versa.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("columnOrder" in body) patch.column_order = cleanIdList(body.columnOrder);
  if ("frozenColumns" in body) patch.frozen_columns = cleanIdList(body.frozenColumns);
  if ("visibleColumns" in body) patch.visible_columns = cleanIdList(body.visibleColumns);

  // Resolve the caller's org for the optional housekeeping tag (best-effort).
  const { data: staff } = await admin
    .from("staff")
    .select("organization_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  // Find-then-update/insert keyed by (auth_user_id, table_key) — one row per
  // user per table. The user_id ALWAYS comes from the verified token.
  const { data: existing } = await admin
    .from("user_table_preferences")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .eq("table_key", tableKey)
    .maybeSingle();

  let error;
  if (existing?.id) {
    ({ error } = await admin
      .from("user_table_preferences")
      .update(patch)
      .eq("id", existing.id)
      .eq("auth_user_id", auth.user.id)); // defence-in-depth: never touch another row
  } else {
    ({ error } = await admin.from("user_table_preferences").insert({
      auth_user_id: auth.user.id,
      table_key: tableKey,
      organization_id: staff?.organization_id ?? null,
      ...patch,
    }));
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
