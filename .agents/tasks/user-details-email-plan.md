# Implementation Plan — Edit Email (and Phone) in the User Details drawer

## Goal
In the User Details drawer, the pencil next to the name only edits the NAME, so a
staff member created without login (email shows "—") has no way to add an email
from here. Generalize that inline edit into an **identity edit** for Name / Email /
Phone, persist it through the existing `updateStaff` → `PATCH /api/staff/[id]` path
(same place every other user field is stored), and keep the DB auth-email in sync
only when a login account already exists. Editing the email here must NOT create an
auth account or enable login.

## Verified findings (ground truth — do not re-litigate)
- `app/src/components/settings/user-details-drawer.tsx` already imports `Input, Label`
  from `@/components/ui/input` and uses `usePermissions().updateStaff`. The identity
  header has `editingName` / `nameDraft` / `savingName` state and a `saveName()` that
  calls `updateStaff(d.id, { name: next })`. Email is read-only (`{d.email || "—"}`),
  phone is read-only (only rendered `{d.phone && …}`). `canManage = can("manage_users")
  || can("edit_users") || can("full_access")` already gates the pencil.
- `usePermissions().updateStaff(id, updates: Partial<TeamMember>)` (permissions-context.tsx)
  does an optimistic local merge, then `PATCH /api/staff/${id}` with `JSON.stringify(updates)`
  and `refreshTeamFromDb()`. So `updateStaff(d.id, { name, email, phone })` already
  persists all three to the staff row + re-syncs team state.
- `TeamMember` (mock-data.ts): `email: string` (required, non-optional), `phone?: string`.
- `PATCH /api/staff/[id]/route.ts` ALREADY maps the body fields:
  `update.name = String(body.name).trim()`, `update.phone = body.phone || null`,
  `update.email = body.email ? normalizeEmail(body.email) : null`. `normalizeEmail` is
  already imported. So no new field mapping is required — only the auth-email sync is
  missing.
