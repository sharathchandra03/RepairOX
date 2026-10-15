# Inventory Master + Repair Service Costing Redesign — Implementation Plan

Worktree: `/Users/apple/Desktop/Reapirox dummy2/app/.worktrees/inventory-costing-redesign`
Nested repo root: `/Users/apple/Desktop/Reapirox dummy2/app`
Design: `.agents/tasks/inventory-costing-redesign/inv-design.md` (Revision 4, APPROVED)
Requirements/contract: `.agents/tasks/inventory-costing-redesign/inv-requirements.md` (24 ACs)

## Project build / test commands (discovered)

- Type check: `npx tsc --noEmit` (run from the worktree root; tsconfig lives there).
- Build: `npm run build` (`next build`).
- Unit tests: `tsx --test src/lib/<file>.test.ts` (the repo convention — see
  `src/lib/lead-intelligence.test.ts`; `package.json` runs it as
  `tsx --test src/lib/lead-intelligence.test.ts`). New calc tests go in
  `src/lib/inventory-costing.test.ts` and run via `npx tsx --test src/lib/inventory-costing.test.ts`.
- Migrations are plain SQL in `supabase/migrations/`; they are applied by
  `npm run db:migrate` but we do NOT run a live DB here — verification of the
  migration is `grep`-free re-read + idempotency review + `tsc`/build of the TS
  that consumes the new columns. The SQL must be additive + idempotent so a
  re-apply is safe.

> Ordering is strict: each item depends on the ones before it and must leave the
> tree type-checking (`npx tsc --noEmit`) green. Build (`npm run build`) is run
> at the integration milestones (items 7, 11, 13) because `next build` is slow.

---

- [ ] 1. **Migration 0075 — schema, per-org code counter, cost + ledger tables, RLS, backfill.**
      Create `supabase/migrations/0075_inventory_costing_redesign.sql`, additive +
      idempotent (`add column if not exists`, `create table if not exists`,
      `drop … if exists` + recreate, every backfill `IS NULL`/`=0`-guarded). Contents,
      in this exact order (design §9):
      (a) `inventory_items` additive columns — `item_kind text`, `item_code text`,
      `service_code text`, `barcode text`, `brand_model text`, `description text`
      (guarded if present), `selling_price numeric not null default 0`,
      `service_charge numeric not null default 0`, `track_stock boolean not null default true`,
      `migration_flag text`. Do NOT add `cost_price`/`standard_labour_cost` here (design §9.1).
      Retain `item_type`, `mode`, `default_price`, `regular_buying_price`, all tiers.
      (b) `inventory_code_sequences` table + `next_inventory_code(p_org_id, p_kind)`
      SECURITY DEFINER function (per-org counter seeded above existing codes), reusing the
      `next_lead_id(p_org_id)` precedent in `0002_leads.sql` (lines 136–186) — NOT a global
      `nextval` sequence (design §9.2 / HIGH-3). `inventory_items_stamp_code_trg` BEFORE
      INSERT stamps `PRT-000001` / `SRV-000001` when blank. Unique partial indexes
      `(organization_id, item_code) where item_code is not null` and the service equivalent.
      `grant execute … to authenticated`.
      (c) Backfill (design §9.3), four guarded statements IN ORDER: classify `item_kind`
      from `item_type` (`Service→service` else `part`); flag `migration_flag =
      'unrecognised_item_type'` for `item_type ∉ {Product,Service}` and `'service_with_stock'`
      for a `service` row carrying non-zero `current_stock`/`min_stock`/`max_stock`
      (non-destructive — stray stock preserved); seed codes via `next_inventory_code` keyed on
      `item_kind`; seed `selling_price`/`service_charge` from `regular_selling_price` only
      (NEVER seed cost — CP stays absent ⇒ "Cost not configured").
      (d) `inventory_item_costs` table (design §9.4): PK `item_id` only, `organization_id`
      default `auth_org_id()`, `branch_id default null` (org-level default row — the NULL
      branch is what makes it visible to every cost-capable org member), `cost_price`,
      `standard_labour_cost`, `cost_configured boolean default false`, `updated_at/by`.
      (e) `inventory_stock_layers` table (design §9.5): `id uuid`, `organization_id`,
      `branch_id default auth_branch_id()`, `item_id`, `source text default 'purchase'`
      (`opening|purchase`), `qty_in`, `unit_cost`, `movement_doc_number`, `received_at`,
      `created_by/at`; indexes on `(item_id)` and `(branch_id)`.
      (f) `stock_movements` additive nullable columns `item_id text`, `unit_cost numeric`,
      `total_value numeric` (design §9.6).
      (g) RLS (design §9.7): enable RLS on both new tables. `inventory_item_costs` SELECT =
      `auth_member_of_org(organization_id) and auth_branch_visible(branch_id) and
      auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])`
      — `view_profit_margin` DELIBERATELY EXCLUDED (MEDIUM-1 option a); INSERT/UPDATE/DELETE =
      `… and auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])`.
      `inventory_stock_layers` SELECT = same cost-only read set + branch scope; write =
      `auth_has_any(array['manage_inventory','manage_purchases','adjust_stock'])`. Use the
      existing helpers (`auth_member_of_org`, `auth_branch_visible`, `auth_has_any`,
      `auth_org_id`, `auth_branch_id`, `auth_staff_id`) — confirm their signatures in
      `0001_initial_schema.sql`/`0002_leads.sql` before referencing.
      No new permission KEYS; no destructive drops; no overwrite of historical values.
      Files: `supabase/migrations/0075_inventory_costing_redesign.sql`
      Verify: re-read the file and confirm every statement is `if not exists`/`IS NULL`/`=0`
      guarded (re-runnable), the RLS read set excludes `view_profit_margin`, no `cost_price`
      column is added to `inventory_items`, and the backfill never overwrites
      `item_type`/`mode`/prices/stock. `npx tsc --noEmit` still green (SQL doesn't affect it,
      but confirms no accidental TS edits).

