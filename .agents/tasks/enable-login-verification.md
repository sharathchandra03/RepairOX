# Verification — Intent-aware ResetPasswordDrawer (enable-login flow)

## Summary

The shared `ResetPasswordDrawer` is now intent-aware via an explicit
`mode: "reset" | "enable"` prop (plus the member's `email`). Clicking
"Enable login…" on a no-login user now opens an enable-mode drawer with
create-password language and a read-only email row; "Reset password" keeps the
original reset language. The underlying write path (`resetPassword`) already
sets the password AND `loginEnabled: true`, so confirming in either mode sets
the password and enables login — no logic change was needed, reset for
login-enabled users is untouched.

## Files changed

- `src/components/settings/reset-password-drawer.tsx` — made intent-aware:
  added `mode?: "reset" | "enable"` (default `"reset"`) and `email?: string`
  props; derived `isEnable`; mode-aware title / field labels / confirm button /
  info copy; read-only email row in enable mode; `Mail` import.
- `src/components/settings/user-details-drawer.tsx` — `onResetPassword` widened
  to `(m: TeamMember, mode?: "reset" | "enable") => void`; "Reset password"
  button passes `"reset"`, "Enable login…" button passes `"enable"`.
- `src/app/(app)/settings/roles-permissions/page.tsx` — both tables: added mode
  state (`resettingMemberMode` in `RoleMembersPanel`'s parent + `resettingMode`
  in the lower table), triggers set `"reset"`/`"enable"`, drawers pass
  `mode`/`email`; `UserDetailsDrawer.onResetPassword` threads `mode ?? "reset"`.
- `src/app/(app)/settings/store/configuration/[id]/page.tsx` — added
  `resettingMode` state, threaded through `UserDetailsDrawer.onResetPassword`,
  drawer passes `mode`/`email`.

## Drawer labels/copy — before → after

| Element | Reset mode (unchanged) | Enable mode (new) |
|---|---|---|
| Title | `Reset password` | `Enable login` |
| Subtitle | `{memberName}` | `{memberName}` (unchanged) |
| Confirm button | `Update password` | `Enable login` |
| First field label | `New password` | `Create password` |
| Second field label | `Confirm new password` | `Confirm password` |
| Email row | (not shown) | read-only `Email` input, placeholder `No email on file` when absent |
| Temporary sub-copy | `{memberName} must change this password the first time they sign in.` (shared, no "existing password" wording) | same |
| Info note | `{memberName} will need to use this new password the next time they sign in. Login is enabled automatically. The existing password is never shown — it can only be replaced.` | `This creates the first password for {memberName}. Login will be enabled and they can sign in with their email and this password.` |

Note: the "Generate a temporary password" link and the "Password to share"
copy box are shared and unchanged (they describe the password being SET, not an
existing one).

## Commands run and results

- `cd app && npx tsc --noEmit` → exit code **0**, no output (clean, no new type
  errors from the touched files).
- `cd app && npm run build` → exit code **0**, build succeeded. The affected
  routes compiled: `/settings/roles-permissions` (24.5 kB),
  `/settings/store/configuration/[id]` (8.11 kB).

Both verifications passed.
