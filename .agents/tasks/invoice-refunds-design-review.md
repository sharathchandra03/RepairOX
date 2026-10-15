# Design Review — RepairOX Invoice Refunds, Partial Refunds, Device Returns & Financial Reconciliation

**Design reviewed:** `app/.agents/tasks/invoice-refunds-design.md` (revised, §20 claims all prior HIGH/MEDIUM/NIT findings resolved)
**Review type:** Re-review of a revision. Every §20 resolution claim was checked against the actual source in the `invoice-refunds` worktree.
**Verdict:** **APPROVED** — zero HIGH and zero MEDIUM findings. The design is concrete, internally consistent, and implementable end-to-end.

---

## Verdict rationale

This is a revision pass. The prior review raised 11 HIGH/MEDIUM + 2 NIT findings. The design's §20 table claims each is resolved by a concrete decision verified against real source. I independently read the cited source for every load-bearing claim; all are accurate. No new HIGH/MEDIUM gaps were introduced by the revision. The gate blockers called out in the review instructions were each checked and are satisfied (see "Gate blocker checklist" below).

---

## Findings

All findings are NIT. None affects the mechanical verdict (HIGH + MEDIUM = 0 → APPROVED).

1. **NIT — Line/device "refundable value" base not restated in one place.** §5.2 defines `lineRemaining = lineRefundableValue − Σ succeeded alloc`, but `lineRefundableValue` is only defined implicitly through the §5.4 allocation (`round(lineNetAfterDisc) + lineTax`). Where it occurs: §5.2. Concrete fix (optional, implementer-safe): add a one-line definition `lineRefundableValue(L) = round(lineNetAfterDisc(L)) + lineTax(L)` next to §5.2 so the per-line remaining and the §5.4 allocation visibly share one formula. The math is already unambiguous; this is a readability nit.

2. **NIT — `invoice_refunds.branch_id` nullability vs RLS `auth_branch_visible`.** §4.1 declares `branch_id uuid → branches(id) on delete set null`, and §4.5 RLS requires `auth_branch_visible(branch_id)`. If an invoice's branch is ever deleted, `branch_id` becomes null and `auth_branch_visible(null)` behavior is unstated. Where it occurs: §4.1 / §4.5. Concrete fix (optional): state that `auth_branch_visible` treats null as org-wide-visible (matching the existing `lead_deals` pattern the design mirrors) OR that invoice-branch deletion is not expected for finalized invoices. This mirrors existing table behavior and is not a blocker.

---

## Gate blocker checklist (from the review instructions)

| Potential blocker | Status in design | Verified against |
|---|---|---|
| Ambiguous/inconsistent accounting/tax/discount/COGS definitions | **Resolved.** Tax is a budget split of `invoice.tax` weighted by `lineNetAfterDisc` with residual-paisa to the largest line (Σ === `invoice.tax` exactly; ₹0-net ⇒ ₹0 tax). Discount proportional to net share. Returned stock valued at `unit_cost`, never refund/selling price. | §5.4, §4.3, scenario 27 |
| Double-counting in reports | **Resolved.** Gross (`billed`/`collected`/`revenueWon`) is never mutated; Net Sales subtracts only refunds whose parent `isFinalizedInvoice` (same `paid` universe as gross); Net Collected subtracts all succeeded refunds (same cash universe). Ledger projection is explicitly a `Refund` outflow, not a reduction of recorded gross. | §10, §12; `isFinalizedInvoice` at `leads-data.ts:1234` confirmed |
| Any mutation of a finalized invoice | **Resolved.** `total`/`paidAmount`/`tax`/`items`/`devices` never rewritten; only an optional re-derivable cache in the existing JSONB envelope; corrections via `reverseRefund` (append-only), never delete/edit. | NFR-1, §13 |
| Missing idempotency/concurrency/duplicate-submission protection | **Resolved.** `one_open_draft` partial unique index (gateway drafts); over-refund guard recomputes Σ under `select ... for update` row lock on the parent invoice (serializes concurrent manual `succeeded` inserts); loyalty reversal keyed by refund uuid via a dedicated partial unique index; ledger projection idempotent per refund uuid (seen-set + `referenceId`). | §4.1, §4.4, §9.5, §6; scenarios 28/29 |
| RLS/tenancy gaps | **Resolved.** All four new tables org + branch scoped, RLS mirrors `lead_deals` (follows parent invoice visibility + a refunds view key); denormalized `invoice_id`/`organization_id` on child tables for parent-visibility checks; realtime registered. | §4.5, NFR-4 |
| Manually-editable (non-derived) refund status | **Resolved.** Refund status is a read-time fold over persisted `succeeded` records (`invoice-refunds.ts`); never a stored editable label. | NFR-2, §5.5 |
| Money-refund and item-return not modeled as separate linked records | **Resolved.** `invoice_refunds` (money) and `invoice_item_returns` (physical) are distinct tables, linked by nullable `refund_id`; return-first and service-only-refund both supported; reversal retains the link and does not auto-reverse the return. | §4.1, §4.3, §6, FR-16; scenario 30 |
| Restock not gated on authorized disposition | **Resolved.** `restock_item_return()` SECURITY DEFINER function rejects any disposition ≠ `restock`, an already-completed return, or a caller lacking `returns_restock`/`approve_inventory`; Inspection/Damaged/Do-Not-Restock never reach the increment path. | §4.4, §6, FR-18 |
| Permission keys not wired across all layers | **Resolved.** Each new key wired at union + `PERMISSION_GROUPS` + `PERMISSION_MODULES` tier + `CAP` + `requirePermission` + RLS; coverage check noted; `view_profitability` placed in the reports **view** tier (not invoices Manage) next to `view_profit_margin`. | §9; `permission-levels.ts` reports view tier confirmed |
| Unresolved open questions left for the implementer | **None.** Grep for TODO/TBD/open-question/unresolved found zero matches. The one-pending-gateway-refund-per-invoice constraint is a stated deliberate limitation, not an open question. | §4.1, §20 |

