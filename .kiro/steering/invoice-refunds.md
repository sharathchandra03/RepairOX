# RepairOX — Invoice Refund & Returned Inventory Standard (permanent)

A monetary **Refund** and a physical **Item Return** are SEPARATE, linkable
facts attached to a **FINALIZED invoice**. The finalized invoice is NEVER
mutated — refunds are new, linked, compensating transactions and the refund
STATUS is DERIVED at read time from the persisted refund rows. This is
repository-defined; every future change to refunds, partial refunds, device
returns, returned-inventory restocking, the Credit Note document, or
net-of-refund reporting MUST comply. It reuses — never forks — the existing
invoice store (`useStore()`), the permission system, the `stock_movements` +
`inventory_items` model, the `loyalty_transactions` ledger, the shared A4 print
family, and the two demo ledgers.

**Reference implementations (match these):**
- Migration (tables, sequences, guards, RLS, realtime, restock fn, loyalty
  guard): `app/supabase/migrations/0076_invoice_refunds.sql`.
- Pure engine (eligibility / allocation / derived status): `app/src/lib/invoice-refunds.ts`.
- Types + pill tone/label maps: `app/src/lib/mock-data.ts` (`InvoiceRefund`,
  `InvoiceRefundAllocation`, `InvoiceItemReturn`, `RefundStatus`,
  `REFUND_STATUS_LABEL/TONE`).
- Store actions (DB-first): `app/src/lib/store.tsx` (`processRefund`,
  `settleRefund`, `reverseRefund`, `recordItemReturn`, `restockItemReturn`).
- Refund workflow: `app/src/components/invoice/refund-flow.tsx`.
- View Invoice section: `app/src/components/invoice/refunds-returns-section.tsx`.
- Credit Note document: `CreditNoteA4` in `app/src/components/print/a4-template.tsx`;
  builder `buildCreditNotePrintData` + `buildRefundAnnotation` in
  `app/src/lib/print-utils.ts`; print route `app/src/app/print/[type]/[id]/page.tsx`
  (`type = credit_note`, `id = <invoice_refunds.id uuid>`).
- Accounting-journal projection: `app/src/lib/refund-accounting-emitter.ts`.
- Net reconciliation: `app/src/lib/reports/kpis.ts`, `app/src/lib/agent-performance.ts`,
  `app/src/lib/leads-data.ts` (`revenueWonNetForLead`).
- Settings: `app/src/lib/store-settings.tsx` (`refundConfig`),
  `app/src/app/(app)/settings/invoice/refunds/page.tsx`.
- Permissions: `CAP.invoice.refund*`, `CAP.inventory.return*`,
  `CAP.sensitive.viewProfit` in `app/src/lib/capabilities.ts`.

---

## Permanent rules

1. **The DB refund ledger is the ONE source of financial-reversal truth.**
   `invoice_refunds` (+ `invoice_refund_allocations`, `invoice_item_returns`,
   `invoice_refund_revisions`) in Postgres is authoritative. The two demo
   ledgers (`accounting-service` journal, `daily-ledger-service`) are
   PRESENTATION projections only — never the authority. There is NO second
   refund store and NO stored refund-status label.

2. **Finalized invoices are immutable.** A refund NEVER rewrites the invoice's
   `total` / `paidAmount` / `tax` / `items` / `devices`. A wrong refund is
   corrected via `reverseRefund` (`status='reversed'`, append-only revision) —
   never a delete or an edit. The only invoice-side write permitted is an
   OPTIONAL re-derivable `refundSummary` cache in the existing JSONB `devices`
   envelope.

3. **Refund status is DERIVED, never stored-editable.** `refundStatus(invoice,
   refunds)` in `invoice-refunds.ts` computes `No Refund | Refund Pending |
   Partially Refunded | Fully Refunded | Refund Failed/Reversed` at read time
   from the persisted rows. `fully_refunded ⇔ priorRefunded == refundableBase`
   (±1 paisa) — a money-base test. Rendered as a RepairOX pill
   (`REFUND_STATUS_TONE`), visually + semantically distinct from the financial
   `InvoiceStatus`. One engine; the table, View Invoice and reports all agree.

