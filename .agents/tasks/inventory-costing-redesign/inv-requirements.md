# Inventory Master + Repair Service Costing Redesign — Requirements

Feature branch: `feature/inventory-costing-redesign`
Worktree: `/Users/apple/Desktop/Reapirox dummy2/app/.worktrees/inventory-costing-redesign`

## Summary

Redesign the Add Inventory form and the inventory/costing model so that a catalogue
item is created through ONE clear **Item Type** choice — **Part / Product** (physical,
purchasable, stockable, sellable) or **Repair Service / Labour** (service, no stock) —
instead of the confusing `Product/Service` + `Buy / Sell / Both` controls. Item Type
drives which fields and costing rules render. Introduce explicit **Cost Price (CP)** and
**Selling Price (SP)** (and a **Service Charge** / **Standard Labour Cost** pair for
services) in place of the single generic `Default Price`, keep the Inventory Master the
single source of truth for cost, add explicit opening-stock/ledger records (never silently
increasing stock on create or on invoice add), wire two distinct Invoice entry paths
(**Add Part** vs **Add Service**), compute parts/service/combined gross profit and margin
under an existing permission-controlled visibility gate, and ensure internal costing never
appears on customer printouts.

All work must reuse existing architecture (shared inventory form fields, `InventorySearchBox`,
`AddInventoryModal`, `RoxCenteredForm`, the GST/SGST/CGST split, the Ticket→Invoice
conversion, the permission system) and preserve historical data with backward-compatible,
additive migrations.

---

## Codebase-Reality Audit (findings that constrain the design)

### A. Current valuation approach and its limitations (spec §4)

**Finding: RepairOX today has NO stock-cost ledger. Cost is item-level only, and even
that cost is FABRICATED, not entered.**

- `InventoryItem` (`src/lib/inventory-data.ts`) stores a single `defaultPrice` plus
  derived tiers (`regularBuyingPrice`, `wholesaleBuyingPrice`, `regularSellingPrice`,
  `mrp`, `dealerPrice`, `distributorPrice`). The DB table `inventory_items`
  (migration `0001_initial_schema.sql`) mirrors these columns.
- `buildInventoryItem` / `inventoryUpdateFromForm` (`src/components/inventory/inventory-item-form.tsx`)
  and the Add Item page (`src/app/(app)/inventory/add-item/page.tsx`) **derive every
  price from `defaultPrice`**: `regularBuyingPrice = round(price*0.7)`,
  `wholesaleBuyingPrice = round(price*0.65)`, `mrp = round(price*1.2)`, etc. So the
  stored "buying price" is a hard-coded 70% of the selling price — it is **not a real
  cost** and must not be treated as one.
- There is NO FIFO / weighted-average layer, NO purchase-receipt cost capture, NO per-unit
  cost history. `StockMovement` (`inventory-data.ts` / `stock_movements` table) records
  only `items` (a quantity), `fromStore`, `toStore`, `type`, `status`, `user`, `date` —
  **no unit cost, no total value, no item id, no lot/layer**.
- `deductPartsForTicket` (`src/lib/store.tsx`) reduces `current_stock` by `part.qty` and
  writes an Outward `stock_movements` row with the quantity only — again no cost.

**Conclusion / limitation to respect:** The current app only supports item-level buying
prices (and those are synthetic). Per the spec, this limitation must be audited *before*
upgrading to a stock-cost ledger. This redesign therefore:
  1. Introduces a real, user-entered **Cost Price (CP)** as the item-level default cost
     (replacing the synthetic `regularBuyingPrice` derivation as the primary cost source).
  2. Adds a **minimal stock-cost ledger foundation** so Purchase/Stock In can record
     actual received quantity + unit cost, and so invoice profitability can resolve an
     actual sold cost via a supported valuation method (**weighted average chosen** —
     see FR-16) with a safe fallback to the item-level CP.
  3. Treats the item-master CP as a DEFAULT ("Cost not configured" when truly absent),
     never silently rewriting historical cost when the catalogue CP changes.

