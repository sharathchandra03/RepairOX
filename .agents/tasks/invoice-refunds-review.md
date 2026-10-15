# Invoice Refunds — Implementation Review

Reviewing the committed work on `invoice-refunds` (`37aae8a..19481ff`, 4 feature
commits + verification docs) against the approved design and plan. The feature
code is fully committed; the only uncommitted files are the task docs
themselves.

The implementation lands a complete, transactional refund + device-return +
reconciliation subsystem: a 903-line DB migration (`0076_invoice_refunds.sql`),
a 448-line pure engine (`invoice-refunds.ts` + tests), ~700 lines of DB-first
store actions, a 5-step `RoxCenteredForm` flow, invoice-table + view-invoice
entry points, a Credit Note print document, net-of-refund reports, 5-layer
permissions, and a steering file. It tracks the revised design (post design
review) closely, including every HIGH/MEDIUM/NIT fix the design called out.

**Watch for:** nothing blocking. The guard suites (`ms:verify`/`ms:security`)
could not execute here (no `.env.local`/Supabase in the environment) — this is
documented in the verification evidence and backed by a clean `tsc`, a clean
`build`, 8/8 engine tests, and a hand cross-check of RLS arrays vs CAP arrays.
Per the review instructions, missing-entirely evidence would warrant rejection,
but the evidence is present and the one unrunnable suite is an environment
constraint, not a code gap.

**Verdict**: APPROVED

## High-level view

Finalized invoices are never mutated. The refund actions in `store.tsx` only
ever insert into `invoice_refunds` / `invoice_refund_allocations` /
`invoice_item_returns`; a grep across the refund action bodies finds no
`invoices.update`, no `paid_amount`/`total` write, and no `updateInvoice` call.
Invoice-level derived figures (refunded, net received) are computed, never
written back.

Refund status is derived, not stored. `refundStatus(invoice, refunds)` in the
pure engine folds the persisted refund rows at read time; there is no editable
status label on the invoice. The migration comment and the steering file both
state this as the contract, and the table/hero/reports all consume the one
engine.

Allocation is provably budget-bounded. Tax is a budget split of `invoice.tax`
weighted by net-after-discount, with the residual paisa pushed to the largest
line and an explicit `isFullInvoice` branch that pins the full-scope budget to
`invoice.tax` exactly; a ₹0-net scope yields ₹0 tax. The over-refund guard sums
`status in (succeeded,pending,processing)` including the new row against
`invoice_refundable_base()`, which takes a `for update` row lock on the invoice
so two concurrent manual `succeeded` inserts serialize.

Restock is disposition-gated and atomic. `restock_item_return()` (SECURITY
DEFINER) rejects any disposition other than `restock`, an already-completed
return, a non-positive qty, and a caller lacking the restock capability; only
then does it insert the `Return` stock movement, bump `current_stock`, and mark
the return completed in one transaction. The money refund and the physical
return are separate linked rows (`invoice_item_returns.refund_id` is nullable).

Reports net without double-counting. `netSales = billed − finalized-parent
refunds` (same universe as billed), `netCollected = collected − all succeeded
refunds`, and `revenueWonNet` subtracts only finalized-parent refunds from
gross `revenueWon`. Gross `billed/collected/gst/revenueWon` stay untouched.

Idempotency and permissions are wired as designed. The one-open-draft partial
unique index, the loyalty one-refund-reversal partial unique index (with the
`source_type` CHECK widened to include `'refund'`), and the per-org sequence
RPCs are all present. The four refund keys + two return keys +
`view_profitability` are wired across union → PERMISSION_GROUPS →
PERMISSION_MODULES → CAP → RLS, with segregation of duties and a self-approval
block in the guard. The Credit Note print contract is `[type]=credit_note`,
`[id]=invoice_refunds.id` with a gated not-found fallback.

<details>
<summary>Issues (0 blocking, 2 informational)</summary>

1. **Guard suites not executed (informational)** — `ms:verify`/`ms:security`/`leads:verify` are live-Supabase scripts and no `.env.local` exists in the worktree; the coder recorded this constraint and cross-checked RLS vs CAP arrays by hand. Re-run against a provisioned instance before production. Not blocking per the review instructions (evidence is present, not missing).
2. **One-in-flight-gateway-draft limitation (informational, by design)** — the `invoice_refunds_one_open_draft` index blocks a second `pending/processing` draft per invoice; this is a deliberate, documented first-implementation limitation (design §4.1), not a defect.

</details>

<details>
<summary>Details</summary>

### 1. Finalized invoices are never mutated (confirmed)

`processRefund`, `settleRefund`, `reverseRefund`, `recordItemReturn`, and
`restockItemReturn` were read in full (`store.tsx` ~2980–3400). None writes to
the `invoices` table or calls `updateInvoice`; a targeted grep over the refund
action bodies for `invoices").update`, `paid_amount`, `.total =`, and
`updateInvoice` returns nothing. The invoice's `total`, `paidAmount`, `tax`,
`items`, and `devices` are read-only inputs to the engine. The migration adds no
`alter table invoices` beyond leaving it entirely untouched — invoice-level
derived figures live in computation and (optionally) the existing JSONB
envelope, consistent with NFR-1.

