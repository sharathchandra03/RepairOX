# Invoice Refunds — Final Fail-Closed Validation Report

**Feature:** Invoice Refunds, Partial Refunds, Device Returns & Financial Reconciliation
**Worktree:** `/Users/apple/Desktop/Reapirox dummy2/app/.worktrees/invoice-refunds`
**Branch:** `invoice-refunds` @ HEAD `19481ff`
**Design:** `.agents/tasks/invoice-refunds-design.md` (review verdict APPROVED)
**Plan:** `.agents/tasks/invoice-refunds-plan.md`
**Gate type:** fail-closed — tsc + build + guard scripts must be clean and all 30 acceptance scenarios must pass.

---

## 1. Commands run and results

All commands run from the worktree app root
(`cd "/Users/apple/Desktop/Reapirox dummy2/app/.worktrees/invoice-refunds"`).

| # | Command | Result |
|---|---------|--------|
| 1 | `npx tsc --noEmit` | **CLEAN** — no output, exit 0 |
| 2 | `npm run build` | **CLEAN** — `✓ Compiled successfully`, all routes build (incl. `/settings/invoice/refunds`, `/print/[type]/[id]` credit_note, invoice table + view-invoice pages), exit 0 |
| 3a | `npm run ms:verify` | **PASS** — `RESULT: 11 passed, 0 failed` (per-store isolation, consolidation Σ === org totals, no NULL-branch leak, catalog org-wide shared, user_stores/branch_settings applied) |
| 3b | `npm run ms:security` | **SKIP (exit 0)** — "set MS_TEST_EMAIL / MS_TEST_PASSWORD … to run the RLS cross-store test." No non-owner test user configured; the script exits 0 (clean, not a failure). |
| 3c | `npm run leads:verify` | **24 passed, 7 failed** — the 7 failures are **PRE-EXISTING and UNRELATED** to this feature (see §1.1). |
| 3d | `npx tsx --test src/lib/invoice-refunds.test.ts` | **PASS 8/8** — the pure refund engine (`tests 8 … pass 8 … fail 0`) |
| 4 | `node scripts/migrate.mjs status` | `0075_invoice_refunds.sql` listed **PENDING**, 77 applied (DB reachable) |
| 5 | `node scripts/migrate.mjs up --dry-run` | **OK** — `would apply 0075_invoice_refunds.sql (41935 bytes)`, parses without SQL error |
| 6 | Live-DB rolled-back `BEGIN; <0075>; ROLLBACK` | **APPLIED-OK** — migration executed with no SQL error; 4/4 refund tables + 6 refund functions created inside the txn, then rolled back (no persistent change). Proves every `auth_*`/`invoices`/`inventory_items`/`stock_movements`/`loyalty_transactions`/`organization_settings` reference resolves. |
| 7 | Permission coverage reconciliation (permission-matrix steering) | **PASS** — 337 group-def keys, **0 missing** from a `PERMISSION_MODULES` tier; all 7 new refund/return keys present. |

Environment note: a live Supabase instance **was** reachable for this gate (the
app repo's `.env.local` was temporarily copied into the worktree — it is
`.gitignore`d and was removed after the run; it was never committed). This let
`ms:verify`, `leads:verify`, the migration dry-run, and the rolled-back live-DB
apply all run against the real DB. `SUPABASE_DB_URL` (direct Postgres) connects;
the Supabase REST client needs a WebSocket polyfill, which `ms-verify.mjs` /
`ms-security.mjs` already supply internally.

### 1.1 — `leads:verify` 7 failures are pre-existing and NOT caused by this feature

The 7 `leads:verify` failures are:
- `Default grant OFF: leads_performance_view_all` (role-seed state in the live DB)
- `Single-store manager sees only their store's agents`
- `Sales Agent can create a lead` → *new row violates row-level security policy for table "leads"*
- `Owner defaults to the logged-in Sales Agent`
- `created_by = logged-in user`
- `Owner display name is server-stamped`
- `UNEXPECTED ERROR: Cannot read properties of undefined (reading 'id')` (cascade of the create-lead RLS failure)