### B. Legacy `item_type` (Product/Service) + `mode` (Buy/Sell/Both) mapping (spec §1)

**How legacy values are stored:**
- `inventory_items.item_type` text, default `'Product'` (values seen: `Product`, `Service`).
- `inventory_items.mode` text, default `'Both'` (values: `Buy`, `Sell`, `Both`).
- App type: `ItemType = "Product" | "Service"`, `ItemMode = "Buy" | "Sell" | "Both"`
  (`inventory-data.ts`). `rowToInventoryItem` defaults `type → "Product"`, `mode → "Both"`.

**Mapping to the new single Item Type:**

| Legacy `item_type` | New Item Type |
|---|---|
| `Product` | **Part / Product** |
| `Service` | **Repair Service / Labour** |
| null / empty | **Part / Product** (DB default is `Product`) |
| any other / unrecognised value | **FLAG — do not auto-map; leave as Part/Product and surface for admin review** |

The `mode` (Buy/Sell/Both) column is **retired from the UI** but **NOT dropped from the DB**
(preserve history + backward compat). Mapping notes:
  - `mode` does not cleanly determine Item Type. A `Service` + any mode → Repair Service.
    A `Product` + any mode → Part/Product (a `Buy`-only product is still a stockable part;
    a `Sell`-only product is still a part sold without purchase tracking).
  - **Items that CANNOT be mapped cleanly / must be flagged, not assumed:**
    - `item_type` values outside {`Product`,`Service`} (none seen in schema defaults, but
      possible from imports) — flag for review.
    - A `Service` item that carries non-zero `current_stock` / `min_stock` / `max_stock`
      (contradicts "service has no stock") — map to Repair Service but FLAG the orphaned
      stock values for admin reconciliation; do not silently discard them.
  - Backfill is **non-destructive**: the migration adds the new columns and (optionally)
    seeds `item_kind` from `item_type`, but never overwrites `item_type`/`mode` and never
    bulk-rewrites prices or stock.

### C. Latest migration number (spec: additive + idempotent)

Latest migration in `supabase/migrations/` is **`0074_lead_multi_device.sql`**.
(Note: there is a pre-existing duplicate `0064_` prefix — `0064_lead_deals_owner_self_approval.sql`
and `0064_quotation_module.sql` — but the highest sequential number is 0074.)
→ **New migration(s) start at `0075`**, must be **additive** (`alter table … add column if
not exists`, `create table if not exists`, guarded trigger drops) and **idempotent**.

### D. Existing permission plumbing already present (reuse, do not duplicate — spec §7, permissions)

Much of the required permission surface ALREADY EXISTS and must be reused:
- `src/lib/permissions.ts` union + `PERMISSION_GROUPS`:
  `inventory_view_cost` ("View Cost / Purchase Price"), `inventory_edit_cost`
  ("Edit Cost / Buying Price"), `view_profit_margin` ("View Profit / Margin"),
  `view_revenue_totals`, plus the core `view_inventory` / `create_item` / `edit_item` /
  `delete_item` / `adjust_stock` / `stock_movement` / `manage_inventory`.
- `src/lib/permission-levels.ts` `inventory` module tiers:
  Work includes `inventory_view_cost`; Manage includes `inventory_edit_cost`;
  the `reports` module View tier includes `view_profit_margin` / `view_revenue_totals`.
- `src/lib/capabilities.ts`:
  `CAP.inventory.{view,create,edit,delete}` and
  `CAP.sensitive.{viewCost,editCost,viewProfit,viewRevenue}` (granular-first with
  `manage_inventory` / `view_financial_reports` coarse fallbacks; `full_access`/`*` implied).

**Conclusion:** The redesign should **reuse** `CAP.sensitive.viewCost` to gate CP /
Standard Labour Cost visibility, `CAP.sensitive.editCost` to gate editing them, and
`CAP.sensitive.viewProfit` to gate the Profitability Breakdown. A NEW capability is only
needed if a distinct "view service labour cost / view profitability breakdown" gate is
desired beyond `view_profit_margin` + `inventory_view_cost`. Default stance: reuse the
existing keys; only add a new key if the design review decides the profitability panel
needs its own toggle (see Open Questions Q1). Any new key must be registered in all layers
(union + PERMISSION_GROUPS + PERMISSION_MODULES tier + CAP + server guard + RLS), OFF by
default, granular-first.

