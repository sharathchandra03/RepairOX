# Inventory costing isolates raw costs but finalizes stock outside the trusted lifecycle

The redesign moves master CP, labour cost, stock-layer cost, and invoice cost snapshots behind cost-scoped tables while keeping the customer invoice projection free of internal fields. The committed migration excludes `view_profit_margin` from raw-cost SELECT policies, forces master-cost rows to `branch_id = NULL`, preserves legacy stock while flagging contradictory classifications, and allocates `PRT-`/`SRV-` codes under per-organization unique indexes. The remaining blockers are concentrated in the privileged finalization path: it is callable outside the intended authorization boundary, trusts invoice/item identifiers without proving their relationship or store scope, and consumes stock on drafts, proformas, and line edits rather than on a finalized sale. The latest commit’s recorded `npx tsc --noEmit`, successful build, and 20/20 costing-test results were accepted and not re-run.

Watch for: **confirmed** cross-tenant/cross-store mutation through exposed security-definer functions; **confirmed** invoice/item scope omissions in the service-role route; **confirmed** draft/proforma stock consumption and stale line-key idempotency; **confirmed** ticket markers not tied to actual ticket consumption; **confirmed** destructive migration statements; **confirmed** route-to-CAP mismatches; **confirmed** missing execution evidence for the DB verifier.

**Verdict**: NEEDS_CHANGES

## High-level view

The raw-cost read boundary is separated from profit visibility: `inventory_item_costs`, `inventory_stock_layers`, and `invoice_line_costs` omit `view_profit_margin`, while the profit-only endpoint returns aggregate GP/margin rather than cost rows. The server endpoints do not fully mirror the canonical capability sets, and the finalization endpoint bypasses invoice branch scope while operating with the service role.

Stock consumption is not aligned with invoice lifecycle. `addInvoice` calls the finalization endpoint for every saved document and line edits call it again, so direct-invoice stock can move while a document is still a draft or proforma; line-id-only idempotency then prevents quantity or item changes from being reconciled.

Ticket-linked invoices avoid a second invoice deduction by marking every line as ticket-consumed, but the marker is not connected to a real `deductPartsForTicket` event. Invoice-only additions are skipped, ticket consumption does not deplete cost layers, and the regression test still models invoice finalization as a no-op rather than the shipped route/RPC contract.

The legacy backfill is non-destructive and preserves stray service stock under `migration_flag`, and code uniqueness is organization-scoped. The migration nevertheless contains explicit `DROP COLUMN` statements and does not constrain new `item_kind` values, so it misses the additive/domain-safe contract.

The print projection and A4 renderer carry only customer-facing line fields, so no CP, labour cost, cost state, or profit property reaches the customer document. Runtime database evidence remains incomplete because the authenticated RLS/RPC verifier exists but the commit records that it was not run.

<details>
<summary>Issues (9)</summary>

1. **Route capability drift** (**confirmed**) — the profit route omits `view_invoice`/`view_profitability`, while finalization omits `create_invoice`/`edit_invoice` and admits unrelated coarse keys; use the canonical `CAP` key sets server-side.
2. **Client-callable privileged stock functions** (**confirmed**) — authenticated/PUBLIC callers can invoke security-definer consumption/depletion with arbitrary ids; revoke client execution or enforce the complete caller and parent relationship inside each function.
3. **Finalization store and item-scope bypass** (**confirmed**) — the service-role route checks invoice organization but not caller branch visibility or invoice→item org/store consistency; validate both before reading cost or mutating stock.
4. **Premature and stale stock consumption** (**confirmed**) — draft/proforma saves and line edits invoke consumption, while line-id-only idempotency cannot reconcile quantity/SKU/deletion changes; consume only on paid non-proforma finalization with immutable or audited correction semantics.
5. **Partial finalization reported as success** (**confirmed**) — per-line RPCs run separately and their errors are ignored, permitting partial stock movement with a successful route response; make the operation transactional or fail closed with durable retry state.
6. **Ticket guard is not tied to ticket fulfillment** (**confirmed**) — every line on a ticket invoice is marked consumed without proving a matching used ticket part, and ticket deduction never depletes cost layers; unify both paths around a durable fulfillment record and consume invoice-only lines normally.
7. **Destructive canonical migration** (**confirmed**) — `DROP COLUMN IF EXISTS unit_cost/total_value` violates the additive/no-history-overwrite contract; remove the drops from the final migration and handle experimental schemas separately.
8. **Unenforced item-kind domain** (**confirmed**) — invalid post-migration kinds receive part codes and remain unflagged; add an idempotent `part|service` constraint plus server-side service/stock invariants.
9. **Unexecuted and stale boundary verification** (**confirmed**) — the DB verifier was not run and its system-role cases miss direct authenticated RPC access, while the pure ticket model no longer matches production; run hardened route/RPC scenarios against a disposable migrated database.

</details>

<details>
<summary>Details</summary>

## Cost-table isolation is undermined by route capability drift

The raw cost policies require `inventory_view_cost`, `inventory_edit_cost`, `manage_inventory`, or `manage_purchases`; `view_profit_margin` is absent, and `inventory_item_costs_scope_guard` forces the one default CP/labour row to `branch_id = NULL`. **Confirmed.** The API arrays do not match the central capabilities they claim to enforce: `CAP.invoice.view` includes `view_invoice` and `CAP.sensitive.viewProfit` includes `view_profitability`, but the profit route omits both; `CAP.invoice.create`/`edit` include `create_invoice`/`edit_invoice`, but the finalization route omits both and admits `manage_sales`/`use_pos`. This falsely denies granular roles and grants privileged costing/stock effects to unrelated coarse roles. Use the applicable `CAP` key sets at the server boundary, then apply record/store scope separately.