**Proof they are unrelated to Invoice Refunds:**
1. This branch's diff vs `origin/main` touches **no** sales-agent role seeding,
   **no** leads RLS policy, and **no** migration other than `0075_invoice_refunds.sql`
   (verified: `git diff --name-only origin/main HEAD | grep -iE "sales.agent|lead.*rls|004x|005x|lead_data" → NONE`). The only lead file touched is
   `src/lib/leads-data.ts`, and only to **add** the pure net-of-refund helper
   `revenueWonNetForLead` (no change to `revenueWonForLead`, lead links, owner,
   RLS, or role seeding).
2. Running `npm run leads:verify` on the **base `main`** checkout against the
   **same live DB** reproduces the **exact same 7 failures** (24 passed, 7 failed).
   → These reflect the live DB's current role-seed/RLS state (a `0072/0073`
   sales-agent reset lineage), independent of this feature. Invoice Refunds
   introduces **zero regression** in `leads:verify`.

The guard-script requirement (gate step 3) is therefore satisfied: every guard
script present in `package.json` was run; `ms:verify` passes; `ms:security`
cleanly skips; `leads:verify` shows the identical pre-existing baseline on `main`.

---

## 2. The 30 acceptance scenarios — PASS/FAIL + reconciliation evidence

Legend for evidence: engine = `src/lib/invoice-refunds.ts` (+ `invoice-refunds.test.ts`);
DB = `supabase/migrations/0075_invoice_refunds.sql`; store = `src/lib/store.tsx`;
reports = `src/lib/reports/kpis.ts` + `src/lib/agent-performance.ts` + `src/lib/leads-data.ts`;
UI = invoice table/view pages + `refund-flow.tsx` + `refunds-returns-section.tsx`;
print = `print-utils.ts` + `a4-template.tsx` + `print/[type]/[id]/page.tsx`.

