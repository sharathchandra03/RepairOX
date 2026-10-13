# Enable-Login Email Fix — Verification

Iteration: 1 (first implementation; no `enable-login-email-review.json` present).

## Commands run (from `app/`)

### 1. Type check
```
npx tsc --noEmit
```
Result: **exit 0** — no type errors (no new errors introduced).

### 2. Production build
```
npm run build
```
Result: **exit 0** — `✓ Compiled successfully`, type validity check passed, all
pages collected/generated.

Note: the very first `npm run build` run aborted at "Collecting page data" with
`ENOENT .next/server/pages-manifest.json` — a stale `.next` artifact issue
unrelated to the code change (compilation + type checking had already passed).
Re-running after `rm -rf .next` built cleanly (exit 0), and a final fresh
`npm run build` also exited 0.

## Changes verified
- `src/components/settings/reset-password-drawer.tsx` — Email input is now an
  editable controlled `type="email"` input in `enable` mode (seeded from the
  `email` prop, empty + "No email on file" placeholder when absent); email is
  validated (`EMAIL_RE`) before confirm, footer button disabled until a valid
  email + password + confirm are present; `onConfirm` signature widened to
  `(password, opts?: { temporary?; email? })` and passes the typed email in
  enable mode. Idle input uses the shared `Input` border (blue only on focus).
- `src/lib/permissions-context.tsx` — `resetPassword` + its context type widened
  to accept `email`; optimistic local member update sets the new email; Supabase
  PATCH body includes `email` only when provided; demo/local path preserved.
- `src/app/(app)/settings/roles-permissions/page.tsx` — the ~646 call site now
  forwards `opts` (so `email` flows); the ~1900 call site already forwarded opts.
- `src/app/(app)/settings/store/configuration/[id]/page.tsx` — already forwards
  `opts` (no change needed).
- `src/app/api/staff/[id]/route.ts` — unchanged; `body.email → update.email`
  mapping and `missing_email`/`missing_password` guards already present.

No parallel credential store; all persistence flows through the existing
`/api/staff/[id]` PATCH path (Supabase Auth user + staff row).
