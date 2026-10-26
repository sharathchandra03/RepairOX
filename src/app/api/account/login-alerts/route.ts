import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   Owner login-alert feed (additive, self-scoped).

   The durable `notifications` table (migration 0025) is written by the sessions
   route when an employee signs in on a new device, addressed to the owner roles
   via `recipient_role`. The client bell today reads the localStorage feed
   (src/lib/notifications.ts), NOT this table — so this tiny route lets an OWNER
   pull the login alerts addressed to THEM and replay them into their own local
   bell feed. It changes nothing for non-owners and touches no existing flow.

   GET  /api/account/login-alerts   List the caller's unread employee_login
                                    notifications (newest first). Returns only
                                    rows targeted at the caller's OWN role within
                                    their OWN org — never another org/role.

   POST /api/account/login-alerts   Acknowledge (mark read) alerts the caller has
                                    surfaced locally. Body: { ids: string[] }.
                                    Scoped to the caller's role + org so a user
                                    can only ack alerts addressed to them.

   OWNER_ROLES mirrors the sessions route. Only these roles receive/read login
   alerts; any other caller gets an empty list (never an error, never data).
   ────────────────────────────────────────────────────────────────────────── */
const OWNER_ROLES = ["master_shop_owner", "platform_owner"];

async function resolveStaff(admin: any, authUserId: string) {
  const { data } = await admin
    .from("staff")
    .select("id, organization_id, role_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data as { id: string; organization_id: string | null; role_id: string | null } | null;
}

export async function GET(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const staff = await resolveStaff(admin, user.id);
  if (!staff || !staff.organization_id || !staff.role_id) {
    return NextResponse.json({ ok: true, alerts: [] });
  }
  // Only owners receive login alerts. Everyone else: empty (never an error).
  if (!OWNER_ROLES.includes(staff.role_id)) {
    return NextResponse.json({ ok: true, alerts: [] });
  }

  const { data, error } = await admin
    .from("notifications")
    .select("id, title, body, reference, href, created_at, dedupe_key")
    .eq("organization_id", staff.organization_id)
    .eq("kind", "employee_login")
    .eq("recipient_role", staff.role_id)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const alerts = (data ?? []).map((n: any) => ({
    id: n.id,
    title: n.title as string,
    body: (n.body ?? "") as string,
    reference: (n.reference ?? null) as string | null,
    href: (n.href ?? null) as string | null,
    createdAt: n.created_at as string,
    dedupeKey: (n.dedupe_key ?? n.id) as string,
  }));

  return NextResponse.json({ ok: true, alerts });
}

export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, acknowledged: 0 });

  const staff = await resolveStaff(admin, user.id);
  if (!staff || !staff.organization_id || !staff.role_id) {
    return NextResponse.json({ ok: true, acknowledged: 0 });
  }
  if (!OWNER_ROLES.includes(staff.role_id)) {
    return NextResponse.json({ ok: true, acknowledged: 0 });
  }

  // Mark read — scoped to the caller's own role + org + the employee_login kind,
  // so a user can only ever acknowledge alerts addressed to them.
  const { data, error } = await admin
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("organization_id", staff.organization_id)
    .eq("recipient_role", staff.role_id)
    .eq("kind", "employee_login")
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, acknowledged: (data ?? []).length });
}