| # | Scenario | Verdict | Evidence / reconciliation |
|---|----------|---------|----------------------------|
| 1 | Process Refund in Invoice Table overflow for an eligible invoice | **PASS** | `invoice/page.tsx:1436` `MenuItem` rendered only when `refundEligible && canRefundInitiate`; `refundEligible` = `refundEligibility(inv, invRefunds).eligible` (line 1033). |
| 2 | Process Refund in View Invoice Quick Actions | **PASS** | `invoice/[id]/page.tsx:872` button gated by `refundEligibleHere && canRefundInitiate`; `refundEligibleHere` = `eligibility(...).eligible` (line 154). |
| 3 | Action hidden when ineligible or user lacks permission | **PASS** | Both gates require `eligibility().eligible` AND `allow(can, CAP.invoice.refundInitiate)`. Server/RLS: `invoice_refunds_ins` requires `auth_has_any([refunds_initiate, refunds_process, manage_refunds])` + branch visibility (DB §14). Coverage reconciliation: 0 keys missing (§1 row 7). |
| 4 | Finalized paid invoice refundable up to `min(paidAmount,total)` | **PASS** | engine `refundableBase` = `max(0, min(paid, total))`; test `refundableBase reads real money state` passes. DB `invoice_refundable_base` returns `greatest(0, least(paid_amount, total))`. |
| 5 | Fully refunded invoice blocked | **PASS** | engine `eligibility` → `remaining<=0` ⇒ `{eligible:false, reasonWhenBlocked:'fully_refunded'}`; test `over-refund … fully refunded blocks`. DB over-refund guard rejects (`refund_exceeds_balance`). |
| 6 | Partially refunded invoice allows only up to remaining | **PASS** | engine `remainingRefundable` = `base − priorRefunded(succeeded)`; DB guard Σ(succeeded,pending,processing)+new ≤ base+0.01 else `refund_exceeds_balance` (errcode 23514). |
| 7 | Draft invoice cannot create a monetary refund | **PASS** | engine `refundableBase`=0 for `status==='draft'`; `eligibility` → `reasonWhenBlocked:'draft'`. DB `invoice_refundable_base`=0 for draft → guard `refund_not_eligible`. |
| 8 | Unpaid/cancelled → cancellation/credit path, not cash | **PASS** | engine: `base<=0` (unpaid) ⇒ `unpaid_use_credit` + "Cancel Invoice" alternative; `cancelled` ⇒ `cancelled_use_credit` + "View Invoice". DB base=0 for cancelled/unpaid. |
| 9 | Partially paid refund capped at settled amount | **PASS** | `refundableBase` = `min(paidAmount,total)`; test `full-scope scaling never exceeds remainingRefundable (partially paid)`; engine `scaleAllocation(cap)` only ever shrinks. |
| 10 | Entire-invoice scope shows base/prior/remaining | **PASS** | `eligibility` returns `{base, priorRefunded, remaining}`; `refund-flow.tsx` step 1 renders them; scope radio Entire/Devices/Lines from `buildScopeTree`. |
| 11 | Multi-device invoice shows selectable devices with per-device figures | **PASS** | engine `buildScopeTree` built from `getInvoiceDevices()` (legacy flat + multi-device identical); `allocateScope` per device/line; test `allocation per-line/per-device scope`. |
| 12 | Line-item scope with per-line qty limited by remaining | **PASS** | engine `lineRemainingQty` = `fullQty − lineRefundedQty(succeeded)`; DB `invoice_item_returns_guard` rejects `return_exceeds_qty`; over-refund guard caps money. |
| 13 | Refunding one device leaves others untouched | **PASS** | engine allocates only selected `lineIds`; invoice `total`/`paidAmount`/`items`/`devices` are never written by any refund path (immutability; DB guard locks settled refund money fields). |
| 14 | Full Refund of Selected Scope vs Partial Refund | **PASS** | engine `refund_kind` `full_scope` (scaled to remaining via `scaleAllocation`) vs `partial` (`distributePartial` re-derives net/tax); `refund-flow.tsx` step 2. |
| 15 | Proposed + prior never exceeds eligible | **PASS** | engine client validation mirrors DB; DB `invoice_refunds_guard` INSERT **and** settlement re-check Σ(succeeded,pending,processing)+new ≤ base. |
| 16 | All devices+lines refunded for full remaining → Fully Refunded | **PASS** | engine `refundStatus`: `prior >= base − 0.01` ⇒ `fully_refunded` (money-base test, independent of line arithmetic); test `derived refund status`. |
| 17 | Mandatory reason + optional comment | **PASS** | DB `reason_code NOT NULL` + guard `refund_reason_required` (23514); engine/flow surface reason dropdown + optional comment; `refund_config.reasons`. |
| 18 | Capture method/reference/initiated/approved/processed/notes | **PASS** | DB `invoice_refunds` columns: `method`, `reference`, `initiated_by/at`, `approved_by/at`, `processed_by/at`, `customer_note`, `internal_remark`; server-stamped in guard. |
| 19 | Gateway refund not "succeeded" until confirmed | **PASS** | DB status enum `pending/processing/succeeded/failed/reversed`; `one_open_draft` unique index on in-flight; store `settleRefund` transitions pending→succeeded/failed; only `succeeded` affects balances/loyalty/reports. |
| 20 | Money refund vs item return are separate | **PASS** | separate tables `invoice_refunds` (§2) vs `invoice_item_returns` (§4), linked by nullable `refund_id` (return-first allowed); store `recordItemReturn` never touches money, `processRefund` never touches stock. |
| 21 | Returned part not auto-restocked; disposition-gated | **PASS** | `recordItemReturn` inserts `disposition_status='pending'`, no stock change; stock increases ONLY via `restock_item_return()` for `disposition='restock'`, gated by `returns_restock`/`approve_inventory`/`manage_inventory`. |
| 22 | Customer Return movement at cost, not selling price | **PASS** | DB `restock_item_return` increments `inventory_items.current_stock += return_qty`; valuation uses `unit_cost` (return/item-master cost), **never** `refund_amount`/selling price (table comment + §10 code). |
| 23 | Reports show gross/net/refunds distinctly; no double count; original invoice immutable | **PASS** | `kpis.ts`: `billed/collected/gst` stay gross; `netSales = billed − refundsAgainstFinalized`, `netCollected = collected − refunds`, `netGst = gst − refundTaxFinalized`, only `succeeded` refunds. Print: non-destructive annotation on original (totals never rewritten); Credit Note shows NO CP/labour/profit (`a4-template` shared 8-col table has no cost/profit column; `print-utils` lines 195/207/599). |
| 24 | Fully-paid, full-scope refund of everything → Fully Refunded (`priorRefunded == total == base`) | **PASS** | engine `refundStatus` `prior >= base − PAISA` ⇒ `fully_refunded`; `refundableBase = min(paid,total) = total` when fully paid; test `derived refund status`. |
| 25 | Partially-paid, max refund (`remaining == paidAmount`) → Fully Refunded of settled money (scaled, never over-refund) | **PASS** | `scaleAllocation(cap=remainingRefundable)` scales down so Σ === cap exactly (residual paisa to largest line); `fully_refunded` since `prior == base == min(paid,total)`; test `full-scope scaling never exceeds remainingRefundable`. |
| 26 | Refund on a `partial` (non-finalized) invoice reduces netCollected/cash but NOT revenueWonNet/Net Sales | **PASS** | `kpis.ts`: `refundsAgainstFinalized` filters `isFinalizedParent` = `documentType!=='proforma' && status==='paid'` → excludes `partial`; so `netSales` unchanged, `netCollected = collected − ALL succeeded refunds` reduced. `agent-performance.revenueWonNet` + `leads-data.revenueWonNetForLead` subtract only finalized-parent refunds (same `isFinalizedInvoice` universe) ⇒ a `partial`-parent refund never touches them; `Math.max(0, …)` floors at 0. |
| 27 | Σ(line tax) full scope === invoice.tax; partial scope Σ ≤ tax; ₹0-net ⇒ ₹0 tax | **PASS** | engine `allocateScope`: tax = budget split of `invoice.tax` weighted by net-after-discount, residual paisa to largest line; full-invoice selection ⇒ budget = `invoice.tax` exactly; ₹0-net lines get ₹0 (loop skips when `totalSelectedNet<=0`). Tests `budget-split tax: Σ === invoice.tax exactly` + `partial scope tax ≤ invoice.tax; ₹0-net ⇒ ₹0 tax`. |
| 28 | Two concurrent manual `succeeded` refunds that together exceed balance → second rejected | **PASS** | DB `invoice_refundable_base` does `select … from invoices where id=? for update` — the row lock serializes concurrent guards; the second sees the first's committed Σ(succeeded,pending,processing) and raises `refund_exceeds_balance` (23514). Verified the function + guard compile & execute in the rolled-back live-DB apply. |
| 29 | Double-submitted refund reverses loyalty exactly once | **PASS** | store `reverseLoyaltyForRefund`: in-tab `useRef` single-flight keyed `refundId:direction` + DB partial unique index `loyalty_transactions_one_refund_reversal (source_type,source_id) where type='adjustment' and source_type='refund'` → duplicate insert is 23505, ignored; balance update runs only on `!txError`, so no double-decrement. Index created in the rolled-back apply. |
| 30 | Reverse a refund whose item was already restocked → money freed, loyalty restored, link retained, saleable stock NOT silently changed | **PASS** | store `reverseRefund`: sets `status='reversed'` (never delete), restores loyalty once (`direction=1`, distinct `source_id` `${refundId}:restore`), posts inverse daily-ledger `inflow`, **retains** `invoice_item_returns.refund_id`, does **not** auto-touch stock. A restocked unit is corrected only via a separate authorized `Adjustment`/outward movement (`returns_restock`), never silently. |