### E. Item Code / Service Code — no auto-code exists today (spec §2A, §3A)

- Current form auto-generates a client-side `SKU-${Date.now().slice(-6)}` or a
  name-prefixed `XXX-0000` only when the user leaves SKU blank. There is **no permanent,
  unique, sequential Item Code**, and `inventory_items.id` is a free-text primary key
  currently reused as the SKU.
- **Reusable convention:** the Quotation module (`0064_quotation_module.sql`) uses a
  Postgres sequence + a `BEFORE INSERT` stamp trigger:
  `next_quotation_no() → 'QT-' || lpad(nextval('quotation_no_seq'),4,'0')`, and
  `quotations_stamp_no_trg` fills the number when blank. **Reuse this exact pattern** for
  `item_code` (`PRT-000001`) and `service_code` (`SRV-000001`): org-level sequence +
  stamp trigger, number is server-generated, immutable, and distinct from the free-text
  `id`/SKU. Keep stock quantities store-specific (`inventory_items.branch_id`).

### F. Invoice line item + Ticket→Invoice reality (spec §5, §6)

- Invoice line items are `InvoiceLineItem` (`mock-data.ts`): `{ id, sku?, name,
  description?, qty, price, taxClass?, discount, total }` — **no cost field, no
  part-vs-service discriminator**. Devices carry `parts: InvoiceLineItem[]`, plus a
  separate `repairCost` (a billed labour component) and `estimateValue` (reference only).
- `StepProducts` (`src/app/(app)/invoice/create/page.tsx`) already distinguishes
  **Search Inventory** (adds existing master item as a line via `addInventoryLine`, bumps
  qty on duplicate SKU) from **Add Inventory** (opens `AddInventoryModal` to create a
  master record), and has an **Add Row** (`addService`) that inserts a blank free-text
  line. There is currently **no Service Catalogue search** and no cost capture on lines.
- Ticket→Invoice: `ticketDeviceToInvoiceDevice` maps `TicketPart[] → InvoiceLineItem[]`
  (preserving sku/qty/unitPrice/total), maps ticket `estimate → estimateValue`
  (reference, never a billable line), and sets `repairCost = 0`. Totals
  (`StepProducts`/`StepPricing`): `subtotal = partsTotal + repairCost`;
  `estimateTotal` is NOT added to the billed total; GST splits into SGST+CGST.
  **Conclusion:** The existing design already (a) does not treat the Estimate as a
  billable line and (b) keeps a single parts/line structure — extend it with a line
  `kind` (part|service) and an internal `cost` rather than forking a new structure.
- **Duplicate-deduction risk:** `deductPartsForTicket` consumes stock from TICKET parts
  (status `planned → used`) and writes Outward movements. If invoice finalization ALSO
  deducts stock for the same inventory items, stock would be consumed twice. The redesign
  must reconcile: a single stock-consumption point per fulfilment, idempotent and guarded
  (see FR-12 / NFR-3).

### G. Print safety (spec §3B, §7)

- `PrintLineItem` (`print-utils.ts`): `{ sku, name, description?, qty, price, taxClass?,
  discount, total }` — **no cost/labour field**, and `buildInvoiceInfo` maps only those
  fields. So internal CP / Standard Labour Cost / profitability **do not currently leak**
  to print. The redesign must preserve this: never add cost/labour/profit to
  `PrintLineItem`, `buildInvoiceInfo`, `buildTicketInfo`, or `QuotationA4`.

---

## Functional Requirements

### Item Type & form restructure

- **FR-1** Remove the `Buy / Sell / Both` selector from the Add/Edit Inventory UI
  (`inventory-item-form.tsx` `InventoryItemFields`, the full Add Item page, and the
  `AddInventoryModal`). The underlying `mode` column/field is retained in data for
  backward compatibility but is no longer user-facing (defaulted on new items).
