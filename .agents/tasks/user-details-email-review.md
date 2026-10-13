# Editable email + phone in the User Details drawer

The User Details drawer's name-only inline edit is generalized into an identity edit covering Name / Email / Phone, persisted through the existing `updateStaff` → `PATCH /api/staff/[id]` path. The route gains a conditional Supabase Auth email sync that fires only when a login account already exists and the email actually changed. This directly answers the user's complaint that there was no way to type/save an email from User Details, and keeps the profile edit from ever auto-creating an auth account or enabling login.

**Watch for:** nothing blocking. The identity edit, validation, persistence, conditional auth sync, permission gating, optimistic refresh, and design-system fidelity all check out against the committed code (`3b17482`). The two intended files — and only those — changed; ResetPasswordDrawer is untouched by this task.

**Verdict**: APPROVED

## High-level view

The edit entry point and persistence are correct. The pencil beside the name opens a stacked Name/Email/Phone editor seeded from the loaded detail; `saveIdentity()` trims all three, requires a non-empty Name, validates Email only when provided (via the existing repo `isValidEmail`), short-circuits a no-op, and persists via `updateStaff(d.id, {name,email,phone})` — the same optimistic-local-merge + `PATCH /api/staff/${id}` + `refreshTeamFromDb()` path every other staff field uses. No second credential or profile store is introduced.

The route mapping and auth-sync are safe. `body.email`/`body.phone` already mapped to `update.email` (normalized, `"" → null`) and `update.phone` (`"" → null`) on the staff row. The new branch calls `admin.auth.admin.updateUserById(authUserId, { email })` with a `.catch` only when `authUserId` is already set and `nextEmail !== prevEmail` — it never calls `createUser` and never writes `login_enabled`, so a profile email edit cannot enable login or spawn an auth account. The pre-existing enable-login branch (`finalLoginEnabled && !authUserId`, which still requires an explicit password + email) is unchanged.

Gating, refresh, and visuals hold. The editor and pencil are behind the existing `canManage = can("manage_users") || can("edit_users") || can("full_access")`, so a non-manager sees read-only identity with no Edit affordance. After save, the drawer optimistically sets `detail.member.{name,email,phone}` then `load()` re-syncs, so the email line flips from `—` to the saved value immediately. Inputs use the shared `Input`/`Label` (idle `border-input`, blue only on `focus:`, no heavy blue box) and the surface stays a side `<Drawer>`. Types are sound: `{name,email,phone}` is a valid `Partial<TeamMember>` and `detail.member` is a `TeamMember`.

<details>
<summary>Issues (0)</summary>

No actionable findings.

</details>

<details>
<summary>Details</summary>

### Identity edit, validation, and persistence

`saveIdentity()` (drawer) trims `name`/`email`/`phone`; blocks on empty Name (`"Name is required."`); validates Email only when non-empty via `isValidEmail` from `@/lib/leads-data` (confirmed at `leads-data.ts:530`, a single shared validator — no second regex); leaves Phone free-form; short-circuits when nothing changed (`name === d.name && email === (d.email ?? "") && phone === (d.phone ?? "")`); then calls `updateStaff(d.id, { name, email, phone })`. Empty strings intentionally clear, matching the route's `"" → null` mapping. (confirmed)

`updateStaff` (`permissions-context.tsx:747`) optimistically merges into `team`, and in Supabase mode issues `PATCH /api/staff/${id}` with the updates body, then `refreshTeamFromDb()`. No duplicate credential/profile store. (confirmed)

### Route field mapping + conditional auth email sync

`api/staff/[id]/route.ts` maps `body.phone → update.phone` (`body.phone || null`) and `body.email → update.email` (`body.email ? normalizeEmail(body.email) : null`) onto the `staff` row — the same row every other user field (including login state) lives on. (confirmed)

The added sync, placed beside the ban/unban sync, runs only inside `if (authUserId && body.email !== undefined)` and only when `nextEmail && nextEmail !== prevEmail`, calling `admin.auth.admin.updateUserById(authUserId, { email: nextEmail }).catch(() => {})`. For a no-login user (`auth_user_id = null`) it is skipped entirely. It never touches `login_enabled` and never calls `createUser`, so the profile email edit cannot enable login or create an auth account. The enable-login path remains the separate `finalLoginEnabled && !authUserId` branch that still demands an explicit password and email. (confirmed)

### Gating, optimistic refresh, name-only regression, types, visuals

- Gating: the pencil and the whole editor are rendered under `canManage` (`user-details-drawer.tsx:137`, used at the identity header). A non-manager sees read-only Name/Email/Phone with no Edit button. (confirmed)
- Immediate reflect: after `updateStaff`, `setDetail((prev) => ... member: { ...prev.member, name, email, phone })` then `load()` re-fetches `GET /api/staff/[id]`, so the `d.email || "—"` line updates at once and persists across refresh. (confirmed)
- Name-only unregressed: editing only the name flows through the identical path; the no-change short-circuit still closes without a write. (confirmed)
- Type safety: `TeamMember` has `email?: string` and `phone: string`, so `{name,email,phone}` is a valid `Partial<TeamMember>`; `detail.member` is a `TeamMember`, so the optimistic spread is sound. (confirmed)
- Design system: shared `Input` (`input.tsx:30-32`) is `border-input` idle, `focus:border-[#4361EE] focus:ring-[#4361EE]/15` on focus — subtle idle border, blue only on focus, no heavy blue box. Still a side `<Drawer>`. (confirmed)
- ResetPasswordDrawer: not part of task commit `3b17482`; left untouched by this task. (confirmed)

### Evidence check (tsc/build)

The evidence file `user-details-email-verification.md` records `npx tsc --noEmit` EXIT:0 and `npm run build` EXIT:0, and its code trace matches the committed source exactly (file list, state rename, `saveIdentity`, route branch). Per instructions I did not re-run the suites; the trace is accurate and adequate, so I accept the recorded results. (confirmed via code trace; build results accepted from evidence)

</details>

<details>
<summary>File map</summary>

- `src/components/settings/user-details-drawer.tsx` — name-only edit replaced with Name/Email/Phone identity edit (new draft state, `saveIdentity`, stacked inputs, `isValidEmail` import, pencil re-labeled "Edit profile").
- `src/app/api/staff/[id]/route.ts` — added conditional Supabase Auth email sync (only when `authUserId` set and email changed); existing email/phone→update mapping unchanged.

Full diff: `git show 3b17482`.

</details>
