# Inventory Costing Redesign — Independent MATH Review

Branch `feature/inventory-costing-redesign` @ `f0e9d2a` vs `main` @ `0e8c22f`.
Scope: correctness of the costing/profitability MATH only — weighted-average
inventory cost, preliminary/parts GP & margin, service revenue + Standard
Labour Cost (no stock movement), combined GP reconciliation to Parts GP +
Service GP, CP-fallback / "Cost not configured", historical-snapshot stability
after a later catalogue CP/SP change, and the overall invoice reconciliation.

The pure engine (`src/lib/inventory-costing.ts`) and the authoritative DB
valuation (`inventory_weighted_avg_cost` + depletion in migration `0077`) are
mathematically correct across every path in scope. The reconciliation identities
hold by construction and are verified against how the invoice actually computes
`subtotal`. The persisted/realized cost path is depletion-aware and immutable, so
historical profitability does not drift when a catalogue CP/SP later changes.

Watch for: one non-blocking inconsistency — the **client in-memory preview**
weighted average is a *lifetime* blend (it reads `qty_in`), while the
**authoritative server snapshot** is *depletion-aware* (it reads `qty_remaining`).
The two can disagree once a cheaper layer has been partially/fully sold, but the
divergent client value is transient (stripped on save, replaced by the server
snapshot on reload) and is never persisted or counted as realized profit
(confidence: confirmed).

**Verdict**: APPROVED

<details>
<summary>High-level view</summary>

The weighted-average resolver is correct. The server function
`inventory_weighted_avg_cost` averages `Σ(qty_remaining·unit_cost)/Σ(qty_remaining)`
and returns NULL when nothing remains, so the caller falls back to the org-level
CP; `inventory_deplete_layers` relieves oldest layers first. That is a correct
FIFO-depletion-feeding-weighted-average and matches the design's finding-#9 intent.

The profitability identities hold algebraically and are not accidental. Revenue
buckets sum to `grossRevenue = partsRevenue + lineServiceRevenue + repairChargeRevenue`,
which equals the invoice's own `subtotal = partsTotal + repairCost` because
`partsTotal` in the invoice totals memo already sums *all* line totals (part and
service kinds) and `repairCost` is folded into service revenue. The single
invoice-level discount is split pro-rata by bucket share, so
`eligibleNetRevenue == max(0, subtotal − discount)` in every case (including
over-discount and zero-revenue), and `partsGP + serviceGP == combinedGP +
otherDirectCost` falls straight out of `partsNet + serviceNet == eligibleNetRevenue`.
The earlier inverted-sign reconciliation assertion is now corrected.

GST never enters the engine (it reads `subtotal`/`discount` only, never `total`),
and finalized-only eligibility goes through a correct `toRevenueInvoiceLike`
adapter before `isFinalizedInvoice`.

"Cost not configured" is handled correctly and is kept distinct from a genuine
configured ₹0: a `""` field persists `cost_configured=false` (→ not configured),
`"0"` persists `cost_configured=true` (→ valid ₹0). A fully-not-configured invoice
now suppresses the margin to `null` ("—"/"Partial") instead of reporting a
misleading 100%, while a real configured ₹0 cost still yields a legitimate 100%.

Historical stability holds: the resolved per-line cost is snapshotted server-side
into the cost-scoped, client-immutable `invoice_line_costs` table at finalize time
and merged back on load; a later catalogue CP/SP edit only upserts
`inventory_item_costs` (future defaults) and never touches the snapshot.

The one wrinkle is the client preview resolver. The store hydrates
`inventoryStockLayers` with `qty_in` (not `qty_remaining`), so the in-memory
`resolvePartUnitCost` computes a lifetime blend. In production this value is
stripped from the invoice JSON on save and overwritten by the server's
depletion-aware snapshot, and the breakdown panel only renders on the saved detail
page — so the lifetime value is a transient, in-session display number, never a
persisted or realized figure.

</details>

<details>
<summary>Issues (3)</summary>

1. **Client preview WAC is lifetime-blend, server WAC is depletion-aware** (LOW) — the store hydrates `inventory_stock_layers` as `{item_id, qty_in, unit_cost}` (store.tsx ~1797), so client `resolvePartUnitCost` averages over `qty_in` while the authoritative `inventory_weighted_avg_cost` averages over `qty_remaining`. They can disagree after a cheaper layer sells out. Non-blocking: the client value is stripped on save and replaced by the server snapshot; it never persists and never feeds realized profit. Optional fix: hydrate `qty_remaining` (fallback `qty_in`) so the preview matches the authoritative value.
2. **In-session post-save display uses the transient client cost** (INFO) — `addInvoice` restores `saved.items = current.items` (store.tsx ~2892), so immediately after save the panel shows the lifetime-blend cost until a reload merges the depletion-aware snapshot. Same root cause as #1; cosmetic, self-corrects on reload.
3. **Service cost provenance label differs between paths** (INFO) — client `addServiceLine` stamps `costState:"resolved"` for a configured labour cost; the server `finalize-costing` stamps `"cp"`. The engine treats both as "configured", so GP/margin are identical; only the provenance label differs. No math impact.