- **FR-2** Replace the `Product / Service` segmented control with ONE **Item Type**
  selector offering exactly two options: **Part / Product** and **Repair Service /
  Labour**. The selection drives which sections/fields and costing rules render.
- **FR-3** Introduce an item discriminator `item_kind` (`part` | `service`) that is the
  new source of truth for Item Type, seeded from legacy `item_type` per Audit §B. Keep
  `item_type` populated for backward compatibility (`part → Product`, `service → Service`).

### Part / Product form (spec §2)

- **FR-4 (Identity)** For Part/Product show: **Item Code** (auto-generated, unique,
  permanent, org-level, read-only, e.g. `PRT-000001` via a DB sequence + stamp trigger —
  Audit §E), **SKU** (optional external ref), **Barcode** (optional, unique where set),
  **Item Name** (required), **Description** (optional), **Item Category** (required),
  **Brand / compatible device or model** (optional), **Unit of Measurement**. Item Code,
  SKU and Barcode are three separate identifiers; none replaces the others; the Item Code
  is never a customer/invoice id.
- **FR-5 (Pricing)** Replace the generic **Default Price** with distinct labelled fields:
  **Cost Price (CP)** (internal default cost/unit, visible only to authorized users),
  **Selling Price (SP)** (customer default price/unit). Retain MRP + wholesale / dealer /
  distributor prices under an **Advanced Pricing** section. CP and SP are stored and
  displayed as DIFFERENT values; CP must not be derived from SP (and vice-versa). The item
  CP is a DEFAULT only — the actual cost of a sold unit comes from valuation records (FR-16).
- **FR-6 (Inventory Tracking)** For Part/Product show: **Track Stock** toggle, **Opening
  Quantity** (only when explicitly creating an opening balance), **Opening Stock Unit Cost**
  (required when opening quantity is entered), **Store / warehouse**, **Minimum Stock
  Level**, **Maximum Stock Level**. Entering opening quantity + cost MUST create a proper
  opening-stock/ledger record (FR-13). Creating an item (or adding it to an invoice) must
  **never** silently increase stock.
- **FR-7 (Tax)** For Part/Product show: **HSN Code**, **Applicable GST rate**, **Unit of
  Measurement**, using the existing goods tax classification labels, GST options and
  validation.
- **FR-8 (Open-from-Invoice)** When the form is opened from the Invoice Products step
  (`AddInventoryModal`), saving creates the catalogue record and returns it to the invoice
  where it is auto-selected (preserve existing `onCreated` behaviour). Any initial stock
  is entered only via an explicit opening-stock/stock-receipt action — not implicitly by
  the invoice.

### Repair Service / Labour form (spec §3)

- **FR-9 (Service Identity)** For Repair Service show: **Service Code** (auto-generated
  unique, e.g. `SRV-000001`, same trigger pattern), **Service Name** (required),
  **Description**, **Service Category**, applicable **device category / brand / model**
  (optional), **Unit / billing basis**. No physical-stock identifiers beyond the code.
- **FR-10 (Service Pricing)** For Repair Service show: **Service Charge** (customer-facing
  default SP), **Standard Labour Cost** (estimated internal cost, explicitly labelled
  "standard / estimated", NOT actual job cost), and the applicable **tax classification /
  rate**. Do NOT show stock quantity, stock balance, opening stock, min/max or reorder
  controls for a service.
- **FR-11 (Service costing semantics)** Standard Labour Cost is an internal costing value.
  It must NEVER appear on the printed customer invoice/quotation/ticket (Audit §G). Service
  Charge contributes to customer invoice revenue; Standard Labour Cost contributes to
  internal service-cost reporting only.

### Pricing & inventory logic (spec §4)

- **FR-12 (Single stock-consumption point)** Finalized sales reduce stock through the
  EXISTING stock-movement logic only. Guard against double deduction: if a ticket already
  consumed parts (`deductPartsForTicket`), invoice finalization for the same fulfilment
  must not consume them again. Stock consumption is idempotent and recorded as a single
  Outward movement per unit of fulfilment.