- [ ] 2. **Inventory data model — `ItemKind`, new fields, `rowToInventoryItem`/`inventoryItemToRow` mapping.**
      In `src/lib/inventory-data.ts`: add `export type ItemKind = "part" | "service";` and add
      to `InventoryItem` the optional-friendly fields `kind: ItemKind`, `itemCode`,
      `serviceCode`, `barcode`, `brandModel`, `costPrice?`, `sellingPrice?`, `serviceCharge?`,
      `standardLabourCost?`, `costState?: "configured" | "not_configured"`, `trackStock`,
      `billingBasis?`, `migrationFlag?` (design §2.1). Keep legacy `type`/`mode` on the
      interface. In `src/lib/store.tsx`: update `rowToInventoryItem` to resolve
      `kind: (r.item_kind as ItemKind) ?? (String(r.item_type) === "Service" ? "service" : "part")`,
      map the new columns (`item_code→itemCode`, `service_code→serviceCode`, `barcode`,
      `brand_model→brandModel`, `selling_price→sellingPrice`, `service_charge→serviceCharge`,
      `track_stock→trackStock`, `migration_flag→migrationFlag`), and set
      `costState` default `"not_configured"` (cost fields populated later by the cost read in
      item 3). Update `inventoryItemToRow` to write `item_kind: item.kind`,
      `item_type: item.kind === "service" ? "Service" : "Product"`, `mode: item.mode ?? "Both"`,
      and the new public columns (`selling_price`, `service_charge`, `track_stock`, `barcode`,
      `brand_model`, `migration_flag`) — but NOT `cost_price`/`standard_labour_cost` (those go
      to `inventory_item_costs`, item 3). Legacy rows must still load (NFR-2): all new fields
      tolerate missing columns.
      Files: `src/lib/inventory-data.ts`, `src/lib/store.tsx`
      Verify: `npx tsc --noEmit` passes; grep that `inventoryItemToRow` does not emit a
      `cost_price`/`standard_labour_cost` key.

