import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/* PUT /api/feature-visibility — upsert one or many feature visibility entries.
   Admin-only (platform_owner, master_shop_owner).

   Body: { roleId, featureId, mode } — single update
     OR: { roleId, bulk: { [featureId]: mode } } — bulk update */
export async function PUT(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin } = guard;

  const body = await req.json();
  const { roleId, featureId, mode, bulk } = body;

  if (!roleId) return NextResponse.json({ ok: false, error: "Missing roleId." }, { status: 400 });

  if (bulk && typeof bulk === "object") {
    // Bulk upsert
    const rows = Object.entries(bulk)
      .filter(([, m]) => m !== "visible") // Only store non-default values
      .map(([fid, m]) => ({ role_id: roleId, feature_id: fid, mode: m as string }));

    // Delete any being set back to visible
    const toDelete = Object.entries(bulk)
      .filter(([, m]) => m === "visible")
      .map(([fid]) => fid);

    if (toDelete.length > 0) {
      await admin.from("feature_visibility")
        .delete()
        .eq("role_id", roleId)
        .in("feature_id", toDelete);
    }

    if (rows.length > 0) {
      const { error } = await admin.from("feature_visibility").upsert(rows, {
        onConflict: "role_id,feature_id",
      });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
  } else if (featureId && mode) {
    // Single upsert
    const { error } = await admin.from("feature_visibility").upsert(
      { role_id: roleId, feature_id: featureId, mode },
      { onConflict: "role_id,feature_id" }
    );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  } else {
    return NextResponse.json({ ok: false, error: "Missing featureId/mode or bulk data." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/* DELETE /api/feature-visibility — remove a visibility override (revert to "visible").
   Body: { roleId, featureId } */
export async function DELETE(req: Request) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin } = guard;

  const { roleId, featureId } = await req.json();
  if (!roleId || !featureId) return NextResponse.json({ ok: false, error: "Missing roleId/featureId." }, { status: 400 });

  await admin.from("feature_visibility")
    .delete()
    .eq("role_id", roleId)
    .eq("feature_id", featureId);

  return NextResponse.json({ ok: true });
}