- **FR-13 (Opening/receipt ledger)** Opening Quantity + Opening Stock Unit Cost, and
  Purchase / Stock In, record actual quantity received and purchase unit cost as
  stock-cost ledger entries (a cost-carrying stock movement). Services never create stock
  movements.
- **FR-14 (No silent cost rewrite)** Editing the catalogue CP changes the item-level
  default cost for FUTURE valuation defaults only; it never rewrites historical cost
  values on past stock layers or finalized invoices.
- **FR-15 (Single source of truth)** The Inventory Master is the canonical source for item
  identity and default pricing; the stock-cost ledger is the canonical source for actual
  per-unit cost. There are no competing cost stores.
- **FR-16 (Valuation method)** Invoice profitability resolves the actual parts cost via a
  supported valuation method. **Weighted average** is chosen (simplest correct method over
  the existing minimal ledger; cheaper to compute than FIFO layer tracking and adequate for
  the current data). When no ledger cost exists, fall back to the item-master CP; when even
  CP is absent, treat parts cost as **"Cost not configured"** (not zero) in profitability.

### Invoice integration (spec §5)

- **FR-17 (Add Part)** The Products step provides an **Add Part** path: search the
  Inventory Master (reuse `InventorySearchBox`, which is already store-scoped), select the
  existing item, enter quantity, load the current default SP onto the line, and resolve the
  valuation cost internally onto the line (not shown to customer). Preserve stock-
  availability display/validation and existing permissions.
- **FR-18 (Add Service)** The Products step provides a distinct **Add Service** path:
  search the Service Catalogue (service-kind master items), select a repair service, load
  its default Service Charge onto the line, and resolve its Standard Labour Cost internally
  onto the line. Adding a service MUST NOT touch physical inventory quantities. (The
  existing free-text "Add Row" may remain as a manual non-catalogue charge, but it is not
  the Add Service path.)
- **FR-19 (Line discriminator + internal cost)** Extend `InvoiceLineItem` with a `kind`
  (`part` | `service`) and an internal `cost` (resolved unit cost / labour cost), both
  optional for backward compatibility. These feed profitability and are never printed.
- **FR-20 (Ticket→Invoice prefill)** Ticket→Invoice conversion prefills applicable parts
  and services from existing Ticket records without duplicating them, continues to map the
  Ticket Estimate to `estimateValue` (reference only, never a billable line), and preserves
  the existing SGST/CGST/discount behaviour.

### Profitability (spec §6, §7)

- **FR-21 (Calculations)** For an invoice containing parts and services compute, over
  **eligible net revenue** (after discount, excluding collected GST):
  - Parts gross profit = eligible net parts revenue − actual parts cost.
  - Service gross profit = eligible net service revenue − service labour cost.
  - Combined gross profit = eligible net invoice revenue − parts cost − service labour cost
    − other recorded direct costs (where supported).
  - Gross margin = gross profit ÷ eligible net revenue × 100, only when the denominator > 0
    (otherwise show "—", never NaN/0 implied as real).
- **FR-22 (Revenue eligibility)** Only FINALIZED eligible invoices contribute realized
  revenue/profit (reuse `isFinalizedInvoice`; exclude estimates/quotations/proformas/
  drafts/cancelled). Collected GST is never counted as revenue. Apply existing discount /
  GST / refund / cancellation rules. Where a cost is missing, show "Cost not configured"
  rather than assuming zero.
- **FR-23 (Profitability Breakdown view)** Provide a permission-controlled internal
  Profitability Breakdown showing Parts Revenue, Service Revenue, Parts Cost, Labour Cost,
  Other Direct Costs (where supported), Gross Profit and Gross Margin. It is hidden from
  customer printouts and from unauthorized roles (gated via `CAP.sensitive.viewProfit`,
  with CP/labour figures additionally honouring `CAP.sensitive.viewCost`).

### Save / edit / historical safety (spec §8)