4. **Eligibility reads REAL money state, not the status label.**
   `refundableBase(invoice) = min(paidAmount, total)`, and `0` for
   proforma/draft/cancelled/unpaid. A proforma/draft is never a cash refund; an
   unpaid/cancelled invoice routes to the cancellation/credit path. The
   remaining refundable = base − Σ succeeded refunds.

5. **Money refund vs physical item return are SEPARATE, linkable workflows.**
   A money refund can exist with no return; an item return can be recorded
   before/without the money refund (`refund_id` nullable). Reversing the money
   refund does NOT auto-reverse a physical return (the part may still be with
   the shop); the `refund_id` link is RETAINED.

6. **Returned inventory is disposition-gated and restocked at COST.** Saleable
   stock increases ONLY when `disposition='restock'` reaches `completed` via the
   atomic `restock_item_return()` DB function (Return `stock_movements` row +
   `current_stock += qty` + return completion, all-or-nothing). Restocked units
   are valued at the item's **cost/valuation** (`unit_cost`), NEVER the
   selling/refund price. `inspection_required` / `damaged_non_saleable` /
   `do_not_restock` never increase saleable stock. Returned qty can never exceed
   invoiced qty − prior accepted returns. A reverse-after-restock correction is
   a SEPARATE authorized `Adjustment` movement + `current_stock -= qty` — never a
   silent stock edit, never a phantom. Invoicing does NOT auto-decrement stock,
   so a return creates a NEW Customer Return inward movement (not a reversal of a
   non-existent decrement).

7. **Permission keys + segregation of duties (UI = server = RLS).** Granular
   keys wired across all five layers with a coarse `manage_refunds` fallback:
   `refunds_view` (invoices·view), `refunds_initiate` (invoices·work),
   `refunds_process` (invoices·manage), `refunds_approve` (invoices·full),
   `returns_accept` (inventory·work), `returns_restock` (inventory·manage),
   `view_profitability` (reports·view). SoD: `initiate ≠ process ≠ approve`,
   `accept ≠ restock`; a user may never approve their own refund when
   `require_approval` is on (DB guard). New keys are OFF by default for existing
   roles (the coarse fallback preserves current access). CAP:
   `CAP.invoice.refundView/refundInitiate/refundProcess/refundApprove`,
   `CAP.inventory.returnAccept/returnRestock`, `CAP.sensitive.viewProfit`.

8. **Net ≠ gross in reports (same-universe nets, no double count).** Gross
   `billed` / `collected` / `gst` / `revenueWon` / `total` / `paidAmount` are
   NEVER mutated (historical integrity). Add net lines on the SAME universe as
   the thing they net: **Net Sales** = `billed − refunds on finalized-parent
   invoices`; **Net Collected** = `collected − all succeeded refunds` (incl.
   partial-invoice refunds); `netRevenue = netCollected − expenses`; **Net GST**
   = `gst − refund tax on finalized parents`. Agent-performance adds
   `revenueWonNet = revenueWon − finalized-parent refunds` while keeping gross
   `revenueWon` unchanged (`revenueWonNetForLead`). A refund on a NON-finalized
   (`partial`) invoice reduces Net Collected but NEVER Net Sales / `revenueWonNet`
   (it was never in gross). Metrics are derived from `invoice_refunds` — never a
   stored counter. The Lead Table **Result** column keeps showing the gross
   finalized invoice total per the lead-workflow-derivation standard; the net is
   a separate reporting metric.

9. **Tax allocation is a provable budget split of `invoice.tax`.** The per-line
   tax share is `invoice.tax` weighted by net-after-discount with the residual
   paisa to the largest line, so Σ(line tax) over a full-invoice scope ===
   `invoice.tax` EXACTLY, a partial scope's Σ ≤ `invoice.tax`, and a ₹0-net scope
   ⇒ ₹0 tax. Never an independent rate multiply. `refund_amount` is gross (net +
   tax); the net/tax split is always derived and persisted.

