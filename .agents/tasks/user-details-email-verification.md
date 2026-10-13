# Verification — Edit Email (and Phone) in the User Details drawer

## Summary
Generalized the User Details drawer's name-only inline edit into an **identity
edit** covering **Name / Email / Phone**, persisted through the existing
`updateStaff` → `PATCH /api/staff/[id]` path, and added a conditional
auth-login-email sync in the route (only when a login account already exists and
the email changed). Editing the email here never creates an auth account and
never enables login.

Iteration: first implementation (`user-details-email-review.json` did not exist).

## Verification commands + results (from `app/`)

### `npx tsc --noEmit`
```
EXIT:0
```
Exit code **0** — no type errors.

### `npm run build`
```
… (full route table printed) …
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT:0
```
Build **succeeded**, exit code **0**. No new errors or warnings introduced by
these changes.

## Files changed (only the two intended files)

### 1. `src/components/settings/user-details-drawer.tsx`
- Added `import { isValidEmail } from "@/lib/leads-data";` (reuses the existing
  repo email validator — no second regex added).
- Replaced the name-only edit state
  (`editingName` / `nameDraft` / `savingName`) with an identity edit:
  ```ts
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState({ name: "", email: "", phone: "" });
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityErr, setIdentityErr] = useState<string | null>(null);
  ```
- The open `useEffect` now does `setEditingIdentity(false); setIdentityErr(null); load();`
  (the draft is seeded when the pencil is clicked, from freshly-loaded detail).
- Replaced `saveName()` with `saveIdentity()`:
  - trims name/email/phone;
  - Name required (non-empty) → `"Name is required."`;
  - Email OPTIONAL, validated only when non-empty via `isValidEmail` →
    `"Enter a valid email address."`;
  - Phone optional;
  - no-op short-circuit when nothing changed;
  - `updateStaff(d.id, { name, email, phone })` (empty string clears, matching
    the route's `"" -> null` mapping);
  - optimistic `setDetail(... member: { ...name, email, phone })` then `load()`
    re-sync — so the email line updates immediately after save.
- Identity header UI: edit mode now renders stacked `Label` + shared `Input`
  fields for Name / Email / Phone (Email `type="email"`, placeholder
  `name@example.com`), an inline error line, and Save/Cancel buttons.
  Enter-to-save / Escape-to-cancel preserved on every field. View mode is
  unchanged (name + `(you)`, email line `{d.email || "—"}`, conditional phone
  line, badges); the single pencil now opens the identity editor (title changed
  `"Edit name"` → `"Edit profile"`, same `canManage &&` gate, same
  `text-[#4361EE] hover:underline` styling, seeds the draft from `d`).

### 2. `src/app/api/staff/[id]/route.ts`
- Email/phone body→update mapping ALREADY existed and was left as-is:
  `update.phone = body.phone || null`,
  `update.email = body.email ? normalizeEmail(body.email) : null`.
- ADDED a best-effort conditional auth-login-email sync, placed next to the
  existing ban/unban sync (same `authUserId` + `.catch(() => {})` pattern):
  ```ts
  if (authUserId && body.email !== undefined) {
    const prevEmail = (row.email as string | null) ?? null;
    const nextEmail = (update.email as string | null) ?? null;
    if (nextEmail && nextEmail !== prevEmail) {
      await admin.auth.admin.updateUserById(authUserId, { email: nextEmail }).catch(() => {});
    }
  }
  ```
  It fires ONLY when a login account already exists (`authUserId` set) AND the
  email actually changed. It never calls `createUser` and never flips
  `login_enabled` — editing the profile email cannot enable login.

## End-to-end trace (Edit identity → persistence)
1. **Edit identity** — a managing admin clicks the pencil beside the name
   (gated by `canManage = can("manage_users") || can("edit_users") ||
   can("full_access")`). This seeds `identityDraft` from the loaded detail and
   opens the inline editor. A user with no email shows an empty Email field
   ready to type (previously the email was read-only `"—"` with no entry point).
2. **Type email/phone** — the admin types into the shared `Input` fields; the
   draft updates on each keystroke. A non-managing viewer sees read-only
   identity with **no** pencil / Edit affordance (gated).
3. **Save** — `saveIdentity()` validates (Name required; Email valid only when
   non-empty via `isValidEmail`), trims all three, short-circuits if unchanged,
   then calls `updateStaff(d.id, { name, email, phone })`.
4. **`updateStaff` → PATCH** — `usePermissions().updateStaff` optimistically
   merges locally, then issues `PATCH /api/staff/${id}` with
   `{ name, email, phone }` and `refreshTeamFromDb()`.
5. **Route maps fields (+ conditional auth sync)** — the PATCH handler writes
   `update.name`, `update.phone` (`"" -> null`), `update.email`
   (`normalizeEmail`, `"" -> null`) to the SAME `staff` row where every other
   user field lives. If (and only if) the staff member already has
   `auth_user_id` AND the email changed, it also calls
   `admin.auth.admin.updateUserById(authUserId, { email })` to keep the login
   email in sync. For a no-login user (`auth_user_id = null`), it performs NO
   auth call — only the staff row is written.
6. **Local state + reload reflect new email** — the drawer optimistically sets
   `detail.member.{name,email,phone}` and calls `load()` to re-fetch
   `GET /api/staff/[id]`. The identity header email line immediately shows the
   new email instead of `"—"`, and it persists across a refresh (stored in the
   DB staff row).

## Confirmations
- **Name-only edit unchanged in behaviour** — editing only the name still calls
  the same `updateStaff` path with the same optimistic `setDetail` + `load()`
  re-sync; the no-change short-circuit still closes the editor without a write.
- **Email edit never enables login / creates an auth account** — the drawer only
  calls `updateStaff({name,email,phone})`; the route's enable-login branch
  (`finalLoginEnabled && !authUserId`, which requires an explicit password) is
  untouched, and the new email-sync branch explicitly only runs when
  `authUserId` already exists and never writes `login_enabled`.
- **No duplicate credential/profile store** — all persistence flows through the
  existing `updateStaff` → `PATCH /api/staff/[id]` path.
- **Design-system fidelity** — the editor uses the shared `Input` + `Label`
  (`src/components/ui/input.tsx`): idle border `border-input`, blue only on
  focus (`focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15`), no
  permanent heavy blue box. No custom idle border classes were added. It stays
  a side `<Drawer>` — not restructured into a modal or a second drawer.
- **ResetPasswordDrawer NOT touched** — `reset-password-drawer.tsx` has zero
  edits from this task. (It carries pre-existing uncommitted changes from a
  prior "enable-login" workflow step; those were left exactly as found and are
  outside this task's scope.)
