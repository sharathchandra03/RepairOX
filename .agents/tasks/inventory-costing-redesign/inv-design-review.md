# Design Review — Inventory Master + Repair Service Costing Redesign (Revision 4)

Reviewed document: `.agents/tasks/inventory-costing-redesign/inv-design.md` (REVISION 4)
Requirements contract: `.agents/tasks/inventory-costing-redesign/inv-requirements.md`
Prior verdict: `inv-design-review.json` (CHANGES_REQUESTED — 0 HIGH, 2 MEDIUM, 4 NIT)

Scope of this pass: confirm the two MEDIUM internal-consistency findings and the four NITs
from the prior review are resolved, and that the resolution is internally consistent across
the sections it touches. Structural source claims were spot-checked where a specific doubt
existed; the whole design was not re-derived.

---

## Verdict basis

MEDIUM findings open: **0**. HIGH findings open: **0**. ⇒ **APPROVED**.

Both MEDIUMs are fully resolved and consistent across every section they touch. The four
NITs are addressed. No new HIGH/MEDIUM issues were found. The remaining items below are NITs
and do not block.

---

## Resolution of prior findings

### MEDIUM-1 — view_profit_margin vs raw-cost RLS contradiction — RESOLVED

The design adopts option (a): `view_profit_margin` is **removed** from the
`inventory_item_costs` (and `inventory_stock_layers`) SELECT RLS set. The authoritative
cost-read set is now cost keys only:
`['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases']`.

Consistency checked across all required sections — they now agree:
- §2.1a: client cost read returns no row for a profit-only viewer; raw CP never reaches that
  client; GP/margin come from a separate cost-free path.
- §6: states the read set excludes `view_profit_margin`; a profit-only viewer selecting the
  cost tables gets zero rows (server/RLS rejection, not a hidden button); GP/margin for that
  viewer come from `getInvoiceProfitAggregate` guarded by `requirePermission`.
- §7.1: two viewer tiers — cost-capable (in-memory engine, full cost columns) vs profit-only
  (cost columns masked, aggregates from the server route).
- §9.7: SELECT policy on both cost tables uses the cost-only key array; `view_profit_margin`
  explicitly excluded.
- §10 / AC-21 map: dedicated profit-only-viewer RLS test asserts zero rows from the cost
  tables and that the aggregate route returns GP/margin with no per-unit cost field.

Source verification: `capabilities.ts` (read directly) confirms
`viewCost = ["inventory_view_cost","manage_inventory","manage_purchases"]`,
`editCost = ["inventory_edit_cost","manage_inventory"]`,
`viewProfit = ["view_profit_margin","view_financial_reports"]`. The design's cost-read set is
exactly the union of viewCost+editCost granular/coarse keys and correctly omits the only key
unique to viewProfit (`view_profit_margin`). So a role holding only `view_profit_margin`
matches none of the cost-read keys ⇒ zero rows. The AC-21 guarantee holds literally.

### MEDIUM-2 — inventory_item_costs branch scoping for an org-wide catalogue — RESOLVED

The single `item_id`-keyed cost row stores the organization-level default cost and is written
with `branch_id = NULL` (not `auth_branch_id()`). The SELECT policy's
`auth_branch_visible(branch_id)` evaluates `auth_branch_visible(NULL)`, which is always true
for a cost-capable org member, so no store strands the default and no store sees
"Cost not configured" when a CP exists.

Consistency checked across all required sections — they agree:
- §9.4: PK `item_id` only; `branch_id default NULL` with the comment that NULL = org-level
  default; upsert overrides any `auth_branch_id()` default with NULL; future per-store
  override reserved as a separate `(item_id, branch_id)` row, not built now.
- §9.7: SELECT policy on `inventory_item_costs` relies on `auth_branch_visible(NULL)` being
  true for every cost-capable org member; `inventory_stock_layers` stays branch-scoped on the
  real receiving store.
- §2.1a: cost row described as the single org-level default with `branch_id = NULL`.
- §3.3: `resolvePartUnitCost` resolution order — branch-scoped ledger layers first (real
  per-store cost), then the NULL-branch org-level CP, then `not_configured`. No stranded
  per-store CP row.
- §10 / AC-21 map: org-level cost visibility test — a cost-capable user in store B reads the
  CP of an org-level item whose cost row was written by store A, and the item is NOT
  "Cost not configured" for store B.

Source verification: `0001_initial_schema.sql` (read directly) confirms
`auth_branch_visible(b) := auth_can_cross_branch() or b is null or b = auth_branch_id()`.
A NULL branch is therefore always visible — the fix is correct.

### NIT-1 — RevenueInvoiceLike mapping before isFinalizedInvoice — RESOLVED