- [ ] 3. **Cost + opening side-channels in `addInventoryItem`/`updateInventoryItem`; cost read.**
      In `src/lib/store.tsx` extend the context signatures (design §2.4, §4):
      `addInventoryItem(item, opts?: { cost?: {costPrice:number; standardLabourCost:number; configured:boolean}; opening?: {qty:number; unitCost:number} })`
      and `updateInventoryItem(id, updates, opts?: { cost? })`. Implementation: after inserting
      the master row, when `opts.cost` present AND caller is cost-authorized, upsert
      `inventory_item_costs` with `branch_id: null` (org-level default, design §9.4/MEDIUM-2)
      and `cost_configured: opts.cost.configured`; when `opts.opening` present (part, qty>0),
      post ONE `inventory_stock_layers` row (`source:'opening'`) + the Inward `stock_movements`
      row (reuse `addStockMovement`, now carrying `item_id`/`unit_cost`/`total_value`) + set
      `current_stock = opening.qty`. Services never write a layer. On load, extend the
      inventory fetch (around `store.tsx` line 1381 `inventory: (invItems ?? []).map(...)`) to
      also read `inventory_item_costs` (RLS returns rows only to cost-capable users) and merge
      `costPrice`/`standardLabourCost`/`costState = cost_configured ? "configured" :
      "not_configured"` onto each item; a non-cost user gets no rows ⇒ fields stay undefined +
      `not_configured`. Update the context type (the `addInventoryItem`/`updateInventoryItem`
      members at lines 115–116) and the provider value object (lines ~3534+). Keep both existing
      call sites compiling (they'll be updated in items 5/6).
      Files: `src/lib/store.tsx`
      Verify: `npx tsc --noEmit` passes; confirm `inventory_item_costs` upsert always sets
      `branch_id: null`, and the opening path writes a cost-carrying layer, not a bare qty.

- [ ] 4. **Pure costing engine `src/lib/inventory-costing.ts` + tests.**
      Create `src/lib/inventory-costing.ts` with (design §3.3, §3.5, §3.6, §3.7):
      `resolvePartUnitCost(itemId, layers, item): {kind:"resolved"; unitCost; source:"ledger"|"cp"} | {kind:"not_configured"}`
      (weighted average over branch-scoped layers first, then org CP fallback, else
      not_configured); the profitability function computing `partsRevenue`, `serviceRevenue`
      (incl. each device `repairCost` folded in as a repair/labour charge with cost
      not_configured — HIGH-2), pro-rata invoice-level discount split into parts/service
      buckets (ignore per-line `discount` — the single-discount-source invariant, MEDIUM-1),
      `eligibleNetRevenue`, `partsGP`, `serviceGP`, `combinedGP`, and `grossMargin` returning
      `null` when `eligibleNetRevenue <= 0`; a `toRevenueInvoiceLike(inv)` adapter mapping to
      `{ id, total, status, documentType: inv.documentType ?? "invoice" }` before calling
      `isFinalizedInvoice` from `src/lib/leads-data.ts` (NIT-1). "not_configured" lines render
      "Cost not configured", never ₹0. Create `src/lib/inventory-costing.test.ts` covering
      (design §10): weighted-average cost, CP fallback, not_configured; zero-denominator margin
      ⇒ null; repairCost reconciliation (`eligibleNetRevenue == max(0, subtotal −
      invoice.discount)` and `partsGP + serviceGP == combinedGP − otherDirectCost`);
      GST-excluded revenue; finalized-only eligibility; non-zero per-line discount ignored
      (invariant); CP=1800/SP=2500 ⇒ ₹700/unit (AC-5); ServiceCharge=500/StdLabour=200 ⇒ ₹300
      (AC-6); configured-₹0 vs not-configured distinction.
      Files: `src/lib/inventory-costing.ts`, `src/lib/inventory-costing.test.ts`
      Verify: `npx tsx --test src/lib/inventory-costing.test.ts` — all tests pass;
      `npx tsc --noEmit` green.

- [ ] 5. **Shared inventory form — Item Type split, CP/SP, Advanced Pricing, Service form, tuple returns.**
      In `src/components/inventory/inventory-item-form.tsx` (design §2.2–§2.6):
      rewrite `InventoryFormValues` to the §2.2 shape (`kind`, `itemCode`, `serviceCode`,
      `barcode`, `brandModel`, `costPrice`, `sellingPrice`, advanced tiers, `serviceCharge`,
      `standardLabourCost`, `trackStock`, `currentStock` (= opening qty on create),
      `openingUnitCost`, `minStock`, `maxStock`, `store`, hidden `mode`); remove `type`/
      `defaultPrice` keys. Update `emptyInventoryForm` (`kind:"part"`, `tax:"18"`,
      `uom:"Piece"`, `trackStock:true`, `mode:"Both"`, money/stock `""`) and
      `inventoryFormFromItem` (map `kind`/codes/cost fields/sku/barcode; opening fields NOT
      re-editable on edit — `currentStock` read-only, no `openingUnitCost`). Change
      `buildInventoryItem(v, opts?: {store?})` to RETURN `{ item, cost?, opening? }` (keep the
      `opts.store` param → `item.store`; §2.4/NIT-1); emit `cost` iff the CP/labour field is
      non-blank via STRING-TRIM (`v.costPrice.trim() !== ""`, so `"0"`⇒configured ₹0, `""`⇒no
      cost); emit `opening` iff `v.trackStock && Number(v.currentStock) > 0`; `id` from `v.sku`
      or the widened `SKU-${Date.now()}-${rand4}` fallback (NEVER `PRT-<ts>`); set `item`
      stock to 0; `sellingPrice→regularSellingPrice/defaultPrice`; `regularBuyingPrice` NOT
      derived (0 on new rows); advanced tiers stored verbatim (remove ALL `SP*multiplier` /
      `defaultPrice*0.7` derivations — NIT-2). Change `inventoryUpdateFromForm(v)` to return
      `{ patch, cost? }` (omit codes/stock/opening; include `migration_flag: null` when the
      edit resolves a flag — §1.2 lifecycle). Update `validateInventoryForm` per §2.5
      (negative CP/SP/charge/labour rejected; opening qty without unit cost rejected; `0` valid).
      Rewrite `InventoryItemFields` rendering: single **Item Type** `SegmentedTabs`
      (`Part / Product`=part, `Repair Service / Labour`=service) replacing the Product/Service
      + Buy/Sell/Both tabs; `isService` drives Part sections (Identity w/ read-only Item Code
      chip, CP+SP + Advanced Pricing disclosure, Inventory Tracking, Tax) vs Service sections
      (Identity w/ read-only Service Code, Service Charge + Standard Labour Cost labelled
      "standard/estimated", Tax — NO stock controls). Gate CP / Standard Labour Cost inputs
      with `CAP.sensitive.viewCost` (view) / `CAP.sensitive.editCost` (edit) honouring the
      existing `canEdit` / `<fieldset disabled>` pattern.
      Files: `src/components/inventory/inventory-item-form.tsx`
      Verify: `npx tsc --noEmit` passes (expect call-site errors in modal/add-item/add-item
      page — fixed in items 6/7); grep that no `Buy`/`Sell`/`Both`/`Product.*Service`
      SegmentedTabs remain and no `*0.7`/`*1.2`/`*0.9`/`*0.85`/`*0.65` derivation remains.

- [ ] 6. **AddInventoryModal — consume tuple, hide opening fields, forward cost.**
      In `src/components/inventory/add-inventory-modal.tsx` (design §4): change `handleSave`
      to `const { item, cost } = buildInventoryItem(values); await addInventoryItem(item,
      { cost }); onCreated?.(item);` — the modal HIDES the Inventory-Tracking opening fields
      (`openingUnitCost`, `currentStock`) so `opening` is always undefined (invoice side never
      establishes stock — FR-8/AC-9), but still forwards `cost` for a cost-authorized creator.
      Preserve the existing double-submit guard and `onCreated` auto-select contract.
      Files: `src/components/inventory/add-inventory-modal.tsx`
      Verify: `npx tsc --noEmit` passes; confirm the modal does not render opening-stock inputs.

- [ ] 7. **Add Item page — re-point to shared form, remove synthetic pricing + raw stock write.**
      In `src/app/(app)/inventory/add-item/page.tsx` (design §4/MEDIUM-2 — this is a full
      rework, not a one-liner): replace the bespoke Item Basics / Pricing & Tax / Stock Levels
      sections and its own Product/Service + Buy/Sell/Both SegmentedTabs with the shared
      `<InventoryItemFields>` driven by `InventoryFormValues`. Route create through
      `const { item, cost, opening } = buildInventoryItem(v); await addInventoryItem(item,
      { cost, opening });` and edit through `const { patch, cost } = inventoryUpdateFromForm(v);
      await updateInventoryItem(id, patch, { cost });`. REMOVE the inline `defaultPrice*0.7`
      derivation block entirely and REMOVE the raw `currentStock` write (opening balance flows
      ONLY through `opening = {qty, unitCost}` → ledger layer). This is the ONLY opening-stock
      entry surface. Keep/adapt any live-preview rail to read the shared form values.
      Files: `src/app/(app)/inventory/add-item/page.tsx`
      Verify: `npx tsc --noEmit` passes; `npm run build` passes (integration milestone); grep
      confirms no `*0.7` synthetic cost and no direct `currentStock:` literal write remain.

- [ ] 8. **InventorySearchBox — `kind` filter prop + `item.kind` presentation.**
      In `src/components/inventory/inventory-search-box.tsx` (design §5.2/NIT-4): add optional
      `kind?: "part" | "service"` prop that, when set, filters results to `item.kind === kind`.
      Switch the out-of-stock test from `item.type === "Product" && available <= 0` (line ~146)
      to `item.kind === "part" && available <= 0`, and the label from `item.type === "Service"`
      (line ~172) to `item.kind === "service"`. Presentation keys off `kind` (new source of
      truth), not the legacy `type` mirror.
      Files: `src/components/inventory/inventory-search-box.tsx`
      Verify: `npx tsc --noEmit` passes; grep confirms `item.type` presentation checks are gone.

- [ ] 9. **Invoice line model + two Products-step paths (Add Part / Add Service).**
      In `src/lib/mock-data.ts`: extend `InvoiceLineItem` with OPTIONAL `kind?: "part" |
      "service"`, `cost?: number`, `costState?: "resolved" | "cp" | "not_configured"` (design
      §5.1; legacy lines without them still render/total). In `src/app/(app)/invoice/create/page.tsx`
      `StepProducts` (design §5.2): formalize **Add Part** (reuse `InventorySearchBox`
      `kind="part"`, select → qty → load `sellingPrice` onto `line.price`, resolve valuation
      cost internally onto `line.cost`/`line.costState` via `resolvePartUnitCost`; preserve
      stock-availability display; `addInventoryLine` stamps `kind:"part"`) and a DISTINCT
      **Add Service** path (`InventorySearchBox` `kind="service"`, select → load `serviceCharge`
      onto `line.price`, stamp `line.cost = standardLabourCost` or not_configured,
      `kind:"service"`, NO inventory-quantity effect). Keep the existing free-text "Add Row"
      (`addService`) as a manual non-catalogue charge (`kind:"service"`, no cost). Totals math
      (`subtotal = partsTotal + repairCost`, estimate excluded) UNCHANGED; `cost`/`kind` never
      affect billed totals.
      Files: `src/lib/mock-data.ts`, `src/app/(app)/invoice/create/page.tsx`
      Verify: `npx tsc --noEmit` passes; confirm two distinct buttons/paths exist (Search/Add
      Part vs Add Service vs Add Inventory) and totals are unchanged.

- [ ] 10. **Ticket→Invoice prefill stamps kind + resolved cost (no estimate line, no dup).**
      In `src/lib/mock-data.ts` (`ticketDeviceToInvoiceDevice`) and the `fromTicket` effect in
      `src/app/(app)/invoice/create/page.tsx` (design §5.3): stamp each prefilled part line with
      `kind:"part"` and a resolved `cost`; prefill ticket-recorded services as `kind:"service"`
      lines; keep `estimate → estimateValue` (reference only, never billable), `repairCost`
      behaviour, and SGST/CGST/discount unchanged. No duplication of parts/services.
      Files: `src/lib/mock-data.ts`, `src/app/(app)/invoice/create/page.tsx`
      Verify: `npx tsc --noEmit` passes; confirm `estimateValue` is not added to the billed
      subtotal and parts are not duplicated.

- [ ] 11. **Profitability Breakdown panel + cost-free aggregate route + double-deduction guard assertion.**
      Create `src/components/invoice/profitability-breakdown.tsx` (design §7.1): rendered on
      invoice detail/review, wrapped in `<Can permission={CAP.sensitive.viewProfit}>`. Shows
      Parts Revenue, Service Revenue (with the Repair/Labour charge sub-line carrying device
      `repairCost`), Parts Cost, Labour Cost, Other Direct Costs, Gross Profit, Gross Margin
      from the §3.5 engine. Two tiers: a cost-capable viewer (`CAP.sensitive.viewCost`) sees
      cost columns + GP/margin in-memory; a profit-only viewer sees cost columns MASKED (locked
      ••••, never ₹0) and GP/margin from a cost-free server route. Create that route
      `getInvoiceProfitAggregate(invoiceId)` (an `app/api/.../route.ts`) guarded by
      `requirePermission(req, ['view_profit_margin','view_financial_reports','inventory_view_cost','manage_inventory','manage_purchases'])`
      returning ONLY derived aggregates (parts/service/combined GP, margin, per-bucket
      revenue) — never per-unit cost. Margin "—" when net revenue 0; not_configured lines show
      "Cost not configured". Confirm (design §5.4) invoice finalize performs NO stock deduction
      (grep `src/app/(app)/invoice/` for `addStockMovement`/`current_stock`/`deductParts` — must
      be none) so there is nothing to double-deduct; `deductPartsForTicket` stays the single
      consumption point.
      Files: `src/components/invoice/profitability-breakdown.tsx`, new API route under
      `src/app/api/` (follow an existing `requirePermission` route e.g.
      `src/app/api/owner/summary/route.ts`), wiring in the invoice detail surface.
      Verify: `npx tsc --noEmit` passes; `npm run build` passes (integration milestone); grep
      the invoice create/finalize flow confirms no stock-deduction call was added.

- [ ] 12. **Legacy "Needs review" surfacing (migration_flag) — list filter chip + pill, no cost leak.**
      In `src/app/(app)/inventory/page.tsx` (design §1.2): add an opt-in "Needs review" filter
      chip (`migration_flag != null`) and a small amber "Needs review" pill (shared pill
      primitive) with the machine reason in its tooltip, gated to `allow(can, CAP.inventory.edit)`.
      The pill/tooltip render ONLY the machine-reason string (`unrecognised_item_type` /
      `service_with_stock` → short human label) and NEVER any CP / labour / stock-layer
      `unit_cost` value (hard no-cost guarantee, NIT-5). Re-saving a flagged item through the
      form clears the flag (handled by `inventoryUpdateFromForm` returning
      `migration_flag: null` in item 5).
      Files: `src/app/(app)/inventory/page.tsx`
      Verify: `npx tsc --noEmit` passes; confirm the pill payload references only
      `migrationFlag` and no cost field.

- [ ] 13. **Print-safety guard test + final full verification.**
      Add a mandatory print-safety test (design §7.2/§10) asserting `buildInvoiceInfo` output
      and every `PrintLineItem` contain NO `cost`/`kind`/`costState`/labour/profit property
      (place in `src/lib/inventory-costing.test.ts` or a dedicated
      `src/lib/print-safety.test.ts`, whichever imports cleanly — do NOT modify
      `PrintLineItem`/`buildInvoiceInfo`/`buildTicketInfo`/`QuotationA4` to add cost). Then run
      the full gate.
      Files: `src/lib/inventory-costing.test.ts` (or `src/lib/print-safety.test.ts`)
      Verify: `npx tsx --test src/lib/inventory-costing.test.ts` (and the print-safety test)
      pass; `npx tsc --noEmit` passes; `npm run build` passes. Re-check the AC→design map in
      §11 of the design against the 24 ACs in the requirements and confirm each is implemented.

---

## Notes / assumptions

- RLS/migration correctness cannot be exercised against a live DB in this environment;
  verification for item 1 is idempotency + policy review + the TS that consumes the columns
  type-checking. The design's RLS tests (AC-21/22) are documented behaviours to assert if a DB
  is available; otherwise they stand as reviewed SQL.
- `view_profit_margin` is intentionally EXCLUDED from the cost-table read RLS (MEDIUM-1
  option a). Keep it out of every cost read set.
- `inventory_item_costs` org-level default row ALWAYS written `branch_id: null` (MEDIUM-2).
- Every price tier is an independent stored value — no tier is ever derived from another.