- **FR-24** Item Code and Service Code are unique and stable (immutable once assigned).
- **FR-25** Editing CP / SP / Service Charge / Standard Labour Cost affects future defaults
  only; it never alters finalized invoices or historical stock-layer costs. Preserve the
  existing price levels (MRP/dealer/distributor) and all historical values.
- **FR-26** Referenced items are archived/deactivated (`active = false`), never hard-
  deleted, when they have transactional history (reuse the existing `active` flag +
  `deleteInventoryItem`/soft-delete columns `deleted_at`/`deleted_by`).
- **FR-27 (Backend enforcement)** All validation and authorization are enforced on the
  backend (API route guards + RLS), not UI-only. Unauthorized users are blocked from
  viewing or changing internal costing / profitability at the server and RLS layers.

---

## Non-Functional Requirements

- **NFR-1 (Additive migrations)** New schema is delivered in migration(s) starting at
  `0075`, additive and idempotent (`add column if not exists`, `create table if not
  exists`, guarded trigger `drop if exists` + recreate). No destructive column drops; no
  bulk rewrite of historical prices/stock. Register new permission keys per the
  permission-matrix standard.
- **NFR-2 (Backward compatibility)** Existing `InventoryItem` records (single
  `defaultPrice`, derived tiers, `item_type`/`mode`) continue to load and display without
  error. Legacy invoices/line items without `kind`/`cost` still render and total correctly.
- **NFR-3 (Idempotent stock & numbering)** Stock consumption and code generation are
  idempotent under double-submit / retry (reuse the double-submit guards already present in
  `AddInventoryModal` and the invoice save flow; use DB sequence + stamp trigger for codes).
- **NFR-4 (Design-system reuse)** Reuse `RoxCenteredForm`, `InventoryItemFields`,
  `InventorySearchBox`, `AddInventoryModal`, shared `Field`/`Input`/`Select`/`SegmentedTabs`,
  the existing GST/SGST/CGST calc, shared table/pill/field primitives, and the shared
  section/detail primitives. Honour the inventory-vs-invoice-line steering (Search = add
  existing; Add Inventory = create master; Add Service = catalogue service; never one
  "Add Item" button for both master-create and line-add). Honour view-vs-edit gating
  (`canEdit`, `<fieldset disabled>`), per-section permission.
- **NFR-5 (Performance / scope)** Inventory search and valuation stay store-scoped
  (branch_id + RLS); profitability resolution is in-memory over already-loaded records (no
  N+1 queries in the UI path).
- **NFR-6 (Verification)** `npx tsc --noEmit` and the project build pass; profitability and
  valuation calculations are covered by tests (weighted-average cost, zero-denominator
  margin, missing-cost "Cost not configured", GST-excluded revenue, finalized-only
  eligibility, double-deduction guard).

---

## Acceptance Criteria

Numbered, testable. Includes the acceptance scenarios from the spec.

1. The Add/Edit Inventory form shows a single **Item Type** control with **Part / Product**
   and **Repair Service / Labour** — and NO `Buy / Sell / Both` and NO `Product / Service`
   control anywhere in the UI.
2. Selecting **Part / Product** renders Item Identity (Item Code read-only, SKU, Barcode,
   Name*, Description, Category*, Brand/model, UoM), CP + SP (+ Advanced Pricing with
   MRP/wholesale/dealer/distributor), Inventory Tracking (Track Stock, Opening Qty, Opening
   Unit Cost, Store, Min, Max), and Tax (HSN, GST, UoM).
3. Selecting **Repair Service / Labour** renders Service Identity (Service Code read-only,
   Name*, Description, Service Category, device category/brand/model, Unit/billing basis),
   Service Charge + Standard Labour Cost, and tax — with NO stock quantity / opening stock /
   min-max / reorder controls visible.
4. A new Part/Product receives a unique, permanent, server-generated Item Code of the form
   `PRT-000001` (sequential), distinct from its SKU and Barcode; a new Service receives
   `SRV-000001`. Codes are immutable on edit.
5. **CP ≠ SP example:** entering CP = ₹1,800 and SP = ₹2,500 stores and displays both as
   different values; a per-unit preliminary margin of ₹700 is derivable (before other
   direct costs / tax). CP is not derived from SP.
