# Implementation Plan — Make "Enable login…" open an enable-mode drawer (not reset)

## Context / root cause (confirmed by reading the code)

`ResetPasswordDrawer` (`app/src/components/settings/reset-password-drawer.tsx`) is a single shared drawer hard-coded to reset-password language. Every "Enable login…" entry currently opens it unchanged, so a no-login user sees "Reset password", "New password/Confirm new password", and the note "The existing password is never shown — it can only be replaced" — wrong, because there is no existing password.

The underlying write path is already correct: `resetPassword(id, newPassword, opts)` in `app/src/lib/permissions-context.tsx` (~line 819) sets `passwordHash` **and** `loginEnabled: true` (and PATCHes the API with `loginEnabled: true`). So enabling login on confirm already works — only the drawer's intent/copy is wrong. **No change to `resetPassword` is needed.**

Call sites / entry points found (all must be updated):
- `app/src/components/settings/reset-password-drawer.tsx` — the shared drawer (the component to make intent-aware).
- `app/src/app/(app)/settings/roles-permissions/page.tsx`:
  - Table 1 (`RoleMembersPanel`): "Reset password" MenuItem (~line 777) and no-login "Enable login…" MenuItem (~line 785) both call `setResettingMember(m)`. Drawer rendered ~line 644 with `resettingMember` state (declared ~line 373).
  - Table 2 (lower component): "Reset password" (~line 1810) and "Enable login…" (~line 1818) both call `setResetting(t)`. Drawer rendered ~line 1891 with `resetting` state (declared ~line 1632). This component also renders `UserDetailsDrawer` (~line 1860) whose `onResetPassword` (~line 1865) calls `setResetting(m)`.
- `app/src/app/(app)/settings/store/configuration/[id]/page.tsx`: drawer rendered ~line 410 with `resetting` state (declared ~line 90). The only trigger here is `UserDetailsDrawer.onResetPassword` (~line 385) → `setResetting(m)`. (No row ⋯ menu with Enable login on this page.)
- `app/src/components/settings/user-details-drawer.tsx`: "Reset password" button (~line 448) and no-login "Enable login…" button (~line 456) both call `onResetPassword(d)`. Prop type at ~line 111: `onResetPassword: (m: TeamMember) => void`.

Design decision: thread an **explicit** intent, never infer from `loginEnabled` alone (because "Reset password" also appears for no-login users). Carry `mode: "reset" | "enable"` from each trigger down to the drawer, and pass the member's `email`. Rationale: an explicit mode is unambiguous at every call site and keeps the two "Reset password" vs "Enable login…" items distinct even for the same (no-login) member.

---

- [ ] 1. Make `ResetPasswordDrawer` intent-aware (props + conditional copy).
      In `app/src/components/settings/reset-password-drawer.tsx`:
      - Extend the props object (and its inline type) with: `mode?: "reset" | "enable"` (treat default as `"reset"`), and `email?: string`.
      - Derive `const isEnable = mode === "enable";` after destructuring.
      - Drawer `title`: `isEnable ? "Enable login" : "Reset password"` (keep `subtitle={memberName}`; keep `icon={KeyRound}`).
      - Footer button label: `isEnable ? "Enable login" : "Update password"` (keep the `<Check>` icon, `w-full gap-1.5`, and `onClick={submit}`).
      - First field `<Label htmlFor="reset-pw">`: `isEnable ? "Create password" : "New password"`.
      - Second field `<Label htmlFor="reset-confirm">`: `isEnable ? "Confirm password" : "Confirm new password"`. Change its placeholder from `"Re-enter password"` to a neutral `"Re-enter password"` (unchanged — fine for both).
      - Add a read-only email row **only when `isEnable`**, placed above the "New/Create password" field, reusing existing `Label` + `Input` tokens: a `<Label>Email</Label>` and a disabled `<Input value={email ?? ""} readOnly disabled iconLeft={<Mail className="h-4 w-4" />} placeholder="No email on file" />`. Import `Mail` from `lucide-react` (add to the existing import line). When `email` is absent the disabled input shows the placeholder (clear read-only fallback).
      - Temporary checkbox: keep it. Update its sub-copy so it does not assume an existing password — change the description line to read for enable mode, e.g. `isEnable ? `${memberName} must change this password the first time they sign in.` : `${memberName} must set their own password the first time they sign in.`` (both are fine; the key is no "existing password" wording). The "Generate a temporary password" link and the "Password to share" copy box stay unchanged (they already describe the password being SET, not an existing one).
      - Replace the trailing blue info note (currently "…Login is enabled automatically. The existing password is never shown — it can only be replaced.") with mode-aware copy:
        - enable: `This creates the first password for ${memberName}. Login will be enabled and they can sign in with their email and this password.`
        - reset: keep the existing text `${memberName} will need to use this new password the next time they sign in. Login is enabled automatically. The existing password is never shown — it can only be replaced.`
      Keep `validatePassword`/`submit`/`onConfirm` logic and all styling tokens unchanged.
      Files: `app/src/components/settings/reset-password-drawer.tsx`
      Verify: `cd "app" && npx tsc --noEmit` — no new errors from this file.