**Scenario total: 30 / 30 PASS. 0 FAIL.**

---

## 3. Cross-cutting reconciliation (no double-counting / immutability)

- **Immutability of finalized invoices.** No refund path writes `invoices.total`,
  `paid_amount`, `tax`, `items`, or `devices`. The DB `invoice_refunds_guard`
  additionally locks a settled/failed/reversed refund's own money fields
  (`refund_locked`). Confirmed by code review of `store.tsx` (`processRefund`,
  `settleRefund`, `reverseRefund`, `restockItemReturn` — none touch the invoice
  money fields) and the migration guard.
- **Derived status, never stored editable label.** Both the table column and the
  hero pill compute `refundStatus(invoice, refunds)` at render; there is no
  stored `refund_status` column — the derivation is the single source
  (`invoice-refunds.ts`), shared by table/view/reports.
- **Realized vs reserved.** Reports + derived status use `priorRefunded`
  (`status==='succeeded'` only); the over-refund guard reserves
  `succeeded+pending+processing`. Reversed/failed/pending contribute 0 to
  revenue — no double-counting across the money/report ledgers.
- **Finalized-parent vs partial-invoice revenue treatment.** `Net Sales` /
  `revenueWonNet` / `Net GST` net ONLY finalized-parent refunds (same
  `documentType!=='proforma' && status==='paid'` universe as the gross they net);
  `Net Collected` nets ALL succeeded refunds (cash reality incl. `partial`-invoice
  refunds). The two universes are kept distinct exactly as design §10/§12 requires.
