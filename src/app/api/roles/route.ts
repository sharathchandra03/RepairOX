import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/* POST /api/roles — create a custom role + its starting permission grants.
   Admin-only. The client generates the id (slug) so it matches optimistically. */
export async function POST(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin } = guard;

  const { id, label, summary, workspaces, permissions } = await req.json();
  if (!id || !label) return NextResponse.json({ ok: false, error: "Missing role id/label." }, { status: 400 });

  const { error: roleErr } = await admin.from("roles").insert({
    id, label, summary: summary ?? null, workspaces: workspaces ?? [], is_custom: true,
  });
  if (roleErr) return NextResponse.json({ ok: false, error: roleErr.message }, { status: 400 });

  const keys: string[] = permissions === "all" ? ["*"] : Array.isArray(permissions) ? permissions : [];
  if (keys.length > 0) {
    await admin.from("role_permissions").insert(keys.map((k) => ({ role_id: id, permission_key: k })));
  }
  return NextResponse.json({ ok: true });
}