6. **Service margin example:** entering Service Charge = ₹500 and Standard Labour Cost =
   ₹200 yields a preliminary service gross profit of ₹300; the Standard Labour Cost is
   labelled standard/estimated.
7. Creating an inventory item with NO opening quantity does NOT create any stock movement
   and leaves stock at 0; adding an existing item to an invoice does NOT change its stock
   until the single finalization/consumption point fires.
8. Entering Opening Quantity + Opening Stock Unit Cost creates a proper opening-stock /
   ledger entry carrying the quantity AND the unit cost (not a bare quantity movement).
9. From the Invoice Products step, **Add Inventory** creates a real Inventory Master record
   and returns it auto-selected to the invoice; its initial stock is only established via an
   explicit opening-stock/stock-receipt action, never by the invoice.
10. The Invoice Products step offers two distinct paths: **Add Part** (search Inventory
    Master → select → qty → loads SP → resolves valuation cost internally, with stock-
    availability validation preserved) and **Add Service** (search Service Catalogue →
    select → loads Service Charge → resolves Standard Labour Cost internally, with NO
    inventory-quantity effect).
11. Ticket→Invoice conversion prefills applicable parts and services from the ticket
    without duplicating them, does NOT add the Ticket Estimate Value as a billable line,
    and preserves existing discount/GST totals.
12. Finalizing an invoice for a ticket whose parts were already deducted does NOT deduct the
    same stock a second time (no double consumption); a single Outward movement per unit of
    fulfilment is recorded.
13. For an invoice with parts and services, the internal Profitability Breakdown shows
    Parts Revenue, Service Revenue, Parts Cost, Labour Cost, Gross Profit and Gross Margin,
    computed per FR-21 over eligible net revenue (after discount, excluding collected GST).
14. Gross margin shows "—" (not 0 or NaN) when eligible net revenue is 0.
15. A part with no ledger cost and no CP shows "Cost not configured" in profitability — not
    ₹0 cost / 100% margin.
16. Actual parts cost in profitability uses the weighted-average ledger cost when ledger
    layers exist, and falls back to the item-master CP otherwise (never the synthetic
    `defaultPrice*0.7` buying price).
17. Draft / proforma / quotation / estimate / cancelled invoices contribute ZERO realized
    revenue and profit; only finalized eligible invoices contribute.
18. The printed customer invoice (and ticket/quotation) shows NO Cost Price, NO Standard
    Labour Cost, NO internal cost and NO profitability figures.
19. Editing an item's CP/SP/Service Charge/Standard Labour Cost changes future defaults only
    and does not alter any already-finalized invoice total or historical stock-layer cost.
20. A referenced item cannot be hard-deleted; it is archived (`active = false`) and remains
    resolvable on historical documents.
21. A user WITHOUT the cost-visibility capability (`CAP.sensitive.viewCost`) cannot see CP /
    Standard Labour Cost in the form or on invoice lines; a user WITHOUT
    `CAP.sensitive.viewProfit` cannot see the Profitability Breakdown — enforced in UI AND
    at the server/RLS layer (verified by a server-side rejection, not just a hidden button).
22. Legacy items load without error: `item_type = Product`→Part/Product,
    `Service`→Repair Service; a `Service` item carrying stock values is mapped to Repair
    Service with its stray stock values flagged for review (not silently discarded); any
    unrecognised `item_type` is flagged, not auto-mapped.
23. Migrations are additive/idempotent, numbered from `0075`, and re-runnable without error;
    no historical price/stock/`item_type`/`mode` values are overwritten.
24. `npx tsc --noEmit` and the build pass; calculation tests (weighted average,
    zero-denominator margin, missing-cost, GST-excluded revenue, finalized-only, double-
    deduction guard) pass.

---

## Constraints

