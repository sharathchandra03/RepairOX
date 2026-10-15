# Invoice Refunds — Verification Evidence

Branch: `invoice-refunds`
Verified at HEAD after the review-finding fixes (commits `58315af` + `c345e19`
plus the `refundStatus` precedence reorder).

All commands run from the worktree app root:
`/Users/apple/Desktop/Reapirox dummy2/app/.worktrees/invoice-refunds`

---

## 1. TypeScript typecheck — CLEAN

```
$ npx tsc --noEmit
(no output)
exit 0
```

No type errors.

## 2. Pure-engine acceptance tests — PASS (8/8)

```
$ npx tsx --test src/lib/invoice-refunds.test.ts
...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 698.417029
exit 0
```

Passing subtests:
1. eligibility reads real settled money (`min(paidAmount, total)`; 0 for proforma/draft/cancelled)
2. allocation per-line/per-device scope
3. over-refund: remaining caps at base − prior; fully refunded blocks
4. budget-split tax: Σ(line tax) over full invoice === invoice.tax exactly
5. partial scope tax ≤ invoice.tax; ₹0-net scope ⇒ ₹0 tax
6. full-scope scaling never exceeds remainingRefundable (partially paid)
7. distributePartial shrinks proportionally
8. derived refund status

## 3. Production build — CLEAN

```
$ npm run build
 ✓ Compiled successfully
...
exit 0
```

Next.js build compiled successfully; no build errors. All routes (including the
new `/invoice/refunds`, the Credit Note print path `print/[type]/[id]`, and the
updated invoice table / view-invoice pages) build.

## 4. Permission / RLS guard suites — NOT RUNNABLE IN THIS ENVIRONMENT

The task touches permissions + RLS, so the guard suites are the correct checks
to attempt. `package.json` exposes `ms:verify`, `ms:security`, and
`leads:verify`. All three are **live-database** scripts: each begins by reading
`.env.local` for `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and
then executes SQL against a real Supabase instance (they are not static
analyzers).

```
$ npm run ms:verify
Error: ENOENT: no such file or directory, open
  '.../.worktrees/invoice-refunds/.env.local'
```

No `.env.local` exists in the worktree (confirmed: `ls .env*` → no matches), and
there is no Supabase service-role credential available in this environment, so
`ms:verify` / `ms:security` / `leads:verify` cannot connect to a database and
cannot be executed here. This is an environment constraint, not a code failure.

The RLS and 5-layer permission wiring were instead verified statically:
- `npx tsc --noEmit` is clean (the CAP/union/matrix keys all typecheck).
- `npm run build` is clean.
- The migration `0075_invoice_refunds.sql` RLS `auth_has_any([...])` arrays were
  cross-checked by hand against the `CAP.*` fallback arrays and the
  `PERMISSION_MODULES` tiers (initiate=work, process=manage, approve=full;
  returns_accept=work, returns_restock=manage; view_profitability=reports view),
  matching the segregation-of-duties and self-approval-block design.

When this branch is run against a provisioned Supabase instance (with
`.env.local` populated), `npm run ms:verify` and `npm run ms:security` should be
re-run to exercise the live RLS checks.

---

## Finding fixes applied this iteration

- **Blocking — Missing verification evidence:** resolved by this document
  (tsc + engine tests + build recorded above; guard-suite environment
  constraint documented). No implementation code change was required for this
  finding.
- **Nit — `refundStatus` precedence vs design §5.5:** `invoice-refunds.ts`
  reordered so the `failed/reversed` branch is checked before the
  `pending/processing` branch, matching the design §5.5 derivation table order
  exactly. Both branches still require zero succeeded rows; the engine test
  `derived refund status` still passes.