The guard additionally locks a settled refund's own money fields: on UPDATE,
when `old.status in (succeeded,failed,reversed)` and any of
`refund_amount/net/tax` changes, it raises `refund_locked` (23514). So even the
refund rows are immutable once terminal.

### 2. Refund status is derived, never a stored editable label (confirmed)

`refundStatus(invoice, refunds)` computes the status from the fold of persisted
refund rows:

```
succeeded.length === 0 && anyFailedOrReversed → refund_failed_reversed
succeeded.length === 0 && anyPendingOrProcessing → refund_pending
prior <= 0 → no_refund
prior >= base − PAISA → fully_refunded
→ partially_refunded
```

The failed/reversed branch is checked before pending/processing (the §5.5 nit
fix, commit `19481ff`), and both require zero succeeded rows, so a succeeded
refund always dominates. `fully_refunded` is a money-base test
(`priorRefunded >= refundableBase ±1 paisa`), independent of line-sum
arithmetic, matching the design's resolution of Finding 9. No `invoice_refunds`
column stores the derived status; the table cell, hero pill, and reports all
call this one function.

### 3. Allocation-awareness: per-device/line, provable tax budget split, locked over-refund guard (confirmed)

`allocateScope()` builds the device/line tree from `getInvoiceDevices()` (so
flat legacy and multi-device invoices behave identically), computes
net-after-discount per selected line against the invoice's proportional
`discountFactor`, then allocates tax as a **budget split of `invoice.tax`**
weighted by net-after-discount — never an independent rate multiply. The
residual paisa is assigned to the largest-net line, and an explicit
`isFullInvoice` check pins the full-scope budget to `invoice.tax` exactly. A
`totalSelectedNet === 0` (fully discounted / ₹0-net) scope allocates zero tax.
Engine test #4 asserts Σ(line tax) over the full invoice === `invoice.tax`
exactly, and #5 asserts partial-scope tax ≤ `invoice.tax` and ₹0-net ⇒ ₹0 tax.

The over-refund guard (`invoice_refunds_guard`, both INSERT and the settle
transition) recomputes `Σ refund_amount where status in
(succeeded,pending,processing)` for the invoice, **including the new row**, and
rejects with `refund_exceeds_balance` (23514) when it exceeds
`invoice_refundable_base(invoice_id) + 0.01`. `invoice_refundable_base()` does
`select ... from invoices where id = ? for update`, so two concurrent manual
`succeeded` inserts serialize — the second sees the first's committed sum and is
rejected. `failed`/`reversed` rows are excluded, freeing their reservation. The
realized set (succeeded-only, used by reports/status) and the guard set
(succeeded+in-flight) are kept distinct exactly as §4.1 specifies.

### 4. Disposition-gated restock, money ≠ physical return (confirmed)

`restock_item_return(return_id)` is a single SECURITY DEFINER function that, in
one transaction, rejects any `disposition <> 'restock'`
(`return_not_restockable`), an already-`completed` return
(`return_already_restocked`), a non-positive qty, and (for end users) a caller
lacking `returns_restock`/`approve_inventory`/`manage_inventory`. Only after
those checks does it insert the `Return` `stock_movements` row, run
`current_stock = current_stock + return_qty`, and set the return
`completed`/`stock_movement_ref`/`restocked_by`/`restocked_at`. The store action
`restockItemReturn` invokes this RPC (not the state-only `addStockMovement`),
and inspection/damaged/do-not-restock dispositions never reach it. The restock
is valued at `unit_cost` on the return record, never `refund_amount`.

Money and physical return are separate linked records: `invoice_item_returns`
has a nullable `refund_id` (return-first allowed), and `recordItemReturn` never
touches stock. The qty-over-return guard rejects `return_qty` beyond invoiced
qty (read from the invoice JSONB via `invoice_line_qty`) minus prior returns
(`return_exceeds_qty`).

### 5. No double-counting in reports (confirmed)

