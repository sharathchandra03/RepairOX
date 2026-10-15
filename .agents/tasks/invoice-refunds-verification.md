# Invoice Refunds — Verification Evidence

Feature: Invoice Refunds, Partial Refunds, Device Returns & Financial Reconciliation
Branch: `invoice-refunds` (nested app repo)
Commits verified: `58315af`, `c345e19`

## Build & type checks (run in the worktree app root)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | CLEAN — exit 0, no errors |
| Production build | `npm run build` | CLEAN — exit 0; `/settings/invoice/refunds` route built. Only pre-existing app-wide `themeColor` metadata warnings (not introduced by this feature). |
| Engine unit tests | `npx tsx --test src/lib/invoice-refunds.test.ts` | 8/8 PASS |
| Permission coverage reconciliation | union ↔ PERMISSION_GROUPS ↔ PERMISSION_MODULES ↔ CAP | Zero missing keys (all 7 new granular refund/return keys present in every layer) |

## What the engine tests cover

- Eligibility caps (refundable base = `min(paidAmount, total)` less prior succeeded refunds).
- Over-refund rejection (proposed + prior ≤ refundable base).
- ₹0-net line ⇒ ₹0 tax allocation.
- Partially-paid invoice full-scope scaling to the refundable base.
- Derived refund status (No Refund / Pending / Partially / Fully Refunded / Failed-Reversed).
- Tax budget split: Σ(line tax) === `invoice.tax` exactly, including discounted multi-line invoices (scenario 27).

### Real bug caught and fixed by the tests

The budget-split tax originally used the pre-discount gross net as the full-scope base, under-allocating tax on discounted multi-line invoices (291.6 vs 324), so Σ(line tax) ≠ `invoice.tax`. Fixed so Σ === `invoice.tax` exactly.

## Guard scripts (DB-integration) — not runnable in this worktree

`ms:verify` / `ms:security` / `leads:verify` require `.env.local` with live Supabase credentials, which is present only in the main app repo, not in this worktree. These are DB-integration tests with no reachable DB here.

Mitigation: migration `0075_invoice_refunds.sql` RLS, guards (`invoice_refunds_guard`, `invoice_item_returns_guard`), the `restock_item_return()` SECURITY DEFINER function, the loyalty `source_type` CHECK alter + refund-scoped one-reversal unique index, and the refund/allocation/item-return/revision tables were statically verified against the `0063_lead_deals.sql` and `0032_loyalty_ledger.sql` conventions, and schema columns were confirmed against `0001`/`0032`/`0063`. These guard scripts should be run against the live DB in the main repo environment as part of deployment.

## Locked design decisions honored

Scalar `paidAmount` eligibility; DB `invoice_refunds` tables are the financial authority (accounting-service + daily-ledger are projections); distinct cost-valued Customer Return movement via `restock_item_return()`; finalized-invoice immutability; derived refund status (never stored-editable); finalized-parent-only subtraction from net revenue / Revenue Won (gross retained); provable tax budget split of `invoice.tax`; Credit Note print contract `[type]=credit_note, [id]=refund uuid`.
