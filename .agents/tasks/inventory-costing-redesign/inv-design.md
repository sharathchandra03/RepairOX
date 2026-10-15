# Inventory Master + Repair Service Costing Redesign — Technical Design

Feature branch: `feature/inventory-costing-redesign`
Worktree: `/Users/apple/Desktop/Reapirox dummy2/app/.worktrees/inventory-costing-redesign`
Requirements: `.agents/tasks/inventory-costing-redesign/inv-requirements.md`
Status: **REVISION 4** — resolves every finding in the latest review
(`inv-design-review.json` / `inv-design-review.md`, which recorded 0 HIGH, 2 MEDIUM, 4 NIT
against Revision 3). See §13 for the finding-by-finding response log. All prior-round fixes
(HIGH-1/2/3, the Revision-2→3 MEDIUM/NIT set) are retained UNCHANGED — the costing/valuation
decision (weighted average), the legacy Product/Service + Buy/Sell/Both mapping,
migration-0075 numbering, and the permission REUSE (no new key) all stand. This revision adds
only internal-consistency clarifications: the cost-RLS vs profit-only-viewer resolution
(MEDIUM-1, option (a) — `view_profit_margin` removed from the raw-cost read set), the
org-level cost-row branch scoping with `branch_id = NULL` (MEDIUM-2), the explicit
`RevenueInvoiceLike` mapping before `isFinalizedInvoice` (NIT-1), the pinned post-split
Advanced-Pricing behaviour (NIT-2), the `migration_flag` lifecycle note (NIT-3), and the
confirmation that `InventorySearchBox`'s new `kind` prop + `item.kind` logic is in-scope and
mapped (NIT-4).

---

## 0. Overview

This redesign replaces the confusing `Product/Service` + `Buy/Sell/Both` controls on the
Add/Edit Inventory form with a single **Item Type** choice — **Part / Product** vs
**Repair Service / Labour** — that drives which fields and costing rules render. It
introduces explicit **Cost Price (CP)** and **Selling Price (SP)** on parts (and
**Service Charge** / **Standard Labour Cost** on services) in place of the single
synthetic `defaultPrice`, adds a minimal **cost-carrying stock ledger** so purchases /
opening stock capture real unit cost and invoice profitability can resolve an actual
sold cost by **weighted average** (with a CP fallback and an explicit "Cost not
configured" state), wires two distinct Invoice entry paths (**Add Part** / **Add
Service**), computes parts/service/combined gross profit and margin behind the existing
`CAP.sensitive.viewCost` / `CAP.sensitive.viewProfit` gates, and guarantees internal
costing never reaches the printed customer document.

Everything is additive. The locked technology stack is the existing one: Next.js +
React + TypeScript client, the `useStore()` Supabase-backed context
(`app/src/lib/store.tsx`), the shared inventory form (`inventory-item-form.tsx`), the
shared `RoxCenteredForm`/`InventorySearchBox`/`AddInventoryModal`, the permission system
(`permissions.ts` / `permission-levels.ts` / `capabilities.ts`), and Supabase migrations
+ RLS. No new libraries are introduced.

Grounding: every decision below cites a file I read. The requirements document's
Codebase-Reality Audit (§A–§G) was independently verified against:
`src/lib/inventory-data.ts`, `src/components/inventory/inventory-item-form.tsx`,
`src/components/inventory/add-inventory-modal.tsx`,
`src/app/(app)/invoice/create/page.tsx` (incl. `StepProducts`/`StepPricing`), `src/lib/store.tsx`
(`deductPartsForTicket`, `rowToInventoryItem`, `inventoryItemToRow`,
`updateInventoryItem`, `addInventoryItem`), `src/lib/mock-data.ts` (`InvoiceLineItem`,
`InvoiceDeviceRecord.repairCost`, `ticketDeviceToInvoiceDevice`), `src/lib/print-utils.ts`
(`PrintLineItem`, `buildInvoiceInfo`), `src/lib/leads-data.ts` (`isFinalizedInvoice`),
`src/lib/capabilities.ts`, `src/lib/permissions.ts`, `src/lib/permission-levels.ts`,
`src/app/(app)/inventory/add-item/page.tsx`,
`supabase/migrations/0001_initial_schema.sql` (RLS policy generator, lines 1400–1412),
`supabase/migrations/0002_leads.sql` (per-org `next_lead_id` counter, lines 136–186),
`supabase/migrations/0064_quotation_module.sql` (stamp-trigger pattern), and the migration
listing (latest = `0074_lead_multi_device.sql`). The audit is accurate.

---

## 1. Item Type model & safe legacy mapping

### 1.1 Representation on `InventoryItem` and in the DB

Today `InventoryItem` (`src/lib/inventory-data.ts`) carries two legacy discriminators:
`type: ItemType = "Product" | "Service"` and `mode: ItemMode = "Buy" | "Sell" | "Both"`,
mirrored by `inventory_items.item_type` (default `'Product'`) and `inventory_items.mode`
(default `'Both'`) (`0001_initial_schema.sql` lines 768–769; `rowToInventoryItem` /
`inventoryItemToRow` in `store.tsx`).

**Decision:** introduce a NEW source-of-truth discriminator rather than overloading
`item_type` (requirements Q7, Audit §B). This keeps every legacy reader of `item_type`
working untouched.

- App type (new):
  ```ts
  // src/lib/inventory-data.ts
  export type ItemKind = "part" | "service";
  ```
- `InventoryItem` gains `kind: ItemKind` (the new canonical Item Type). `type` and `mode`
  remain on the interface for backward compatibility and are kept in sync on write.
- DB: `inventory_items.item_kind text` (new column), with a backfill that seeds it from
  `item_type` (`'Service' → 'service'`, else `'part'`). `item_type` and `mode` columns are
  **retained, never dropped, never bulk-rewritten** (requirements FR-3, NFR-1, AC-23).

`rowToInventoryItem` resolves `kind` with legacy fallback so pre-migration rows (and any
read before backfill runs) still classify correctly:
```ts
kind: (r.item_kind as ItemKind) ?? (String(r.item_type) === "Service" ? "service" : "part"),
```
`inventoryItemToRow` writes `item_kind: item.kind` and keeps `item_type`/`mode` in sync:
```ts
item_kind: item.kind,
item_type: item.kind === "service" ? "Service" : "Product",   // keep legacy readers working
mode:      item.mode ?? "Both",                                 // retained, defaulted, not user-facing
```

### 1.2 Safe legacy mapping (Product/Service + Buy/Sell/Both → Item Type)

Mapping is applied in TWO places that must agree: the DB backfill (migration 0075) and the
client resolver (`rowToInventoryItem`). Both use the SAME rule.

| Legacy `item_type` | New `item_kind` | Note |
|---|---|---|
| `Product` | `part` | — |
| `Service` | `service` | — |
| null / empty | `part` | DB default is `Product` |
| any other / unrecognised | `part` + **flag** | NOT auto-trusted; surfaced for admin review |

The `mode` column does **not** influence `item_kind` (a `Buy`-only product is still a
stockable part; a `Sell`-only product is still a part sold without purchase tracking —
Audit §B). `mode` is retired from the UI only.

**Values that cannot be mapped cleanly (flag, never assume)** — requirements FR-3/AC-22,
spec §1 "do not assume every legacy value can be migrated":

1. `item_type` ∉ {`Product`,`Service`}. Mapped to `part` provisionally **and flagged**.
2. A `Service` row carrying non-zero `current_stock` / `min_stock` / `max_stock`
   (contradicts "service has no stock"). Mapped to `service` **and flagged**; the stray
   stock values are **preserved** (never zeroed/discarded), only surfaced for
   reconciliation.

Flagging mechanism (non-destructive, additive): a new nullable column
`inventory_items.migration_flag text`. The backfill sets it to a short machine reason
(`'unrecognised_item_type'` or `'service_with_stock'`) ONLY for the rows above; all clean
rows leave it null. The flag is never shown on customer-facing surfaces.

**Flagged-row surface (resolves prior NIT-2):** the flag is not write-only. The Inventory
list page (`src/app/(app)/inventory/page.tsx`) gains an opt-in filter chip **"Needs review"**
that filters `migration_flag != null`, and the inventory row renders a small amber "Needs
review" pill (reusing the shared pill primitives) with the machine reason in its tooltip,
gated to inventory-manage users (`allow(can, CAP.inventory.edit)`). This makes "flag for
review" actionable in the same pass rather than a dormant column. (It is read-only context;
clearing the flag is a future reconciliation action and is explicitly out of scope here —
noted so the column has a defined consumer today.)

**`migration_flag` lifecycle (resolves NIT-3).** The flag is not permanent dead state. Its
defined terminal transition is a deliberate admin edit: when an authorized inventory-manage
user re-saves a flagged item through the shared form and that edit resolves the contradiction
— re-saving a `service_with_stock` row (the service form exposes no stock controls, so a
re-save stops carrying stock) or re-saving an `unrecognised_item_type` row with a valid Item
Type — `inventoryUpdateFromForm` **nulls `migration_flag`** in the same `patch`
(`migration_flag: null`), so the "Needs review" pill disappears after that edit. Building an
automatic reconciliation sweep (a bulk job) stays out of scope this pass; the
edit-clears-flag path above is the defined lifecycle, so the column is never permanently
stuck.

**No-cost-in-the-pill guarantee (resolves NIT-5).** `migration_flag` is a non-sensitive
column on `inventory_items` readable by all operational roles, so gating the pill's display
to `CAP.inventory.edit` is a UI nicety, not a cost boundary. To ensure an inventory-editor
who lacks `CAP.sensitive.viewCost` can NEVER infer a cost figure from this surface, the pill
and its tooltip render **only the machine-reason string** (`"unrecognised_item_type"` /
`"service_with_stock"`, mapped to a short human label) and **never** any CP, Standard Labour
Cost, or stock-layer `unit_cost` value — the same hard print-safety guarantee as §7.2. The
`service_with_stock` reason surfaces that stray *quantity* exists for reconciliation; it
never reveals a cost. This is covered by the same "no cost leaks" assertion family as the
print test (§10): the Needs-review pill payload contains no cost/labour/unit_cost property.

### 1.3 Removal of the Buy/Sell/Both UI control

In `InventoryItemFields` (`inventory-item-form.tsx`): the two `SegmentedTabs` for
"Product / Service" and "Buy / Sell / Both" are removed. A single `SegmentedTabs` labelled
**Item Type** with options `Part / Product` (value `part`) and `Repair Service / Labour`
(value `service`) replaces them, bound to `values.kind`. `mode` is no longer rendered;
`buildInventoryItem`/`inventoryUpdateFromForm` set `mode: "Both"` by default so the
retained column stays populated. (FR-1, FR-2, AC-1.)

---

## 2. Form fields, `InventoryFormValues`, and the build/validate functions

### 2.1 New / changed `InventoryItem` fields (`src/lib/inventory-data.ts`)

Added (all optional-friendly with safe numeric/string defaults so NFR-2 holds):

| Field | Type | Meaning |
|---|---|---|
| `kind` | `ItemKind` | NEW Item Type source of truth (§1.1) |
| `itemCode` | `string` | permanent server-generated `PRT-000001` (parts) |
| `serviceCode` | `string` | permanent server-generated `SRV-000001` (services) |
| `barcode` | `string` | optional scanning id, unique where set |
| `brandModel` | `string` | optional "Brand / compatible device or model" label |
| `costPrice` | `number` | **CP** — internal default cost/unit (parts) — see §2.1a on storage |
| `sellingPrice` | `number` | **SP** — customer default price/unit (parts) |
| `serviceCharge` | `number` | customer-facing default SP (services) |
| `standardLabourCost` | `number` | estimated internal cost (services) — see §2.1a on storage |
| `costState` | `"configured" \| "not_configured"` | derived on read: whether a real CP/labour cost exists |
| `trackStock` | `boolean` | parts only; false ⇒ sellable non-stock good |
| `billingBasis` | `string` | service unit/billing basis (reuse `uom` channel) |

`sku` already exists; it is split out explicitly in the form (see §2.2). The existing
`defaultPrice`, `regularBuyingPrice`, `wholesaleBuyingPrice`, `regularSellingPrice`, `mrp`,
`dealerPrice`, `distributorPrice`, `hsnCode`, `tax`, `uom`, `currentStock`, `minStock`,
`maxStock`, `active`, `reservedStock`, `soldUnits`, `purchasedUnits` are **retained**
(FR-5 advanced pricing, FR-25, NFR-2).

#### 2.1a Where CP / Standard Labour Cost are STORED (resolves HIGH-1)

> **HIGH-1:** Postgres RLS is row-level only; it cannot mask a column. The existing
> `inventory_items` SELECT policy (`0001` line 1411) admits
> `['manage_inventory','transfer_inventory','manage_purchases','manage_repair_jobs','view_only']`
> — and `manage_repair_jobs` / `view_only` do NOT hold `inventory_view_cost`. If `cost_price`
> / `standard_labour_cost` were columns on `inventory_items`, those roles could
> `select cost_price from inventory_items` and read the value server-side, so FR-27 / AC-21
> ("server-side rejection, not just a hidden button") would be unachievable.

