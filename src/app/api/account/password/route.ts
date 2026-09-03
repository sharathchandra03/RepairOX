import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/account-security";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/account/password — self-service change password.

   Body: { currentPassword, newPassword, revokeOthers?: boolean, sessionToken? }

   Flow:
     1. Verify the caller's session (requireUser).
     2. Re-authenticate with the CURRENT password using a throwaway anon client
        (proves the user knows their existing password before we change it).
     3. Update the password via the service-role admin client.
     4. Optionally revoke the caller's OTHER active sessions (keeps THIS device
        signed in — Supabase does not force a re-login on password change here).

   Passwords are never stored by us — Supabase Auth owns the credential.
   ────────────────────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const email = user.email;
  if (!email) return NextResponse.json({ ok: false, error: "This account has no email." }, { status: 400 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const revokeOthers = Boolean(body.revokeOthers);
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";

  if (!currentPassword) return NextResponse.json({ ok: false, reason: "missing_current" }, { status: 400 });
  if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json({ ok: false, reason: "weak_password" }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ ok: false, reason: "same_password" }, { status: 400 });
  }

  // 2) Prove the current password with a throwaway (no-persist) anon client.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInErr } = await verifier.auth.signInWithPassword({ email, password: currentPassword });
  if (signInErr) {
    return NextResponse.json({ ok: false, reason: "wrong_current" }, { status: 400 });
  }
  await verifier.auth.signOut().catch(() => {});

  // 3) Update the credential via service-role.
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });
  }

  // 4) Optionally revoke this user's OTHER tracked sessions (not the current
  //    device). This reflects the change in the Active Sessions list too.
  if (revokeOthers) {
    let q = admin
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("auth_user_id", user.id)
      .is("revoked_at", null);
    if (sessionToken) q = q.neq("session_token", sessionToken);
    await q;
    // Also invalidate refresh tokens on the auth side so revoked devices can't
    // silently refresh. Supabase signs out ALL sessions incl. the current one,
    // so we only do this when the user explicitly asked to sign out others.
    await admin.auth.admin.signOut(user.id, "others").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
