# Enable-login email editable + persisted

The "Enable login" drawer previously showed a read-only, disabled email field, so an admin enabling login for a staff member with no email on file could not supply one — and even when an email existed, the drawer never forwarded it, so only a password went to the server. This change makes the email field an editable, validated `type="email"` input in `enable` mode, widens `onConfirm` to carry the typed email, threads it through `resetPassword` into the existing `/api/staff/[id]` PATCH body, and relies on the already-present handler mapping (`body.email → update.email → createUser`) to create the Supabase Auth user and persist `staff.email`. Reset mode is untouched. No new credential store, table, or endpoint.

Watch for: nothing blocking. (confirmed) The scope is tight — four code files, one additive optional field, and the server handler is unchanged by design.

**Verdict**: APPROVED

## High-level view

The drawer gates `enable`-mode confirm on a basically-valid email plus a non-empty password/confirm, both via an inline error-on-submit and a disabled footer button; the email is seeded from the `email` prop (or empty with the "No email on file" placeholder) and re-seeds whenever the drawer re-opens. Reset mode never renders the email field, so its behavior is unchanged and reset-mode callers pass `email` undefined.

`onConfirm`'s signature gains `email?: string` on the opts object. Every render site forwards `opts` into `resetPassword`: both `ResetPasswordDrawer` instances in roles-permissions (the ~646 site is the one this commit fixed; the ~1894 site already forwarded) and the store/configuration site. `user-details-drawer` only opens the drawer via `onResetPassword` and never wires `onConfirm`, so it needs no change.

`permissions-context.resetPassword` widens both its implementation and its context-type signature, trims the email, updates the local member email optimistically so it shows without a refresh, and includes `email` in the PATCH body only when present. The non-Supabase demo path still works because the optimistic `setTeam` (password hash, `loginEnabled`, email) runs regardless of `isSupabaseConfigured`.

The server handler `api/staff/[id]/route.ts` is unchanged: it already maps `body.email` to `update.email`, computes `email = update.email ?? row.email`, enforces `missing_password`/`missing_email`, and calls `admin.auth.admin.createUser({ email, password, email_confirm: true })` then links `auth_user_id`. The typed email flows into both the Auth user creation and the staff-row write — the single real credential store.

The input uses the shared `Input` component with no border overrides, so idle is the subtle `border-input` and blue appears only on focus/hover — matching the other drawer inputs and the design-system "no permanent heavy blue box" rule.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking issues found. Every verification item in the task holds.

</details>

<details>
<summary>Details</summary>

### Email editable + validated in enable mode

In `reset-password-drawer.tsx` the email `<Input>` dropped `readOnly disabled` and is now controlled: `value={emailValue}` / `onChange={(e) => setEmailValue(e.target.value)}`, still `type="email"`, still the `Mail` icon and "No email on file" placeholder. State is seeded in the open effect — `setEmailValue(email ?? "")` — and the effect dependency array was widened to `[open, email]` so a prefilled email appears and re-seeds correctly when the prop changes. A module-scope `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` gates confirm: `submit()` runs the email check before `validatePassword` and returns with "Enter a valid email address." on failure, and the footer button is `disabled={isEnable && (!emailValid || !password || !confirm)}`. This is belt-and-suspenders (inline error + disabled button) and is appropriate, not over-engineered.

Reset mode is genuinely untouched: the email block is wrapped in `{isEnable && (...)}`, so reset mode renders no email field, and `submit()` passes `...(isEnable ? { email: trimmedEmail } : {})` — email is omitted entirely for reset. No regression.

### onConfirm signature + call sites

The prop type widened to `onConfirm: (password: string, opts?: { temporary?: boolean; email?: string }) => void`. All three render sites forward opts:

- roles-permissions ~646 (`resettingMember`): changed in this commit from dropping opts to `(password, opts) => { if (resettingMember) resetPassword(resettingMember.id, password, opts); ... }`.
- roles-permissions ~1894 (`resetting`): already `(password, opts) => resetPassword(resetting.id, password, opts)`.
- store/configuration/[id] ~417: already `(password, opts) => { if (resetting) resetPassword(resetting.id, password, opts); ... }`.

`user-details-drawer.tsx` only invokes `onResetPassword(d, "enable" | "reset")` to open the drawer; it does not render `ResetPasswordDrawer` or wire `onConfirm`, so no change is needed there (and none was made). Reset-mode callers compile and behave with `email` undefined.

### permissions-context resetPassword

Both the `PermissionsContextValue.resetPassword` type and the `useCallback` implementation gained `email?: string`. `const email = opts?.email?.trim() || undefined` normalizes empty/whitespace to undefined. The optimistic `setTeam` spreads `...(email ? { email } : {})` into the member so the new email shows immediately. The Supabase PATCH body spreads `...(email ? { email } : {})` so email is sent only when provided (reset mode omits it, preserving the existing email). The optimistic update runs before the `isSupabaseConfigured` branch, so the demo/local path (hash + loginEnabled + local email) is preserved.

### Server handler unchanged (single credential store)

`api/staff/[id]/route.ts` is not in the diff and remains correct for this flow: `if (body.email !== undefined) update.email = body.email ? normalizeEmail(body.email) : null`, `const email = update.email ?? row.email`, and in the `finalLoginEnabled && !authUserId` branch it returns `missing_password` / `missing_email` guards then `createUser({ email, password, email_confirm: true })` and sets `update.auth_user_id`. The typed email persists to `staff.email` and creates the Auth account — no second credential store, no duplicated staff/auth record, only the `/api/staff/[id]` PATCH path.

### Input styling

The email field uses the shared `@/components/ui/input` `Input`, whose idle class is `border border-input` with `focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15` (blue only on focus) — identical to the password/confirm inputs in the same drawer. No permanent heavy blue box.

### Verification evidence

`.agents/tasks/enable-login-email-verification.md` records `npx tsc --noEmit` → exit 0 and `npm run build` → exit 0 (with an explained stale-`.next` first-run abort resolved by `rm -rf .next`). The commit message (`d7ca3ad`) corroborates both results. Per task instructions these were not re-run; the recorded evidence is present and consistent, and no specific doubt warranted a spot-check.

### End-to-end traces

- No-email enable: admin opens "Enable login…" for a user with no email → types email + password → `submit` sends `{ password, loginEnabled: true, temporary, email }` → handler maps `body.email → update.email`, `email` non-null, creates Auth user, links `auth_user_id`, writes `staff.email`. Holds.
- Prefilled-email enable: `emailValue` seeded from `email` prop, editable, sent and persisted the same way. Holds.
- Reset mode: `email` omitted from opts and PATCH body; existing `auth_user_id` path updates the password only; existing email untouched. Holds.

</details>

<details>
<summary>File map</summary>

- `src/components/settings/reset-password-drawer.tsx` — email input made editable + validated in enable mode; `onConfirm` widened; footer gated.
- `src/lib/permissions-context.tsx` — `resetPassword` (impl + context type) accepts/forwards email; optimistic local email update; PATCH body includes email only when provided.
- `src/app/(app)/settings/roles-permissions/page.tsx` — ~646 call site now forwards `opts`.
- `src/app/api/staff/[id]/route.ts` — unchanged (already maps `body.email` and enforces guards); confirmed, not modified.
- `.agents/tasks/enable-login-email-verification.md` — tsc/build evidence (added).

Full diff: `git show d7ca3ad`.

</details>