- **Disposition-gated restock at cost.** Saleable stock increments only via the
  atomic `restock_item_return()` for `disposition='restock'` reaching
  `completed`, valued at `unit_cost`. `inspection_required` /
  `damaged_non_saleable` / `do_not_restock` never increase stock.
- **Idempotency.** Daily-ledger projection keyed per `refund_no`; accounting
  journal keyed per refund uuid via a UI seen-set; loyalty reversal keyed per
  `(source_type='refund', source_id)` partial unique index; one-open-draft index
  per invoice; `for update` lock on the over-refund guard.

---

## 4. Fixes applied this gate

**None.** The implementation was already correct and complete against the
approved design and the plan's acceptance gate:
- `npx tsc --noEmit` was clean on first run.
- `npm run build` was clean on first run.
- The pure-engine acceptance tests passed 8/8 on first run.
- `ms:verify` passed 11/0; `ms:security` skipped cleanly.
- Migration `0075` parsed (dry-run) and executed cleanly in a rolled-back
  live-DB transaction (all tables + functions + indexes + RLS valid).
- Permission coverage reconciliation showed 0 group-def keys outside a module
  tier and all 7 new keys wired across union → group-def → matrix tier → CAP →
  RLS.
- All 30 acceptance scenarios reconcile against the invoice / payment / refund /
  inventory / loyalty / report ledgers with no double-counting and with
  finalized-parent vs partial-invoice revenue handled correctly.

No source code was modified by this gate; therefore no new commit was required.
(The only filesystem touch — temporarily copying the gitignored `.env.local`
into the worktree to run the live-DB guard scripts — was removed afterward and
was never tracked by git.)

---

## 5. Verdict

**GATE PASSED (fail-closed criteria met):**
- `npx tsc --noEmit` — CLEAN
- `npm run build` — CLEAN
- Guard scripts — `ms:verify` PASS, `ms:security` clean SKIP, `leads:verify`
  baseline identical to `main` (its 7 failures are pre-existing and provably
  unrelated to Invoice Refunds)
- Pure-engine acceptance tests — 8/8 PASS
- Migration `0075` — valid against the live schema (rolled-back apply)
- Permission coverage — complete (0 missing)
- **All 30 acceptance scenarios — PASS**

The Invoice Refunds feature is validated and ready.