10. **The Credit Note is a DISTINCT customer-facing document + a non-destructive
    original annotation.** The Credit Note (`type=credit_note`,
    `id=<invoice_refunds.id uuid>`) reuses the shared A4 family (`CreditNoteA4`),
    sourcing company/office/phone from Store Configuration (`buildStoreInfo`) —
    never hard-coded. It shows refunded devices/lines/qty/net/tax, method,
    reference, reason + the original invoice reference, and NEVER cost price /
    labour / profit. The original invoice print carries a non-destructive
    annotation ("PARTIALLY REFUNDED ₹X on DATE (CN-00NN)" / "FULLY REFUNDED") —
    totals untouched. A missing/unauthorized refund id renders the not-found
    block (RLS is the real boundary). Credit Note is A4-only; gated by
    `CAP.invoice.print` + `CAP.invoice.refundView`.

11. **Idempotency guards (the backend is the authority).** A partial unique
    index allows at most ONE in-flight gateway refund per invoice
    (`invoice_refunds_one_open_draft`); the over-refund guard recomputes
    Σ `refund_amount` in `(succeeded,pending,processing)` incl. the new row under
    a `select … for update` row lock on the invoice (serializing concurrent
    manual `succeeded` inserts) and rejects `refund_exceeds_balance` (23514);
    loyalty is reversed exactly once per refund via the refund-scoped
    `loyalty_transactions_one_refund_reversal` unique index
    (`source_type='refund'`, `source_id=<refund uuid>`). The daily-ledger
    projection is idempotent per `refund_no`; the journal projection fires once
    per refund uuid from a UI effect (seen-set), never inside the store action.

12. **Realtime + state.** `WorkSessionProvider`-style — the store subscribes the
    four refund tables to the realtime channel scoped by the active store;
    allocations/returns follow the parent. Refund/return reads are DB-first with
    a localStorage fallback (dual-mode), toast-on-error.

13. **Settings.** `refund_config` (`{ reasons, requireApproval, allowPartial,
    restockDefault }`) on `organization_settings`, parsed like
    `loyalty_config`/`invoicePaymentModes`. The free-text `refundPolicy` is kept
    (it still prints). Refund methods reuse `invoicePaymentModes` — no second
    list. Editable only with `CAP.settings.financial` (view-vs-edit honoured).

### First-implementation limitation (stated)

At most ONE in-flight gateway (`pending`/`processing`) refund per invoice is
intentional for this phase — a second gateway draft is blocked until the first
settles or fails. Manual sequential `succeeded` device refunds are still
allowed (serialized by the `for update` lock, not this index). No live
payment-gateway (PSP) is wired; the lifecycle (`pending/processing/succeeded/
failed/reversed`) + reference field model it. No service-role auto-close /
`status='interrupted'` cleanup job exists yet.

### Procedure for every new/changed refund/return surface
1. Read eligibility + remaining + allocation from `invoice-refunds.ts`; never
   trust the status label; never store a refund status.
2. Write through `useStore()` refund/return actions — never the table ad-hoc;
   the DB guard + RLS are the real boundary.
3. Keep money refund and physical return separate + linkable; restock only via
   the authorized atomic `restock_item_return()` at cost.
4. Gate every control with the CAP keys; keep SoD intact.
5. Keep gross unchanged; add net on the same universe; never double count.
6. Credit Note is A4-only via the shared family; original annotation is
   non-destructive; never show CP/labour/profit on the customer document.
7. Run `npx tsc --noEmit` and `npm run build` before declaring done.

If a refund surface mutates a finalized invoice, stores an editable refund
status, derives durations/eligibility from the status label alone, lets a user
approve their own refund, restocks at selling price or without authorization,
double-counts a refund in gross, ships a CSV-only / hand-rolled Credit Note,
diverges the owner-report-style net math from the same-universe rule, or exposes
an unauthorized refund via the print route, it is non-compliant — fix it to this
standard.