</details>

<details>
<summary>Details</summary>

## Weighted-average cost resolution

`resolvePartUnitCost` (inventory-costing.ts) is the simple correct form:
`Σ(qty_in·unit_cost)/Σ(qty_in)` over the item's layers when `Σqty > 0`, else the
org CP when `costState==="configured"` and `costPrice >= 0`, else `not_configured`.
The CP guard uses `>= 0` (so a configured ₹0 resolves), and a CP present without
`costState==="configured"` is correctly treated as not configured.

The authoritative DB function is the one that feeds the persisted snapshot and
realized reporting, and it is depletion-aware:

```sql
sum(coalesce(qty_remaining, qty_in) * unit_cost)
  / sum(coalesce(qty_remaining, qty_in))   -- NULL when the sum is 0 → caller falls back to CP
```

`inventory_deplete_layers` relieves `order by received_at asc, created_at asc`
with `v_take = least(rem, remaining)` and decrements `qty_remaining` — a correct
oldest-first depletion. So after a 10@₹100 layer sells out and 30@₹200 remains,
the authoritative value is ₹200 (not the ₹175 lifetime blend). This is exactly
the behaviour finding #9 intended.

The gap is only on the client: the store loads layers as `qty_in`, so the
in-memory preview recomputes the ₹175 lifetime blend. Because that value is
stripped from the invoice JSON on save (`stripLineCost`) and the server
`finalize-costing` writes the depletion-aware snapshot to `invoice_line_costs`
(merged back by `mergeInvoiceCosts` on load), the lifetime value never persists
and never reaches realized profit. If `finalize-costing` fails, the line degrades
to `not_configured` (no row to merge) — it does not fall back to the client
lifetime value. The divergence is therefore a transient in-session preview nuance,
documented as Issue #1/#2.

## Reconciliation: grossRevenue == invoice.subtotal

The engine computes `grossRevenue` purely from `lines` + `devices` (it never reads
`inv.subtotal`), so reconciliation to the billed document depends on the mapping
being faithful. It is:

- Invoice totals (invoice/create/page.tsx `totals` memo):
  `allItems = devices.flatMap(d.parts)` (or flat `items`),
  `partsTotal = Σ allItems.total`, `repairCost = Σ device.repairCost`,
  `subtotal = partsTotal + repairCost`. Crucially `partsTotal` includes *both*
  part- and service-kind lines (they all live in `parts`).
- Engine: `partsRevenue = Σ part-line.total`,
  `lineServiceRevenue = Σ service-line.total`,
  `repairChargeRevenue = Σ device.repairCost`,
  `grossRevenue = partsRevenue + lineServiceRevenue + repairChargeRevenue`.

These are the same sum, so `grossRevenue == subtotal`. The panel adapter
(`toCostingInvoice`) and the server profit route reconstruct the same lines +
device repairCosts, and the flat-invoice wrap (`getInvoiceDevices`) uses a device
with the default `repairCost: 0`, so a legacy flat invoice reconciles too (no
phantom repair charge).

## Discount split and net revenue

One invoice-level discount, split pro-rata:
`partsDiscount = discount·partsRevenue/grossRevenue`,
`serviceDiscount = discount·serviceRevenue/grossRevenue` (both 0 when
`grossRevenue==0`). Since the shares sum to 1, `partsDiscount + serviceDiscount ==
discount`, and because the split is proportional both buckets cross zero together.
Hence `eligibleNetRevenue == max(0, subtotal − discount)` holds for discount ≤
subtotal, for over-discount (both nets clip to 0), and for the zero-revenue case —
verified by walking the `Math.max(0, …)` clipping, not just by the happy path. The
per-line `discount` field is deliberately ignored (the single-discount-source
invariant), matching how the invoice itself computes totals; the test with a bogus
non-zero per-line discount confirms the result is unchanged.

## Combined-GP identity

`partsGP = partsNet − partsCost`, `serviceGP = serviceNet − labourCost`,
`combinedGP = eligibleNetRevenue − partsCost − labourCost − otherDirectCost`. Since
`partsNet + serviceNet == eligibleNetRevenue`, it follows exactly that
`partsGP + serviceGP == combinedGP + otherDirectCost`. The corrected test asserts
this with `otherDirectCost > 0` (previously the inverted sign was inert only
because the term was 0), so the identity is now genuinely exercised.

## Service revenue + Standard Labour Cost, no stock movement