**Decision (review fix option (a)):** the item-master cost figures do NOT live as readable
columns on the broadly-readable `inventory_items` row. They move to a dedicated
**cost-scoped table `inventory_item_costs`** whose RLS requires a cost capability, exactly
like the new `inventory_stock_layers`:

```
inventory_item_costs
  item_id          text primary key references inventory_items(id) on delete cascade
  organization_id  uuid   (auth_org_id default)
  branch_id        uuid   (default NULL — the single org-level default cost row; a NULL
                           branch is visible to every cost-capable org member, §9.4/MEDIUM-2)
  cost_price            numeric not null default 0   -- part CP default (org-level)
  standard_labour_cost  numeric not null default 0   -- service labour cost (org-level)
  cost_configured       boolean not null default false  -- true only when a real value was entered
  updated_at / updated_by
```

- **Read RLS** on `inventory_item_costs` requires ONLY the cost-capability keys —
  `auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])`
  (granular-first, with the coarse keys that `CAP.sensitive.viewCost` already resolves —
  confirmed `capabilities.ts` lines 100–101: `viewCost = ['inventory_view_cost',
  'manage_inventory','manage_purchases']`, `editCost = ['inventory_edit_cost',
  'manage_inventory']`). **`view_profit_margin` is deliberately NOT in this set (MEDIUM-1,
  option (a)):** holding only the profit key must never hand a user the RAW CP / labour row,
  so the hard "server never returns raw cost to a non-cost user" guarantee stays literally
  true. A `manage_repair_jobs` / `view_only` role, AND a profit-only viewer who lacks the cost
  keys, are NOT in this set, so none of them can read the raw cost even by querying the table
  directly — the server/RLS boundary FR-27/AC-21 demand. (How a profit-only viewer still gets
  GP/margin without the raw cost row is defined in §7.1.)
- **Write RLS** requires `auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])`.
- The `inventory_items` row itself carries **no `cost_price`/`standard_labour_cost` column**,
  so there is nothing to leak on the row every operational role can read. (The synthetic
  legacy `regular_buying_price` column stays as-is for backward compat but is no longer
  the cost source — §2.4.)

**Client surface stays uniform.** `rowToInventoryItem` continues to expose `item.costPrice`
/ `item.standardLabourCost` / `item.costState` on the `InventoryItem` object, but it
populates them from a SEPARATE cost read (`inventory_item_costs`) that only succeeds for a
cost-capable user. For ANY user lacking the cost keys — including a profit-only viewer who
holds `view_profit_margin` but not `inventory_view_cost`/`manage_inventory`/`manage_purchases`
— the cost read returns no row and the client leaves `costPrice`/`standardLabourCost`
undefined and `costState = "not_configured"`-equivalent (the form masks them anyway via
`CAP.sensitive.viewCost`). This means raw cost is UI-gated AND RLS-gated, and the two agree:
a profit-only viewer's client NEVER receives raw CP/labour from RLS. (`inventory_stock_layers`,
§4/§9, is the same shape of boundary for the actual ledger cost.) The GP/margin figures a
profit-only viewer is allowed to see come from a cost-free aggregate path, defined in §7.1 —
not from the raw cost row.

`addInventoryItem` / `updateInventoryItem` write the master row to `inventory_items` and
(when the caller is cost-authorized and the CP/labour FIELD IS NON-BLANK) upsert the
`inventory_item_costs` row in the same logical save; a non-cost user simply never writes a
cost. **The "was a value entered" test is a STRING-TRIM test, not a numeric test (resolves
NIT-4):** `configured = v.costPrice.trim() !== ""` (for a service,
`v.standardLabourCost.trim() !== ""`). Consequences:
- A field left **blank** (`""`) ⇒ `buildInventoryItem`/`inventoryUpdateFromForm` emit **no**
  `cost` object ⇒ no `inventory_item_costs` row is written ⇒ `cost_configured` keeps its
  table default `false` ⇒ the item reads as **"not configured"** (⇒ "Cost not configured" in
  profitability, §3.7).
- A field containing **`"0"`** ⇒ a `cost` object IS emitted with `configured: true` and
  `costPrice: 0` ⇒ the row is written with `cost_configured = true` ⇒ the item reads as a
  valid, intentional **₹0 cost** (NOT "not configured").