---

## Verified Assumptions (checked against source)

1. **Loyalty idempotency facts (§9.5, Finding 1/6).** `0032_loyalty_ledger.sql`: `source_type check (source_type in ('invoice','adjustment','admin'))` (line 57) and `loyalty_transactions_one_earn_per_source ... where type = 'earn' and source_id is not null` (lines ~72–76). CONFIRMED — the existing index does NOT cover reversal rows, and the CHECK would reject a `'refund'` source, so the design's new CHECK-alter + refund-scoped partial unique index is necessary and correctly specified.
2. **Restock is net-new logic (§6, Finding 2).** `store.tsx` `addStockMovement` (line 2838) only inserts the `stock_movements` row and prepends state — it never mutates `inventory_items.current_stock`. `updateInventoryItem` (line 2857) DOES write `current_stock` (`row.current_stock = updates.currentStock`). CONFIRMED — the explicit atomic `restock_item_return()` function (movement insert + `current_stock += qty` + return update) is correctly identified as new logic.
3. **StockMovement field shape (§4.3, Finding 4).** `inventory-data.ts:201` (type decl line 186): `StockMovement = { docNumber, fromStore, toStore, items, date, user, type, status }` — no `sku`, no `unit_cost`, no source-reference. `MovementType` includes `"Return"`. CONFIRMED — the field-division decision (item/cost/link on the return record; qty/stores/actor on the movement) is sound; `type: "Return"` is a valid movement type.
4. **Ledger projection mechanism (§6, Finding 3).** `daily-ledger-service.ts` exports a module-level `recordTransaction(input)` (~line 544). `expense-accounting-emitter.ts` defines `AccountingBridge = { addEntry, reverseEntry, getEntriesByReference }` and `recordExpenseInDailyLedger` calls the module-level `recordTransaction`. `providers.tsx` mounts `AccountingProvider` (line ~32), nested inside `StoreProvider`. CONFIRMED — the projection can run from a UI effect that consumes both `useStore()` and `useLedger()`; no React hook is called from inside a store `useCallback`.
5. **Net-revenue same-universe rule (§10/§12, Finding 5).** `isFinalizedInvoice` (`leads-data.ts:1234`) = `(documentType ?? "invoice") !== "proforma" && status === "paid"`. CONFIRMED — `revenueWon` counts only `paid` invoices, so subtracting only refunds whose parent `isFinalizedInvoice` keeps gross and net on the same universe and prevents `revenueWonNet` going negative/below correct.
6. **Daily ledger already models Refund (§0.3).** `daily-ledger-service.ts`: `TransactionModule` includes `"Refund"`, `TransactionCategory` includes `"Refund"`, color `"orange"`. CONFIRMED.
7. **Invoices Full tier + reports view tier (§9, Finding 13).** `permission-levels.ts`: invoices Full tier includes `manage_refunds`, `void_payment`, `reconcile_payment` (line 107); reports module `view` tier includes `view_profit_margin`, `view_revenue_totals` (the money-sensitive opt-in slot). CONFIRMED — placing `view_profitability` in the reports view tier (not invoices Manage) is correct.
8. **Print route contract (§8, Finding 10).** `print/[type]/[id]/page.tsx`: resolves records via `useParams` + `records.find(x => x.id === docId)` from `useStore()`, returns `null` → not-found block; `FormatSelector` has an `a4Only` branch. CONFIRMED — the `[type]='credit_note'`, `[id]=<invoice_refunds.id uuid>`, loader-finds-refund-and-allocations-and-parent-invoice design is implementable; A4-only addition is consistent with the existing pattern.
9. **Invoice/device model (§0.1).** `mock-data.ts`: `InvoiceDeviceRecord` with `repairCost?`, `parts: InvoiceLineItem[]`; `getInvoiceDevices(invoice)` (line 1234) returns `devices[]` or wraps flat `items` into one synthetic device. CONFIRMED — building the scope tree from `getInvoiceDevices()` makes flat and multi-device invoices behave identically.
10. **Provider nesting (§6).** `providers.tsx`: `StoreProvider` → `StoreSettingsProvider` → `CatalogProvider` → `AccountingProvider` → `LeadsProvider` … CONFIRMED — a component in the tree can consume both `useStore()` and `useLedger()`, so the emitter-effect approach is feasible.

## Unverified / Wrong Assumptions

None. Every source-citing claim in the design's §20 resolution table and §0 audit that I spot-checked was accurate. No claim was found to be wrong or unverifiable.

(Not independently re-derived, but internally consistent and not source-dependent: the exact SQL text of the new guard/sequence/revision functions in `0075` — these follow the cited `0063_lead_deals.sql` pattern and the design specifies their behavior precisely; the pure allocation/rounding math in `invoice-refunds.ts` — specified as formulas with a provable residual-paisa invariant and covered by the §16 unit-test plan.)

---

## Summary

The revision genuinely closed every prior finding with decisions grounded in correctly-read source, not hand-waving. The accounting model keeps gross immutable and net derived; tax/discount allocation is a provable budget split; money refunds and physical returns are separate linked records; restock is disposition- and permission-gated through an atomic DB function; idempotency and concurrency are protected by a unique index plus a `for update` row lock; loyalty reversal has a dedicated once-only guard; permissions are wired across all layers; and reports gain net-of-refund metrics on matched universes with no double counting. The two remaining NITs are readability/edge-case clarifications that do not block implementation.

**APPROVED.**