Service lines contribute `serviceGP = serviceNet − labourCost` where
`labourCost = Σ configured service-line cost`. `addServiceLine` loads
`serviceCharge` onto `line.price` and `standardLabourCost` onto `line.cost` with no
inventory-quantity effect; services never produce an `opening`/layer and
`post_opening_stock`/`post_stock_receipt` are parts-only. So the Service Charge
₹500 / Standard Labour ₹200 → ₹300 GP case holds, with zero stock side effects.
`repairCost` device charges fold into service revenue with `not_configured` cost
(there is no labour cost on a free-form repair charge), flagged `costPartial`.

## "Cost not configured" vs configured ₹0, and the 100%-margin suppression

`buildCost` keys on a string-trim (`field.trim() === ""`), so `""` → no cost row
(→ not configured) and `"0"` → `configured:true, cost 0` (→ valid ₹0). In the
engine, `lineCostConfigured` is `costState!=="not_configured" && typeof cost ===
"number"`, so a ₹0 configured cost counts and a missing/`not_configured` cost does
not (never silently ₹0). The margin is suppressed to `null` when
`eligibleNetRevenue==0` OR when the invoice is fully not-configured (`costLineCount
> 0 && configuredCostLineCount === 0`), so a cost-unknown invoice shows "—"/
"Partial" rather than a false 100%, while a genuine configured ₹0 still yields a
legitimate 100%. A partial invoice (some configured, some not) computes the margin
on known costs and flags `costPartial` — an accepted, documented behaviour.

## Historical snapshot stability after a later CP/SP change

Finalize resolves cost server-side and upserts `invoice_line_costs`, which has no
end-user write policy (immutable from clients) and is parent-scope-stamped. On load
`mergeInvoiceCosts` re-attaches it. A later catalogue CP/SP edit upserts only
`inventory_item_costs` (and the public price on `inventory_items`), never the
invoice snapshot or the immutable `inventory_stock_layers`, so a finalized invoice's
profitability is frozen at its finalize-time cost. (Deliberately re-saving/editing
the invoice itself re-runs `finalize-costing` and re-resolves at current rates —
that is an explicit invoice edit, not a catalogue CP change, and is consistent with
FR-25.)

## Verification evidence

The latest commit records, re-run in the worktree: `npx tsc --noEmit` → PASS;
`npm run inventory:costing:test` → 20/20 PASS; `npm run build` → compiled
successfully. The pure-engine test file independently covers weighted average / CP
fallback / not_configured, AC-5 ₹700 and AC-6 ₹300, zero-denominator margin,
repairCost folding + reconciliation identity, the single-discount invariant,
GST-excluded revenue, pro-rata split, configured-₹0 vs not-configured, the
fully-not-configured 100%-suppression, finalized-only eligibility, the
LEDGER-DISCONNECT ledger read, and the SYS-1 profit-only aggregate projection.
These are the suites relevant to this MATH review and are reported green; the
DB-persona suite (`inventory:costing:verify`) is a system/RLS boundary suite
requiring `SUPABASE_DB_URL` and is out of this review's math scope. Per the review
protocol I did not re-run tsc/build/tests; I read the diff plus this evidence and
spot-read the call sites to confirm the mapping, with no remaining articulable
doubt that warranted executing a calc path.

</details>

<details>
<summary>File map</summary>

- `src/lib/inventory-costing.ts` — pure engine: `resolvePartUnitCost`,
  `computeInvoiceProfitability`, `toRevenueInvoiceLike`/`isEligibleForRealizedProfit`.
- `src/lib/inventory-costing.test.ts` — 20 pure-engine math tests (+ print safety).
- `supabase/migrations/0077_inventory_costing_redesign.sql` — depletion-aware
  `inventory_weighted_avg_cost`, `inventory_deplete_layers`,
  `consume_invoice_line_stock`, `post_opening_stock`/`post_stock_receipt`, cost
  tables + scope guards.
- `src/app/api/invoice/[id]/profit/route.ts` — tiered aggregate; same engine over
  snapshot costs.
- `src/app/api/invoice/[id]/finalize-costing/route.ts` — authoritative snapshot +
  idempotent consumption.
- `src/components/invoice/profitability-breakdown.tsx` — `toCostingInvoice` adapter;
  cost-capable in-memory vs profit-only server aggregate.
- `src/app/(app)/invoice/create/page.tsx` — `resolveLinePartCost`, Add Part / Add
  Service line stamping; `totals` memo (subtotal = partsTotal + repairCost).
- `src/lib/store.tsx` — layer/snapshot hydration (`qty_in`), `stripLineCost`,
  `mergeInvoiceCosts`, `persistInvoiceLineCosts`.
- `src/lib/mock-data.ts` — `InvoiceLineItem.kind/cost/costState`; ticket→invoice
  part `kind:"part"`.
- `src/components/inventory/inventory-item-form.tsx` — CP/SP distinct fields
  (`buildCost` string-trim), advanced tiers stored verbatim (no `SP*0.7`).

Full diff: `git diff main` in the worktree.

</details>