- [ ] 2. Thread `mode` through `UserDetailsDrawer`'s `onResetPassword`.
      In `app/src/components/settings/user-details-drawer.tsx`:
      - Change the prop type (~line 111) to `onResetPassword: (m: TeamMember, mode?: "reset" | "enable") => void;`.
      - "Reset password" button (~line 448): `onClick={() => onResetPassword(d, "reset")}`.
      - "Enable login…" button (~line 456, the `!d.loginEnabled` branch): `onClick={() => onResetPassword(d, "enable")}`.
      Files: `app/src/components/settings/user-details-drawer.tsx`
      Verify: `cd "app" && npx tsc --noEmit` — the new 2-arg signature compiles; call sites updated in later steps.

- [ ] 3. roles-permissions page — Table 1 (`RoleMembersPanel`) intent + drawer wiring.
      In `app/src/app/(app)/settings/roles-permissions/page.tsx`:
      - Add a mode state next to `resettingMember` (~line 373): `const [resettingMemberMode, setResettingMemberMode] = useState<"reset" | "enable">("reset");`.
      - Pass a setter into `RoleMembersPanel` where `setResettingMember` is passed (~line 581): add prop `setResettingMemberMode={setResettingMemberMode}` and declare it in the component's prop list/type (~lines 672/681) as `setResettingMemberMode: (mode: "reset" | "enable") => void;`.
      - "Reset password" MenuItem (~line 777): `onClick={() => { setResettingMemberMode("reset"); setResettingMember(m); close(); }}`.
      - "Enable login…" MenuItem (~line 785): `onClick={() => { setResettingMemberMode("enable"); setResettingMember(m); close(); }}`.
      - Update the `<ResetPasswordDrawer>` for `resettingMember` (~line 644) to pass `mode={resettingMemberMode}` and `email={resettingMember?.email}`. Keep its existing `onConfirm` (calls `resetPassword(resettingMember.id, password)` — leave as-is; it enables login).
      Files: `app/src/app/(app)/settings/roles-permissions/page.tsx`
      Verify: `cd "app" && npx tsc --noEmit`.

- [ ] 4. roles-permissions page — Table 2 (lower component) intent + drawer wiring.
      In the same file, in the second table component (state `resetting` ~line 1632):
      - Add `const [resettingMode, setResettingMode] = useState<"reset" | "enable">("reset");` beside it.
      - "Reset password" MenuItem (~line 1810): `onClick={() => { setResettingMode("reset"); setResetting(t); close(); }}`.
      - "Enable login…" MenuItem (~line 1818): `onClick={() => { setResettingMode("enable"); setResetting(t); close(); }}`.
      - `UserDetailsDrawer.onResetPassword` (~line 1865): `onResetPassword={(m, mode) => { setViewing(null); setResettingMode(mode ?? "reset"); setResetting(m); }}`.
      - `<ResetPasswordDrawer>` for `resetting` (~line 1891): add `mode={resettingMode}` and `email={resetting?.email}` (keep existing `onConfirm` with `opts`).
      Files: `app/src/app/(app)/settings/roles-permissions/page.tsx`
      Verify: `cd "app" && npx tsc --noEmit`.

- [ ] 5. store configuration page — intent + drawer wiring.
      In `app/src/app/(app)/settings/store/configuration/[id]/page.tsx`:
      - Add `const [resettingMode, setResettingMode] = useState<"reset" | "enable">("reset");` beside `resetting` (~line 90).
      - `UserDetailsDrawer.onResetPassword` (~line 385): `onResetPassword={(m, mode) => { setViewingMember(null); setResettingMode(mode ?? "reset"); setResetting(m); }}`.
      - `<ResetPasswordDrawer>` (~line 410): add `mode={resettingMode}` and `email={resetting?.email}` (keep existing `onConfirm` with `opts` and `setTimeout(load, 400)`).
      Files: `app/src/app/(app)/settings/store/configuration/[id]/page.tsx`
      Verify: `cd "app" && npx tsc --noEmit`.

- [ ] 6. Full type-check and (if quick) build.
      Confirm no `onResetPassword` call site still passes a single arg where the new signature is expected, and all three `ResetPasswordDrawer` usages pass `mode`/`email`.
      Files: none (verification only)
      Verify: `cd "app" && npx tsc --noEmit` passes with zero errors. Then run the project build if it completes quickly: `cd "app" && npm run build` — report pass/fail; if it is slow or environment-blocked, report that tsc passed and note build status.

## Notes / assumptions
- `resetPassword` and the `/api/staff/[id]` PATCH already set `loginEnabled: true`, so confirming in enable mode enables login with no behavioral change. Reset mode for login-enabled users is untouched.
- `TeamMember.email` is a plain string in all three pages (`m.email` / `t.email` / `d.email`), so `email={resetting?.email}` passes a `string | undefined` matching the new optional prop.
- Minimal, mode-based threading avoids widening `resettingMember` into an object and keeps the existing `RoleMembersPanel` prop plumbing intact (one extra setter prop).
