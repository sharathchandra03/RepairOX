# Enable-Login Email Fix — Implementation Plan

## Goal
Fix the "Enable login" drawer so an admin can enable login for a staff member who has
NO email on file (type an email), and so the typed email + password actually persist
through the existing `/api/staff/[id]` PATCH path (Supabase Auth user + staff row) —
the single real credential store. Build on the already-shipped intent-aware drawer
(`mode: "reset" | "enable"` + `email` prop); do NOT redo that.

## Investigation findings (confirmed by reading the files)
- `src/components/settings/reset-password-drawer.tsx`
  - Current `onConfirm` signature: `onConfirm: (password: string, opts?: { temporary?: boolean }) => void`.
  - In enable mode the Email `<Input>` is `type="email"` but `readOnly disabled`, bound to
    `value={email ?? ""}` with placeholder "No email on file" — NOT editable (problem 1).
  - `submit()` calls `onConfirm(password, { temporary })` — never sends an email (problem 2).
- `src/app/api/staff/[id]/route.ts` PATCH:
  - `body.email` IS ALREADY mapped: `if (body.email !== undefined) update.email = body.email ? normalizeEmail(body.email) : null;`
  - `const email = (update.email ?? row.email)`; when `finalLoginEnabled && !authUserId` it
    returns 400 `missing_password` without `body.password`, 400 `missing_email` without an email,
    then `admin.auth.admin.createUser({ email, password, email_confirm: true })` and links `auth_user_id`.
  - **CONCLUSION: NO handler change is required.** The typed email will flow via `body.email` ->
    `update.email` -> `email` and both persist (staff.email) and create the Auth user. Keep all
    existing validation (`missing_email` / `missing_password`) intact — do not touch this file.
- `src/lib/permissions-context.tsx` `resetPassword(id, newPassword, opts?: { temporary?: boolean })`:
  - Optimistically updates local team (hash password, `loginEnabled: true`, timestamps).
  - When `isSupabaseConfigured`: `apiFetch('/api/staff/'+id, { method:'PATCH',
    body: JSON.stringify({ password: newPassword, loginEnabled: true, temporary }) })` then
    `refreshTeamFromDb()`. Does NOT send `email` (bug for problem 2).
- `src/lib/auth.ts`: has `normalizeEmail` but NO email-format validator — the drawer will use a
  simple inline regex.
- Call sites that open the drawer / wire `onConfirm` -> `resetPassword`:
  - `src/app/(app)/settings/roles-permissions/page.tsx` ~line 646 (`resettingMember` table):
    `onConfirm={(password) => { if (resettingMember) resetPassword(resettingMember.id, password); ... }}`
    — currently DROPS opts entirely (no temporary, no email). Must forward opts.
  - `src/app/(app)/settings/roles-permissions/page.tsx` ~line 1894 (`resetting` table):
    `onConfirm={(password, opts) => { if (resetting) resetPassword(resetting.id, password, opts); ... }}`
    — already forwards `opts`; widening the opts type makes `email` flow automatically.
  - `src/app/(app)/settings/store/configuration/[id]/page.tsx` ~line 417:
    `onConfirm={(password, opts) => { if (resetting) resetPassword(resetting.id, password, opts); ... }}`
    — already forwards `opts`.
  - `src/components/settings/user-details-drawer.tsx`: only calls `onResetPassword(d, "enable")`
    (opens the drawer); it does NOT render the drawer or call `onConfirm`. **No change needed here.**

## Chosen onConfirm signature
`onConfirm: (password: string, opts?: { temporary?: boolean; email?: string }) => void`

Rationale: single additive optional field on the existing opts object. Reset-mode callers pass
`email` undefined (unchanged behaviour); enable-mode forwards the typed email. Callers that already
spread `opts` into `resetPassword` need no logic change once the opts type is widened.

---

## Steps (ordered by dependency)

- [ ] 1. Widen `resetPassword` in `src/lib/permissions-context.tsx` to accept and forward an email.
      Change the signature to `resetPassword = useCallback((id, newPassword, opts?: { temporary?: boolean; email?: string }) => ...)`.
      Extract `const email = opts?.email?.trim() || undefined;`.
      In the optimistic `setTeam` map, when `email` is present also set `email` on the member object
      (so the new email shows immediately): `...(email ? { email } : {})` inside the member spread.
      In the Supabase branch, include email in the PATCH body only when provided:
      `body: JSON.stringify({ password: newPassword, loginEnabled: true, temporary, ...(email ? { email } : {}) })`.
      Also update the `ResetPasswordFn` / context type declaration for `resetPassword` wherever it is
      typed (search for `resetPassword` in the context value type / interface in this same file and
      widen its opts there too). Keep the non-Supabase demo path working (local hash + loginEnabled true
      + local email set).
      Files: `src/lib/permissions-context.tsx`
      Verify: `cd app && npx tsc --noEmit` — no new type errors from this file.