## Security-definer consumption accepts arbitrary identities

**Confirmed.** `consume_invoice_line_stock` and `mark_ticket_line_consumed` are `SECURITY DEFINER` and granted to `authenticated`, while `inventory_deplete_layers` retains PostgreSQL’s default PUBLIC execute privilege. None verifies invoice permission, caller org/branch, invoice existence, line membership, or the invoice→item relationship. Arbitrary ids can lower another store’s stock, deplete cost layers, create an Outward movement, or pre-claim a fulfillment key so a real sale is skipped. These functions are only needed by the service-role route: revoke them from PUBLIC/anon/authenticated and grant only `service_role`, or make each independently validate the full relationship and caller scope; keep the depletion helper internal.

## Service-role finalization omits invoice and item scope

**Confirmed.** The finalization route loads an invoice by id and organization only and never evaluates `auth_branch_visible(row.branch_id)`, unlike the profit route. It then trusts JSON `sku` as an inventory primary key; cost queries have no org/branch predicate, and consumption derives scope from the item rather than invoice. A branch-A invoice can reference a branch-B or foreign-org item, allowing the service role to read its cost and mutate its stock. Validate caller access to the invoice, resolve every line to an item in the same organization/permitted store relationship, and use authoritative item `item_kind`/`track_stock` rather than caller-controlled line kind.

## “Finalize costing” runs on drafts and mutable edits

**Confirmed.** `addInvoice` invokes the route after every insert, including default drafts and proformas, and `updateInvoice` invokes it whenever lines change, irrespective of status. The route does not validate document type/status, so stock moves and a historical snapshot is captured before a finalized eligible sale. Its key is only `invoice:<id>:line:<id>`: increasing quantity consumes no delta, changing SKU leaves the old item deducted and new item untouched, and deletion does not restore stock. Snapshot upserts also recompute current WAC/CP on edits, including finalized invoices. Trigger cost capture/consumption on the paid non-proforma transition, then make finalized quantities/snapshots immutable or correct them through an audited reversal. The route also ignores per-line RPC failures across separate transactions, allowing partial consumption with a success response; finalization must be atomic or fail closed.

## Ticket markers do not prove ticket consumption

**Confirmed.** Any non-null `ticket_id` makes every part line call `mark_ticket_line_consumed`, without proving it came from a ticket part, is `used`, or has an Outward movement. A catalogue part added while reviewing a ticket invoice is therefore marked but never deducted. Prefill itself maps each ticket part once and keeps the estimate non-billable, but `deductPartsForTicket` updates master stock/movements without depleting `inventory_stock_layers`; the marker only inserts a log row, so future WAC still includes sold stock. Make ticket consumption write the shared fulfillment identity, movement, stock decrement, and layer depletion; invoice finalization should recognize only matching durable ticket-part records and consume invoice-only lines normally.

## Migration replay is destructive and item kind is unconstrained

**Confirmed.** Backfill writes only new/null fields, preserves `item_type`, `mode`, legacy prices and stray stock, and flags contradictions; per-org counters plus unique indexes correctly scope `PRT-`/`SRV-` uniqueness. But the migration executes `DROP COLUMN IF EXISTS unit_cost/total_value` on `stock_movements`. It is rerunnable on the final shape but not additive and can destroy data from an earlier revision; because current `main` never had those columns, omit these drops from the canonical migration and handle experimental schemas separately. `item_kind` also lacks a check constraint: the stamp trigger treats every non-`service` value as a part, so a crafted invalid kind receives a `PRT-` code and remains unflagged. Add an idempotent `part|service` constraint after backfill and enforce service/`track_stock` invariants server-side.

## Verification does not exercise the shipped finalization contract

The recorded typecheck, build, and 20/20 pure tests were accepted. **Confirmed.** The DB verifier was not run for lack of `SUPABASE_DB_URL`, so there is no execution evidence for migration replay or security-definer boundaries. Its consumption cases run as the system role, missing authenticated direct RPC access, and the pure ticket test defines finalization as empty despite production now consuming/marking lines. After hardening, run against a disposable migrated DB and add route cases for wrong-store callers, foreign SKUs, drafts/proformas, line quantity/SKU edits, invoice-only lines on ticket invoices, ticket-layer depletion, and partial failures.

</details>

<details>
<summary>File map</summary>

- `supabase/migrations/0077_inventory_costing_redesign.sql` — classification/codes, cost tables, RLS, ledger, and privileged stock RPCs.
- `src/app/api/invoice/[id]/{finalize-costing,profit}/route.ts` — service-role snapshot/consumption and tiered profitability.
- `src/lib/store.tsx`, `src/app/(app)/invoice/create/page.tsx`, `src/lib/mock-data.ts` — save lifecycle, ticket deduction/prefill, and catalogue lines.
- `src/lib/inventory-costing.ts`, `src/lib/inventory-costing.test.ts`, `scripts/inventory-costing-verify.mjs` — engine and verification surfaces.
- `src/lib/{permissions,capabilities}.ts` — canonical route capability comparison.
- `src/lib/print-utils.ts`, `src/components/print/a4-template.tsx` — customer print projection and A4 renderer.

Full committed diff: `git diff main...HEAD` from `/Users/apple/Desktop/Reapirox dummy2/app/.worktrees/inventory-costing-redesign`.

</details>
