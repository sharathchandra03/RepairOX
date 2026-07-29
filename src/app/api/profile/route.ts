import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rowToStaff } from "@/lib/staff-map";

export const dynamic = "force-dynamic";

/* PATCH /api/profile — self-service profile update for ANY signed-in user.

   Unlike /api/staff/[id] (admin-only), this route lets every authenticated
   user edit *their own* record — but only the safe personal fields:
   name, phone and avatar (profile picture). Role, salary, branch, status and
   login access stay admin-only and cannot be changed here.

   The update is scoped by auth_user_id = the caller's verified session, so a
   user can never touch anyone else's row even though the service-role client
   bypasses RLS. */
export async function PATCH(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server not configured." }, { status: 500 });
  }

  // Verify the session and resolve the caller's auth user.
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ ok: false, reason: "missing_name" }, { status: 400 });
    update.name = name;
  }
  if (body.phone !== undefined) {
    update.phone = body.phone ? String(body.phone).trim() : null;
  }
  if (body.avatarUrl !== undefined) {
    const v = body.avatarUrl;
    // Safety cap so a huge image can't bloat the row / realtime payload.
    if (typeof v === "string" && v.length > 1_500_000) {
      return NextResponse.json({ ok: false, reason: "image_too_large" }, { status: 413 });
    }
    update.avatar_url = v ? String(v) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const { data: updated, error: updErr } = await admin
    .from("staff")
    .update(update)
    .eq("auth_user_id", auth.user.id)
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { ok: false, error: updErr?.message ?? "Profile not found for this account." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, member: rowToStaff(updated) });
}