- [ ] 2. Make Email editable in enable mode and send it on confirm in `src/components/settings/reset-password-drawer.tsx`.
      - Update the prop type to `onConfirm: (password: string, opts?: { temporary?: boolean; email?: string }) => void`.
      - Add state: `const [emailValue, setEmailValue] = useState("")`.
      - In the `useEffect([open])` reset block, seed it: `setEmailValue(email ?? "")` (so a prefilled
        email shows and a no-email user starts empty). Keep resetting the other fields as-is.
      - In enable mode render the Email `<Input>` as an EDITABLE controlled input:
        `value={emailValue}`, `onChange={(e) => setEmailValue(e.target.value)}`, remove `readOnly` and
        `disabled`, keep `type="email"`, keep the `Mail` icon and placeholder "No email on file".
      - In reset mode (not enable) keep the current read-only display behaviour — reset mode does not
        render the email field at all today, so leave that branch unchanged.
      - Add a simple validator near the top of the file (module scope):
        `const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;`
      - In `submit()`: when `isEnable`, require a valid email first —
        `const em = emailValue.trim(); if (!EMAIL_RE.test(em)) { setError("Enter a valid email address."); return; }`
        — run this BEFORE the existing `validatePassword` check. Keep existing password rules unchanged.
      - Change the confirm call to pass the email in enable mode:
        `onConfirm(password, { temporary, ...(isEnable ? { email: emailValue.trim() } : {}) })`.
      - Optional (nice-to-have, keep minimal): disable the footer button in enable mode when the email
        is empty/invalid OR password rules unmet — but inline error-on-submit (above) is sufficient; do
        not over-engineer. If adding a disabled state, compute it from `EMAIL_RE.test(emailValue.trim())`
        and non-empty password/confirm.
      Files: `src/components/settings/reset-password-drawer.tsx`
      Verify: `cd app && npx tsc --noEmit` — clean. Manual: open "Enable login…" for a no-email user,
      the Email field accepts typing.

- [ ] 3. Forward `opts` (so `email` flows) at the roles-permissions line ~646 call site.
      Change `onConfirm={(password) => { if (resettingMember) resetPassword(resettingMember.id, password); setResettingMember(null); }}`
      to `onConfirm={(password, opts) => { if (resettingMember) resetPassword(resettingMember.id, password, opts); setResettingMember(null); }}`.
      Files: `src/app/(app)/settings/roles-permissions/page.tsx`
      Verify: `cd app && npx tsc --noEmit` — clean.

- [ ] 4. Confirm the other two call sites already forward opts (no code change expected).
      - roles-permissions ~line 1894 (`resetting`): already `(password, opts) => resetPassword(resetting.id, password, opts)`.
      - store/configuration ~line 417: already `(password, opts) => resetPassword(resetting.id, password, opts)`.
      Only touch these if `npx tsc --noEmit` reports a mismatch after step 1/2 (it should not).
      Files: `src/app/(app)/settings/roles-permissions/page.tsx`, `src/app/(app)/settings/store/configuration/[id]/page.tsx`
      Verify: `cd app && npx tsc --noEmit` — clean; both call sites still compile and pass email through.

- [ ] 5. Do NOT modify `src/app/api/staff/[id]/route.ts`.
      Confirmed: `body.email` already maps to `update.email`, and `email = update.email ?? row.email`
      feeds both the staff-row write and `createUser`. The existing `missing_email` / `missing_password`
      guards must stay intact. This step is a guardrail — no edit.
      Verify: re-read the PATCH handler lines mapping `body.email` and the `finalLoginEnabled && !authUserId`
      block to confirm they are unchanged.

---

## Correctness requirements to confirm (Definition of Done)
- **No-email enable works end-to-end:** admin opens "Enable login…" for a user with no email,
  types a new email + password -> drawer sends `{ password, loginEnabled: true, temporary, email }` ->
  PATCH maps `body.email` -> `update.email`, creates the Supabase Auth user with that email, links
  `auth_user_id`, and persists `staff.email`. User can then sign in.
- **Prefilled email enable works:** a user who already has an email sees it prefilled (editable),
  can keep or change it; it is sent and persisted the same way.
- **Reset mode unregressed:** reset-mode callers pass `email` undefined; the PATCH body omits `email`
  (`...(email ? { email } : {})`), existing email is untouched, password reset still works for a user
  with an existing `auth_user_id`.
- **No second credential store:** everything flows through the existing `resetPassword` ->
  `/api/staff/[id]` PATCH -> Supabase Auth + staff row. No new table, no new endpoint, no client-side
  password persistence beyond the existing demo hash fallback.
- **Local state updates immediately:** the member's new email appears without waiting for a refresh
  (optimistic `setTeam`), then reconciled by `refreshTeamFromDb()`.

## Verification
- `cd app && npx tsc --noEmit` must exit 0 (no type errors).
- `cd app && npm run build` should succeed.