This makes "configured but 0" and "not configured" produce *different* persisted
`cost_configured` values from the same code path, keyed purely on `string.trim() !== ""` —
never on `Number(x) > 0` (which would wrongly collapse an intentional ₹0 into "not
configured").

**CP ≠ SP, and CP is not derived from SP (FR-5, AC-5).** Today
`buildInventoryItem`/`inventoryUpdateFromForm` derive every tier from `defaultPrice`
(`regularBuyingPrice = round(price*0.7)`, etc.). The redesign stops treating the derived
`regularBuyingPrice` as cost. New rule:
- `costPrice` = user-entered CP (independent field on `inventory_item_costs`; `0`/empty ⇒
  "Cost not configured" per §3.7, never `SP*0.7`).
- `sellingPrice` = user-entered SP; `regularSellingPrice = sellingPrice`;
  `defaultPrice = sellingPrice` (keep legacy readers — e.g. `owner/summary` stock value —
  working, which already prefers `regular_selling_price ?? default_price`).
- `regularBuyingPrice` is **retained on `inventory_items` but no longer the cost source**.
  It is left at its existing value on legacy rows (never overwritten); on new rows it is set
  to `0` (not `SP*0.7`), so no synthetic cost is manufactured. Any legacy aggregate that
  reads `regular_buying_price` (e.g. `inventoryStats`) keeps running on the historical value
  but is NOT used by the new profitability engine, which reads only
  `inventory_item_costs` / `inventory_stock_layers` (§3.3).
- **Advanced Pricing (MRP / dealer / distributor / wholesale) post-split behaviour is pinned
  (resolves NIT-2):** these four tiers are **retained and user-editable** under the Advanced
  Pricing disclosure (FR-5/AC-2), and on save they are stored **exactly as entered** — they
  are **NOT auto-filled from SP and NOT re-derived by any multiplier** (`SP*1.2`, `SP*0.9`,
  `SP*0.85`, `SP*0.65` are all removed along with `defaultPrice*0.7`). A field the user leaves
  blank is persisted as blank/`0` (its existing default on the row), never a surprise
  SP-derived value; a field the user fills is persisted verbatim. Legacy rows keep whatever
  tier values they already have (never overwritten). This matches the explicit removal of the
  synthetic-derivation block in both the modal path and the Add Item page (§2.4, §4) — the
  single rule is "no price tier is ever derived from another; CP, SP and each advanced tier
  are independent stored values."

### 2.2 `InventoryFormValues` (`inventory-item-form.tsx`)

```ts
export type InventoryFormValues = {
  // identity
  kind: "part" | "service";            // replaces `type`; drives field rendering
  itemCode: string;                    // read-only; blank on create → server stamps
  serviceCode: string;                 // read-only; blank on create → server stamps
  name: string;
  sku: string;                         // optional external ref (NOT the id anymore for new parts)
  barcode: string;                     // optional
  description: string;
  category: string;
  brandModel: string;                  // optional
  uom: string;                         // UoM (part) / billing basis (service)
  // pricing — part
  costPrice: string;                   // persisted to inventory_item_costs (§2.1a)
  sellingPrice: string;
  mrp: string; dealerPrice: string; distributorPrice: string; wholesaleBuyingPrice: string; // advanced
  // pricing — service
  serviceCharge: string;
  standardLabourCost: string;          // persisted to inventory_item_costs (§2.1a)
  // tax
  hsn: string;
  tax: string;
  // stock — part (CREATE ONLY for opening — see §2.4)
  trackStock: boolean;
  currentStock: string;                // = Opening Quantity on CREATE only
  openingUnitCost: string;             // Opening Stock Unit Cost (create only)
  minStock: string;
  maxStock: string;
  store: string;
  // internal
  mode: string;                        // retained, hidden, defaulted "Both"
};
```
The old `type`/`defaultPrice` keys are removed from the form values; `description`,
`barcode`, `brandModel` and an explicit `sku` are promoted to real fields.

### 2.3 `emptyInventoryForm` / `inventoryFormFromItem`

- `emptyInventoryForm()` returns `{ kind: "part", itemCode: "", serviceCode: "", ...,
  tax: "18", uom: "Piece", trackStock: true, mode: "Both", ... }` with all money/stock
  fields `""`. Item/Service codes are blank on create (server stamps them).
- `inventoryFormFromItem(item)` maps a persisted item back: `kind` from `item.kind`,
  `itemCode`/`serviceCode` from the item, `costPrice`/`sellingPrice` (or
  `serviceCharge`/`standardLabourCost` for services) from the explicit fields (undefined for
  a non-cost user ⇒ blank + masked), `sku`/`barcode` from the item, stock + advanced tiers
  as today. **On edit the opening fields are not re-editable** (requirements Q5):
  `openingUnitCost` is not surfaced and `currentStock` is shown read-only (stock only
  changes via Purchase/Stock In — §4).

### 2.4 `buildInventoryItem` / `inventoryUpdateFromForm`

**`buildInventoryItem(v, opts?)` now returns a tuple (resolves MEDIUM-2 + preserves the
existing `opts.store`, NIT-1):**
```ts
export function buildInventoryItem(
  v: InventoryFormValues,
  opts?: { store?: string },           // UNCHANGED — the existing store-label arg is kept
): {
  item: InventoryItem;
  cost?: { costPrice: number; standardLabourCost: number; configured: boolean }; // → inventory_item_costs
  opening?: { qty: number; unitCost: number };                                   // → opening-stock movement
}
```
The current signature is `buildInventoryItem(v, opts?: { store?: string }): InventoryItem`
(verified line 83); `item.store` is set from `opts?.store ?? "Main Store"` (verified line 93)
and the real multi-store scoping is stamped by `withStore()` (branch_id) inside
`addInventoryItem`. The redesign **keeps the `opts.store` parameter exactly** and only
changes the RETURN from a bare `InventoryItem` to the `{ item, cost?, opening? }` tuple;
`item.store` continues to come from `opts.store`. Both existing call sites that pass a store
label (`AddInventoryModal`, the Add Item page) keep passing it unchanged, so the
store-scoping of a created item is not lost.
- `item`: identity + public pricing + tax + `kind` + `mode:"Both"` + `active:true`. For a
  part, `sellingPrice`/`regularSellingPrice`/`defaultPrice` are set from SP; stock on the
  built item is **0** (opening never flows through `item.currentStock`). For a service,
  `regularSellingPrice=defaultPrice=serviceCharge`, stock fields 0, `trackStock:false`.
- `cost`: emitted whenever the CP (part) or Standard Labour Cost (service) field is
  **non-blank** — the test is `v.costPrice.trim() !== ""` (string-trim, NOT `Number > 0`), so
  an intentional `"0"` still emits a `cost` object with `configured: true` and
  `costPrice: 0`. A blank field emits **no** `cost` object (so `cost_configured` stays its
  default `false` ⇒ "not configured", §2.1a/§3.7). The save layer writes it to
  `inventory_item_costs` (§2.1a) when the caller is cost-authorized.
- `opening`: present only when `v.trackStock && Number(v.currentStock) > 0` for a part;
  `{ qty, unitCost }`. The save layer turns this into an explicit opening-stock movement +
  ledger layer (§4). Services never return `opening`.

**`id` strategy (resolves MEDIUM-3) — one coherent rule:**
- `inventory_items.id` remains the existing free-text, SKU-like text PRIMARY KEY. On create
  the client sets `id` from `v.sku` (when the user typed a SKU) **or the existing
  `SKU-${Date.now()}`-style fallback** used today — **NOT** `PRT-<ts>`. The `id` never
  impersonates the real sequential code.
- `item_code` / `service_code` are the ONLY `PRT-`/`SRV-` identifiers. They are server-
  stamped on INSERT by the per-org counter (§9.2), immutable, unique, and distinct from
  `id` and from `sku`/`barcode`.
- The "`id = itemCode`" idea from the prior draft is **removed**; `id` is never renamed to
  the code (so existing FKs and invoice-line `sku` references keep working).
- **Fallback-id uniqueness:** the current 6-digit `Date.now()` slice is collision-prone at
  volume. The fallback is widened to the full `SKU-${Date.now()}-${rand4}` (a 4-char random
  suffix) and the DB keeps `id` as a unique PRIMARY KEY, so a same-millisecond double-create
  cannot collide; a collision (astronomically unlikely) fails the insert loudly rather than
  silently merging.

**`inventoryUpdateFromForm(v)` (EDIT) now returns a `{ patch, cost? }` shape, symmetric with
`buildInventoryItem` (resolves NIT-2):**
```ts
export function inventoryUpdateFromForm(v: InventoryFormValues): {
  patch: Partial<InventoryItem>;                                                    // → inventory_items columns
  cost?: { costPrice: number; standardLabourCost: number; configured: boolean };    // → inventory_item_costs upsert
}
```
Today `inventoryUpdateFromForm(v)` returns a bare `Partial<InventoryItem>` (verified line
114) and `updateInventoryItem(id, updates: Partial<InventoryItem>)` writes ONLY
`inventory_items` columns (verified `store.tsx` lines 115/2861) — so there is no defined path
to persist a changed CP on edit. The redesign makes the edit path symmetric with create:
- `inventoryUpdateFromForm` returns `patch` (the public `inventory_items` columns:
  `name/category/uom/description/sku/barcode/brandModel/sellingPrice/serviceCharge/hsnCode/
  tax/min/max/active`) plus an optional `cost` object, present only when a non-blank CP (part)
  / Standard Labour Cost (service) value was entered. It **omits** `itemCode`, `serviceCode`,
  `currentStock`, `openingUnitCost`, and never returns `opening` (codes immutable FR-24/AC-4;
  stock not edited here FR-14/Q5). When the edited row had a `migration_flag` and the edit
  resolves it (§1.2 lifecycle), the `patch` also sets `migration_flag: null`.
- `updateInventoryItem` gains a symmetric optional second-channel arg:
  `updateInventoryItem(id, updates: Partial<InventoryItem>, opts?: { cost?: { costPrice:
  number; standardLabourCost: number; configured: boolean } }): Promise<void>`. When
  `opts.cost` is present AND the caller is cost-authorized, it upserts the
  `inventory_item_costs` row (§2.1a) in the same logical save; a non-cost user never writes a
  cost. The call site becomes
  `const { patch, cost } = inventoryUpdateFromForm(v); await updateInventoryItem(id, patch, { cost });`.
Editing CP/SP affects **future** defaults only; it never rewrites historical stock-layer cost
or finalized invoice snapshots (FR-14, FR-25, AC-19) — guaranteed because historical cost
lives on immutable ledger rows (§4) and on the invoice-line `cost` snapshot (§5.1), not on
the master. (The symmetric `addInventoryItem(item, { cost, opening })` is defined in §4.)

### 2.5 `validateInventoryForm`

```
if (!v.name.trim()) return "Item name is required";
if (!v.category) return "Please select a category";
if (v.kind === "part") {
  if (v.sellingPrice !== "" && Number(v.sellingPrice) < 0) return "Selling Price can't be negative";
  if (v.costPrice   !== "" && Number(v.costPrice)   < 0) return "Cost Price can't be negative";
  if (v.trackStock && v.currentStock && Number(v.currentStock) > 0 && v.openingUnitCost === "")
    return "Enter the Opening Stock Unit Cost for the opening quantity";   // FR-6, AC-8
} else { // service
  if (v.serviceCharge !== "" && Number(v.serviceCharge) < 0) return "Service Charge can't be negative";
  if (v.standardLabourCost !== "" && Number(v.standardLabourCost) < 0) return "Standard Labour Cost can't be negative";
}
return null;
```
`0`/`₹0` remain valid (design-system rule); only negative or opening-qty-without-cost is
rejected.

### 2.6 Rendering (`InventoryItemFields`)

`isService = values.kind === "service"`.

- **Part / Product** renders: *Item Identity* (Item Code read-only chip, SKU, Barcode,
  Name*, Description, Category*, Brand/model, UoM), *Pricing* (CP + SP, with an **Advanced
  Pricing** disclosure holding MRP/wholesale/dealer/distributor), *Inventory Tracking*
  (Track Stock toggle; when on: Opening Quantity, Opening Unit Cost, Store, Min, Max; when
  off: no availability/deduction, item still a `part`), *Tax* (HSN, GST, UoM). (FR-4..7,
  AC-2, Q4.)
- **Repair Service / Labour** renders: *Service Identity* (Service Code read-only, Name*,
  Description, Service Category, device category/brand/model, Unit/billing basis), *Service
  Pricing* (Service Charge + Standard Labour Cost, the latter labelled
  "Standard / estimated cost — not actual job cost"), *Tax* (HSN/class, GST). **No** stock
  quantity / opening stock / min-max / reorder controls. (FR-9..11, AC-3, AC-6.)
- CP / Standard Labour Cost inputs are gated by `CAP.sensitive.viewCost` (view) and
  `CAP.sensitive.editCost` (edit) — §6. A user without view-cost sees those fields
  omitted/masked (and, per §2.1a, the client never received the value from RLS anyway); the
  rest of the form stays usable.

Item Code / Service Code are **read-only** on both create (shown as "Auto-generated on
save") and edit (immutable).

---

## 3. Costing / valuation decision

### 3.1 Audited current state

Verified (Audit §A): there is NO stock-cost ledger. `defaultPrice` drives synthetic tiers;
`regularBuyingPrice = round(defaultPrice*0.7)` is **not a real cost**. `stock_movements`
(`0001` lines 798–812) stores only `items` (quantity), `from_store`, `to_store`,
`movement_type`, `status`, `movement_user`, `movement_date` — **no unit cost, no total
value, no item id**. `deductPartsForTicket` reduces `current_stock` by `part.qty` and
writes an Outward row with the quantity only (`store.tsx`).

### 3.2 Decision: introduce a minimal cost-carrying stock ledger; valuation = weighted average

Per spec §4 ("audit the limitation before upgrading") and requirements FR-16/Q2/Q3:

- **Keep item-level CP as a DEFAULT**, not as the authoritative sold cost. CP now lives on
  the cost-scoped `inventory_item_costs` table (§2.1a), not on the open master row.
- **Add a minimal stock-cost ledger**: a new table `inventory_stock_layers` that records,
  per cost-carrying receipt (opening stock OR Purchase/Stock In), `item_id`, `branch_id`,
  `qty_in`, `unit_cost`, `source` (`opening` | `purchase`), `movement_doc_number`
  (optional link to `stock_movements`), `received_at`. Additive; does NOT fork the
  stock-movement engine — stock quantity still flows through `stock_movements` /
  `current_stock`; the layer table only adds the **cost dimension** the current schema
  lacks.
- **Valuation method = WEIGHTED AVERAGE** (FR-16). Rationale: over the existing minimal
  ledger it is the simplest correct method, O(layers) to compute, cheaper than FIFO
  consumption/relieving, and adequate for current data. The schema does not preclude FIFO
  later (layers carry `received_at` and per-layer qty), so FIFO remains a future option
  (Q2 out of scope now).

### 3.3 Deriving the ACTUAL sold cost (not master CP)

A pure helper `resolvePartUnitCost(itemId, layers, item)` in a new
`src/lib/inventory-costing.ts`, returning a discriminated result:

```ts
type ResolvedCost =
  | { kind: "resolved"; unitCost: number; source: "ledger" | "cp" }
  | { kind: "not_configured" };

resolvePartUnitCost(itemId, layers, item):
  const relevant = layers.filter(l => l.item_id === itemId);
  const totalQty  = Σ relevant.qty_in;
  if (totalQty > 0) return { kind:"resolved", unitCost: Σ(qty_in·unit_cost)/totalQty, source:"ledger" }; // weighted avg
  if (item.costState === "configured" && item.costPrice >= 0) return { kind:"resolved", unitCost: item.costPrice, source:"cp" };
  return { kind:"not_configured" };
```
Invoice profitability resolves parts cost through this helper — never through
`regularBuyingPrice`/`defaultPrice*0.7` (AC-16). The resolution order is deliberate and
consistent with the branch model (MEDIUM-2): **actual store-specific ledger layers first**
(`inventory_stock_layers`, branch-scoped weighted average — the real cost of stock that
physically entered THIS store), falling back to the **org-level default CP** from the single
`inventory_item_costs` row (`branch_id = NULL`, visible to every cost-capable org member),
and only then `not_configured`. So per-store cost variation flows from the ledger while the
item still carries one org-level default — there is no stranded per-store CP row. Services use
`standardLabourCost` from the same org-level cost row (an estimated internal cost, FR-11); a
service with `costState !== "configured"` is also `not_configured`, never ₹0.

### 3.4 Single source of truth (FR-15)

- Inventory Master (`inventory_items`) = item identity + **public** default pricing (SP /
  Service Charge).
- `inventory_item_costs` = item-level **default cost** (CP / Standard Labour Cost),
  cost-capability-scoped.
- `inventory_stock_layers` = actual per-unit **cost** of received stock.
- `invoices.items[].cost` (new, §5) = the **snapshot** of the resolved unit cost at the
  time the invoice line was finalized, so historical profit never shifts when the item CP
  later changes (FR-14/FR-25/AC-19). No competing cost stores.

### 3.5 Profitability functions (`src/lib/inventory-costing.ts`)

Operate over **eligible net revenue** (after discount, excluding collected GST) — FR-21,
FR-22, AC-13/14/15.

**Revenue inputs (resolves HIGH-2 — `repairCost` is billed revenue).** Confirmed in
`invoice/create/page.tsx` (`StepPricing` totals, lines 507–538) and
`InvoiceDeviceRecord.repairCost` (`mock-data.ts` line 1135): the invoice billed
`subtotal = partsTotal + repairCost`, where `repairCost` is each device's agreed labour
charge (billed, not an inventory line, estimate excluded). The profitability engine MUST
include it, or `eligibleNetRevenue` cannot reconcile to the taxable base and Combined GP
understates profit on every ticket→invoice case that bills labour via `repairCost`.

**Decision:** each device's `repairCost` is folded into **service revenue** as an
ad-hoc repair/labour charge with cost `not_configured` (there is no Standard Labour Cost
attached to a free-form repair charge). It is surfaced as its own "Repair/Labour charge"
line in the breakdown (§7.1) so it is visible, not hidden inside line items.

**The discount invariant — ONE discount source (resolves MEDIUM-1).** The billed invoice
has exactly ONE real discount: the invoice-level `form.pricing.discount` (confirmed:
`invoice/create/page.tsx` `totals` memo, `taxable = subtotal − discount`, line ~536). Every
line's per-line `InvoiceLineItem.discount` is **structurally always `0`** today — hard-set
on every path that produces a line: ticket prefill (line 298), field edit (lines 1612,
1706), and both line-add paths (lines 1612/1692). The profitability engine therefore uses
the **invoice-level discount as the single source** and does NOT also subtract a per-line
discount term, so the two mechanisms can never double-count. The identity
`grossRevenue == invoice.subtotal` and
`eligibleNetRevenue == max(0, subtotal − invoice.discount)` hold by this stated invariant,
not by luck. Correctness is enforced by a reconciliation test (§10) that includes a line
carrying a **non-zero per-line discount** and asserts `eligibleNetRevenue` still equals
`max(0, subtotal − invoice.discount)` (i.e. the per-line discount is deliberately ignored by
the engine, matching how the invoice totals are actually computed).

```
// line items (each carries kind, qty, price, resolved cost). line.total already = qty*price.
// Per the invariant above, the engine ignores line.discount (always 0 today) and reconciles
// purely against the single invoice-level discount — no per-line discount term.
lineServiceRevenue     = Σ line.total where kind == "service"
repairChargeRevenue    = Σ device.repairCost over all devices        // billed labour, cost not_configured
serviceRevenue         = lineServiceRevenue + repairChargeRevenue
partsRevenue           = Σ line.total where kind == "part"
grossRevenue           = partsRevenue + serviceRevenue               // == invoice.subtotal (parts + services + repairCost)

// the single invoice-level discount (one Invoice.discount number, confirmed mock-data.ts)
// is distributed pro-rata by each bucket's share of grossRevenue, so the eligible net
// revenue reconciles to the invoice taxable base (subtotal - discount):
if (grossRevenue > 0) {
  partsDiscount   = invoice.discount * (partsRevenue   / grossRevenue);
  serviceDiscount = invoice.discount * (serviceRevenue / grossRevenue);
} else {
  partsDiscount = 0; serviceDiscount = 0;                            // zero-denominator rule
}
partsNet       = max(0, partsRevenue   - partsDiscount);
serviceNet     = max(0, serviceRevenue - serviceDiscount);
eligibleNetRevenue = partsNet + serviceNet;                          // == max(0, subtotal - invoice.discount)

partsCost      = Σ (line.cost * line.qty) for kind == "part"     (not_configured tracked)
labourCost     = Σ (line.cost * line.qty) for kind == "service"  (repairCharge lines contribute 0 / not_configured)
otherDirectCost= Σ invoice.otherDirectCosts (where supported; 0 today)

partsGP        = partsNet   - partsCost
serviceGP      = serviceNet - labourCost
combinedGP     = eligibleNetRevenue - partsCost - labourCost - otherDirectCost
grossMargin    = eligibleNetRevenue > 0 ? (combinedGP / eligibleNetRevenue) * 100 : null   // null → render "—"
```

By construction `partsGP + serviceGP = combinedGP + otherDirectCost`, because
`partsNet + serviceNet = eligibleNetRevenue` (so `partsGP + serviceGP =
eligibleNetRevenue − partsCost − labourCost = combinedGP + otherDirectCost`; MATH-2
corrected the earlier `−` sign). When `grossRevenue == 0` both bucket discounts
are `0`, `eligibleNetRevenue == 0`, and `grossMargin` is `null` ("—", never NaN/0 — AC-14).

Both the pro-rata discount split AND the single-discount-source invariant are **stated
decisions**, not open assumptions. If the business later adopts a real per-line discount,
the engine must switch to `grossRevenue = Σ (line.total − line.discount)` and apply only the
*remaining* invoice-level discount pro-rata — called out here so the change is scoped, not
built now. (If discount should instead be attributed only to parts, that is a one-line change
to the two `*Discount` assignments.)

### 3.6 Eligible finalized-invoice rule

Realized revenue/profit counts ONLY finalized eligible invoices. Reuse
`isFinalizedInvoice` from `src/lib/leads-data.ts` (confirmed body:
`(inv.documentType ?? "invoice") !== "proforma" && inv.status === "paid"`, lines 1234–1236).
Drafts/proformas/quotations/estimates/cancelled contribute ZERO (FR-22, AC-17).

**Input mapping (resolves NIT-1).** `isFinalizedInvoice` takes the `RevenueInvoiceLike` shape
(confirmed `leads-data.ts` lines 1223–1229: `{ id, ticketId?, total, status, documentType?:
"invoice" | "proforma" }`). The profitability engine MUST map the invoice record into that
shape BEFORE calling it — never pass raw invoice form state. The adapter sets
`documentType: inv.documentType ?? "invoice"` (so a record with no explicit document type is
treated as a normal invoice, matching the function's own `?? "invoice"` default) and
`status: inv.status`. i.e. the engine receives a mapped `{ documentType, status, total, id }`
object, and `isFinalizedInvoice` applies its own `?? "invoice"` default defensively on top.
The Profitability Breakdown may still PREVIEW an unsaved/draft invoice's figures (clearly
labelled "preview — not realized"), but aggregate/realized reporting filters on
`isFinalizedInvoice` over the mapped shape.

### 3.7 "Cost not configured" incomplete-cost state

`resolvePartUnitCost` returns `{ kind: "not_configured" }` when neither a ledger layer nor a
configured CP exists; services with no configured Standard Labour Cost (and the
`repairCost` repair-charge lines) are likewise `not_configured`. The breakdown renders "Cost
not configured" for any such line and marks the invoice's parts/combined cost as **partial**
(cost figure shown with an asterisk + a "some costs not configured" note), never ₹0 / never
100% margin (FR-16, FR-22, AC-15). "Configured but 0" (a user intentionally entered a cost
of 0) is distinct from "not configured" and is a valid real ₹0 cost.

---

## 4. Opening / receipt ledger & stock movements

- **Opening stock (create):** `addInventoryItem(item, opts?)` is extended with an optional
  second arg carrying the cost + opening intent returned by `buildInventoryItem`:
  ```ts
  addInventoryItem(item: InventoryItem, opts?: {
    cost?:    { costPrice: number; standardLabourCost: number; configured: boolean };
    opening?: { qty: number; unitCost: number };
  }): Promise<InventoryItem>
  ```
  When `opts.opening` is present (part, Track Stock on, qty > 0) the implementation, AFTER
  the item row is inserted, posts a single cost-carrying entry: an `inventory_stock_layers`
  row (`source='opening'`, `unit_cost = opening.unitCost`, `qty_in = opening.qty`) AND the
  corresponding `stock_movements` Inward row (quantity flows through the existing engine) AND
  sets `current_stock = opening.qty`. This is an explicit opening-stock action, not a
  side-effect of create. When `opts.opening` is absent, stock stays 0 (FR-6, FR-13, AC-7/8).
  When `opts.cost` is present and the caller is cost-authorized, it upserts
  `inventory_item_costs` (§2.1a).
- **Both call sites updated (resolves MEDIUM-2):**
  - `AddInventoryModal.handleSave` → `const { item, cost, opening } =
    buildInventoryItem(values); await addInventoryItem(item, { cost, opening }); onCreated?.(item);`
    (confirmed current body is `buildInventoryItem(values)` + `addInventoryItem(item)`;
    `add-inventory-modal.tsx` lines 69–80.) **The modal HIDES the Inventory-Tracking opening
    fields** (`openingUnitCost`, `currentStock`) — the invoice side never establishes stock,
    matching FR-8/AC-9 — so `opening` from the modal is always `undefined`. (The modal still
    forwards `cost` for a cost-authorized user so CP is captured on creation.)
  - The full Add Item page (`src/app/(app)/inventory/add-item/page.tsx`) is **re-pointed to
    the shared form — a non-trivial rework, not a one-line swap (resolves MEDIUM-2).**
    Verified: this page does NOT use `InventoryItemFields` or `buildInventoryItem` today. It
    is an independent hand-rolled form with its own `useState` fields that builds an
    `InventoryItem` literal, **derives every tier inline from `defaultPrice`**
    (`regularBuyingPrice = round(defaultPrice*0.7)`, `wholesaleBuyingPrice = *0.65`,
    `mrp = *1.2`, `dealerPrice = *0.9`, `distributorPrice = *0.85`), has its own raw
    `currentStock` input, and calls `addInventoryItem(newItem)` (create) /
    `updateInventoryItem(editId, {...})` (edit) with those synthetic prices (lines ~95–160).
    The redesign:
      1. Replaces the page's bespoke `Item Basics` / `Pricing & Tax` / `Stock Levels`
         sections (including its own `Product/Service` + `Buy/Sell/Both` `SegmentedTabs`,
         confirmed lines ~210–230) with the shared `<InventoryItemFields>` driven by
         `InventoryFormValues` (so the page gains, for free, the single Item Type control,
         Item/Service Code chip, CP + SP, Advanced Pricing, Track Stock + Opening Qty/Unit
         Cost, HSN/GST — delivering AC-2 / AC-3 on the full page, not just the modal). The
         live-preview rail may stay but reads from the shared form values.
      2. Routes save through `buildInventoryItem(v)` → `addInventoryItem(item, { cost, opening })`
         (create) and `inventoryUpdateFromForm(v)` → `updateInventoryItem(id, patch, { cost })`
         (edit, §2.4/NIT-2).
      3. **Removes the inline `defaultPrice*0.7`-derivation block entirely** so no synthetic
         cost is manufactured on this page (the same fabrication being removed from the modal
         path), and **removes the raw `currentStock` write** so stock is no longer set
         directly on the row — any opening balance now flows ONLY through
         `opening = { qty, unitCost }`, which the save layer turns into an explicit
         opening-stock movement + ledger layer (§4). This prevents the page from silently
         setting opening stock with no ledger entry (FR-6/FR-13/AC-8).
    **This full Add Item page is the ONLY surface where an opening balance is entered.** The
    `AddInventoryModal` deliberately hides the opening fields (above), and the edit path never
    returns `opening` (§2.4). So there is exactly one opening-stock entry point, and it always
    produces a cost-carrying ledger layer.
- **Purchase / Stock In:** reuse the existing Purchase/Stock In concept (out of scope to
  redesign) but ensure it writes a layer row (`source='purchase'`, qty + unit cost) in
  addition to the quantity movement. `addStockMovement` gains an optional
  `{ itemId, unitCost }` so an Inward movement can carry a cost layer (FR-13). This reuses
  the existing stock-movement engine; no second engine.
- **Services never create stock movements or layers** (FR-13).

---

## 5. Invoice integration

### 5.1 Line discriminator + internal cost (`InvoiceLineItem`)

Extend `InvoiceLineItem` (`src/lib/mock-data.ts`) with OPTIONAL fields (NFR-2 — legacy
lines without them still render/total):
```ts
kind?: "part" | "service";                           // defaults to "part" when absent for legacy rows
cost?: number;                                       // resolved unit cost snapshot — INTERNAL, never printed
costState?: "resolved" | "cp" | "not_configured";    // provenance for the breakdown
```
These feed profitability (§3) and are **never** added to `PrintLineItem` /
`buildInvoiceInfo` (§7). The totals math in `StepProducts`/`StepPricing` is unchanged
(`subtotal = partsTotal + repairCost`; estimate excluded) — `cost`/`kind` do not affect
billed totals (FR-19).

### 5.2 Two Products-step paths

`StepProducts` (`invoice/create/page.tsx`) already distinguishes **Search Inventory**
(adds existing master item via `addInventoryLine`) from **Add Inventory** (creates a master
via `AddInventoryModal`). The redesign formalises the two billing paths:

- **Add Part** (reuse `InventorySearchBox`, store-scoped): search Inventory Master filtered
  to `kind === "part"`, select, enter qty, load current `sellingPrice` onto the line, and
  resolve the valuation cost internally onto `line.cost`/`line.costState` via
  `resolvePartUnitCost` (not shown to the customer). Preserve stock-availability display/
  validation and existing permissions. `addInventoryLine` sets `kind: "part"` and stamps
  `cost`. (FR-17, AC-10.)
- **Add Service** (NEW, distinct from the existing free-text "Add Row"): a Service
  Catalogue search over `kind === "service"` master items (same `InventorySearchBox`
  component, filtered to services). Select → load `serviceCharge` onto `line.price`, stamp
  `line.cost = standardLabourCost` (or `not_configured`), `kind: "service"`. **No
  inventory-quantity effect** (FR-18, AC-10). The existing free-text `addService`
  ("Add Row") stays as a manual non-catalogue charge (`kind: "service"`, no `cost`).

`InventorySearchBox` is reused for both; a `kind` filter prop (`"part" | "service"`) scopes
results. **This is an explicit in-scope component change for this pass (resolves NIT-4), not
an assumed given.** Verified current state: `inventory-search-box.tsx` keys its presentation
off the legacy mirror — line 146 `const out = item.type === "Product" && available <= 0;`
and line 172 `{item.type === "Service" ? "Service" : out ? "Out of stock" : …}`. The
implementation pass:
  1. adds an optional `kind?: "part" | "service"` prop that, when set, filters the result
     list to `item.kind === kind` (Add Part passes `"part"`, Add Service passes `"service"`);
  2. switches the out-of-stock test to `item.kind === "part" && available <= 0` and the label
     to `item.kind === "service" ? "Service" : out ? "Out of stock" : …` — i.e. presentation
     keys off `kind` (the new source of truth), not the legacy `type` mirror.
This honours the inventory-vs-invoice-line steering: Search = add existing; Add Inventory =
create master; Add Service = catalogue service — never one "Add Item" button for both. It is
reflected in the AC→design map (AC-10) so it is not treated as an invisible given.

### 5.3 Ticket → Invoice prefill without duplication / without estimate-as-line

Confirmed in `ticketDeviceToInvoiceDevice` (`mock-data.ts`) and the `fromTicket` effect in
`invoice/create/page.tsx`: ticket parts → `InvoiceLineItem[]` (sku/qty/price/total
preserved), ticket `estimate → estimateValue` (reference only, never a billable line),
`repairCost = 0`, estimate NOT added to the billed subtotal. The redesign preserves all of
this and additionally stamps each prefilled part line with `kind: "part"` and a resolved
`cost` (so profitability works on pushed invoices), and prefills any ticket-recorded
services as `kind: "service"` lines. The device `repairCost`, when the user sets one, feeds
profitability as repair-charge revenue per §3.5. No duplication of parts/services; estimate
stays a reference (FR-20, AC-11). SGST/CGST/discount behaviour unchanged.

### 5.4 Duplicate-stock-deduction guard (reconciled with `deductPartsForTicket`)

Confirmed: `deductPartsForTicket` (`store.tsx`) is the authoritative ticket-driven
consumption point — it flips `TicketPart.status` `planned → used`, reduces `current_stock`,
and writes Outward movements. It is invoked from the Tickets list, ticket detail, and bulk
status flows — **never from invoice finalization today**.

**Decision (requirements Q6; resolves MEDIUM-1 — this pass is a GUARD, not new standalone
deduction):** `deductPartsForTicket` remains the SINGLE authoritative consumption point for
**ticket-originated** fulfilment. Invoice finalization does **not** introduce a new
deduction path in this pass. Specifically:

**Honest statement of what is (not) built this pass (resolves NIT-3).** Verified: the invoice
create/finalize flow contains **no** `addStockMovement` / `current_stock` write / deduction
anywhere under `src/app/(app)/invoice/`, and `deductPartsForTicket` is invoked ONLY from the
Tickets list, ticket detail, and dashboard flows (grep: `tickets/[id]/page.tsx`,
`tickets/page.tsx`, `dashboard/page.tsx`), never from invoice. So **invoice finalization
performs NO stock deduction today, and this redesign adds none.** There is therefore nothing
to double-deduct — the "guard" is the *absence* of a second deduction path, not an active
runtime check that is not implemented.

1. **Ticket-linked invoices (the common case):** `InvoiceFormDevice.ticketDeviceId` and
   `Invoice.ticketId` tie the invoice back to its ticket. Stock consumption is owned entirely
   by the ticket flow (`deductPartsForTicket`), which flips `TicketPart.status`
   `planned → used`. Because invoice finalization writes no stock movement, a part the ticket
   already consumed (`status === "used"`) is simply never touched again by the invoice —
   there is no code path that could re-deduct it. (FR-12, AC-12.)
2. **Idempotency:** `deductPartsForTicket` is itself keyed by the ticket part's `status`
   (consumes `planned` once → `used`); a re-run / double-submit finds `used` parts and skips
   them. No new idempotency logic is added on the invoice side because the invoice side does
   not consume.
3. **Standalone invoices (no linked ticket):** invoice finalization continues to perform
   **no stock deduction** (today's behaviour, honouring FR-12's "reduce stock through the
   EXISTING stock-movement logic only"). Standalone-invoice stock consumption is **explicitly
   out of scope for this redesign** — a standalone sale's stock is adjusted through the
   existing Purchase/Stock In / stock-movement tools. If a future pass wants standalone-invoice
   auto-deduction, it would be added as its own change: a finalize hook with an explicit
   per-invoice idempotency key (e.g. an additive `invoices.stock_consumed_at` flag) that only
   deducts `kind === "part" && trackStock` lines via `addStockMovement`, guarded so a
   re-finalize is a no-op. That is named only to show the schema does not preclude it; it is
   not built now.

**AC-12 verification (what the test actually asserts):** finalize a ticket-linked invoice
whose ticket parts were already consumed, then assert (a) each ticket `TicketPart.status`
remains `"used"` and (b) the item's `current_stock` is **unchanged** after invoice finalize —
i.e. the test confirms the invoice path adds no deduction, rather than exercising an active
per-ticket guard check (which does not exist). The single consumption point stays
`deductPartsForTicket`; this pass introduces no second stock engine and no new consumption
path.

---

## 6. Permissions

Reuse the existing keys (Audit §D; confirmed in `permissions.ts`, `permission-levels.ts`,
`capabilities.ts`). The required visibility surface already exists.

**Decision on Open Question Q1:** REUSE existing keys; do NOT add a new capability. CP /
Standard Labour Cost visibility → `CAP.sensitive.viewCost`
(`inventory_view_cost` + coarse `manage_inventory`/`manage_purchases`); editing them →
`CAP.sensitive.editCost` (`inventory_edit_cost` + `manage_inventory`); the Profitability
Breakdown → `CAP.sensitive.viewProfit` (`view_profit_margin` + `view_financial_reports`).
These are already registered in all layers and are OFF by default (opt-in: the `inventory`
module Work tier grants `inventory_view_cost`, Manage grants `inventory_edit_cost`; the
`reports` module View tier grants `view_profit_margin`). No new key means no new matrix
drift risk, and it matches the inventory-vs-invoice-line steering (`CAP.inventory` reused
for the master-create/search gate).

- `CAP.inventory.create` continues to gate the "Add Inventory" action (master create);
  `CAP.inventory.view` gates search/select. Billing an invoice stays gated by
  `CAP.invoice.*`. (Reused exactly — `capabilities.ts`.)
- No `PermissionKey` union / `PERMISSION_GROUPS` / `PERMISSION_MODULES` / `CAP` additions
  are required for this redesign.

**Server + RLS enforcement (FR-27, AC-21) — now achievable (resolves HIGH-1).** Cost
figures no longer live on the broadly-readable `inventory_items` row. The boundary is:
- `inventory_item_costs` (CP / Standard Labour Cost): **read RLS** requires ONLY the cost
  keys —
  `auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])`.
  **`view_profit_margin` is deliberately excluded (MEDIUM-1, option (a))** so a profit-only
  viewer never reads a raw CP/labour row. **write RLS** requires
  `auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])`.
- `inventory_stock_layers` (actual ledger cost): same cost-only read set
  (plus org + branch scope via `auth_member_of_org` + `auth_branch_visible`).
- `inventory_items` keeps its existing policy but carries **no cost column**, so the
  `manage_repair_jobs` / `view_only` roles that can read the row read no cost.

A role lacking the cost keys — including a profit-only viewer holding only
`view_profit_margin` — that issues `select cost_price from inventory_item_costs` receives
**zero rows**: a true server/RLS rejection, not merely a hidden button. The cost-capable
Profitability Breakdown is derived in-memory from already-authorized cost records (NFR-5),
so its gate is the client CAP plus the RLS on the cost source tables. The profit-only
viewer's aggregated GP/margin instead comes from the cost-free
`getInvoiceProfitAggregate` server route (§7.1), guarded by
`requirePermission(req, ['view_profit_margin','view_financial_reports','inventory_view_cost','manage_inventory','manage_purchases'])`,
which returns derived aggregates only (never a raw per-unit cost FIELD). AC-21 is worded as a
RAW-FIELD boundary (not "can never derive any cost figure" — see the §7.1 approved product
decision for finding #4): a profit-only viewer never READS a raw cost field. It is verified by
a server-side test: a role with ONLY `view_profit_margin` (no cost key) selecting from
`inventory_item_costs` / `inventory_stock_layers` / `invoice_line_costs` gets zero rows, and
the aggregate route still yields GP/margin without exposing a raw cost field. (The aggregate
GP/margin may be arithmetically invertible to a unit cost on a trivially small invoice — an
accepted, documented residual, not a leak of a raw field.)

---

## 7. Internal Profitability Breakdown & print safety

### 7.1 The Profitability Breakdown view

A new internal panel (e.g. `src/components/invoice/profitability-breakdown.tsx`) rendered
on the invoice detail / review surface, wrapped in `<Can permission={CAP.sensitive.viewProfit}>`.
It shows: Parts Revenue, Service Revenue (with the **Repair/Labour charge** sub-line that
carries each device's `repairCost`, per §3.5/HIGH-2), Parts Cost, Labour Cost, Other Direct
Costs (where supported), Gross Profit, Gross Margin — computed by the §3.5 functions over
the invoice's lines AND device repair charges.

**Two distinct viewer tiers (resolves MEDIUM-1, option (a)) — the per-line cost columns are
a hard RLS boundary, not just a UI mask:**

- **Cost-capable viewer** (holds `CAP.sensitive.viewCost` → `inventory_view_cost` /
  `manage_inventory` / `manage_purchases`, and typically also `viewProfit`): their client
  received the `inventory_item_costs` / `inventory_stock_layers` rows from RLS, so the §3.5
  engine runs fully in-memory and the panel shows BOTH the per-line/parts/labour **cost
  columns** AND Gross Profit / Gross Margin.
- **Profit-only viewer** (holds `CAP.sensitive.viewProfit` but NOT any cost key): per §2.1a
  their client received NO raw cost rows from RLS, so they **cannot** compute per-unit cost
  in-memory and the panel renders the per-line/parts/labour **cost columns as masked** (not
  "₹0" — a locked/•••• treatment that is explicitly absence-of-authorization, never a cost
  value). The **aggregated Gross Profit / Gross Margin figures** they are allowed to see are
  produced by a SEPARATE cost-free path: a `getInvoiceProfitAggregate(invoiceId)` server
  route (`requirePermission(req, ['view_profit_margin','view_financial_reports',
  'inventory_view_cost','manage_inventory','manage_purchases'])`) that computes GP/margin
  SERVER-SIDE (where it legitimately reads the cost tables under the service role / an
  authorized query) and returns ONLY the derived aggregate numbers (combined GP + margin for a
  profit-only viewer; the full bucket breakdown additionally for a cost-capable viewer) —
  never the per-unit CP/labour field. (If the business later decides a profit viewer MAY also
  see raw cost, the single change is to add `view_profit_margin` to the `inventory_item_costs`
  read set in §9.7 — called out so the boundary is a deliberate, one-line decision.)

> **APPROVED PRODUCT DECISION (review finding #4 — profit-only aggregate-cost disclosure).**
> FR-23 requires a profit-only viewer to see Gross Profit and Gross Margin on EVERY invoice,
> including a single-line one. Because that viewer may also read the invoice's net revenue and
> line quantities, `combinedGP` is arithmetically invertible on a trivially small (e.g.
> single-line / single-bucket) invoice: `partsCost = eligibleNetRevenue − combinedGP`, and
> `÷ qty` yields a per-unit cost. We ACCEPT this residual rather than suppress GP/margin for
> small invoices (rejected — it would silently remove a capability FR-23 explicitly grants).
> Rationale: profit permission is itself a trust grant to see profitability; the exposure is
> an AGGREGATE GP/margin figure (never a raw per-field CP/labour value and never the bucket
> breakdown for a profit-only viewer), and the raw cost FIELDS remain hard-gated server-side
> behind the cost key (the SYS-1 relocation of cost off the broadly-readable rows stays). The
> real, enforceable security line is "a profit-only viewer never READS a raw cost field," and
> that line holds. AC-21's guarantee is therefore worded as that raw-field boundary, NOT as
> "can never derive any cost figure" (which is unachievable without violating FR-23).

This stays consistent with NFR-5: the cost-capable breakdown is fully in-memory over
already-loaded records (no N+1), and the profit-only path is a SINGLE lightweight aggregate
call per invoice-detail render (one request, not a per-line / per-item query loop), so
neither path introduces N+1 queries in the UI.

Margin shows "—" when eligible net revenue is 0 (AC-14); any `not_configured` line
(including the repair-charge line) shows "Cost not configured" (AC-15). It uses the shared
detail/section primitives (design-system reuse). (FR-23, AC-13.)

### 7.2 Print safety (hard guarantee)

Confirmed: `PrintLineItem` (`print-utils.ts`) is `{ sku, name, description?, qty, price,
taxClass?, discount, total }` — no cost/labour/profit field; `buildInvoiceInfo` maps only
those. The redesign **must not** add `cost`/`kind`/`costState`/labour/profit to
`PrintLineItem`, `buildInvoiceInfo`, `buildTicketInfo`, or `QuotationA4`. The invoice line
`cost`/`costState` are stripped at the `buildInvoiceInfo` boundary (they simply aren't
mapped). Standard Labour Cost and the device repair-charge cost never appear on any customer
document (FR-11, AC-18). **Guarantee is enforced by a MANDATORY test (NIT-3, kept in §10):**
a unit test asserts the `buildInvoiceInfo` output and every `PrintLineItem` contain no
`cost`/`kind`/`costState`/labour/profit property, so a future edit cannot silently leak
internal cost.

---

## 8. Save / edit / historical safety

- **Codes stable & immutable** (FR-24, AC-4): `item_code` / `service_code` are server-
  stamped once by a BEFORE INSERT trigger via the per-org counter (§9.2) and never on
  update; `inventoryUpdateFromForm` omits them; they are read-only in the form.
- **Editing CP/SP/Service Charge/Standard Labour Cost affects future defaults only**
  (FR-14, FR-25, AC-19): historical cost lives on immutable `inventory_stock_layers` rows
  and on the invoice line `cost` snapshot — editing the master (`inventory_item_costs`
  upsert) never rewrites them. The `updateInventoryItem` activity log already records price
  changes (`store.tsx` `buildChanges`).
- **Archive, not delete** (FR-26, AC-20): referenced items are soft-deleted via the
  existing `active=false` + `deleted_at`/`deleted_by` columns (`0001`) and
  `deleteInventoryItem`; they remain resolvable on historical documents.
- **Backend validation + authorization** (FR-27): RLS on `inventory_items` /
  `stock_movements` / new `inventory_item_costs` / new `inventory_stock_layers`;
  `validateInventoryForm` on the client plus NOT-NULL/defaults + the stamp trigger
  server-side.

---

## 9. Supabase migration plan

Latest existing migration = `0074_lead_multi_device.sql` (verified by directory listing;
the pre-existing duplicate `0064_` prefix does not change the max). **New migration =
`0075_inventory_costing_redesign.sql`**, additive + idempotent (NFR-1, AC-23).

Contents (all guarded `add column if not exists` / `create table if not exists` /
`drop … if exists` + recreate; re-runnable):

### 9.1 `inventory_items` additive columns (NO cost columns here)

`item_kind text`, `item_code text`, `service_code text`, `barcode text`,
`brand_model text`, `description text` (if not already present),
`selling_price numeric not null default 0`, `service_charge numeric not null default 0`,
`track_stock boolean not null default true`, `migration_flag text`.
**Deliberately NOT added here:** `cost_price`, `standard_labour_cost` (they live on
`inventory_item_costs`, §9.4, so the broadly-readable row cannot leak them — HIGH-1).
Retain `item_type`, `mode`, `default_price`, `regular_buying_price` and all derived tiers.

### 9.2 Per-org code counters + stamp trigger (resolves HIGH-3)

> **HIGH-3:** The quotation pattern uses a single GLOBAL sequence (`quotation_no_seq`),
> producing globally-sequential codes shared across all orgs — not the "organization-level"
> generation FR-4 / spec §2A require, and it leaks the global creation rate across tenants.

**Decision (review fix (b)): per-org numbering**, reusing the EXISTING race-safe per-org
counter precedent `public.next_lead_id(p_org_id)` in `0002_leads.sql` (lines 136–186: a
`lead_sequences` counter table, `insert … on conflict do nothing`, `select … for update`,
`update … set next_number = v_num + 1`). This is the established, verified pattern in this
codebase — NOT a global `nextval` sequence.

```
create table if not exists public.inventory_code_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('part','service')),
  next_number     integer not null default 1,
  primary key (organization_id, kind)
);

create or replace function public.next_inventory_code(p_org_id uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare v_num integer; v_prefix text;
begin
  v_prefix := case when p_kind = 'service' then 'SRV-' else 'PRT-' end;
  -- seed above any existing codes for this org+kind so re-runs/imports never collide
  insert into public.inventory_code_sequences (organization_id, kind, next_number)
  values (p_org_id, p_kind,
    coalesce((select max((regexp_replace(
         case when p_kind='service' then service_code else item_code end,'\D','','g'))::int)
       from public.inventory_items
       where organization_id = p_org_id and item_kind = p_kind
         and (case when p_kind='service' then service_code else item_code end) ~ '\d'), 0) + 1)
  on conflict (organization_id, kind) do nothing;
  select next_number into v_num from public.inventory_code_sequences
    where organization_id = p_org_id and kind = p_kind for update;
  update public.inventory_code_sequences set next_number = v_num + 1
    where organization_id = p_org_id and kind = p_kind;
  return v_prefix || lpad(v_num::text, 6, '0');
end; $$;
```
`inventory_items_stamp_code_trg` (BEFORE INSERT): when `item_kind='part'` and `item_code`
blank → `item_code := next_inventory_code(new.organization_id,'part')`; when
`item_kind='service'` and `service_code` blank → `service_code :=
next_inventory_code(new.organization_id,'service')`. Each org starts at `PRT-000001` /
`SRV-000001`; codes are per-org independent (no cross-tenant rate leak). Unique partial
indexes `(organization_id, item_code) where item_code is not null` and
`(organization_id, service_code) where service_code is not null`. `grant execute` on the
function to `authenticated`.

### 9.3 Backfill — explicit, ordered, idempotent (resolves MEDIUM-4)

Run as separate guarded statements IN THIS ORDER (every one `IS NULL`-guarded for re-run
safety; the stamp trigger is INSERT-only so existing rows are seeded here, keyed on
`item_kind`, not `item_type`):

```
-- (1) classify FIRST, from legacy item_type
update public.inventory_items
   set item_kind = case when item_type = 'Service' then 'service' else 'part' end
 where item_kind is null;

-- (2) flag the un-mappable / contradictory rows (non-destructive; stray stock preserved)
update public.inventory_items set migration_flag = 'unrecognised_item_type'
 where migration_flag is null and item_type is not null and item_type not in ('Product','Service');
update public.inventory_items set migration_flag = 'service_with_stock'
 where migration_flag is null and item_kind = 'service'
   and (coalesce(current_stock,0) <> 0 or coalesce(min_stock,0) <> 0 or coalesce(max_stock,0) <> 0);

-- (3) seed codes keyed on item_kind (one value per row; next_inventory_code is volatile)
update public.inventory_items
   set item_code = public.next_inventory_code(organization_id,'part')
 where item_kind = 'part' and item_code is null;
update public.inventory_items
   set service_code = public.next_inventory_code(organization_id,'service')
 where item_kind = 'service' and service_code is null;

-- (4) seed PUBLIC prices only (never the cost — cost stays absent ⇒ "Cost not configured")
update public.inventory_items set selling_price = regular_selling_price
 where coalesce(selling_price,0) = 0 and coalesce(regular_selling_price,0) <> 0;
update public.inventory_items set service_charge = regular_selling_price
 where item_kind = 'service' and coalesce(service_charge,0) = 0 and coalesce(regular_selling_price,0) <> 0;
```
No `inventory_item_costs` row is seeded in the backfill: legacy `regular_buying_price` is
synthetic, so CP is left truly absent (⇒ "Cost not configured", never the fabricated
`SP*0.7`). No price/stock/`item_type`/`mode`/`regular_buying_price` value is overwritten
(AC-23). Each `update` is idempotent via its `IS NULL`/`= 0` guard; a set-based `update`
with the volatile `next_inventory_code` allocates one distinct value per row.

### 9.4 New cost-scoped table `inventory_item_costs` (HIGH-1)

```
create table if not exists public.inventory_item_costs (
  item_id              text primary key references public.inventory_items(id) on delete cascade,
  organization_id      uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id            uuid default null references public.branches(id) on delete set null,  -- NULL = org-level default cost (MEDIUM-2)
  cost_price           numeric not null default 0,
  standard_labour_cost numeric not null default 0,
  cost_configured      boolean not null default false,
  updated_at           timestamptz not null default now(),
  updated_by           uuid default public.auth_staff_id() references public.staff(id) on delete set null
);
```

**Branch scoping (resolves MEDIUM-2).** The PK is `item_id` only — exactly ONE cost row per
item, holding the **organization-level default cost** (CP / Standard Labour Cost), matching
"CP is an org-level item default" (spec §2A, FR-4, §3.4). The row's `branch_id` is written as
**`NULL`** (NOT `auth_branch_id()`), so the SELECT policy's `auth_branch_visible(branch_id)`
evaluates `auth_branch_visible(NULL)` → always true for any cost-capable org member
(verified `0001` lines 416–419). This fixes the stranding bug: whichever store first writes
CP no longer stamps its own `branch_id` onto the shared row and hides the default from
cost-capable users in other stores. (`addInventoryItem`/`updateInventoryItem` therefore
upsert `inventory_item_costs` with `branch_id => null` explicitly, overriding any
`auth_branch_id()` default.) Store-SPECIFIC physical cost already lives, correctly
branch-scoped, on the per-receipt `inventory_stock_layers` rows (§9.5), which is where
real per-store cost variation belongs and what the weighted-average valuation reads first
(§3.3). A future per-store CP OVERRIDE, if ever needed, is an explicitly separate feature:
an additional row keyed `(item_id, branch_id)` with a non-null `branch_id`, resolved as
"branch override else org-level NULL-branch default" — reserved, not built now, so this
table's single-row-per-item contract stays simple today.

### 9.5 New ledger table `inventory_stock_layers`

```
create table if not exists public.inventory_stock_layers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.auth_org_id() references public.organizations(id) on delete cascade,
  branch_id uuid default public.auth_branch_id() references public.branches(id) on delete set null,
  item_id text not null references public.inventory_items(id) on delete cascade,
  source text not null default 'purchase',       -- opening | purchase
  qty_in numeric not null default 0,
  unit_cost numeric not null default 0,
  movement_doc_number text,                       -- optional link to stock_movements
  received_at timestamptz not null default now(),
  created_by uuid default public.auth_staff_id() references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);
```
Indexes on `(item_id)` and `(branch_id)`.

### 9.6 `stock_movements` additive cost columns (optional link)

`item_id text`, `unit_cost numeric`, `total_value numeric` — all nullable (legacy movements
stay valid).

### 9.7 RLS (cost-capability-gated — HIGH-1; AC-21)

Enable RLS on both new tables. Policies use the existing helpers (`auth_member_of_org`,
`auth_branch_visible`, `auth_has_any`, `auth_org_id`, confirmed in 0001/0002/0064):

- `inventory_item_costs` **select** (cost keys ONLY — `view_profit_margin` deliberately
  excluded per MEDIUM-1 option (a)):
  `auth_member_of_org(organization_id) and auth_branch_visible(branch_id) and
   auth_has_any(array['inventory_view_cost','inventory_edit_cost','manage_inventory','manage_purchases'])`.
  Because the org-level default cost row is written with `branch_id = NULL` (§9.4) and
  `auth_branch_visible(NULL)` is always true for org members (verified `0001` lines 416–419:
  `select … or b is null or …`), every cost-capable user in ANY store of the org reads the
  single org-level default cost — no store strands it. **insert/update/delete**:
  `… and auth_has_any(array['inventory_edit_cost','manage_inventory','manage_purchases'])`.
- `inventory_stock_layers` **select**: same cost-only read set as above (ledger cost is
  sensitive too), but branch-scoped on the ACTUAL receiving store (`auth_branch_visible(branch_id)`
  with a real `branch_id`, since a stock layer is a per-store physical receipt, not an
  org-level default). **insert/update/delete**:
  `… and auth_has_any(array['manage_inventory','manage_purchases','adjust_stock'])`.

No NEW permission KEYS are added — only policy wiring to existing keys (so no matrix drift;
§6). No destructive drops; no bulk rewrite of historical prices/stock/`item_type`/`mode`
(AC-23). Re-running is safe.

---

## 10. Verification plan (NFR-6, AC-24)

- `npx tsc --noEmit` + project build pass.
- Pure unit tests for `src/lib/inventory-costing.ts`:
  - weighted-average cost over multiple layers; CP fallback when no layers;
    "not_configured" when neither (AC-15, AC-16);
  - zero-denominator margin ⇒ `null` ("—") and bucket discounts 0 (AC-14, §3.5 edge rule);
  - **`repairCost` folded into service revenue** so `eligibleNetRevenue == max(0, subtotal −
    invoice.discount)` and `partsGP + serviceGP == combinedGP + otherDirectCost` (HIGH-2);
  - GST excluded from revenue (AC-13);
  - finalized-only eligibility via `isFinalizedInvoice` (AC-17);
  - pro-rata discount split reconciliation (incl. a case with parts + services + repairCost);
  - **single-discount-source invariant (resolves MEDIUM-1):** a line carrying a NON-ZERO
    per-line `discount` must NOT change the result — assert `eligibleNetRevenue == max(0,
    subtotal − invoice.discount)` still holds (the engine ignores `line.discount`, reconciling
    only against the invoice-level discount), proving the two discount mechanisms never
    double-count;
  - CP=1800/SP=2500 ⇒ ₹700/unit preliminary margin (AC-5);
    ServiceCharge=500/StdLabour=200 ⇒ ₹300 service GP (AC-6).
- Guard test: a ticket-consumed part is NOT re-deducted on invoice finalize of a
  ticket-linked invoice; invoice finalize performs no deduction for a standalone invoice
  (AC-12, §5.4).
- **Mandatory print test (prior NIT-3):** `buildInvoiceInfo` output and every `PrintLineItem`
  contain no `cost`/`kind`/`costState`/labour/profit property (AC-18).
- **Needs-review pill no-cost test (resolves NIT-5):** the data passed to the "Needs review"
  pill/tooltip contains only the machine-reason string and no `cost`/`costPrice`/
  `standardLabourCost`/`unit_cost` property, so a view-cost-less inventory-editor cannot infer
  cost from it.
- **Configured-₹0 vs not-configured test (resolves NIT-4):** `buildInventoryItem` with
  `costPrice: "0"` emits a `cost` object (`configured: true`, `costPrice: 0`); with
  `costPrice: ""` emits **no** `cost` object — and in profitability the former yields a valid
  ₹0 cost while the latter yields "Cost not configured" (not ₹0 / not 100% margin).
- **Add Item page rework test (resolves MEDIUM-2):** `add-item/page.tsx` renders the shared
  `InventoryItemFields` and routes save through `buildInventoryItem`/`inventoryUpdateFromForm`;
  no `defaultPrice*0.7`-style synthetic cost is written, and an opening balance set on this
  page produces a cost-carrying `inventory_stock_layers` row (not a bare `current_stock`
  write).
- RLS test (AC-21): a role holding only `manage_repair_jobs` / `view_only` selecting from
  `inventory_item_costs` and `inventory_stock_layers` returns ZERO rows; a role with
  `inventory_view_cost` reads them.
- **Profit-only-viewer RLS test (resolves MEDIUM-1):** a role holding ONLY
  `view_profit_margin` (no `inventory_view_cost`/`edit_cost`/`manage_inventory`/
  `manage_purchases`) selecting from `inventory_item_costs` / `inventory_stock_layers`
  returns ZERO rows (raw CP is never handed over), while `getInvoiceProfitAggregate` still
  returns GP/margin for that caller and its payload contains NO per-unit cost/labour field.
- **Org-level cost visibility test (resolves MEDIUM-2):** a cost-capable user in store B
  reads the CP of an org-level item whose `inventory_item_costs` row was written by a user in
  store A (the row's `branch_id` is NULL, so `auth_branch_visible(NULL)` is true and the item
  is NOT "Cost not configured" for store B).
- Migration re-run test: `0075` applies twice without error; legacy rows load and classify;
  a `Service`-with-stock row and an unrecognised `item_type` row are flagged (not discarded)
  (AC-22, AC-23).
- Per-org code test: two orgs each start at `PRT-000001` / `SRV-000001` (HIGH-3).

---

## 11. Acceptance-criteria → design mapping

| AC | Satisfied by |
|---|---|
| 1 (single Item Type, no Buy/Sell/Both, no Product/Service) | §1.3, §2.6 |
| 2 (Part form fields) | §2.1–§2.6 |
| 3 (Service form fields, no stock controls) | §2.6 |
| 4 (PRT-/SRV- codes, immutable, per-org) | §2.4, §8, §9.2 |
| 5 (CP≠SP ₹1800/₹2500 → ₹700) | §2.1/§2.1a, §2.4, §3.5, §10 |
| 6 (ServiceCharge/StdLabour ₹500/₹200 → ₹300) | §2.6, §3.5, §10 |
| 7 (no opening qty ⇒ no movement / stock 0; invoice add ≠ deduct) | §2.4, §4, §5.4 |
| 8 (opening qty+cost ⇒ cost-carrying ledger entry) | §2.4, §4, §9.5 |
| 9 (Add Inventory from invoice returns auto-selected; stock only via explicit action) | §4 (modal hides opening; both call sites) |
| 10 (Add Part / Add Service distinct paths; `InventorySearchBox` `kind` prop + `item.kind` logic in-scope) | §5.2 |
| 11 (Ticket→Invoice prefill, no estimate line, totals preserved) | §5.3 |
| 12 (no double stock deduction; single consumption point — invoice finalize deducts nothing) | §5.4, §10 |
| 13 (Profitability Breakdown contents incl. repairCost, net-of-GST) | §3.5, §7.1 |
| 14 (margin "—" when net revenue 0) | §3.5, §7.1 |
| 15 ("Cost not configured", not ₹0/100%) | §3.3, §3.7, §7.1 |
| 16 (weighted-average, CP fallback, never defaultPrice*0.7) | §2.1a, §3.2, §3.3 |
| 17 (only finalized eligible contribute) | §3.6 |
| 18 (print shows no cost/labour/profit) | §7.2 |
| 19 (edit CP/SP affects future only) | §2.4, §3.4, §8 |
| 20 (archive not delete) | §8 |
| 21 (CAP.sensitive.viewCost / viewProfit; UI + server/RLS rejection; profit-only viewer gets aggregate GP/margin via the cost-free route, never a raw cost FIELD — raw-field boundary per the §7.1 finding-#4 decision) | §2.1a, §6, §7.1, §9.4/§9.7, §10 |
| 22 (legacy load/map, flag stray-stock service & unknown type, surfaced) | §1.1, §1.2, §9.3 |
| 23 (additive/idempotent migrations from 0075, no overwrite) | §9 |
| 24 (tsc/build + calc tests) | §10 |

---

## 12. Assumptions carried forward (flagged)

- **Q1 — permissions:** reuse `CAP.sensitive.viewCost`/`editCost`/`viewProfit`; no new key
  (decided §6; cost now also RLS-gated via the cost-scoped tables).
- **Q2 — valuation:** weighted average only; FIFO out of scope but not precluded (§3.2).
- **Q3 — ledger depth:** minimal cost-carrying layer table, not a multi-warehouse FIFO
  engine (§3.2, §9.5).
- **Q4 — Track Stock off:** behaves as a sellable non-stock part (no availability block, no
  deduction) while still `kind='part'` (§2.6).
- **Q5 — opening stock on edit:** opening fields are create-time only; further stock via
  Purchase/Stock In (§2.3, §4).
- **Q6 — consumption authority:** `deductPartsForTicket` owns TICKET-linked fulfilment.
  SUPERSEDED for direct sales by §13.-2 finding #8 (FR-12): invoice finalization now DOES
  deduct a direct-invoice part's stock exactly once through the server-owned, idempotency-
  keyed `consume_invoice_line_stock`, and marks ticket-consumed lines so the two paths never
  double-deduct. (The original §5.4 "finalize deducts nothing" narrowing is no longer the
  behaviour — see §13.-2.)
- **Q7 — item_kind vs item_type:** new `item_kind` column, `item_type`/`mode` kept in sync
  for backward compat (§1.1).
- **Decision (was assumption) — discount split:** the invoice-level `discount` is
  distributed pro-rata between parts and services by net-revenue share, so Parts GP +
  Service GP reconcile to Combined GP; bucket discounts are 0 when `grossRevenue == 0`; the
  denominator includes `repairCost` (§3.5). This is a stated decision, not an open question.
- **Decision (was assumption) — `id`:** `inventory_items.id` stays the free-text SKU-like
  PRIMARY KEY (fallback `SKU-${Date.now()}-${rand4}`, NOT `PRT-<ts>`); `item_code`/
  `service_code` are the only `PRT-`/`SRV-` identifiers and are never equal to `id` (§2.4).

---

## 13. Response to design review (`inv-design-review.json`)

### 13.-2 Aggregator review (Revision 5 → Revision 6): 11 blocking findings (inv-review.json) — ALL RESOLVED

This round reconciled the branch with current `main` and closed the trust-boundary
and stock-accounting gaps the system/math reviews raised. Several fixes INTENTIONALLY
tighten behaviour the earlier design under-delivered against the authoritative FRs
(FR-12 idempotent consumption; FR-13 valued Purchase/Stock-In); none weakens a
requirement.

- **#1 Stale base + migration collision** — the branch is REBASED onto current `main`
  (which carries work-session `0075` and invoice-refund `0076`); those subsystems and
  their permission surfaces are retained (they were never deleted — the diff only looked
  that way on the stale base). The costing migration is renumbered `0075 → 0077`
  (`0077_inventory_costing_redesign.sql`); there is no `0075`/`0076` collision and no
  stale reference to the old number.
- **#2 Raw cost on `stock_movements`** — the broadly-readable `stock_movements` no longer
  has `unit_cost`/`total_value` (dropped if a prior revision added them). Cost lives ONLY
  on the cost-gated `inventory_stock_layers`. The quantity Inward/Outward movement carries
  no cost field, so no non-cost reader admitted by the broad row policy can read cost.
- **#3 Profit-route store scope** — `GET /api/invoice/[id]/profit` reproduces the EXACT
  `auth_branch_visible` contract: a null invoice branch is org-wide; otherwise the branch
  must be the caller's home `staff.branch_id` or an active `user_stores` grant; cross-branch
  is `multi_store_access` OR the `is_admin()` role set — NOT `manage_branches`, NOT
  `full_access`/`*`, NOT a hard-coded role id. (§7.1)
- **#4 Profit-only arithmetic disclosure** — ACCEPTED + DOCUMENTED as an approved product
  decision (§7.1 call-out, AC-21 reworded). FR-23 behaviour is kept exactly; the raw-field
  boundary is the real security line and holds.
- **#5 Mutable / branch-spoofable snapshots** — `invoice_line_costs` has NO end-user
  INSERT/UPDATE/DELETE policy (writes are a service-role finalization operation only, so a
  snapshot is immutable from any client); the scope guard now REJECTS a non-null child
  branch that differs from the parent invoice (previously it accepted it) and always stamps
  org+branch from the parent. (§9.7)
- **#6 Missing snapshot for non-cost creators** — the new privileged route
  `POST /api/invoice/[id]/finalize-costing` (service role) RESOLVES each line's cost from the
  authoritative records (depletion-aware weighted average over `inventory_stock_layers`,
  else org-level CP, else not-configured) and persists the snapshot REGARDLESS of the
  invoice creator's cost-read grants, returning only non-sensitive counts. The browser no
  longer upserts `invoice_line_costs`.
- **#7 Cross-store opening-stock RPC** — `post_opening_stock` now checks
  `auth_branch_visible(v_branch)` (plus org membership + action key) before any write, so a
  branch-scoped worker can no longer post opening stock into another store by item id. (§6c)
- **#8 Idempotent sales-consumption boundary (FR-12)** — SUPERSEDES the earlier "invoice
  finalize deducts nothing / standalone out of scope" narrowing (Q6/§5.4). A server-owned
  `consume_invoice_line_stock` deducts a DIRECT-invoice part exactly once, protected by a
  unique fulfilment-key PK on `stock_consumption_log` (retry / concurrent finalize = no-op),
  writing a single Outward movement and depleting cost layers oldest-first.
  `mark_ticket_line_consumed` records a ticket-consumed line so a later finalize never
  double-deducts; the ticket path (`deductPartsForTicket`) remains the authority for
  ticket-originated fulfilment. Wired through the finalize route. (§9 of the migration)
- **#9 Incomplete receipt valuation (FR-13 / FR-16)** — `post_stock_receipt` posts an atomic
  branch-scoped cost layer for Purchase/Stock-In (not just opening stock), and
  `addStockMovement` routes an Inward movement carrying `{itemId, unitCost}` through it.
  `inventory_weighted_avg_cost` is now DEPLETION-AWARE: layers carry `qty_remaining`, sales
  deplete the oldest first, and the average is over remaining quantity — so after a cheap
  layer sells out the valuation reflects the remaining (expensive) stock, not a lifetime
  blend. (§8 of the migration)
- **#10 Editable kind breaks code identity** — `item_kind` is immutable once assigned: the
  `inventory_items_lock_code` trigger REJECTS a kind change, the Edit form locks the Item
  Type control (`lockItemType`), and `inventoryUpdateFromForm` omits `kind`/`type` from the
  update patch. The permanent PRT-/SRV- code can never become the wrong kind.
- **#11 Model-only tests** — `scripts/inventory-costing-verify.mjs`
  (`npm run inventory:costing:verify`) adds authenticated DB coverage as real personas in a
  rolled-back transaction: raw cost-read denial for a non-cost role (all three cost tables),
  no-cost-column `stock_movements`, wrong-store opening RPC fail-closed, parent-branch
  mismatch rejection on snapshots + layers, no end-user snapshot write, idempotent
  consumption (single Outward, deducted once) + ticket-consumed guard, depletion-aware WAC,
  and `item_kind` immutability. It runs `--with-migration` against the current base to catch
  a replay collision. (Requires `SUPABASE_DB_URL`.)
- **Math nits** — the fully-not-configured invoice now reports `grossMargin: null` (rendered
  "—"/"Partial"), not 100%; the inverted-sign reconciliation test assertion is corrected to
  the `combinedGP + otherDirectCost` identity.

### 13.-1 Implementation review (Revision 4 → Revision 5): 10 HIGH + 1 NIT (inv-review.json) — ALL RESOLVED

This round responds to the IMPLEMENTATION review (`inv-review.json`, built from
`inv-system-review.md` + `inv-math-review.md`), not a design review. One change OVERRIDES
the approved design §7.1 by explicit product decision; the rest harden the implementation to
match the already-approved design.

- **§7.1 OVERRIDE — strict cost-confidentiality boundary (approved; SYS-1 / SYS-3).** The
  approved §7.1 returned per-bucket revenue to a PROFIT-ONLY viewer alongside bucket GP. The
  implementation review (SYS-1) proved that combination is a cost-derivation side-channel:
  `bucketCost = bucketNet − bucketGP`, exact for a single-line bucket, so a profit-only viewer
  could reconstruct a per-unit cost. Spec §7/§8 and AC-21 make cost confidentiality a HARD
  requirement (server-side rejection of raw cost for non-cost roles, "not just a hidden
  button"), which outranks the §7.1 presentation choice. **Decision (approved):** a
  profit-only viewer now receives ONLY `combinedGP + grossMargin + costPartial` — per-bucket
  revenue, bucket GP and the per-line breakdown are WITHHELD (not masked) for any non-cost
  viewer, on BOTH the server aggregate route and the panel. A cost-capable viewer is unchanged
  (full bucket breakdown + raw cost). This supersedes §7.1's "profit viewer sees per-bucket
  revenue" wording.
- **SYS-1 — raw cost relocated out of broadly-readable storage.** The per-line `cost`/`costState`
  snapshot is NO LONGER written into `invoices.items` / `devices.records` JSON (whose SELECT
  policy admits non-cost roles). It moves to a new cost-scoped table `invoice_line_costs`
  (RLS = cost keys only; §9.5b), written by a cost-authorized save and read back only on the
  cost-capable in-memory path + the server aggregate. Historical immutability is preserved —
  only WHERE the snapshot lives changed. `stock_movements.unit_cost/total_value` are no longer
  written (cost lives only on the cost-gated ledger layer).
- **SYS-2 — cost-write RLS = CAP.sensitive.editCost EXACTLY.** `manage_purchases` removed from
  the `inventory_item_costs` write policies (now `inventory_edit_cost`/`manage_inventory`);
  receipt-cost capture stays on `inventory_stock_layers` (which keeps `manage_purchases`).
- **SYS-3 — profit route hardened.** Conjunctive invoice-view AND (profit-view OR cost);
  reproduces the invoice org + `auth_branch_visible` predicate; cost source read from
  `invoice_line_costs`; tiered payload (profit-only ⇒ combined GP/margin only).
- **LEDGER-DISCONNECT — weighted-average ledger is now READ.** `inventory_stock_layers` is
  loaded (cost-scoped, branch-scoped) into the store and passed to `resolvePartUnitCost`, so a
  part line resolves the branch weighted-average FIRST (then org CP, then not configured),
  restoring the `costState: "resolved"` / `source: "ledger"` provenance at runtime (FR-16/AC-16).
- **SYS-5 — rerun-safe price backfill.** The one-time public-price seed is gated behind a
  persistent `schema_backfill_marks` marker, so replaying 0075 after normal use never
  overwrites an intentional zero.
- **SYS-6 — legacy flag no longer cleared on ordinary edit.** `inventoryUpdateFromForm` no
  longer emits `migration_flag: null` and no longer zeroes a flagged service's preserved
  min/max. The flag is cleared ONLY by a dedicated, confirmed, audited `reconcileMigrationFlag`
  action (which, for `service_with_stock`, also clears the stray stock before clearing the flag).
- **SYS-7 — server-authoritative codes.** The INSERT stamp overwrites any client-supplied code
  for an end-user, validates the `PRT-`/`SRV-` prefix, clears the opposite-kind code; a BEFORE
  UPDATE guard makes assigned codes immutable; `next_inventory_code` rejects a cross-org
  `p_org_id`; `inventory_code_sequences` is RLS-locked (no end-user policies/privileges).
- **SYS-8 — parent-scope guards.** Triggers stamp/validate `inventory_item_costs`,
  `inventory_stock_layers` and `invoice_line_costs` organization (and layer branch) from the
  parent row, rejecting any mismatch.
- **SYS-9 — atomic opening stock.** Opening receipt is posted by one `post_opening_stock` RPC
  (layer + movement + current_stock in a single transaction), replacing the three independent
  client writes.
- **SYS-10 / tests — added a Ticket→Invoice no-double-deduction regression, a profit-boundary
  test (profit-only tier exposes no bucket figures), and a ledger weighted-average read test.**
- **MATH-2 — reconciliation identity corrected to `+ otherDirectCost`** in §3.5 and the test
  comment.

### 13.0 Latest review (Revision 3 → Revision 4): 0 HIGH · 2 MEDIUM · 4 NIT — ALL RESOLVED

These are internal-consistency clarifications only; the costing/valuation decision (weighted
average), the legacy Product/Service + Buy/Sell/Both mapping, the migration-0075 numbering,
and the permission REUSE (no new key) are all UNCHANGED.

- **MEDIUM-1 (cost RLS vs profit-only-viewer contradiction): ADDRESSED — option (a) chosen,
  stated explicitly.** `view_profit_margin` is **removed** from the `inventory_item_costs`
  (and `inventory_stock_layers`) SELECT RLS set (§6, §9.7), so only cost-capable roles ever
  read a raw CP / labour row — the hard "server never returns raw cost to a non-cost user"
  guarantee (FR-27/AC-21) is now literally true, verified against `capabilities.ts` lines
  100–102 (`viewCost`/`editCost`/`viewProfit` key sets). A **profit-only viewer** (holds
  `view_profit_margin`, lacks every cost key) therefore receives NO raw cost row from RLS
  (§2.1a) and gets its aggregated GP/margin from a NEW cost-free `getInvoiceProfitAggregate`
  server route that computes profit server-side and returns only derived aggregates, never a
  per-unit cost (§7.1). §7.1, §6, §9.7, §2.1a, the AC-21 mapping and the §10 test are all
  aligned to this one rule.
- **MEDIUM-2 (`inventory_item_costs` branch scoping strands the org-wide default): ADDRESSED
  — org-level default stored with `branch_id = NULL`.** The single `item_id`-keyed cost row
  holds the organization-level default cost and is written with `branch_id = NULL` (NOT
  `auth_branch_id()`), so the SELECT policy's `auth_branch_visible(NULL)` is always true for
  cost-capable org members — verified against `0001_initial_schema.sql` lines 416–419
  (`auth_branch_visible(b)` returns true `or b is null or …`). No store strands the default.
  Store-specific physical cost stays correctly branch-scoped on `inventory_stock_layers`,
  which the weighted-average valuation reads FIRST, falling back to the NULL-branch org-level
  CP (§3.3). A future per-store CP override is reserved as a separate `(item_id, branch_id)`
  row, not built now. §9.4, §9.7, §2.1a, §3.3 aligned.
- **NIT-1 (`RevenueInvoiceLike` mapping before `isFinalizedInvoice`): ADDRESSED.** §3.6 now
  states the engine maps the invoice record into the `RevenueInvoiceLike` shape
  (`{ id, total, status, documentType }`, verified `leads-data.ts` 1223–1236) with
  `documentType: inv.documentType ?? "invoice"` BEFORE calling `isFinalizedInvoice` — never
  raw invoice form state.
- **NIT-2 (Advanced Pricing post-split behaviour): ADDRESSED — pinned to "stored as entered,
  never derived".** §2.1a states MRP/dealer/distributor/wholesale are retained + editable and
  persisted verbatim (blank stays blank/`0`), with every `SP*multiplier` derivation removed
  alongside `defaultPrice*0.7`. No surprise SP-derivation is reintroduced. Verified against
  the current `inventory-item-form.tsx` tiers (`*1.2`/`*0.9`/`*0.85`/`*0.65`, lines 97–130).
- **NIT-3 (`migration_flag` lifecycle): ADDRESSED.** §1.2 adds the one-line lifecycle: a
  deliberate admin re-save that resolves the contradiction nulls `migration_flag` via
  `inventoryUpdateFromForm` (§2.4), so the "Needs review" pill clears and the column is not
  permanent dead state; the bulk reconciliation sweep stays out of scope.
- **NIT-4 (`InventorySearchBox` `kind` prop + `item.kind` logic in-scope): CONFIRMED.** §5.2
  now spells out the exact component change (new `kind?` prop filtering results, out-of-stock
  test + label switched from the verified `item.type` usage at lines 146/172 to `item.kind`)
  as an explicit in-scope edit for this pass, and it is reflected in the AC→design map (AC-10).

### 13.0b Prior review (Revision 2 → Revision 3): 0 HIGH · 2 MEDIUM · 5 NIT — ALL RESOLVED

- **MEDIUM-1 (profitability reconciliation rested on an unstated `line.discount == 0`
  invariant / double-count risk): ADDRESSED.** §3.5 now states the invariant explicitly —
  every per-line `InvoiceLineItem.discount` is structurally `0` today (verified: ticket
  prefill line 298, field edit lines 1612/1706, line-add lines 1612/1692), and the invoice
  has one real discount (`form.pricing.discount`, `taxable = subtotal − discount`). The engine
  uses the invoice-level discount as the SINGLE source and drops the `− (line.discount || 0)`
  term entirely, so the two mechanisms cannot double-count. §10 adds a reconciliation test
  with a NON-ZERO per-line discount asserting `eligibleNetRevenue == max(0, subtotal −
  invoice.discount)` still holds.
- **MEDIUM-2 (Add Item page described as a thin switch, but it is a hand-rolled form needing
  full rework): ADDRESSED.** §4 now spells out that `add-item/page.tsx` does NOT use
  `InventoryItemFields`/`buildInventoryItem` today and derives prices inline from
  `defaultPrice*0.7` with its own raw `currentStock` input. The page is re-pointed to the
  shared `<InventoryItemFields>` + `buildInventoryItem`/`inventoryUpdateFromForm`, the
  synthetic-price block and the raw `currentStock` write are removed (opening stock flows only
  through `opening = { qty, unitCost }` → a ledger layer), and it is confirmed as the ONLY
  opening-stock entry surface.
- **NIT-1 (`buildInventoryItem` signature dropped `opts.store`): ADDRESSED.** §2.4 keeps the
  existing `opts?: { store?: string }` arg unchanged (`item.store = opts?.store ?? "Main
  Store"`, verified lines 83/93); only the RETURN becomes the `{ item, cost?, opening? }`
  tuple. Both store-passing call sites are unchanged, so store-scoping is preserved.
- **NIT-2 (edit-path cost upsert had no call-site mechanism): ADDRESSED.** §2.4 makes the edit
  path symmetric with create: `inventoryUpdateFromForm` returns `{ patch, cost? }`, and
  `updateInventoryItem(id, updates, opts?: { cost? })` gains the same cost side-channel as
  `addInventoryItem`, so a changed CP is actually persistable on edit (for a cost-authorized
  user).
- **NIT-3 (double-deduction guard is a no-op given today's behaviour): ADDRESSED.** §5.4 now
  states plainly that invoice finalization performs NO stock deduction (verified: no
  `addStockMovement`/`current_stock`/deduct under `invoice/`; `deductPartsForTicket` called
  only from tickets + dashboard), so there is nothing to double-deduct — the "guard" is the
  absence of a second path, not an unimplemented runtime check. AC-12's test asserts ticket
  parts stay `used` and `current_stock` is unchanged after invoice finalize (§10).
- **NIT-4 (configured-₹0 vs not-configured had no capture mechanism): ADDRESSED.** §2.1a/§2.4
  make the test a string-trim test: `configured = v.costPrice.trim() !== ""`. `"0"` ⇒ a `cost`
  object with `configured: true` + `costPrice: 0` (valid ₹0); `""` ⇒ no `cost` object (⇒
  `cost_configured` stays `false` ⇒ "not configured"). §10 adds a test for both. The rule is
  never `Number(x) > 0`.
- **NIT-5 (migration-flag pill could leak cost): ADDRESSED.** §1.2 adds the explicit guarantee
  that the "Needs review" pill/tooltip renders ONLY the machine-reason string and never any
  CP/labour/stock-cost/`unit_cost` value (same hard guarantee as print safety §7.2), with a
  dedicated no-cost assertion in §10.

### 13.1 Prior review (Revision 1 → Revision 2) — retained for history

- **HIGH-1 (cost columns not RLS-protected on the broadly-readable row): ADDRESSED.**
  Moved `cost_price` / `standard_labour_cost` off `inventory_items` into a cost-scoped
  `inventory_item_costs` table (review fix (a)), with read RLS requiring a cost capability
  and write RLS requiring edit-cost/manage. The master row carries no cost column, so
  `manage_repair_jobs`/`view_only` roles read no cost server-side. FR-27/AC-21 are now
  achievable; §2.1a, §6, §9.1 (no cost column), §9.4, §9.7, §10 (RLS test). *(The Revision-2
  read set originally included `view_profit_margin`; Revision 4 / MEDIUM-1 later REMOVED it
  from the cost read set — see §13.0 — so the authoritative read set is cost keys only:
  `inventory_view_cost`/`inventory_edit_cost`/`manage_inventory`/`manage_purchases`.)*
- **HIGH-2 (profitability dropped `repairCost`): ADDRESSED.** §3.5 now folds each device's
  `repairCost` into service revenue (cost `not_configured`), surfaced as a Repair/Labour
  charge line in the breakdown (§7.1), so `eligibleNetRevenue == max(0, subtotal −
  invoice.discount)` reconciles to the taxable base and Combined GP includes billed labour.
  Verified against `StepPricing` totals (`subtotal = partsTotal + repairCost`) and
  `InvoiceDeviceRecord.repairCost`.
- **HIGH-3 (global sequence not "org-level"): ADDRESSED.** §9.2 replaces the global
  quotation-style sequence with a per-org counter (`inventory_code_sequences` +
  `next_inventory_code(org, kind)`), reusing the verified `next_lead_id(p_org_id)` precedent
  from `0002_leads.sql`. Each org starts at `PRT-000001`/`SRV-000001`; no cross-tenant rate
  leak.
- **MEDIUM-1 (invented standalone-invoice deduction vs FR-12): ADDRESSED.** §5.4 drops the
  net-new finalize→deduct path; invoice finalization performs NO deduction (today's
  behaviour), the change is purely the double-deduction guard for ticket-linked invoices.
  Standalone auto-deduction is explicitly out of scope, with the future hook (idempotency
  key, `kind==="part" && trackStock`, `addStockMovement`) named but not built.
- **MEDIUM-2 (opening-stock-from-modal path unspecified): ADDRESSED.** §2.4 gives
  `buildInventoryItem` an explicit `{ item, cost?, opening? }` return; §4 extends
  `addInventoryItem(item, { cost, opening })` and updates BOTH call sites
  (`AddInventoryModal.handleSave` — which HIDES opening fields so `opening` is always
  undefined — and the Add Item page). No opening qty is dropped or silently applied.
- **MEDIUM-3 (`id` vs `item_code` contradiction): ADDRESSED.** §2.4 fixes one coherent rule:
  `id` stays the free-text SKU-like PK (widened fallback `SKU-${Date.now()}-${rand4}`, not
  `PRT-<ts>`); `item_code`/`service_code` are the only sequential codes; the "id = itemCode"
  sentence is removed; §12 updated to match.
- **MEDIUM-4 (backfill order / kind-targeting unstated): ADDRESSED.** §9.3 spells out four
  ordered, `IS NULL`/`= 0`-guarded statements: classify `item_kind` first, then flag, then
  seed codes keyed on `item_kind`, then seed public prices only (never CP). Re-run safe.
- **MEDIUM-5 (pro-rata split was an assumption, zero-denominator undefined, must include
  repairCost): ADDRESSED.** §3.5 promotes the split to a stated decision, defines bucket
  discounts = 0 and margin = "—" when `grossRevenue == 0`, and includes `repairCost` in both
  the service-revenue bucket and the split denominator (ties into HIGH-2).
- **NIT-1 (`InventorySearchBox` keyed off `item.type`): ADDRESSED.** §5.2 switches the
  out-of-stock/label logic to `item.kind` when the `kind` filter prop is added.
- **NIT-2 (`migration_flag` write-only): ADDRESSED.** §1.2 adds a "Needs review" inventory
  filter + pill (gated to inventory-manage users) that reads `migration_flag`, making
  flagged rows visible for admin review.
- **NIT-3 (print safety by omission is fragile): ADDRESSED.** §7.2 + §10 keep a MANDATORY
  test asserting the print payload / `PrintLineItem` contain no cost/kind/profit property.