- An email validator already exists: `isValidEmail(email)` in
  `app/src/lib/leads-data.ts` (regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Reuse it; do NOT
  add a second validator.
- The route already has an `admin` client and already calls
  `admin.auth.admin.updateUserById(authUserId, { ban_duration })` with `.catch(() => {})`
  for ban/unban. The staff row carries `row.auth_user_id` (null when the user has no
  login — the common case here).

---

- [ ] 1. Generalize the inline identity edit (state + reset) in `user-details-drawer.tsx`.
      Replace the name-only edit state with an identity edit that covers Name/Email/Phone.
      Add `const [editingIdentity, setEditingIdentity] = useState(false);`,
      `const [identityDraft, setIdentityDraft] = useState({ name: "", email: "", phone: "" });`,
      `const [savingIdentity, setSavingIdentity] = useState(false);`, and
      `const [identityErr, setIdentityErr] = useState<string | null>(null);`. You may remove the
      old `editingName` / `nameDraft` / `savingName` state (nothing else references it) — the
      task's `editingIdentity`/`identityDraft`/`savingIdentity` naming replaces it 1:1.
      In the existing `useEffect` that runs on open (currently `setEditingName(false);
      setNameDraft(member.name); load();`), change it to `setEditingIdentity(false);
      setIdentityErr(null); load();` (the draft is seeded when the pencil is clicked, below,
      so it reflects freshly-loaded detail).
      Files: `app/src/components/settings/user-details-drawer.tsx`
      Verify: `npx tsc --noEmit` from `app/` reports no new errors in this file.

- [ ] 2. Add an `isValidEmail` import and a `saveIdentity()` handler, removing `saveName()`.
      At the top of `user-details-drawer.tsx` add `import { isValidEmail } from "@/lib/leads-data";`
      (keep existing imports). Replace `saveName()` with:
      ```ts
      async function saveIdentity() {
        const name = identityDraft.name.trim();
        const email = identityDraft.email.trim();
        const phone = identityDraft.phone.trim();
        if (!name) { setIdentityErr("Name is required."); return; }
        if (email && !isValidEmail(email)) { setIdentityErr("Enter a valid email address."); return; }
        setIdentityErr(null);
        // No-op if nothing changed.
        if (name === d.name && email === (d.email ?? "") && phone === (d.phone ?? "")) {
          setEditingIdentity(false); return;
        }
        setSavingIdentity(true);
        // Empty string clears the field (matches other save paths: route maps "" -> null).
        updateStaff(d.id, { name, email, phone });
        setSavingIdentity(false);
        setEditingIdentity(false);
        // Reflect immediately, then re-sync from the server.
        setDetail((prev) => (prev ? { ...prev, member: { ...prev.member, name, email, phone } } : prev));
        load();
      }
      ```
      Note `TeamMember.email` is a required `string`, so pass `email` (possibly `""`) — this
      matches the existing read `d.email || "—"` and the route's `body.email ? … : null`
      clearing. `updateStaff` is synchronous w.r.t. local state (fire-and-forget PATCH), so the
      `await`-free body mirrors the current `saveName()`.
      Files: `app/src/components/settings/user-details-drawer.tsx`
      Verify: `npx tsc --noEmit` from `app/` — no new type errors.

- [ ] 3. Rebuild the identity header UI: edit mode now shows Name/Email/Phone inputs; view mode
      keeps the current look with one pencil that opens identity edit.
      In the identity header block, replace the `editingName ? (…) : (…)` region:
      - **Edit mode** (`editingIdentity`): a compact stacked form inside the header's
        `min-w-0 flex-1` container using the shared `Label` + `Input`:
        ```tsx
        <div className="space-y-2">
          <div>
            <Label htmlFor="idn-name">Name</Label>
            <Input id="idn-name" value={identityDraft.name} autoFocus
              onChange={(e) => setIdentityDraft((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") setEditingIdentity(false); }} />
          </div>
          <div>
            <Label htmlFor="idn-email">Email</Label>
            <Input id="idn-email" type="email" value={identityDraft.email} placeholder="name@example.com"
              onChange={(e) => setIdentityDraft((p) => ({ ...p, email: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") setEditingIdentity(false); }} />
          </div>
          <div>
            <Label htmlFor="idn-phone">Phone</Label>
            <Input id="idn-phone" value={identityDraft.phone} placeholder="Optional"
              onChange={(e) => setIdentityDraft((p) => ({ ...p, phone: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") setEditingIdentity(false); }} />
          </div>
          {identityErr && <p className="text-[11.5px] font-medium text-rose-600">{identityErr}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            <Button size="sm" onClick={saveIdentity} loading={savingIdentity}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditingIdentity(false); setIdentityErr(null); }}>Cancel</Button>
          </div>
        </div>
        ```
      - **View mode**: keep the existing name line + `(you)` marker, the email line
        (`<Mail/> {d.email || "—"}`), and the role/status badges EXACTLY as they are. Keep the
        phone line but render it even when empty is NOT required — leave the existing
        `{d.phone && (…)}` conditional as-is for display. Move the pencil button so it opens the
        identity editor and seeds the draft from the loaded detail:
        ```tsx
        onClick={() => { setIdentityDraft({ name: d.name, email: d.email ?? "", phone: d.phone ?? "" }); setIdentityErr(null); setEditingIdentity(true); }}
        title="Edit profile"
        ```
        (change its `title` from "Edit name" to "Edit profile"; keep the `canManage &&` gate and
        the `text-[#4361EE] hover:underline` styling). Keep the pencil beside the NAME in view
        mode so the entry point is unchanged for users.
      Files: `app/src/components/settings/user-details-drawer.tsx`
      Verify: `npx tsc --noEmit` from `app/`; then `npm run build` from `app/` succeeds. Manually
      confirm (dev) the pencil opens Name/Email/Phone fields and a staff member with no email can
      now type one.

- [ ] 4. Confirm the drawer inputs honour the design-system idle/focus border (no heavy blue box).
      Read `app/src/components/ui/input.tsx` and verify the shared `Input` uses `border-input`
      idle and the RepairOX-blue focus ring (blue only on focus) — the drawer must NOT add any
      `border-[#4361EE]` idle class to inputs or wrappers. Do not add custom border classes to the
      new inputs; rely on the shared `Input`. If `Input` already complies (expected), make no
      change here. Keep everything inside the existing `<Drawer>` — this stays a side drawer, not a
      modal.
      Files: `app/src/components/ui/input.tsx` (read-only check), `app/src/components/settings/user-details-drawer.tsx`
      Verify: visual check in dev — idle inputs show a subtle neutral border, blue appears only on
      focus; no persistent blue box.

- [ ] 5. Add conditional auth-email sync to `PATCH /api/staff/[id]/route.ts` (email mapping already
      exists — do NOT re-add it).
      After the staff row `update` object is built and `const email = (update.email ?? row.email)
      as string | null;` is set (it already exists), and after the row is updated, add a
      best-effort sync of the Supabase Auth email ONLY when an auth account already exists and the
      email actually changed. Place it next to the existing ban/unban sync block (which already
      uses `authUserId` and `.catch(() => {})`):
      ```ts
      // Keep the auth login email in sync — ONLY when a login already exists AND
      // the email changed. Never create an auth account here; editing the profile
      // email must not silently enable login.
      if (authUserId && body.email !== undefined) {
        const prevEmail = (row.email as string | null) ?? null;
        const nextEmail = (update.email as string | null) ?? null;
        if (nextEmail && nextEmail !== prevEmail) {
          await admin.auth.admin.updateUserById(authUserId, { email: nextEmail }).catch(() => {});
        }
      }
      ```
      Do NOT add any `createUser` / enable-login logic in this path. `update.email` is already
      normalized via `normalizeEmail`. Keep this independent of the existing
      `finalLoginEnabled && !authUserId` branch (that branch requires an explicit password and is
      the enable-login flow — leave it untouched).
      Files: `app/src/app/api/staff/[id]/route.ts`
      Verify: `npx tsc --noEmit` from `app/`; `npm run build` from `app/` succeeds. Logic check:
      for a staff member with `auth_user_id = null` (no login), editing email writes only the staff
      row and performs no auth call; for one with an auth account, changing email also calls
      `updateUserById`.

- [ ] 6. Full build + regression check.
      Run `npx tsc --noEmit` and `npm run build` from `app/`. Confirm no new errors, and that the
      Reset Password drawer (`reset-password-drawer.tsx`) was NOT modified. Spot-check in dev:
      (a) name-only edit still works and still only changes the name; (b) adding an email to a
      no-login user saves and persists after refresh without enabling login or creating an auth
      account; (c) editing phone saves.
      Files: none (verification only)
      Verify: `npm run build` from `app/` passes; manual dev spot-checks above pass.

---

## Guardrails / notes for the implementer
- Reuse the shared `Input` + `Label` from `@/components/ui/input` and the shared `Button`; do not
  hand-roll inputs or add idle blue borders (design-system: blue only on focus, never a heavy blue
  box). Keep the experience a side drawer.
- Reuse `isValidEmail` from `@/lib/leads-data` — do not add a second email regex.
- Email is OPTIONAL in the editor (validate only when non-empty); Name is REQUIRED; Phone optional.
  Trim all three. Empty string clears the field (the route maps `""` → `null`).
- The name-only behaviour must remain functionally identical (same `updateStaff` path, same
  optimistic `setDetail` + `load()` re-sync).
- Editing the email must NEVER create an auth account or enable login. The auth-email sync fires
  only when `row.auth_user_id` is already set and the email changed.
- Do NOT touch `ResetPasswordDrawer` / `reset-password-drawer.tsx`.
