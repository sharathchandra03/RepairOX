# Intent-aware ResetPasswordDrawer for the enable-login flow

The shared `ResetPasswordDrawer` was hard-coded to reset-password language, so clicking "Enable login…" on a no-login user showed "Reset password", "New/Confirm new password" and the note "The existing password is never shown — it can only be replaced" — nonsensical for a user who has no password yet. The fix threads an explicit `mode: "reset" | "enable"` (plus the member's `email`) from every trigger down to the drawer, and swaps title, field labels, confirm button, info copy and adds a read-only email row when in enable mode. The underlying write path (`resetPassword`) already set the password AND `loginEnabled: true`, so no logic change was needed — only the drawer's intent and copy.

Watch for: nothing blocking. The design choice to carry an explicit `mode` rather than infer from `loginEnabled` is correct (confirmed) — "Reset password" also appears for no-login users, so inference would be ambiguous.

**Verdict**: APPROVED

## High-level view

The intent is modeled as an explicit prop rather than inferred state, which is the right call: both "Reset password" and "Enable login…" can target the same no-login member, so only an explicit mode disambiguates them. The prop defaults to `"reset"`, keeping every untouched call site behaviorally identical.

The drawer's enable-mode presentation is complete and matches the user's ask — email shown read-only (with a "No email on file" placeholder fallback), "Create password"/"Confirm password" labels, an "Enable login" title and confirm button, and info copy that describes creating the first password instead of referencing a non-existent existing one. The reset-mode strings are preserved verbatim.

Wiring is consistent across all surfaces: both tables in `roles-permissions/page.tsx` and the two buttons in `user-details-drawer.tsx` set `"reset"` for Reset and `"enable"` for Enable login, and the `onResetPassword` callback was widened to carry the mode with a `?? "reset"` fallback. The store-configuration page threads the same path.

The confirm behavior is unchanged and already correct: `resetPassword` sets `passwordHash` and `loginEnabled: true` optimistically and PATCHes `/api/staff/[id]` with `loginEnabled: true`, so confirming in enable mode both sets the password and enables login. Reset for login-enabled users is untouched. Verification evidence (tsc exit 0, build exit 0) is recorded.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking issues found.

</details>

<details>
<summary>Details</summary>

### Intent carried explicitly, not inferred

`ResetPasswordDrawer` gains `mode?: "reset" | "enable"` (default `"reset"`) and `email?: string`, with `const isEnable = mode === "enable"` driving every conditional. This is the right model because a no-login member can be the target of both "Reset password" and "Enable login…", so inferring intent from `loginEnabled` would collapse the two distinct actions. The default preserves existing behavior for any call site that doesn't pass a mode.

### Drawer presentation in enable mode

All five enable-mode surfaces are present and correct (confirmed by reading the file):

- Title `isEnable ? "Enable login" : "Reset password"`.
- Confirm button `isEnable ? "Enable login" : "Update password"`, keeping the `<Check>` icon and `w-full gap-1.5` tokens.
- First field label `"Create password"` vs `"New password"`; second `"Confirm password"` vs `"Confirm new password"`.
- A read-only email row rendered only when `isEnable`, reusing the existing `Label` + `Input` tokens with `readOnly disabled`, `iconLeft={<Mail/>}`, and `placeholder="No email on file"` so an absent email degrades to a clear fallback. `Input` supports `iconLeft` (confirmed in `ui/input.tsx`).
- Info note is mode-aware: enable mode reads "This creates the first password for {name}. Login will be enabled and they can sign in with their email and this password." — no "existing password" language. Reset mode keeps the original string verbatim.

The temporary-password checkbox, generate link, and "Password to share" copy box are untouched and already describe the password being SET, not an existing one. `validatePassword`/`submit`/`onConfirm` are unchanged.

### Consistent wiring across all triggers

`roles-permissions/page.tsx` — Table 1 (`RoleMembersPanel`): a `resettingMemberMode` state and a `setResettingMemberMode` prop were added; "Reset password" sets `"reset"`, "Enable login…" sets `"enable"`, and the drawer receives `mode`/`email`. Table 2 (`UsersTab`): a `resettingMode` state with the same trigger wiring, and `UserDetailsDrawer.onResetPassword={(m, mode) => ... setResettingMode(mode ?? "reset")}`.

`user-details-drawer.tsx`: the prop type is widened to `(m: TeamMember, mode?: "reset" | "enable") => void`; the "Reset password" button passes `"reset"`, the `!d.loginEnabled` "Enable login…" button passes `"enable"`.

`store/configuration/[id]/page.tsx`: `resettingMode` state added and threaded through `onResetPassword` and into the drawer.

A sweep for `<ResetPasswordDrawer` (3 usages) and `onResetPassword` (2 callback call sites + the type + 2 buttons) confirms every call site is updated — no stale single-arg caller remains.

### Confirm sets password AND enables login

`resetPassword(id, newPassword, opts)` in `permissions-context.tsx` sets `passwordHash`, `loginEnabled: true`, `lastPasswordChangedAt`, `passwordResetRequired` optimistically, and when Supabase is configured PATCHes `/api/staff/[id]` with `{ password, loginEnabled: true, temporary }`. Enable mode reuses this path unchanged, so confirming creates the password and enables login in one action. Reset mode for login-enabled users is behaviorally identical to before.

### Type safety and verification evidence

The coder recorded verification in `enable-login-verification.md`: `npx tsc --noEmit` → exit 0 (no output), `npm run build` → exit 0 with the two affected routes compiling. The new optional props and the widened `onResetPassword` signature are consistent across the type, all two callback call sites (with `?? "reset"`), the two buttons, and all three drawer usages, so no new type errors are expected. I did not re-run the suites per instruction; the per-file read corroborates the recorded clean type-check.

### Scope and design-system fidelity

The change stays within the existing drawer structure — same `Drawer`, `Input`/`Label`, `Button`, tokens, and info-note styling. It remains a side drawer (no structural change), introduces one new `lucide-react` import (`Mail`), and makes no unrelated refactors. Scope is tight and matches the plan.

</details>

<details>
<summary>Files changed</summary>

- `src/components/settings/reset-password-drawer.tsx` — intent-aware: `mode`/`email` props, `isEnable`, mode-aware title/labels/button/info copy, read-only email row, `Mail` import.
- `src/components/settings/user-details-drawer.tsx` — `onResetPassword` widened to `(m, mode?)`; buttons pass `"reset"`/`"enable"`.
- `src/app/(app)/settings/roles-permissions/page.tsx` — both tables: mode state + triggers + drawer `mode`/`email`; callback threads `mode ?? "reset"`.
- `src/app/(app)/settings/store/configuration/[id]/page.tsx` — `resettingMode` state threaded through callback + drawer.

Full diff: `git diff d8a7beb..HEAD -- 'src/**'`
</details>
