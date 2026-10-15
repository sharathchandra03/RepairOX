# RepairOX — Invoice Refunds, Partial Refunds, Device Returns & Financial Reconciliation

**Artifact:** Requirements + Technical Design (authoritative — **revised after design review**, see §20)
**Worktree:** `app/.worktrees/invoice-refunds` (the Next.js app repo; the orchestrator's `.worktrees/invoice-refunds/app` path is a symlink to it)
**Next migration number:** `0075`
**Status:** revised to resolve all HIGH/MEDIUM (and both NIT) review findings → ready for re-review → implementation

---

## 0. Audit summary — what already exists (and the critical constraints it imposes)

This feature is a transactional accounting subsystem. The audit below is the foundation; every design decision reuses these anchors rather than forking a competing data source.

### 0.1 The Invoice model (`src/lib/mock-data.ts`)
- `Invoice` (type ~line 1250) carries: `id` (text PK), `branchId`, `customerId`/`customer`/`phone`/`email`, `status: InvoiceStatus` (`draft | sent | paid | partial | overdue | cancelled`), `total`, `subtotal`, `discount`, `tax`, `sgst/cgst/sgstRate/cgstRate/gstRate`, `paidAmount`, `paymentMode`, `ticketId`/`sourceTicketId`, `documentType` (`invoice | proforma`), `proformaStatus`, `items: InvoiceLineItem[]` (legacy flat) and `devices?: InvoiceDeviceRecord[]` (multi-device).
- **There is NO `payments[]` array.** Payment state is the scalar `paidAmount` + `paymentMode` + the derived `status`. The refund model must therefore read actual money state from `(total, paidAmount, status, documentType)` — never from a non-existent payment ledger, and never trust the `status` label alone (spec §2).
- `InvoiceDeviceRecord` (type ~line 1089): `id`, `ticketDeviceId` (durable device→invoice link), `brand/model`, `estimateValue`, `repairCost`, `parts: InvoiceLineItem[]`, `subtotal`. **Device net = `repairCost` + Σ(parts) with device-proportional discount/tax allocation** — there is no stored per-device tax/discount, so allocation must be computed (see §6).
- `InvoiceLineItem` (type ~line 1064): `id`, `sku?`, `name`, `qty`, `price`, `discount`, `total`. The `sku` is the inventory-item link (reuse per `inventory-vs-invoice-line` steering: a line **references** an inventory item, it is not the master).
- `getInvoiceDevices(invoice)` (~line 1234) is the canonical accessor — returns `devices[]`, or wraps legacy flat `items` into one synthetic device. **The refund scope UI MUST build its device/line tree from `getInvoiceDevices()`** so legacy flat invoices and multi-device invoices behave identically.
- `getDocumentType()` / `isProforma()` (~line 980) are the authoritative document-type predicates. A proforma is never revenue and never refundable.
- `isFinalizedInvoice(inv)` in `src/lib/leads-data.ts` (~line 1234) = `documentType !== "proforma" && status === "paid"`. This is the revenue gate reused across Leads/Agent Performance.

### 0.2 The Invoice write path (`src/lib/store.tsx`) — the single source of truth
- `rowToInvoice` (~line 294) / `invoiceToRow` (~line 350): **document-type + lineage + GST metadata are packed into the JSONB `devices` envelope** (`{ records: [...], repairStatus, paymentMode, documentType, ... }`) to avoid DB migrations for additive invoice-level fields. This is the established extension pattern.
- `addInvoice` (~line 2294), `updateInvoice` (~line 2447), `deleteInvoice` (~line 2591, soft delete), `convertProformaToInvoice` (~line 2613).
- `awardLoyaltyForPaidInvoice` (~line 2154): on a paid invoice, writes `loyalty_transactions` (type `earn`, `source_id = invoiceId`, protected by a partial unique index) and bumps `customers.lifetime_value`/`total_invoices`. **A refund must reverse loyalty** proportionally (see §9.5).
- `syncTicketStatusFromInvoice` (~line 2049): invoice↔ticket status sync.
- `addStockMovement` (~line 2838): writes `stock_movements`. **Invoicing does NOT currently decrement inventory stock** — stock movements are a separate manual module. The refund feature therefore does not "reverse an invoice decrement" (there is none); a device return creates a *new, distinct* `Customer Return` inward movement only when authorized (spec §6, §7).
- Pattern to mirror: DB-first write → `rowToX(res.data)` → `setState` → `logActivity` → realtime subscription reconciles. Toast on error. `withStore()` stamps `branch_id`. `shouldUseDb()` gates DB vs local/demo.

### 0.3 Accounting / ledger (reuse, do NOT fork)
- `src/lib/accounting-service.tsx` — `useLedger()`, `LedgerEntryType` **already includes `refund`**, `reverseEntry(id)`. **localStorage-only, demo-seeded.** It is a *presentation/journal view*, not the authoritative financial store.
- `src/lib/daily-ledger-service.ts` — `useDailyLedger()`, `recordTransaction()`, `TransactionModule`/`TransactionCategory` **already include `Refund`** with `direction: "outflow"`, `colorCode: "orange"`. Also localStorage/demo singleton.
- **Critical finding:** neither ledger is DB-backed or the source of truth. The authoritative financial state lives on the **invoice records in Postgres**. Therefore refund amounts are persisted in a new **DB-backed refund ledger** (migration 0075); the two demo ledgers are *projected into* via their existing `refund` type/`Refund` module for UI continuity, but are never the financial authority.

### 0.4 Reports / revenue (the reconciliation points)
- `src/lib/reports/kpis.ts` `computeCore`: `billed = Σ total` (live, non-proforma, non-cancelled); `collected = Σ paidAmount`; `gst = Σ tax`; `pending = billed − collected`; `netRevenue = collected − expenses`; `grossMargin`, `dailyAvgRevenue`, projections all derive from these.
- `src/lib/agent-performance.ts`: `revenueWon` = Σ **finalized invoice `total`** via `revenueWonForLead` / `isFinalizedInvoice`.
- **Refunds must introduce NET metrics that subtract refunds from gross, WITHOUT mutating `total`/`paidAmount`.** `total` and `paidAmount` stay the immutable historical gross (spec §12, §13).

### 0.5 Permissions (`permissions.ts` / `permission-levels.ts` / `capabilities.ts`)
- Already present keys: `manage_refunds`, `manage_payments`, `void_payment`, `reconcile_payment` (invoices module); `adjust_stock`, `stock_movement`, `approve_inventory` (inventory module); `view_profit_margin`/`view_financial_reports` (sensitive).
- `permission-levels.ts` invoices module: **Full tier already lists** `manage_refunds`, `void_payment`, `reconcile_payment`. Inventory `manage` tier lists `approve_inventory`.
- `CAP.invoice.*`, `CAP.inventory.*`, `CAP.recordScope.invoicesViewAll` in `capabilities.ts`.
- RLS helpers available (from migrations): `auth_has_any`, `auth_branch_visible`, `auth_member_of_org`, `auth_org_id`, `auth_branch_id`, `auth_staff_id`, `auth_store_ids`, `auth_can_cross_branch`.

### 0.6 Printing
- `src/lib/print-utils.ts`: `PrintDocumentType = "ticket" | "invoice" | "quotation" | "diagnostic"`; `buildInvoicePrintData`, `buildInvoiceInfo`, `buildCustomerFromInvoice`, `buildStoreInfo`.
- `src/components/print/a4-template.tsx`: shared A4 family (`BRAND` palette, header + number pill + barcode, item table, totals box, footer). `QuotationA4` is the reference for adding a *new document type* in the same family.
- Print route `src/app/print/[type]/[id]/page.tsx` switches on `docType`. `src/lib/pdf-generator.ts` for PDF.

### 0.7 Settings
- `store-settings.tsx`: `refundPolicy` is a **free-text string** (print footer only), `invoicePaymentModes: string[]` (reusable payment-method list: `cash, upi, bank_transfer, card, cheque, wallet, other`). No structured refund rules exist today → the feature adds a small structured `refund_config` (see §11).

**No existing credit-note / refund-record / item-return table exists** (grep confirmed). → migration `0075` creates them.

---

## 1. Requirements

### 1.1 Summary
Add a complete, transactional **Refund + Device Return + Financial Reconciliation** capability to the Invoice module. A user with permission can process a monetary refund against a finalized invoice — for the whole invoice, selected devices, or selected line items — up to the invoice's **actual** refundable balance derived from real payment state. Physical item returns are modeled and tracked **independently** from money refunds (a service refund has no return; a returned item may await inspection before refund), with disposition-gated inventory restocking. Finalized invoices are **never mutated**; refund status is **derived** from persisted refund records; all reports gain **net-of-refund** metrics without changing historical gross figures. Everything reuses the existing invoice store, permission system, inventory movement model, print family, and ledger types.

### 1.2 Functional Requirements

**Entry points (§1)**
- FR-1. A **Process Refund** action appears in: (a) the Invoice Table row overflow `Dropdown`/`MenuItem`; (b) View Invoice → Quick Actions; and is suppressed everywhere the invoice is ineligible or the user lacks permission. It uses existing RepairOX button/menu styling and is NOT redundantly duplicated across every surface.
- FR-2. Clicking Process Refund opens a focused in-context refund workflow (a centered multi-step flow), never a navigation that loses context.

**Eligibility (§2)**
- FR-3. Eligibility is computed from **actual financial/payment state** `(documentType, status, total, paidAmount, settledRefundableBase, priorRefunds)` — never the status label alone.
- FR-4. A **proforma or draft** invoice can NEVER create a monetary refund. **Unpaid / cancelled** invoices route to the existing cancellation/credit path, not a cash refund. A **partially paid** invoice caps the monetary refund at the eligible settled amount. A **fully refunded** invoice is blocked; a **partially refunded** invoice allows a further refund only up to the remaining refundable balance.
- FR-5. When ineligible, the UI explains why and offers the authorized alternative (Cancel Invoice / adjust payment) where one exists.

**Refund scope (§3)**
- FR-6. Scope selection supports **Entire Invoice**, **Selected Devices**, and **Selected Line Items (with quantities)**, built from `getInvoiceDevices()` so flat and multi-device invoices behave identically.
- FR-7. Each scope row shows: original eligible amount, previously refunded, remaining eligible, and (for devices/lines) model + ticket/device reference, quantity, net, tax share. Refunding one device/line never alters the value of unrelated devices/lines.
- FR-8. A line cannot be refunded beyond its remaining refundable quantity/value after prior returns/refunds. Device→line associations are preserved.

**Full vs partial (§4)**
- FR-9. After scope, offer **Full Refund of Selected Scope** (remaining eligible for the scope) or **Partial Refund** (a smaller amount with explicit allocation to devices/lines).
- FR-10. The confirmation screen shows: original invoiced, previous refunds, current proposed refund, remaining refundable, tax/discount allocation, reason, method, reference.
- FR-11. The proposed refund + all prior successful refunds can **never exceed** the eligible refundable amount (validated client-side AND in the DB guard).
- FR-12. Refunding the entire remaining eligible balance across all devices/lines **derives** Fully Refunded; refunding one device of a multi-device invoice derives Partially Refunded.

**Reasons + payment detail (§5)**
- FR-13. A refund reason is required, chosen from a configurable/existing reason list, with an optional comment. Default reasons: Customer requested, Part defective, Wrong part supplied, Repair unsuccessful, Duplicate charge, Service not delivered, Other.
- FR-14. Capture: refund date/time, initiated-by, approved-by (if the workflow requires approval), processed-by, method (from `invoicePaymentModes`), reference/transaction id, customer-facing note, internal remark, related invoice + device/line allocations.
- FR-15. A gateway refund is NOT marked successful until confirmed; support `pending | processing | succeeded | failed | reversed` where integrations require them. Manual refunds record an authorized confirmation + reference.

**Money vs item return (§6)**
- FR-16. Refund Transaction (money) and Item Return (physical) are **separate linked** records. A money refund can exist with no return; an item return can exist before/without the money refund being paid.
- FR-17. Per selected item the return workflow captures: returned (Y/N), condition (Uninspected / Good / Damaged / Defective / Other), inventory disposition (Restock / Inspection Required / Damaged-Non-saleable / Do Not Restock), returned quantity, receiving store/location, inspection notes.
- FR-18. Stock movements are created only when an authorized restock/receipt is confirmed; not every returned part re-enters saleable stock.

**Inventory (§7)**
- FR-19. A return links to the original invoice line, inventory item (`sku`), device, and the refund/return record.
- FR-20. Returned quantity can never exceed invoiced quantity minus previously accepted returns.
- FR-21. A distinct **Customer Return** stock movement is recorded on restock. **Division of fields (verified against the real `StockMovement` type, `inventory-data.ts:201` = `{docNumber, fromStore, toStore, items, date, user, type, status}` — it has NO sku/item id, NO unit_cost, NO source-reference field):** the `stock_movements` row carries ONLY qty (`items`), the stores (`fromStore`/`toStore`), `date`, actor (`user`), `type: "Return"`, and `docNumber`. The **item (`sku`), the cost/valuation (`unit_cost`), and the link back to the refund/return (`refund_id`/`return_no`)** live on the `invoice_item_returns` record, which stores the movement's `docNumber` in `stock_movement_ref`. The return record is therefore the authoritative item+cost ledger for the return; the stock movement is only the quantity/stores/actor movement row. Extending the `StockMovement`/`stock_movements` shape to carry per-item cost is **out of scope** (left to the sibling `inventory-costing-redesign` worktree, §19.5). Saleable stock increases **only** on Restock disposition; Inspection/Damaged dispositions do not increase saleable stock. Returned stock is valued at the item's **cost/valuation** (`unit_cost` on the return record), never the customer selling/refund price. No unrelated movements are duplicated or reversed; purchase-cost history is untouched. Service-only refunds create no stock movement.

**Data model + auditability (§8)**
- FR-22. Reuse existing refund/credit/reversal structures where present; where none exists, create new normalized tables (migration 0075): refund record + refund allocations + item-return records, with full audit (who/when/what, append-only revisions).

**Derived status / immutability / idempotency / permissions / printing / reports** — captured as NFRs + acceptance criteria below (spec §9–§18).

### 1.3 Non-Functional Requirements
- NFR-1. **Immutability:** a finalized invoice's `total`, `paidAmount`, `tax`, `items`, `devices` are never rewritten by a refund; corrections use compensating refund records / reversals, never silent delete/edit (spec §12).
- NFR-2. **Derived status:** refund status (`No Refund | Refund Pending | Partially Refunded | Fully Refunded | Refund Failed/Reversed`) is computed at read time from persisted successful refund records — never a manually editable stored label (spec §9).
- NFR-3. **Idempotency:** duplicate-click / concurrent-submission / two-tab protection via DB guard revalidation + a unique index (one open refund-draft per invoice, and over-refund rejection in the same transaction).
- NFR-4. **Tenancy + RLS:** every new table is org + branch scoped; UI = server = RLS all agree; refund visibility follows the parent invoice's visibility + a refunds view key.
- NFR-5. **Segregation of duties:** initiate ≠ approve ≠ process ≠ accept-return ≠ restock; a self-approval of one's own refund is blocked when approval is required.
- NFR-6. **Reconciliation integrity:** gross sales, refunds, and net sales are distinct metrics; no double counting; `₹0` is valid data (never dimmed).
- NFR-7. **Design-system compliance:** View Invoice stays on the `view-detail-pages` standard (DetailHero + SummaryCards + grid + DetailSection + PinnedRail); the refund flow uses `RoxCenteredForm`; pills follow the pill standard; print uses the shared A4 family.
- NFR-8. **Multi-store:** refunds/returns respect store scope; a Customer Return names its receiving store via `StoreContextCell` semantics; cross-store needs `multi_store_access`.
- NFR-9. **Performance:** refund-status derivation is an in-memory fold over the invoice's refund records (indexed by invoice id); no N+1 at table render.

### 1.4 Acceptance Criteria (testable)
See **§15 — Acceptance scenario map** (the 23 scenarios), each mapped to a concrete design decision. These are the numbered, testable criteria.

### 1.5 Out of Scope
- A live payment-gateway integration (the model supports `pending/processing/succeeded/failed/reversed` and a provider reference, but no specific PSP is wired).
- Promoting the two demo ledgers (`accounting-service`, `daily-ledger-service`) to DB-backed stores — out of scope; they remain presentation layers that project the new DB refund facts.
- Converting a refund into store credit / loyalty-credit tender (only loyalty-points reversal is in scope, §9.5).
- Tax authority (GST credit-note e-filing / IRN) integration.

---

## 2. Technology stack (locked once approved)
TypeScript + Next.js (App Router) + React, Supabase (Postgres + RLS + Realtime), the existing `useStore()` context, `RoxCenteredForm` + shared `detail-page` primitives, the shared A4 print family, `@supabase/supabase-js`. No new runtime dependencies. All money is INR via `formatINR`.

---

## 3. Architecture overview

```
                 CUSTOMER
                     │
        FINALIZED INVOICE  (immutable: total, paidAmount, tax, devices)
                     │  (reference by id — never embedded, never mutated)
   ┌─────────────────┼───────────────────────────────────────────┐
   │                 │                                             │
 REFUND RECORD   REFUND ALLOCATIONS                         ITEM RETURN RECORDS
 (money event)   (per device / per line + qty + tax share)  (physical, independent)
   │                 │                                             │
   │                 └── sum reconciles against invoice balance    └── disposition-gated
   │                                                                   CUSTOMER RETURN
   └── projected into: daily-ledger (Refund/outflow),                  stock_movements
       accounting journal (refund), loyalty reversal,                  (cost-valued, only on Restock)
       and NET report metrics (gross − refunds = net)
                     │
          DERIVED refund status  (read-time fold; never stored editable)
```

**Where the code lives.** Refund/return actions are added to the existing invoice store **as new actions on `useStore()`** in `src/lib/store.tsx` (same provider that owns `invoices`, `stockMovements`, loyalty) — NOT a separate competing provider — so refunds, invoices, inventory, and loyalty mutate through one DB-first + realtime + toast path and stay transactionally coherent. A thin derived-helpers module (`src/lib/invoice-refunds.ts`, pure functions) holds eligibility, allocation math, and status derivation so the store, UI, and reports share one engine (mirrors how `leads-data.ts` holds pure lead helpers consumed by `leads-context.tsx`).

---

## 4. Data model (migration `0075_invoice_refunds.sql`)

Three new tables, mirroring the `0063_lead_deals.sql` structure (per-org sequence RPC + guard trigger + append-only revisions + RLS that follows the parent record). All are **additive + idempotent**. The invoice table is NOT altered — invoice-level derived figures are computed, and any invoice-side cache (optional) is written into the existing JSONB `devices` envelope, never a schema change.

### 4.1 `invoice_refunds` (the money event — one row per refund transaction)
```
id                   uuid pk default gen_random_uuid()
organization_id      uuid not null → organizations(id) on delete cascade
branch_id            uuid → branches(id) on delete set null      -- the invoice's branch (sales/origin store)
refund_no            text                                          -- CN-0001 … per org (next_refund_id)
invoice_id           text not null → invoices(id) on delete cascade
invoice_reference    text                                          -- cached display
customer_id          text → customers(id) on delete set null
customer_name        text
ticket_id            text                                          -- cached lineage
scope                text not null                                 -- 'invoice' | 'devices' | 'lines'
refund_kind          text not null default 'partial'              -- 'full_scope' | 'partial'
-- Money (all INR, >= 0). gross = net + tax for the refunded scope.
refund_net           numeric not null default 0                    -- pre-tax refunded value
refund_tax           numeric not null default 0                    -- tax component refunded (SGST+CGST share)
refund_discount      numeric not null default 0                    -- discount reversed (negative impact)
refund_amount        numeric not null default 0                    -- gross cash returned (authoritative)
-- Reason + method
reason_code          text not null                                 -- from refund_config.reasons
reason_comment       text
method               text not null                                 -- from invoicePaymentModes (cash/upi/card/...)
reference            text                                          -- txn / cheque / UTR reference
customer_note        text
internal_remark      text
-- Lifecycle (gateway-aware; manual refunds skip pending/processing)
status               text not null default 'succeeded'
   -- 'pending' | 'processing' | 'succeeded' | 'failed' | 'reversed'
-- Segregation-of-duties audit
initiated_by         uuid → staff(id)   initiated_by_name text   initiated_at timestamptz default now()
approved_by          uuid → staff(id)   approved_by_name  text   approved_at  timestamptz
processed_by         uuid → staff(id)   processed_by_name text   processed_at timestamptz
reversed_by          uuid → staff(id)   reversed_at timestamptz  reversal_reason text
created_at           timestamptz not null default now()
updated_at           timestamptz not null default now()

indexes: (invoice_id), (organization_id), (branch_id), (status), (customer_id)
-- Over-refund + duplicate-draft guard (see §4.4 + §5):
unique partial index invoice_refunds_one_open_draft on (invoice_id) where status in ('pending','processing')
```
**Decision (resolves review Finding 12):** at most **one in-flight (gateway `pending`/`processing`) refund per invoice** is intentional for the first implementation — while a gateway refund is settling, a second refund draft on the same invoice is blocked and the refund flow shows a clear message ("A refund is already in progress for this invoice; wait for it to settle or fail"). This is a deliberate, stated limitation (it keeps the over-refund guard's reservation arithmetic simple and race-free). Note it does NOT block manual `succeeded` refunds against each other (those are serialized by the `for update` lock, not this index), so a multi-device invoice can still receive several sequential manual device refunds. Relaxing the index to allow concurrent non-overlapping gateway scopes is explicitly **deferred** (added complexity, no current PSP integration).
**Balance accounting — one precise rule (resolves review Finding 7):**
- **Realized refunded balance** (what reports/`priorRefunded`/derived status use) = Σ `refund_amount` where `status = 'succeeded'` only. `reversed`/`failed` contribute 0; `pending`/`processing` contribute 0 to the *realized* figure.
- **Over-refund GUARD base** (what the DB guard checks on insert/transition) = Σ `refund_amount` where `status IN ('succeeded','pending','processing')` **including the NEW/updated row**, rejected if that sum `> invoice_refundable_base(invoice_id)`. So in-flight gateway drafts DO reserve against the balance (preventing two concurrent drafts from each passing), while a `failed`/`reversed` row frees its reservation. The guard set and the realized set are deliberately different; §5.2 "reserve pending/processing for guard" refers to the GUARD base, §5.5 "`priorRefunded`" refers to the realized set.
- **Concurrency guarantee (two simultaneous manual `succeeded` inserts):** the `invoice_refunds_one_open_draft` unique index only covers `pending`/`processing`, so it does NOT protect the manual path (manual refunds insert directly as `succeeded`). The guard therefore takes a **row lock on the parent invoice** inside `invoice_refundable_base(invoice_id)` (`select total, paid_amount, status, document_type from invoices where id = invoice_id for update`), so two concurrent `BEFORE INSERT` guards serialize: the second sees the first's committed amount in the Σ and is rejected with `refund_exceeds_balance` (`errcode 23514`). A unique index alone cannot stop two individually-valid `succeeded` rows — the `for update` lock is the authority.

### 4.2 `invoice_refund_allocations` (per device / per line breakdown)
```
id              uuid pk
organization_id uuid not null → organizations(id) on delete cascade
refund_id       uuid not null → invoice_refunds(id) on delete cascade
invoice_id      text not null                                 -- denormalized for RLS + fast rollups
device_id       text                                          -- InvoiceDeviceRecord.id (null for flat/invoice scope)
ticket_device_id text                                         -- durable device link
line_id         text                                          -- InvoiceLineItem.id (null when whole-device/repairCost)
line_component  text not null default 'line'                  -- 'line' | 'repair_cost' | 'device_tax' | 'discount_adj'
sku             text                                          -- inventory link, when line_component='line' and a product
qty             numeric not null default 0                    -- refunded qty for this line (0 for non-line components)
alloc_net       numeric not null default 0
alloc_tax       numeric not null default 0
alloc_amount    numeric not null default 0                    -- alloc_net + alloc_tax
created_at      timestamptz not null default now()

indexes: (refund_id), (invoice_id), (invoice_id, line_id), (invoice_id, device_id)
```
The allocations are the authoritative record of "how much of each line/device has been refunded", used by eligibility to compute remaining balances (§5). Σ(allocations.alloc_amount) for a refund = that refund's `refund_amount`.

### 4.3 `invoice_item_returns` (physical returns — independent, linkable)
```
id               uuid pk
organization_id  uuid not null → organizations(id) on delete cascade
branch_id        uuid → branches(id)                           -- RECEIVING store (may differ from invoice branch)
return_no        text                                          -- RET-0001 … per org
invoice_id       text not null → invoices(id) on delete cascade
device_id        text
line_id          text
sku              text → (inventory_items.id by reference; nullable for service/non-stock)
item_name        text
refund_id        uuid → invoice_refunds(id) on delete set null -- LINK to money refund when related (nullable: return-first)
returned         boolean not null default true
return_qty       numeric not null default 0
condition        text not null default 'uninspected'           -- 'uninspected' | 'good' | 'damaged' | 'defective' | 'other'
disposition      text not null default 'inspection_required'   -- 'restock' | 'inspection_required' | 'damaged_non_saleable' | 'do_not_restock'
disposition_status text not null default 'pending'             -- 'pending' | 'completed'  (restock executed?)
stock_movement_ref text                                        -- the Customer Return stock_movements.doc_number, once executed
unit_cost        numeric                                        -- cost/valuation at return time (NEVER selling price)
receiving_store  text                                           -- display label of branch_id
inspection_notes text
received_by      uuid → staff(id)  received_by_name text  received_at timestamptz default now()
restocked_by     uuid → staff(id)  restocked_at timestamptz
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()

indexes: (invoice_id), (refund_id), (sku), (organization_id), (disposition, disposition_status)
```

### 4.4 Sequences + guard + revisions (mirror `0063`)
- `next_refund_id(org)` → `CN-0001` (Credit Note sequence), `next_return_id(org)` → `RET-0001`, `next_item_return_id` — gap-free per org, same `*_sequences` + `on conflict do nothing` + `for update` pattern as `deal_sequences`.
- `invoice_refunds_guard()` BEFORE INSERT/UPDATE (SECURITY DEFINER, service-role bypass):
  - Stamp `refund_no`, `initiated_by`, `initiated_at`, `organization_id` immutable; `invoice_id` immutable.
  - Reject refund on a **proforma or draft or cancelled or unpaid** invoice (`refund_not_eligible`).
  - **Over-refund guard (the core integrity check):** recompute Σ `refund_amount` where `status IN ('succeeded','pending','processing')` for `invoice_id` from `invoice_refunds` **including this row**, and reject if it exceeds the invoice's eligible refundable base, with `errcode 23514`, message `refund_exceeds_balance`. The base is read via `invoice_refundable_base(invoice_id)`, which does `select ... from invoices where id = invoice_id for update` (the row lock serializing concurrent manual `succeeded` inserts — see §4.1). `failed`/`reversed` rows are excluded, freeing their reservation.
  - Capability enforcement per transition: INSERT needs `refunds_initiate`/`manage_refunds`; moving to `succeeded` (processing) needs `refunds_process`/`manage_refunds`; `reversed` needs `refunds_approve`/`manage_refunds`; approval columns (`approved_by`) only settable by a non-initiator holding `refunds_approve` (self-approval blocked when `refund_config.require_approval` is on).
  - Mandatory `reason_code`; reject blank.
- `invoice_item_returns_guard()`: reject `return_qty` beyond invoiced qty minus prior accepted returns for the same `(invoice_id, line_id)` (`return_exceeds_qty`); a `restock` disposition reaching `disposition_status='completed'` requires `returns_restock`/`approve_inventory`; stamps `received_by`.
- `restock_item_return(return_id)` SECURITY DEFINER function (the atomic restock, §6 Finding-2): in one transaction — insert the `Return` `stock_movements` row, `update inventory_items set current_stock = current_stock + return_qty`, set `invoice_item_returns.disposition_status='completed'` + `stock_movement_ref` + `restocked_by`/`restocked_at`; rejects any disposition ≠ `restock`, an already-`completed` return, or a caller lacking `returns_restock`/`approve_inventory`.
- **Loyalty reversal guard (§9.5 Finding 1/6):** `alter` the `loyalty_transactions.source_type` CHECK to add `'refund'` + add the partial unique index `loyalty_transactions_one_refund_reversal on (source_type, source_id) where type='adjustment' and source_type='refund'`.
- `invoice_refunds_record_revision()` AFTER INSERT/UPDATE → append-only `invoice_refund_revisions` (same shape as `lead_deal_revisions`: action, status_after, actor, amount, comment) for full auditability.

### 4.5 RLS (follows the parent invoice)
Mirror `lead_deals` RLS exactly:
- SELECT visible iff `auth_member_of_org(organization_id)` AND `auth_branch_visible(branch_id)` AND (`auth_has_any(['refunds_view','manage_refunds','manage_invoices','manage_reports'])` OR the parent invoice is visible to the caller).
- INSERT/UPDATE require the matching refund capability + branch visibility; the guard enforces *which* transition.
- `invoice_refund_allocations` + `invoice_item_returns` + `invoice_refund_revisions` visibility follows via their denormalized `invoice_id`/`organization_id` and a parent-visibility check.
- Realtime: add all four tables to `supabase_realtime`.

---

## 5. Eligibility + balance math (pure helpers in `src/lib/invoice-refunds.ts`)

### 5.1 Refundable base (the "actual settled amount", not the label)
```
refundableBase(invoice) =
  isProforma(invoice)              → 0  (never refundable)
  status === 'draft'               → 0
  status === 'cancelled'           → 0  (route to credit/cancellation path)
  else                             → min(paidAmount, total)     // only money actually received is refundable
```
Rationale (spec §2): a `paid`-labelled invoice refunds up to `min(paidAmount,total)`; a `partial` invoice refunds up to its settled `paidAmount`; an unpaid `sent/overdue` invoice has `paidAmount=0` → base 0 → not a cash refund (route to cancellation). This reads **real money state**, never the status word alone.

### 5.2 Already-refunded + remaining
```
priorRefunded(invoice, refunds) = Σ refund_amount where status === 'succeeded'      // REALIZED set (reports + status)
guardReserved(invoice, refunds) = Σ refund_amount where status in ('succeeded','pending','processing')  // GUARD set
remainingRefundable(invoice, refunds) = max(0, refundableBase(invoice) − priorRefunded)   // what the UI offers
// The DB over-refund guard (§4.4) rejects when guardReserved + newRow > refundableBase, under a `for update`
// row lock on the invoice; the client validates against remainingRefundable. Realized vs guard sets are distinct (§4.1).
```
Per-line / per-device remaining uses the allocations: `lineRemaining = lineRefundableValue − Σ succeeded alloc for that line`, and `lineRemainingQty = lineQty − Σ succeeded alloc.qty`.

### 5.3 Eligibility result
```
eligibility(invoice, refunds) → {
  eligible: boolean,
  reasonWhenBlocked: 'proforma' | 'draft' | 'cancelled_use_credit' | 'unpaid_use_credit'
                   | 'fully_refunded' | 'no_balance',
  base, priorRefunded, remaining,
  suggestedAlternative?: { label, href }   // e.g. Cancel Invoice when unpaid
}
```
`eligible = remaining > 0 && base > 0`. Fully refunded ⇒ `remaining === 0` ⇒ blocked with `fully_refunded`.

### 5.4 Scope + allocation math (the exact formulas)
Because the invoice stores a single `discount` and `tax` at the header, device/line refunds use **proportional allocation** against the invoice's net:

```
deviceNet(d)     = (d.repairCost ?? 0) + Σ(parts.total)       // from InvoiceDeviceRecord
invoiceNet       = Σ deviceNet(d) over getInvoiceDevices(invoice)   // == subtotal + Σ repairCost
discountFactor   = invoiceNet > 0 ? invoice.discount / invoiceNet : 0

For a selected line L (qty q of its qty):
  lineGrossNet     = L.price * q − (L.discount pro-rated by q)   // L.discount is a per-line absolute on full qty
  lineNetAfterDisc = lineGrossNet * (1 − discountFactor)         // the line's net share after proportional discount

Tax is allocated as a BUDGET SPLIT of invoice.tax (NOT an independent rate multiply), so Σ never drifts above invoice.tax:
  totalSelectedNet = Σ lineNetAfterDisc over all lines in scope
  lineTax          = totalSelectedNet > 0
                     ? round( invoice.tax * lineNetAfterDisc / totalSelectedNet )
                     : 0                                          // zero-net scope ⇒ zero tax (explicit)
  // Residual-paisa fix: after rounding, assign (invoice.tax − Σ lineTax) [bounded by scope] to the LARGEST
  // lineNetAfterDisc line, so Σ lineTax over a FULL-invoice scope === invoice.tax EXACTLY (provable, not asserted).
  lineRefund       = round(lineNetAfterDisc) + lineTax

For repair_cost of a device: treated as a line with price=repairCost, qty=1, no sku.
Device scope = Σ of its lines' + repairCost allocations.
Invoice scope = remaining of every device/line (= remainingRefundable).
```
- **Discount allocation** is proportional to each line's share of invoice net (spec §4: "tax/discount allocation" shown). **Tax allocation is a budget split of `invoice.tax`** weighted by `lineNetAfterDisc` with residual-paisa assignment to the largest line, so Σ(line tax refunds for the full invoice) === `invoice.tax` exactly and any partial scope's Σ ≤ `invoice.tax` — the "never over-refunds GST" guarantee is now provable, not asserted. A fully-discounted / ₹0-net scope (`totalSelectedNet == 0`) allocates **zero** tax (no nonsensical `max(1,…)` clamp).
- A **Partial** refund lets the user override the amount downward; the override is distributed across the selected allocations proportionally, and `refund_net`/`refund_tax` are re-derived so the net/tax split is always consistent (never a bare lump sum with no breakdown).
- **Rounding:** allocate with banker's-safe rounding and assign the residual paisa to the largest allocation so Σ(allocations) === refund_amount exactly (prevents 1-paisa drift that would false-trigger the over-refund guard).

### 5.5 Derived refund status (never stored editable — NFR-2, spec §9)
```
refundStatus(invoice, refunds) =
  anyFailedOrReversedAndNoSucceeded          → 'refund_failed_reversed'
  no succeeded refund && any pending/processing → 'refund_pending'
  priorRefunded === 0                         → 'no_refund'
  priorRefunded >= refundableBase (±1 paisa)  → 'fully_refunded'
  priorRefunded > 0                           → 'partially_refunded'
```

**Full-scope "Full Refund" vs the capped `refundableBase` (resolves review Finding 9).** `refundableBase = min(paidAmount, total)` is a MONEY cap, while per-line/device allocations are derived from `total`'s line structure. For a partially-paid invoice (`paidAmount < total`) the two do not coincide, so the design pins the relationship:
- **"Full Refund of Selected Scope" is CAPPED at `remainingRefundable`** (the money base), and the per-line/device allocation computed in §5.4 is **scaled by `min(1, remainingRefundable / scopeGrossSum)`** so the sum of allocations never exceeds `min(paidAmount, total)`. The over-refund guard (money) and the per-line qty guard (returns) remain the two independent authorities; the scale only ever shrinks, never inflates.
- `fully_refunded` is reached when **`priorRefunded == refundableBase` (±1 paisa)** — a purely money-base test, independent of line-sum arithmetic. So: a **fully-paid** invoice (`paidAmount >= total`) whose entire scope is refunded reaches `priorRefunded == total == refundableBase` → **Fully Refunded**; a **partially-paid** invoice whose maximum (`remainingRefundable`) is refunded reaches `priorRefunded == paidAmount == refundableBase` → **Fully Refunded** of the settled money (it was never fully *billed*-refundable because the rest was never paid). Refunding one device of a multi-device fully-paid invoice leaves `priorRefunded < total` → **Partially Refunded**.
- The ±1 paisa tolerance now only absorbs genuine rounding of the money comparison, not an undefined line-vs-base relationship.
Rendered as a RepairOX pill (pill standard): No Refund (neutral/none), Refund Pending (amber), Partially Refunded (sky/blue), Fully Refunded (emerald), Refund Failed/Reversed (rose). It is computed in `invoice-refunds.ts` and consumed by the table cell, View Invoice hero, and reports — one engine, consistent everywhere.

---

## 6. Store actions (new, on `useStore()` in `src/lib/store.tsx`)

All DB-first → `rowTo*` → `setState` → `logActivity` → realtime, with toast on error, `withStore()` for branch stamping, `shouldUseDb()` gating. New state slices: `invoiceRefunds: InvoiceRefund[]`, `invoiceRefundAllocations`, `invoiceItemReturns` (loaded in the mount query alongside `invoices`, scoped by `scopeToStore`).

- `processRefund(input): Promise<string>` — validates eligibility + allocation (re-reads live `invoices` for concurrency), inserts `invoice_refunds` + `invoice_refund_allocations` in one logical operation (the DB guard is the authoritative over-refund check), returns `refund_no`. On a manual method, `status='succeeded'` immediately; on a gateway method, `status='pending'` and a later `settleRefund` transitions it. **Idempotency:** a client-generated `refund_no` guess is ignored (server stamps); the `one_open_draft` unique index + guard re-check prevents double submission (two tabs / double click).
- `settleRefund(refundId, { status, reference })` — transitions `pending/processing → succeeded | failed`; only `succeeded` affects balances/reports/loyalty.
- `reverseRefund(refundId, reason)` — compensating action: sets `status='reversed'` (never deletes), freeing the money balance (the `reversed` row drops out of both the realized set and the guard set per §4.1) and writing an append-only revision; requires `refunds_approve`. **Effect on a linked physical return / already-executed restock (resolves review Finding 11):** reversing the MONEY refund does **NOT** auto-reverse a physical item return — they are independent (the part may legitimately still be with the shop). The reversed refund **retains its `invoice_item_returns.refund_id` link** (history is preserved; nothing is silently unlinked). It also **re-reverses the loyalty adjustment** (an inverse `type='adjustment'` row, same refund-scoped idempotency key as §9.5, so points are restored exactly once) and emits the inverse ledger projection (`reverseEntry` + a `Refund` inflow correction). If the returned part was **already restocked** (`disposition_status='completed'`, saleable stock incremented), reversing the money does NOT silently decrement stock — the erroneous restock is unwound only by a **separate, authorized `Adjustment`/outward `stock_movements` + `current_stock -= qty`** operation (gated `returns_restock`/`approve_inventory`, same atomic DB-function pattern as `restockItemReturn`), surfaced as an explicit action, never an automatic hidden stock edit. This prevents phantom inventory while keeping stock corrections auditable.
- `recordItemReturn(input)` — inserts `invoice_item_returns` (return-first allowed, `refund_id` null until linked). Does **not** touch stock.
- `restockItemReturn(returnId)` — only when disposition is `restock` and the user holds `returns_restock`/`approve_inventory`. **This is net-new increment logic, NOT an existing capability** — verified `addStockMovement` (`store.tsx:2838`) only inserts the `stock_movements` row and prepends to state; it NEVER mutates `inventory_items.current_stock`. The restock is therefore an explicit atomic 3-part operation that must all apply or none:
  1. Insert a **Customer Return** `stock_movements` row (`type: "Return"`, `fromStore` = customer label, `toStore` = receiving store, `items` = qty, `date`, `user` = actor, `docNumber` from `next_item_return`/a movement sequence) — reusing the `addStockMovement` write shape only (not its state-only behaviour).
  2. `update inventory_items set current_stock = current_stock + <return_qty> where id = <sku>` (DB-first, same `shouldUseDb()` + realtime pattern as `updateInventoryItem` at `store.tsx:2857`, which DOES write `current_stock`). **This increment is the new logic.** The restocked units are valued at the item's **cost/valuation**, never the customer selling/refund price — the `unit_cost` is read from the item master (or carried on the return record), never from `refund_amount`.
  3. Set `invoice_item_returns.disposition_status='completed'` + `stock_movement_ref = <movement docNumber>` + `restocked_by`/`restocked_at`.
  To guarantee the three cannot partially apply, this is implemented as a **single Postgres function `restock_item_return(return_id)` (SECURITY DEFINER)** invoked by the store action, running the movement insert + `current_stock` bump + return-record update in one DB transaction, guarded by `returns_restock`/`approve_inventory` and rejecting any disposition other than `restock` or a return already `completed`. Inspection-Required / Damaged-Non-saleable / Do-Not-Restock dispositions NEVER reach this path, so saleable stock is never increased for them.
- **Loyalty reversal (§9.5):** when a `succeeded` refund reduces the realized paid amount, `processRefund` reverses loyalty proportionally by inserting ONE `loyalty_transactions` row (`type: 'adjustment'`, negative `points_change`, **`source_type: 'refund'`, `source_id = <invoice_refunds.id uuid>`**) and decrements the customer's `points_balance`/`lifetime_value` — reusing the existing loyalty write path (`awardLoyaltyForPaidInvoice`'s inverse), never a fork. **Idempotency is NOT provided by the existing `loyalty_transactions_one_earn_per_source` index** (verified `0032_loyalty_ledger.sql` lines 72–76: that partial unique index is scoped `where type = 'earn' and source_id is not null`, so it does NOT cover `adjustment`/reversal rows). The reversal is made provably once-only by a **new dedicated guard added in `0075` (see §9.5)**: a partial unique index keyed on the refund uuid plus a CHECK-constraint change. The reversal row is written in the **same logical operation as the `succeeded` transition** and is keyed on the refund's own uuid, so a double-submit / two-tab retry cannot double-decrement points.
- **Ledger projection (§9/§10):** the two ledgers are localStorage/demo projection targets, NOT the financial authority (the DB `invoice_refunds` row is). The projection must NOT be attempted by calling React hooks from inside the `useStore()` `useCallback` action (verified: `useDailyLedger` is a hook at `daily-ledger-service.ts:728` and `useLedger` a hook at `accounting-service.tsx:391` — neither is callable from a store action). Concrete, implementable mechanism:
  - **Daily ledger** → the store action calls the **module-level exported `recordTransaction(input)`** (`daily-ledger-service.ts:544` — a plain function that `persist()`s + `emit()`s, callable anywhere) with `{ module: 'Refund', category: 'Refund', direction: 'outflow', amount: refund_amount, cashOrBank, paymentMode, referenceId: refund_no, date, createdBy }`. This is exactly how `expense-accounting-emitter.ts` mirrors expenses (`recordExpenseInDailyLedger`).
  - **Accounting journal** → use the established **`AccountingBridge` pattern** (`expense-accounting-emitter.ts` `AccountingBridge` = `{ addEntry, reverseEntry, getEntriesByReference }`): the UI layer (the refund flow / a small refund-accounting-emitter) obtains `addEntry`/`reverseEntry` from `useLedger()` (the `AccountingProvider` IS mounted — verified `providers.tsx:32`) and posts `addEntry({ type: 'refund', account: method, debit: refund_amount, credit: 0, reference: refund_no, status: 'posted' })` **in a React effect that fires once per newly-observed `succeeded` refund** (keyed by refund uuid in a seen-set), NOT inside the store action and NOT on every realtime echo/render. `reverseRefund` posts the inverse via `reverseEntry`.
  - Both projections are **idempotent per refund uuid** (daily ledger: `referenceId = refund_no`; journal: `reference = refund_no` + the UI seen-set) so a realtime re-emit never doubles a ledger row. When a provider is absent (local/demo off), the projection is simply skipped — it is never the authority.

---

## 7. UI design

### 7.1 Entry points (spec §1)
- **Invoice Table** (`src/app/(app)/invoice/page.tsx`): add a `Process Refund` `MenuItem` (icon `Undo2`/`RotateCcw`) to the existing row-overflow `Dropdown` (~line 1346), inserted above the Delete divider, rendered only when `eligibility(inv).eligible && allow(can, CAP.invoice.refundInitiate)`. Not added as a separate always-visible row button (avoid redundancy, spec §1).
- **View Invoice** (`src/app/(app)/invoice/[id]/page.tsx`): add a `Process Refund` button to the Quick Actions card (~line 791) with the existing full-width bordered-row styling, gated the same way. Add a new **Refunds & Returns** `DetailSection` (accent `emerald`) in the left column (after Payment/Totals) listing refund records (refund_no, amount, method, status pill, reason, date, actor) and item-return records (return_no, item, qty, condition, disposition, restock status) — empty state is a compact dashed "No refunds or returns" card (no large blank band, spec §7/§31).
- The View Invoice **hero** gains the derived **Refund Status** pill next to the financial status (distinct from `InvoiceStatus`), and a `Refunded` SummaryCard (`formatINR(priorRefunded)`) + a `Net Received` SummaryCard (`paidAmount − refunded`).

### 7.2 The refund workflow (focused, in-context — spec §1/§3/§4)
A centered multi-step flow built on `RoxCenteredForm` (`canEdit` gated by `CAP.invoice.refundInitiate`), opened from either entry point (query param `?refund=<invoiceId>` on View Invoice, or a modal on the table). Steps:
1. **Eligibility + Scope** — shows base/prior/remaining; radio for Entire Invoice / Selected Devices / Selected Line Items; device/line tree from `getInvoiceDevices()` with per-row remaining qty/value; blocked state shows the reason + alternative (Cancel Invoice link when unpaid).
2. **Amount (Full vs Partial)** — **Full = remaining of selected scope, capped at `remainingRefundable`** (read-only computed; the §5.4 allocation is scaled by `min(1, remainingRefundable/scopeGrossSum)` so a partially-paid invoice's full-scope refund can never exceed the settled money — §5.5 Finding-9 rule). Partial = editable amount (≤ remaining) with live allocation + tax/discount breakdown; client validation mirrors the DB over-refund guard.
3. **Reason + Method** — reason dropdown (from `refund_config.reasons`), optional comment, method (`invoicePaymentModes`), reference, customer note, internal remark, approver (if `require_approval`).
4. **Item Return (optional, per selected item)** — the §6 fields (returned Y/N, condition, disposition, qty, receiving store, inspection notes). Clearly separated from the money refund; defaults to "no return" for service lines.
5. **Review + Confirm** — original / previous / proposed / remaining, allocation table, scope summary, then Confirm → `processRefund()`.

### 7.3 Pills + design-system
Refund-status and refund-lifecycle pills use the shared pill cell (`flex h-7 w-full`, tone from a new `REFUND_STATUS_TONE` map), per the pill standard. The Refunds section table (if it grows) uses the in-section table look (view-detail-pages §4), not the full `rox-table`.

---

## 8. Printing (spec §14 — annotate original, add a distinct Credit Note)

- **Immutable original invoice:** `buildInvoicePrintData` is extended to accept the derived refund summary and stamp a **non-destructive annotation** — a "PARTIALLY REFUNDED ₹X on DATE (CN-00NN)" / "FULLY REFUNDED" watermark/footer line on the existing invoice A4/thermal — the invoice content/totals are never rewritten (NFR-1).
- **New print document type:** extend `PrintDocumentType` to `"ticket" | "invoice" | "quotation" | "diagnostic" | "credit_note"`. Add `buildCreditNotePrintData(settings, invoice, refund, allocations)` in `print-utils.ts` and a `CreditNoteA4` component in `a4-template.tsx` (reusing the shared `BRAND`/header/number-pill/customer-block/totals-box/footer family exactly like `QuotationA4`).
- **Print route id contract (resolves review Finding 10):** the route is `src/app/print/[type]/[id]/page.tsx` (verified it resolves records via `useParams` + `records.find(x => x.id === docId)` and renders a standard "Document not found" block when absent). Pin: **`[type] = 'credit_note'`, `[id] = <invoice_refunds.id uuid>`** (the refund PK, not the `CN-00NN` display no, not the invoice id). Add a `credit_note` branch to the route's `useMemo` loader that: finds `invoiceRefunds.find(r => r.id === docId)` from `useStore()`, loads its `invoiceRefundAllocations` (filter by `refund_id`) and the parent `invoices.find(i => i.id === refund.invoice_id)`, then calls `buildCreditNotePrintData(settings, invoice, refund, allocations)`. A **non-existent or RLS-unauthorized refund id renders the existing not-found block** (never a blank/half-rendered doc). Credit Note is **A4-only** (add to the `a4Only` set in `FormatSelector`). The Credit Note shows refunded devices/lines, qty, net, tax, refund method + reference, reason, and the original invoice reference. **No cost price / labour cost / profit** ever appears on the customer-facing credit note (spec §14, consistent with `inventory-vs-invoice-line`/sensitive-visibility rules).
- **Route permission gate:** the print route branch is gated by `CAP.invoice.print` AND refund visibility (`CAP.invoice.refundView`); the DB RLS on `invoice_refunds` (§4.5) is the real boundary — an unauthorized refund id simply isn't in the client's `invoiceRefunds` and renders not-found.
- Reachable from the refund record row (Print Credit Note) and the Refunds & Returns section; gated by `CAP.invoice.print`.

---

## 9. Permissions (reuse + new granular keys — follows `permission-matrix` steering exactly)

**Reuse (coarse fallback):** `manage_refunds` (already in catalog + Full tier of the invoices module + role presets). Every new granular key lists `manage_refunds` as a coarse fallback so existing roles that hold it keep working; `full_access`/`*` implied by `can()`.

**New granular keys** (added to ALL layers — union in `permissions.ts`, a `{key,label}` def in the invoices `PERMISSION_GROUPS` group, the right tier in `PERMISSION_MODULES` invoices/inventory module, a `CAP` entry, server `requirePermission`, and RLS `auth_has_any`):

| Key | Module · Tier | Gates |
|---|---|---|
| `refunds_view` | invoices · **view** | See refund/return records + refund status |
| `refunds_initiate` | invoices · **work** | Open the refund flow, create a refund draft |
| `refunds_process` | invoices · **manage** | Mark a refund succeeded / settle a manual or gateway refund |
| `refunds_approve` | invoices · **full** | Approve (when required) + reverse a refund (compensating) |
| `returns_accept` | inventory · **work** | Record a physical item return (receive) |
| `returns_restock` | inventory · **manage** | Execute the disposition-gated restock movement |
| `view_profitability` | reports · **view** (sensitive slot) | See CP/labour/profit/net-margin figures — registered **next to the existing `view_profit_margin`** in the reports module `view` tier (the "money-sensitive opt-in" slot, verified `permission-levels.ts:300–301`), NOT the invoices tier, so a Manage-tier invoice user does NOT silently gain profit visibility. Coarse fallback: `view_profit_margin`/`view_financial_reports` (resolves review Finding 13) |

**Segregation of duties (NFR-5):** `refunds_initiate` ≠ `refunds_approve` ≠ `refunds_process`; `returns_accept` ≠ `returns_restock`. The DB guard blocks a user approving their own refund when `refund_config.require_approval` is on. All checks run at UI (`<Can>`/`allow(can, CAP.invoice.refund*)`), server, AND RLS — the DB guard is the real boundary.

**CAP additions** (`capabilities.ts`, granular-first + coarse fallback):
```
CAP.invoice.refundView     = ['refunds_view', 'manage_refunds', 'manage_invoices']
CAP.invoice.refundInitiate = ['refunds_initiate', 'manage_refunds']
CAP.invoice.refundProcess  = ['refunds_process', 'manage_refunds']
CAP.invoice.refundApprove  = ['refunds_approve', 'manage_refunds']
CAP.inventory.returnAccept = ['returns_accept', 'adjust_stock', 'manage_inventory']
CAP.inventory.returnRestock= ['returns_restock', 'approve_inventory', 'manage_inventory']
CAP.sensitive.viewProfit   = ['view_profitability', 'view_profit_margin', 'view_financial_reports']  // granular-first
```
`view_profitability` is registered in the sensitive/reports group (next to `view_profit_margin`) in both `permissions.ts` (`PERMISSION_GROUPS`) and the reports module **view** tier in `permission-levels.ts` — keeping it out of the invoices Manage tier so invoice management never implies profit visibility.

**Coverage check (steering §6):** after adding keys, verify every new group-def key appears in a `PERMISSION_MODULES` tier and in the union (`refunds_view/initiate/process/approve` in the invoices module tiers, `returns_accept/restock` in the inventory module tiers, `view_profitability` in the reports view tier), and run `npx tsc --noEmit` + build.

### 9.5 Loyalty reversal — reuses the existing loyalty path, with a dedicated idempotency guard (resolves review Findings 1 + 6)

Reversing earned points on a `succeeded` refund reuses the `loyalty_transactions` ledger (never a fork), but the existing dedup index does NOT cover it, and the `source_type` CHECK would reject a natural refund key. **Decision (chosen approach), implemented in migration `0075`:**

1. **Alter the CHECK constraint** on `loyalty_transactions.source_type` to add `'refund'`:
   ```sql
   alter table public.loyalty_transactions drop constraint if exists loyalty_transactions_source_type_check;
   alter table public.loyalty_transactions add constraint loyalty_transactions_source_type_check
     check (source_type in ('invoice','adjustment','admin','refund'));
   ```
   (Verified the constraint is `in ('invoice','adjustment','admin')` at `0032_loyalty_ledger.sql:57`; the existing index `loyalty_transactions_one_earn_per_source` is `where type='earn'` at lines 72–76 and does NOT apply to reversals.)
2. **Add a refund-scoped partial unique index** so one refund can reverse loyalty at most once:
   ```sql
   create unique index if not exists loyalty_transactions_one_refund_reversal
     on public.loyalty_transactions(source_type, source_id)
     where type = 'adjustment' and source_type = 'refund';
   ```
3. The reversal row is written with `type='adjustment'`, `source_type='refund'`, `source_id = <invoice_refunds.id uuid>`, negative `points_change`. A double-submit/retry hits the unique index and is a no-op (`on conflict do nothing`), so points and `lifetime_value` are decremented exactly once. The reversal is driven in the same logical operation as the `succeeded` transition (store action, mirroring `awardLoyaltyForPaidInvoice`), keyed on the refund uuid.

This is additive + idempotent (guarded `drop constraint if exists` / `create ... if not exists`) per the lead-data-foundation migration rule.

---

## 10. Reports / revenue reconciliation (spec §10/§13 — net ≠ gross, no double count)

Add a **net-of-refund** layer WITHOUT mutating `total`/`paidAmount`:
- `src/lib/reports/kpis.ts` `computeCore`: add `refunds = Σ succeeded invoice_refunds.refund_amount` (in range, non-reversed/non-failed). Two distinct net lines, each on a base of the SAME universe as the thing it nets (no asymmetry):
  - **Net Sales** = `billed − refundsAgainstFinalized`, where `refundsAgainstFinalized` sums only refunds whose parent invoice `isFinalizedInvoice` (`billed` is gross finalized/live sales — same universe). A `partial`-invoice refund is NOT subtracted here (it was never in `billed`).
  - **Net Collected** = `collected − refunds` (ALL succeeded refunds, including `partial`-invoice refunds): `collected = Σ paidAmount` is actual money received, and every refund is actual money returned, so both sit on the real cash universe. This is the correct base for `netRevenue = netCollected − expenses`.
  - `refundRate = refunds / max(ε, collected)`. **`billed`/`collected` stay gross** (historical integrity); new KPIs `Refunds`, `Net Sales`, `Net Collected`, `Refund Rate` are added. GST refunded (`Σ refund_tax` on finalized-parent refunds) nets the `gst` KPI into a `Net GST`.
- `agent-performance.ts` Revenue Won: add `revenueWonNet = revenueWon − attributableRefunds`, where **the subtracted refund base and the gross base MUST be the same universe** to avoid the asymmetry the review flagged. Verified: `revenueWon` = Σ **finalized** invoice `total`, and `isFinalizedInvoice` (`leads-data.ts:1234`) counts ONLY `documentType !== 'proforma' && status === 'paid'`. But refunds are eligible on `partial` invoices too (base = `min(paidAmount,total)`), and a `partial` invoice is NOT in gross `revenueWon`. **Rule:** `attributableRefunds` for `revenueWonNet`/`revenueWonForLead`'s net reconciliation subtracts ONLY refunds whose **parent invoice `isFinalizedInvoice`** (same `status === 'paid'` universe as the gross) — so a refund can never subtract money that was never counted as gross, and `revenueWonNet` can never go below its correct value or negative. Refunds against **non-finalized (`partial`) invoices** are tracked separately (they reduce `netCollected`/the daily-ledger cash position, since real cash DID move, but they were never in `revenueWon`, so they do NOT touch `revenueWonNet`). The gross `revenueWon` is always retained unchanged; dashboards show Net Revenue Won where refunds matter.
- **Daily ledger / accounting journal:** already receive the `Refund` outflow / `refund` journal entry projection (§6), so the day's cash/bank position and the journal net reflect refunds without a second source of truth.
- **Owner dashboard KPIs, customer transaction history, multi-store summaries, invoice reports + filters:** add a "Refund status" filter + a Refunds column; customer history shows refund rows alongside invoices. All derive from `invoice_refunds` — never a stored counter.

**No double counting:** gross sales, refunds, and net sales are three distinct derived numbers from the same `invoice_refunds` facts; the ledger projection is clearly a `Refund` outflow, not a reduction of the invoice's recorded gross.

---

## 11. Settings — structured refund config (`refund_config`)
Extend `store-settings.tsx` with a small structured `refund_config` (JSON column `refund_config`, same parse pattern as `invoice_payment_modes` / `loyalty_config`): `{ reasons: string[], require_approval: boolean, allow_partial: boolean, restock_default: disposition }`. The free-text `refundPolicy` string is **kept** (it still prints on documents). Reason list defaults to the §5 list; admins can rename/add (editable only with `CAP.settings.financial`). Payment methods reuse `invoicePaymentModes` (no second list).

---

## 12. Lead / Ticket / Walk-In / Field attribution preservation (spec §15 lineage)
A refund **references** `invoice_id` + cached `ticket_id`/`customer_id`; it never rewrites the invoice, ticket, lead `linkedInvoiceId`/`linkedTicketId`, Sales-Agent attribution, or walk-in/field links. The Lead workflow derivation (`deriveLeadWorkflow`) continues to read finalized invoices; its **Result money** is reconciled to **net** by subtracting **only refunds whose parent invoice `isFinalizedInvoice`** (the same `status === 'paid'` universe as the gross `revenueWonForLead` — §10 Finding-5 rule), so a refunded lead no longer over-reports revenue and never under-reports it by subtracting a `partial`-invoice refund that was never in gross — without touching the lead's links or owner. Customer identity stays the Customer Master record (no duplicate).

---

## 13. Immutability & corrections (spec §12)
- Finalized invoices are never edited by a refund. The only invoice-side write is an **optional** cached refund summary into the existing JSONB `devices` envelope (`refundSummary: {refunded, status}`) purely to avoid a cross-table read at table render — it is a *cache*, re-derivable from `invoice_refunds`, never the authority, and never alters `total`/`paidAmount`/`tax`/`items`.
- A wrong refund is corrected via `reverseRefund` (status `reversed`, append-only revision), never a delete/rewrite. The over-refund guard + reversal keep the balance arithmetic always provable from append-only facts.

---

## 14. Edge cases (concrete handling)
- **Legacy flat invoice (no `devices[]`):** `getInvoiceDevices()` wraps `items` into one device; scope UI + allocation work unchanged.
- **Zero-net device / ₹0 line:** valid; allocation = 0; never dimmed; cannot be "refunded" for money but can still be returned physically.
- **Discount > line value / 100% discount:** `discountFactor` clamps; line net floors at 0; refund of a fully-discounted line is ₹0 money but may still trigger an item return.
- **Rounding drift:** residual-paisa assignment (§5.4) keeps Σ(allocations)=refund_amount so the guard never false-rejects.
- **Concurrent/double submit:** `one_open_draft` unique index + guard re-check → second submission fails with `refund_exceeds_balance` or duplicate-key; the UI shows the toast and refreshes from realtime.
- **Return-first, refund-later:** `invoice_item_returns` with `refund_id` null and `disposition_status='pending'`; no false financial refund is recorded (spec §7 last paragraph).
- **Gateway failure:** `status='failed'` → no balance impact, no loyalty reversal, no ledger outflow; retry creates a new attempt.
- **Partially paid then refund then more payment:** base re-reads `min(paidAmount,total)` live each time; remaining recomputes.
- **Cancelled/unpaid invoice:** blocked for cash refund; UI routes to `CAP.invoice.cancel` path.
- **Reverse a refund whose item was already restocked:** `reverseRefund` frees the money balance, re-reverses loyalty, retains the `refund_id`↔return link, but does NOT touch saleable stock; the already-restocked units are corrected only by a separate authorized `Adjustment`/outward movement + `current_stock` decrement (§6 `reverseRefund`), so no phantom inventory and no silent stock edit.
- **Refund on a `partial` (not finalized) invoice:** eligible (base = `min(paidAmount,total)`, cash was received), reduces `netCollected`/daily-ledger cash, but is NOT subtracted from `revenueWonNet`/`Net Sales` (the parent invoice was never in gross `revenueWon`/`billed`) — so net revenue never goes below its correct value (§10/§12 Finding-5 rule).

---

## 15. Acceptance scenario map (the 23 scenarios — spec §16/§17 → design decision)

| # | Scenario | Design decision satisfying it |
|---|---|---|
| 1 | Process Refund appears in Invoice Table overflow for an eligible invoice | §7.1 table `MenuItem`, gated by `eligibility().eligible` + `CAP.invoice.refundInitiate` |
| 2 | Process Refund appears in View Invoice Quick Actions | §7.1 Quick Actions button, same gating |
| 3 | Action hidden when invoice ineligible or user lacks permission | §5.3 eligibility + §9 permission gate at UI/server/RLS |
| 4 | Finalized paid invoice is refundable up to `min(paidAmount,total)` | §5.1 `refundableBase` |
| 5 | Fully refunded invoice is blocked from further refund | §5.2/§5.3 `remaining===0` → `fully_refunded` + guard |
| 6 | Partially refunded invoice allows refund only up to remaining | §5.2 `remainingRefundable` + §4.4 over-refund guard |
| 7 | Draft invoice cannot create a monetary refund | §5.1 base 0 + guard `refund_not_eligible` |
| 8 | Unpaid/cancelled invoice → cancellation/credit path, not cash | §5.3 `unpaid_use_credit`/`cancelled_use_credit` + alternative link |
| 9 | Partially paid refund capped at settled amount | §5.1 `min(paidAmount,total)` |
| 10 | Entire-invoice scope shows base/prior/remaining | §7.2 step 1 + §5 |
| 11 | Multi-device invoice shows selectable devices with per-device figures | §7.2 tree from `getInvoiceDevices()` + §5.4 device allocation |
| 12 | Line-item scope with per-line qty limited by remaining | §5.2 `lineRemainingQty` + §4.4 `return_exceeds_qty`/over-refund guard |
| 13 | Refunding one device leaves others untouched | §5.4 per-allocation; invoice totals immutable (§13) |
| 14 | Full Refund of Selected Scope vs Partial Refund | §7.2 step 2 + §4.1 `refund_kind` |
| 15 | Proposed + prior never exceeds eligible | §4.4 DB guard + §5 client validation |
| 16 | All devices+lines refunded for full remaining → Fully Refunded | §5.5 `refundStatus` derivation |
| 17 | Mandatory reason + optional comment | §4.1 `reason_code` NOT NULL + guard; §7.2 step 3 |
| 18 | Capture method/reference/initiated/approved/processed/notes | §4.1 lifecycle + audit columns |
| 19 | Gateway refund not "succeeded" until confirmed | §4.1 `pending/processing/succeeded/failed/reversed` + `settleRefund` |
| 20 | Money refund vs item return are separate | §4.1 vs §4.3 (independent, linkable via `refund_id`) |
| 21 | Returned part not auto-restocked; disposition-gated | §4.3 `disposition`/`disposition_status` + §6 `restockItemReturn` + `returns_restock` |
| 22 | Customer Return movement at cost, not selling price | §4.3 `unit_cost` + §6 restock values at cost |
| 23 | Reports show gross/net/refunds distinctly; no double count; original invoice immutable | §10 net metrics + §13 immutability + §8 non-destructive print annotation |
| 24 | **Fully-paid** invoice, full-scope refund of everything → **Fully Refunded** (`priorRefunded == total == refundableBase`) | §5.5 Finding-9 rule |
| 25 | **Partially-paid** invoice, max refund (`remainingRefundable == paidAmount`) → **Fully Refunded** of settled money (allocation scaled to fit `min(paidAmount,total)`, never over-refunds) | §5.5 + §7.2 step 2 scaling |
| 26 | Refund on a **`partial` (non-finalized)** invoice reduces `netCollected`/cash but does NOT push `revenueWonNet`/`Net Sales` below its correct value or negative | §10/§12 Finding-5 same-universe rule + §14 edge case |
| 27 | Σ(line tax refunds) for a full-invoice scope === `invoice.tax` exactly; a partial scope's Σ ≤ `invoice.tax`; ₹0-net scope ⇒ ₹0 tax | §5.4 budget-split allocation + residual paisa |
| 28 | Two concurrent manual `succeeded` refunds that are each individually valid but together exceed the balance → the second is rejected (`refund_exceeds_balance`) by the `for update` lock | §4.1 + §4.4 concurrency guarantee |
| 29 | Double-submitted refund reverses loyalty exactly once (no double-decrement of points/`lifetime_value`) | §9.5 refund-scoped unique index |
| 30 | Reverse a refund whose item was already restocked → money freed, loyalty restored, link retained, saleable stock NOT silently changed (corrected via a separate authorized adjustment) | §6 `reverseRefund` + §14 edge case |

(The spec's §1–§18 are fully covered; the acceptance scenarios above (the spec's 23 + 7 added during review to close the net-reporting, tax-allocation, concurrency, loyalty-idempotency, and reversal-restock gaps) enumerate the testable criteria. Each is independently verifiable via unit tests on `invoice-refunds.ts` helpers + integration tests on the store actions + DB guard, plus a manual UI pass.)

---

## 16. Testability
- **Unit (pure, no DB):** `invoice-refunds.ts` — `refundableBase`, `remainingRefundable`, `eligibility`, `allocate(scope, amount)`, `refundStatus` across the §14 edge cases + the 23 scenarios (deterministic fixtures: flat invoice, multi-device, partial-paid, fully-refunded, ₹0 line, 100%-discount, rounding-drift).
- **Integration (DB guard):** over-refund rejection (incl. `succeeded+pending+processing` summation), proforma/draft/cancelled rejection, self-approval block, qty-over-return rejection, duplicate gateway-draft unique index, **two concurrent manual `succeeded` inserts serialized by the `for update` lock (scenario 28)**, **loyalty reversal double-submit → one decrement (scenario 29, via the refund-scoped unique index)**, **`restock_item_return` atomicity (movement + `current_stock` bump + return update all-or-nothing)**, append-only revisions — run as real users in a rolled-back transaction (mirror `npm run leads:verify` / `sales-agent-verify.mjs` style).
- **Reconciliation:** a refund on a **finalized** invoice reduces `Net Sales`/`revenueWonNet` by exactly `refund_amount` while `billed`/`revenueWon`/`total`/`paidAmount` are unchanged; a refund on a **`partial`** invoice reduces `netCollected` but NOT `Net Sales`/`revenueWonNet` (scenario 26); Σ(line tax) === `invoice.tax` for a full-invoice refund (scenario 27).
- Run `npx tsc --noEmit` + `npm run build` before done.

---

## 17. Steering update (new workspace steering file)
Add `.kiro/steering/invoice-refunds.md` (repository-defined, same format/tone as `inventory-vs-invoice-line` / `permission-matrix` / `view-detail-pages`): the refund data model is the one source of financial-reversal truth; finalized invoices are immutable; refund status is derived; money-refund vs item-return are separate linked workflows; disposition-gated restock at cost; permission keys + segregation of duties; net ≠ gross in reports; distinct Credit Note print document; idempotency guards. Cite the reference implementations created here.

---

## 18. Files to create / modify

**Create**
- `supabase/migrations/0075_invoice_refunds.sql` — tables, sequences, guards, revisions, RLS, realtime (mirror `0063`); PLUS `restock_item_return()` SECURITY DEFINER function; PLUS the `loyalty_transactions.source_type` CHECK alter + the `loyalty_transactions_one_refund_reversal` partial unique index (§9.5).
- `src/lib/invoice-refunds.ts` — pure types + eligibility/allocation(budget-split tax)/status engine.
- `src/lib/refund-accounting-emitter.ts` — the `AccountingBridge`-based journal projection + module-level `recordTransaction` daily-ledger projection (mirror `expense-accounting-emitter.ts`), fired once per newly-observed `succeeded`/`reversed` refund from a UI effect (§6 Finding-3).
- `src/components/invoice/refund-flow.tsx` — the `RoxCenteredForm` multi-step workflow.
- `src/components/invoice/refunds-returns-section.tsx` — the View Invoice DetailSection.
- `.kiro/steering/invoice-refunds.md` — steering.

**Modify**
- `src/lib/store.tsx` — refund/return state + `processRefund`/`settleRefund`/`reverseRefund`/`recordItemReturn`/`restockItemReturn` (the last invokes the DB `restock_item_return()` function, not the state-only `addStockMovement`); `rowTo*`/`*ToRow` mappers; mount-query load; loyalty reversal (refund-scoped idempotent row); module-level `recordTransaction` daily-ledger projection. (The accounting-journal projection runs via the `refund-accounting-emitter` UI effect, not the store action — §6 Finding-3.)
- `src/lib/mock-data.ts` — `InvoiceRefund`/`InvoiceRefundAllocation`/`InvoiceItemReturn` types + `REFUND_STATUS_LABEL/TONE`.
- `src/app/(app)/invoice/page.tsx` — Process Refund `MenuItem` + Refund-status column/filter.
- `src/app/(app)/invoice/[id]/page.tsx` — Quick Action + hero pill/cards + Refunds & Returns section.
- `src/lib/permissions.ts`, `src/lib/permission-levels.ts`, `src/lib/capabilities.ts` — new keys/tiers/CAP.
- `src/lib/print-utils.ts`, `src/components/print/a4-template.tsx`, `src/app/print/[type]/[id]/page.tsx`, `src/lib/pdf-generator.ts` — Credit Note doc + original annotation.
- `src/lib/reports/kpis.ts`, `src/lib/agent-performance.ts`, `src/lib/leads-data.ts` (revenue net) — net-of-refund metrics.
- `src/lib/store-settings.tsx` — `refund_config`.
- Server route guards wherever a refund API endpoint is added (`requirePermission`).

---

## 19. Assumptions (flagged for review)
1. **No `payments[]` table exists** — payment state is scalar (`paidAmount`); eligibility reads `min(paidAmount,total)` as the settled refundable base. If a richer payment ledger is introduced later, `refundableBase` is the single place to swap in per-payment settlement logic.
2. **The two ledger services are demo/localStorage** and are projection targets, not the financial authority; the DB `invoice_refunds` table is authoritative. If they are promoted to DB-backed later, the projection calls stay the same.
3. **Invoicing does not auto-decrement stock today**, so a return creates a *new* Customer Return inward movement rather than reversing a non-existent decrement.
4. **`refund_amount` is gross** (net + tax); the net/tax split is always derived and persisted so GST reconciliation and the Credit Note are exact.
5. The sibling worktree `inventory-costing-redesign` may later enrich `StockMovement` with per-item qty/cost; this design uses the current `stock_movements` shape (qty/stores/actor/type/docNumber only) and stores `sku`/`unit_cost`/source-link on the `invoice_item_returns` record so it is forward-compatible — extending `StockMovement` itself is out of scope.

---

## 20. Review responses (revision pass — resolving `invoice-refunds-design-review.json`)

Every HIGH and MEDIUM finding is resolved by a concrete design decision verified against the actual source in the worktree; both NITs are also closed. Nothing was backlogged or ignored.

| # | Sev | Finding | Resolution (section) |
|---|---|---|---|
| 1 | HIGH | Loyalty reversal idempotency claim false (`one_earn_per_source` is `where type='earn'`) | **§9.5** — new refund-scoped partial unique index `loyalty_transactions_one_refund_reversal` keyed on the refund uuid; reversal written once in the `succeeded` operation. §6 bullet rewritten. Verified against `0032_loyalty_ledger.sql:72–76`. |
| 2 | HIGH | `restockItemReturn` relied on a stock increment `addStockMovement` doesn't do | **§6 `restockItemReturn`** + **§4.4 `restock_item_return()`** — explicit atomic DB function: insert `Return` movement + `update inventory_items.current_stock += qty` + set return `completed`/`stock_movement_ref`; stated as net-new logic. Verified `addStockMovement` (`store.tsx:2838`) is state-only; `updateInventoryItem` (`:2857`) writes `current_stock`. |
| 3 | HIGH | Ledger projection called React hooks from a store action | **§6 Ledger projection** — daily ledger via module-level `recordTransaction()` (`daily-ledger-service.ts:544`); journal via the `AccountingBridge` pattern (`expense-accounting-emitter.ts`) fired once per `succeeded` refund in a UI effect (seen-set keyed by refund uuid). `AccountingProvider` mount confirmed (`providers.tsx:32`). New file `refund-accounting-emitter.ts` (§18). |
| 4 | MED | `StockMovement` can't carry item/cost/source-ref | **FR-21 / §4.3** — division of fields made explicit: movement = qty/stores/actor/type/docNumber; `sku`/`unit_cost`/`refund_id` live on `invoice_item_returns` (`stock_movement_ref` links them). Extending `StockMovement` is out of scope. Verified type at `inventory-data.ts:201`. |
| 5 | MED | Net-revenue base asymmetric (`partial` eligible vs `paid`-only gross) | **§10 / §12 / §14** — subtract from `revenueWonNet`/`Net Sales` ONLY refunds whose parent `isFinalizedInvoice` (same `paid` universe as gross); `partial`-invoice refunds hit `netCollected` only. Scenario 26 added. Verified `isFinalizedInvoice` at `leads-data.ts:1234`. |
| 6 | MED | `source_type` CHECK collision not addressed | **§9.5** — `0075` alters the CHECK to add `'refund'` + adds the refund-scoped unique index; reversal rows use `source_type='refund'`, `source_id=<refund uuid>`. Verified CHECK at `0032:57`. |
| 7 | MED | Guard summation set + concurrency under-specified | **§4.1 / §4.4 / §5.2** — realized set (`succeeded`) vs guard set (`succeeded+pending+processing incl. new row`) separated; manual-insert concurrency serialized by `select ... for update` on the invoice inside `invoice_refundable_base`. |
| 8 | MED | Effective-tax-rate allocation can exceed `invoice.tax` | **§5.4** — tax is now a budget split of `invoice.tax` weighted by `lineNetAfterDisc` with residual paisa to the largest line (Σ === `invoice.tax` exactly; ₹0-net ⇒ ₹0 tax). Scenario 27 added. |
| 9 | MED | Full-scope → Fully Refunded vs capped base (partially-paid) | **§5.5 / §7.2 step 2** — Full Refund capped at `remainingRefundable`, allocations scaled by `min(1, remainingRefundable/scopeGrossSum)`; `fully_refunded` ⇔ `priorRefunded == refundableBase`. Scenarios 24 + 25 added. |
| 10 | MED | Credit Note print id contract ambiguous | **§8** — `[type]='credit_note'`, `[id]=<invoice_refunds.id uuid>`; loader finds refund + allocations + parent invoice → `buildCreditNotePrintData`; unauthorized/missing → not-found; route gated by `CAP.invoice.print` + refund visibility. Verified route pattern at `print/[type]/[id]/page.tsx`. |
| 11 | MED | Reversal effect on item-return/restock undefined | **§6 `reverseRefund` / §14** — money reversal is independent of the physical return (link retained), loyalty re-reversed once, and an already-restocked part is corrected only via a separate authorized `Adjustment`/outward movement — never a silent stock edit. Scenario 30 added. |
| 12 | NIT | One pending refund blocks a multi-device invoice | **§4.1** — stated as a deliberate first-impl limitation (one in-flight gateway refund per invoice, with clear UI messaging); manual sequential device refunds still allowed; relaxing deferred. |
| 13 | NIT | `view_profitability` placed in invoices Manage tier | **§9** — moved to the reports module **view** tier next to `view_profit_margin` (verified `permission-levels.ts:300–301`); CAP wired granular-first with the coarse fallback; coverage check noted. |