`kpis.ts computeCore` subtracts only finalized-parent refunds from `billed`
(`netSales`, same `status==='paid'` non-proforma universe as `billed`) and all
succeeded refunds from `collected` (`netCollected`, the real cash universe).
`netGst` subtracts only finalized-parent `refund_tax`. Gross `billed`,
`collected`, `gst` are unchanged; `netRevenue` is rebased on `netCollected −
expenses` (design §10). `agent-performance.ts` adds `revenueWonNet` =
`revenueWon − attributableRefunds`, where `revenueWonNetForLead` subtracts only
succeeded refunds whose parent `isFinalizedInvoice` and is reachable from the
lead's finalized ticket/invoice links, clamped `Math.max(0, Math.min(gross,
net))` and falling back to gross when no refund data is supplied. A
partial-invoice refund never touches `netSales`/`revenueWonNet` — only
`netCollected`.

### 6. Idempotency / concurrency guards (confirmed)

- `invoice_refunds_one_open_draft` partial unique index on `(invoice_id) where
  status in (pending,processing)` — blocks a duplicate in-flight gateway draft.
- The `for update` lock in `invoice_refundable_base()` serializes concurrent
  manual `succeeded` inserts (a unique index alone cannot, since two distinct
  valid `succeeded` rows don't collide).
- `loyalty_transactions_one_refund_reversal` partial unique index on
  `(source_type, source_id) where type='adjustment' and source_type='refund'`,
  with the `source_type` CHECK widened to include `'refund'`. The reversal row
  is keyed on the refund uuid; the restore row uses `${refundId}:restore` so the
  two never collide. The store ignores `23505` so a double-submit is a no-op.
- `next_refund_id`/`next_item_return_id` per-org sequence RPCs mirror the
  `0063_lead_deals` pattern (`refund_sequences` + `for update`).

### 7. RLS + 5-layer permission wiring + SoD (confirmed)

The four refund keys (`refunds_view/initiate/process/approve`), two return keys
(`returns_accept/restock`), and `view_profitability` are present in the
`PermissionKey` union and `PERMISSION_GROUPS` defs (`permissions.ts`), placed in
the correct `PERMISSION_MODULES` tiers (`permission-levels.ts`: refunds_view→
invoices view, initiate→work, process→manage, approve→full; returns_accept→
inventory work, restock→manage; view_profitability→reports **view** tier beside
`view_profit_margin`, NOT the invoices tier), given granular-first + coarse CAP
entries (`capabilities.ts`), and enforced in the migration RLS via
`auth_has_any([...])`. The RLS arrays match the CAP fallback arrays by hand
inspection (CAP ↔ RLS lockstep).

Segregation of duties is enforced in `invoice_refunds_guard`: INSERT needs
initiate/process/manage; the `succeeded` transition needs process/manage; a
`reversed` transition needs approve/manage; and setting `approved_by` is blocked
when `new.initiated_by = v_me` (`refund_self_approval_forbidden`, 42501) and
otherwise requires approve/manage. No delete policy exists (refunds are reversed,
never deleted). Visibility follows the parent invoice via org + branch + a
view-key array, mirroring `lead_deals`.

### 8. Non-destructive original annotation + Credit Note print contract (confirmed)

The print route resolves `credit_note` with `[id] = invoice_refunds.id` (uuid):
it finds the refund, loads its allocations and the parent invoice, gates on
`CAP.invoice.refundView && CAP.invoice.print`, and renders the standard
"Document Not Found" block for a missing/unauthorized id. The original invoice
print receives a non-destructive annotation string (`buildRefundAnnotation`
passed as a separate param to `buildInvoicePrintData`) — the invoice content and
totals are never rewritten. Credit Note is A4-only (added to the `a4Only` set).

### Verification evidence (read, not re-run)

Per the review instructions the suites were not re-executed. The recorded
evidence (`invoice-refunds-verification.md`) shows `npx tsc --noEmit` clean,
`npx tsx --test src/lib/invoice-refunds.test.ts` 8/8 pass, and `npm run build`
compiled successfully. The guard suites are live-DB scripts that fail at
`.env.local` lookup in this environment; the coder documented the constraint and
cross-checked the RLS/CAP arrays statically. No specific articulable doubt
remained that warranted a spot re-run; the one targeted grep used above (no
invoice mutation in the refund path) corroborates the immutability claim.

</details>

<details>
<summary>File map</summary>

- `supabase/migrations/0076_invoice_refunds.sql` — tables, sequences, guards, restock fn, loyalty guard, RLS, realtime.
- `src/lib/invoice-refunds.ts` (+ `.test.ts`) — pure eligibility/allocation/status engine.
- `src/lib/mock-data.ts` — refund/return types, `RefundStatus`, label/tone maps.
- `src/lib/store.tsx` — DB-first refund/return actions, loyalty reversal, ledger projection.
- `src/components/invoice/refund-flow.tsx` — 5-step RoxCenteredForm flow.
- `src/components/invoice/refunds-returns-section.tsx` — View Invoice section.
- `src/app/(app)/invoice/page.tsx`, `invoice/[id]/page.tsx` — entry points + derived status.
- `src/app/(app)/invoice/refunds/page.tsx` — refunds list.
- `src/app/print/[type]/[id]/page.tsx`, `src/components/print/a4-template.tsx`, `src/lib/print-utils.ts` — Credit Note + annotation.
- `src/lib/reports/kpis.ts`, `agent-performance.ts`, `leads-data.ts` — net-of-refund metrics.
- `src/lib/permissions.ts`, `permission-levels.ts`, `capabilities.ts` — 5-layer keys.
- `src/lib/store-settings.tsx`, `settings-nav.tsx` — refund_config.
- `src/lib/refund-accounting-emitter.ts` — journal projection.
- `.kiro/steering/invoice-refunds.md` — steering standard.
- Full diff: `git -C <worktree> diff 37aae8a HEAD`.

</details>