§3.6 states the engine maps the invoice record into the `RevenueInvoiceLike` shape with
`documentType: inv.documentType ?? "invoice"` before calling `isFinalizedInvoice`, never raw
form state. Source verification: `leads-data.ts` confirms the `RevenueInvoiceLike` shape
`{ id, ticketId?, total, status, documentType?: "invoice" | "proforma" }` and the body
`(inv.documentType ?? "invoice") !== "proforma" && inv.status === "paid"`. The design's
citation and the `?? "invoice"` default are accurate.

### NIT-2 — Advanced Pricing post-split behavior — RESOLVED

§2.1a pins MRP/dealer/distributor/wholesale as retained + user-editable and persisted exactly
as entered, with every `SP*multiplier` derivation removed alongside `defaultPrice*0.7`. Blank
stays blank/0; no surprise SP-derivation. §4 confirms the inline derivation block is removed
from both the modal path and the Add Item page. Consistent and unambiguous.

### NIT-3 — migration_flag lifecycle — RESOLVED

§1.2 defines the terminal transition: an authorized re-save that resolves the contradiction
(service re-saved without stock controls; unrecognised type re-saved with a valid Item Type)
nulls `migration_flag` via `inventoryUpdateFromForm` so the "Needs review" pill clears. Bulk
reconciliation stays out of scope. The column has a defined consumer and lifecycle.

### NIT-4 — InventorySearchBox kind filter in-scope — RESOLVED/CONFIRMED

§5.2 spells out the exact in-scope change: a new optional `kind?: "part" | "service"` prop
that filters results to `item.kind`, and switching the out-of-stock test + label from
`item.type` to `item.kind`. Reflected in the AC→design map (AC-10). Source verification:
`inventory-search-box.tsx` lines 146 (`item.type === "Product"`) and 172
(`item.type === "Service"`) match the design's cited current state exactly. The planned edit
is accurate and treated as a real component change, not an invisible given.

---

## New findings this pass

### NIT-5 — getInvoiceProfitAggregate route is referenced but not specified beyond its guard

§6/§7.1 introduce a new server route `getInvoiceProfitAggregate(invoiceId)` to serve
GP/margin to a profit-only viewer without exposing raw cost, and pin its
`requirePermission(...)` guard. The route's return contract is described in prose ("parts GP,
service GP, combined GP, margin, and the per-bucket revenue; never per-unit CP/labour") but no
explicit response type/shape is given, and it is a new API surface not reflected in the
AC→design map or the file-level plan. This is sufficient to implement unambiguously (the §3.5
engine defines the exact aggregates, and the "no per-unit cost field" rule is testable per
§10), so it is a NIT, not a blocker. Fix: add a one-line response-shape note (e.g.
`{ partsGP, serviceGP, combinedGP, grossMargin: number | null, partsNet, serviceNet }`) and
list the route in the file plan so the coder treats it as a deliberate new surface rather than
inferring it.

### NIT-6 — resolvePartUnitCost CP fallback reads item.costPrice, which is undefined for a non-cost caller

§3.3's `resolvePartUnitCost` CP-fallback branch tests `item.costState === "configured" &&
item.costPrice >= 0`. Per §2.1a, for a non-cost user `costPrice` is left undefined and
`costState` is "not_configured"-equivalent, so the branch correctly falls through to
`not_configured` — consistent. The NIT is only that this coupling (the resolver's correctness
depends on §2.1a having populated `costState`/`costPrice` solely from the authorized cost read)
is implicit; a one-line note in §3.3 that `item.costState`/`item.costPrice` are populated only
from the cost-capable read (so a non-cost caller never reaches the CP branch) would make the
boundary self-evident at the resolver. Non-blocking.

---

## Verified assumptions (checked against source)

1. `auth_branch_visible(NULL)` is always true (`0001_initial_schema.sql`:
   `auth_can_cross_branch() or b is null or b = auth_branch_id()`). ⇒ MEDIUM-2 fix is sound.
2. `capabilities.ts` cost/profit key sets are exactly as the design cites
   (`viewCost`/`editCost`/`viewProfit`), so excluding `view_profit_margin` from the cost-read
   set does deny a profit-only viewer every raw-cost key. ⇒ MEDIUM-1 fix is sound.
3. `isFinalizedInvoice` / `RevenueInvoiceLike` shape and the `?? "invoice"` default match the
   design (`leads-data.ts`). ⇒ NIT-1 citation accurate.
4. `InventorySearchBox` currently keys off `item.type` at the cited lines
   (`inventory-search-box.tsx` 146/172). ⇒ NIT-4 citation accurate; planned `item.kind`
   switch is a real, scoped change.

## Unverified / wrong assumptions

- None found. No claim relied upon for the MEDIUM resolutions was contradicted by source. The
  structural claims that gate the verdict were all confirmed.

---

## Conclusion

Both MEDIUM internal-consistency findings are fully resolved and consistent across §2.1a, §3.3,
§6, §7.1, §9.4, §9.7, and the §10/AC-21 tests. The four NITs are addressed. The two new items
(NIT-5, NIT-6) are documentation/clarity NITs that do not block. Verdict: **APPROVED**.
