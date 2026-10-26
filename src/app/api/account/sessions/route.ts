import { NextResponse } from "next/server";
import { requireUser, parseUserAgent, extractIp } from "@/lib/account-security";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   Single-device login + owner login alerts (additive).

   • OWNER_ROLES — the true org owners. They are EXEMPT from both behaviours:
     they are never single-device-restricted and their own logins never raise
     an alert. Everyone else (employees) is single-device + alerts the owners.
     This is only a TARGETING helper, never a security gate (RLS + the route's
     own self-scoping remain the real boundary).
   ────────────────────────────────────────────────────────────────────────── */
const OWNER_ROLES = ["master_shop_owner", "platform_owner"];

function deviceDescription(browser: string, os: string): string {
  const b = browser && browser !== "Unknown" ? browser : "a browser";
  const o = os && os !== "Unknown" ? os : "an unknown device";
  return `${b} on ${o}`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Active Sessions API — real, self-owned session records (user_sessions).

   POST   /api/account/sessions   Register or heartbeat THIS device's session.
                                  Body: { sessionToken: string }
                                  Called on sign-in and periodically while the
                                  app is open. Upserts by session_token and
                                  refreshes last_activity + device/IP info.

   GET    /api/account/sessions   List the caller's active (non-revoked)
                                  sessions, newest activity first. Marks the row
                                  whose session_token matches ?current=<token>.

   DELETE /api/account/sessions   Revoke one of the caller's OTHER sessions.
                                  Body: { id: string }  (server-side invalidate)

   All actions are scoped to the caller's verified auth user, so a user can
   only ever see or revoke their own sessions.
   ────────────────────────────────────────────────────────────────────────── */

async function resolveStaff(admin: any, authUserId: string) {
  const { data } = await admin
    .from("staff")
    .select("id, organization_id, name, role_id, branch_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  return data as {
    id: string;
    organization_id: string | null;
    name: string | null;
    role_id: string | null;
    branch_id: string | null;
  } | null;
}

/* On a genuinely NEW session for an employee (non-owner), two additive side
   effects run with the service-role client. Both are best-effort and each is
   wrapped so a failure NEVER blocks the session registration (the core
   behaviour is unchanged):
     1. Single-device — revoke this employee's OTHER living sessions.
     2. Owner alert   — write ONE durable notification (per org, per session)
        addressed to the org owners: "<name> signed in on <device>".           */
async function onNewEmployeeSession(
  admin: any,
  opts: {
    authUserId: string;
    staff: { id: string; organization_id: string | null; name: string | null; branch_id: string | null };
    newSessionId: string;
    browser: string;
    os: string;
    loginAtIso: string;
  }
) {
  const { authUserId, staff, newSessionId, browser, os, loginAtIso } = opts;

  // 1. Single-device enforcement — revoke every OTHER non-revoked session row
  //    for this employee. The row just inserted (newSessionId) is excluded, so
  //    the current device stays live. A revoked device's next heartbeat returns
  //    410, and the client logs it out on that tick.
  try {
    await admin
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("auth_user_id", authUserId)
      .is("revoked_at", null)
      .neq("id", newSessionId);
  } catch {
    /* best-effort — never blocks sign-in */
  }

  // 2. Owner login alert — one durable notification row per login event. The
  //    dedupe_key is unique per (org, session row), so a heartbeat or retry
  //    never produces a second alert, and the org's unique index backs it up.
  try {
    if (!staff.organization_id) return;
    const device = deviceDescription(browser, os);
    const who = staff.name?.trim() || "An employee";
    await admin.from("notifications").insert({
      organization_id: staff.organization_id,
      branch_id: staff.branch_id,
      kind: "employee_login",
      title: "Employee signed in",
      body: `${who} signed in on ${device}.`,
      // recipient_role targets the owners' bell; two owner roles → two rows so
      // both a Master Shop Owner and a Platform Owner can receive it.
      recipient_role: "master_shop_owner",
      reference: staff.id,
      dedupe_key: `login:${newSessionId}:mso`,
      created_by: staff.id,
      created_at: loginAtIso,
    });
    await admin.from("notifications").insert({
      organization_id: staff.organization_id,
      branch_id: staff.branch_id,
      kind: "employee_login",
      title: "Employee signed in",
      body: `${who} signed in on ${device}.`,
      recipient_role: "platform_owner",
      reference: staff.id,
      dedupe_key: `login:${newSessionId}:po`,
      created_by: staff.id,
      created_at: loginAtIso,
    });
  } catch {
    /* best-effort — an alert failure never blocks sign-in */
  }
}

export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.trim() : "";
  if (!sessionToken) return NextResponse.json({ ok: false, error: "Missing session token." }, { status: 400 });

  const staff = await resolveStaff(admin, user.id);
  if (!staff) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  const ua = req.headers.get("user-agent");
  const parsed = parseUserAgent(ua);
  const ip = extractIp(req);
  const now = new Date().toISOString();

  // Does this device already have a row?
  const { data: existing } = await admin
    .from("user_sessions")
    .select("id, revoked_at")
    .eq("session_token", sessionToken)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existing) {
    // Heartbeat: only refresh living sessions. A revoked row stays revoked so a
    // signed-out device can't quietly resurrect itself.
    if (existing.revoked_at) {
      return NextResponse.json({ ok: false, revoked: true }, { status: 410 });
    }
    await admin
      .from("user_sessions")
      .update({
        last_activity: now,
        ip_address: ip,
        user_agent: ua,
        browser: parsed.browser,
        browser_version: parsed.browserVersion,
        os: parsed.os,
        device_type: parsed.deviceType,
      })
      .eq("id", existing.id);
    return NextResponse.json({ ok: true, id: existing.id });
  }

  const { data: inserted, error } = await admin
    .from("user_sessions")
    .insert({
      staff_id: staff.id,
      auth_user_id: user.id,
      organization_id: staff.organization_id,
      session_token: sessionToken,
      user_agent: ua,
      browser: parsed.browser,
      browser_version: parsed.browserVersion,
      os: parsed.os,
      device_type: parsed.deviceType,
      ip_address: ip,
      login_at: now,
      last_activity: now,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // A genuinely new device just registered. For EMPLOYEES (non-owner roles)
  // run the two additive side effects: single-device revoke + owner login
  // alert. Owners are exempt. Awaited but fully guarded, so neither can break
  // the response the client depends on.
  const isOwner = staff.role_id ? OWNER_ROLES.includes(staff.role_id) : false;
  if (!isOwner) {
    await onNewEmployeeSession(admin, {
      authUserId: user.id,
      staff: {
        id: staff.id,
        organization_id: staff.organization_id,
        name: staff.name,
        branch_id: staff.branch_id,
      },
      newSessionId: inserted.id,
      browser: parsed.browser,
      os: parsed.os,
      loginAtIso: now,
    });
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}

export async function GET(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const { searchParams } = new URL(req.url);
  const currentToken = searchParams.get("current") ?? "";

  const { data, error } = await admin
    .from("user_sessions")
    .select(
      "id, session_token, browser, browser_version, os, device_type, ip_address, location, login_at, last_activity"
    )
    .eq("auth_user_id", user.id)
    .is("revoked_at", null)
    .order("last_activity", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Never leak the raw session_token to the browser — only a boolean "isCurrent".
  const sessions = (data ?? []).map((s: any) => ({
    id: s.id,
    browser: s.browser,
    browserVersion: s.browser_version,
    os: s.os,
    deviceType: s.device_type,
    ipAddress: s.ip_address,
    location: s.location,
    loginAt: s.login_at,
    lastActivity: s.last_activity,
    isCurrent: Boolean(currentToken) && s.session_token === currentToken,
  }));

  return NextResponse.json({ ok: true, sessions });
}

export async function DELETE(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "Missing session id." }, { status: 400 });

  // Scope the revoke to the caller's own rows — a user can never revoke someone
  // else's session even with the service-role client.
  const { data: revoked, error } = await admin
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("auth_user_id", user.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!revoked) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