- **permission-matrix**: Reuse `CAP.inventory.*` and `CAP.sensitive.{viewCost,editCost,
  viewProfit}` where they fit. Any NEW capability key must be registered in ALL layers
  (`PermissionKey` union + `PERMISSION_GROUPS` def + `PERMISSION_MODULES` tier + `CAP` entry
  + server `requirePermission` + RLS `auth_has_any`), granular-first + coarse fallback, OFF
  by default. Never gate with `if (role === …)`.
- **design-system / inventory-vs-invoice-line**: Reuse the shared inventory form, search box,
  centered-form shell and GST calc; keep Search (add existing) distinct from Add Inventory
  (create master) distinct from Add Service (catalogue service); never a single "Add Item"
  for both. Honour view-vs-edit gating on every create/edit surface.
- **additive migrations**: New SQL starts at `0075`, additive + idempotent; preserve legacy
  columns (`item_type`, `mode`, derived price tiers), configured values and all historical
  data; follow the quotation numbering (sequence + stamp trigger) convention for codes.
- **single source of truth**: Inventory Master = identity + default pricing; stock-cost
  ledger = actual per-unit cost. No duplicate/competing cost stores; no fork of the invoice
  line structure, the stock-movement engine, or the Ticket→Invoice conversion.
- **print safety**: Never add cost/labour/profit fields to `PrintLineItem` /
  `buildInvoiceInfo` / `buildTicketInfo` / `QuotationA4`.

---

## Open Questions / Assumptions

- **Q1 (permission granularity):** Reuse `view_profit_margin` + `inventory_view_cost` for
  the Profitability Breakdown + CP visibility, or add a dedicated
  `inventory_view_profitability` / `inventory_view_labour_cost` key? **Assumption:** reuse
  existing keys (CP/labour → `CAP.sensitive.viewCost`; breakdown → `CAP.sensitive.viewProfit`)
  unless the design review wants a dedicated toggle. Flagged for the design step.
- **Q2 (valuation scope):** Weighted average is chosen (FR-16). Confirm FIFO is NOT required
  now. **Assumption:** weighted-average with CP fallback is sufficient; FIFO layer tracking
  is out of scope for this pass but the ledger schema should not preclude it later.
- **Q3 (stock-cost ledger depth):** The spec says "audit the limitation before upgrading to
  a stock-cost ledger." **Assumption:** deliver a MINIMAL cost-carrying stock ledger
  (quantity + unit cost + item id on stock movements / a stock-layer table), not a full
  multi-warehouse lot/FIFO engine. Confirm depth in design.
- **Q4 (Track Stock off):** For a Part/Product with Track Stock = off, confirm it behaves
  like a sellable non-stock good (no availability block, no deduction) while still being a
  "part" (not a service). **Assumption:** yes.
- **Q5 (Opening stock on edit):** Opening Quantity/Unit Cost is a create-time concept.
  **Assumption:** on EDIT the opening-stock fields are not re-editable; further stock enters
  only via Purchase/Stock In — matching "don't silently change stock on edit."
- **Q6 (double-deduction authority):** Which flow is the single consumption point —
  `deductPartsForTicket` on ticket completion, or invoice finalization? **Assumption:** the
  ticket-driven `deductPartsForTicket` remains authoritative for ticket-originated
  fulfilment; invoice finalization only deducts for parts NOT already consumed by a linked
  ticket. Confirm in design.
- **Q7 (`item_kind` vs `item_type`):** Introduce a new `item_kind` (part|service) column, or
  overload the existing `item_type`? **Assumption:** add `item_kind` and keep `item_type`
  in sync for backward compatibility, so legacy readers of `item_type` keep working.

## Out of Scope

- Full FIFO / lot / multi-warehouse valuation engine (minimal weighted-average ledger only).
- Actual technician-time labour costing from work logs (architecture must allow it later,
  but Standard Labour Cost is the only service cost captured now).
- Purchase Order / vendor workflow redesign (reuse the existing Purchase/Stock In concept;
  only ensure it can record quantity + unit cost into the ledger).
- Redesigning the Invoice pricing/GST model, the Ticket model, or the print templates beyond
  adding the two Invoice entry paths and the internal (non-printed) profitability view.
- Customer-facing display of any cost, labour, or margin figure.
