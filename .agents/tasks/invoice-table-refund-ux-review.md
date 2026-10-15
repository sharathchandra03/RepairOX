# Invoice Table — Refund UX & Status Dropdown

The change rebalances the invoice list columns (narrows Refund, widens Customer), turns the Status cell into an edit-gated lifecycle dropdown, and makes an eligible Refund cell a clickable entry point into the already-mounted RefundFlow. All three live in one commit (`11c83d4`) touching only `src/app/(app)/invoice/page.tsx` (+94/−6). Refund status stays derived and read-only; no new modal, data path, or migration was introduced.

Watch for: nothing blocking. The status dropdown is gated on `CAP.invoice.edit` rather than the more granular `CAP.invoice.changeStatus` — this is a deliberate choice recorded in the plan and matches the task brief verbatim (confirmed).

**Verdict**: APPROVED

## High-level view

The column rebalance is a two-line width change under `table-fixed` + `w-full` inside the `border-2 border-zinc-300` frame with an `[overflow-x:clip]` wrapper. Refund drops from `w-[150px]` to `w-[116px]` and Customer grows from `w-[20%]` to `w-[25%]`. Net fixed-column width actually *decreases* by 34px while the percentage customer column absorbs it, so horizontal-overflow risk is lower than before, not higher. The refund pill keeps the full-width-in-cell `truncate` + `title` treatment the PILL standard requires.

The Status cell forks on `canChangeStatus`: a view-tier user (no `edit_invoice`/`manage_invoices`) gets the unchanged read-only pill; an editor gets a pill-shaped Dropdown trigger (focus-ring only, no idle blue box) listing all six financial statuses with the current one marked by a check + highlight. Selecting calls `updateInvoice(inv.id, { status })` with a `next === inv.status` no-op guard. Proforma rows are untouched and never see a financial dropdown. The derived refund state is never exposed here.

The Refund cell becomes a keyboard-accessible control (`<button>`, `stopPropagation`, focus-visible ring) only when `refundEligibility().eligible && canRefundInitiate`; it reuses `setRefundTarget(inv)` to open the single mounted `RefundFlow`. Ineligible or unpermitted rows keep the plain `—` / non-interactive pill. The overflow-menu "Process Refund" item is preserved with the same gate and callback.

<details>
<summary>Issues (0)</summary>

No blocking or actionable issues.

</details>

<details>
<summary>Details</summary>

### 1. Column rebalance

`INV_ALL_COLUMNS` now reads `customer: w-[25%]` and `refundStatus: w-[116px]`; every other column is unchanged. The table is `<table className="w-full text-sm table-fixed">` inside `<div className="[overflow-x:clip]">` inside the `border-2 border-zinc-300` card. Under `table-fixed` + `w-full` the declared widths are a layout hint shared proportionally across 100% of the container, and the clip wrapper is a hard backstop — so a width change cannot push a horizontal scrollbar past the 2px frame. Fixed columns sum to 986px and Customer takes 25%; because Refund shrank 34px while Customer's growth is percentage-based, the intrinsic width is smaller than the previous `w-[150px]` / `w-[20%]` layout, which is what frees room for names.

The refund pill retains `inline-flex h-7 w-full min-w-0 … truncate` with a `title` tooltip (both the interactive and non-interactive variants share one `pillClasses` constant), so the longest `REFUND_STATUS_LABEL` ("Refund Failed / Reversed") truncates with the full value in the tooltip rather than clipping or forcing per-row width jumps. This satisfies the PILL standard's full-width-in-cell + truncate + tooltip requirement; there is no `inline-flex whitespace-nowrap` on the refund pill. The customer name wrapper's existing `max-w-[180px]` / `line-clamp-2` / `title` is left intact and simply gets more room before clamping. (confirmed)

### 2. Status dropdown

The non-proforma `case "status"` builds the read-only `statusPill` first, then returns it directly when `!canChangeStatus` — correct view-vs-edit behaviour. When editing is permitted it renders a `Dropdown` (`align="left" width="w-44"`) whose trigger is a pill-shaped `<button type="button">` reusing the existing tone (`invoiceStatusPillStyle(statusHex)` inline style or the `INVOICE_STATUS_TONE` ring classes) plus `hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[#4361EE]/40` and a trailing `ChevronDown`. There is no heavy idle blue box — the accent is focus-only, honouring the control standard. The wrapping `<div onClick={(e) => e.stopPropagation()}>` plus the button's own `stopPropagation` prevent the row's `/invoice/:id` navigation from firing when interacting with the menu.

The menu maps `Object.keys(INVOICE_STATUS_LABEL) as InvoiceStatus[]` — exactly the six financial lifecycle statuses (draft, sent, paid, partial, overdue, cancelled) — each as a `MenuItem` with a tone dot, the current one marked by `bg-[#EEF1FD]`, bold label, and a `Check` glyph. `onClick` calls `onChangeStatus?.(key)` then `close()`. The callback passed from the call site is `(next) => { if (next === inv.status) return; void updateInvoice(inv.id, { status: next }); }` — a genuine no-op on same-status (also avoiding a spurious "→ paid" loyalty side effect) and double-fire-safe because the menu closes on select. It mutates only `inv.status`; the derived refund state is never surfaced or edited here. (confirmed)

The proforma branch is byte-for-byte the prior read-only `PROFORMA_STATUS_TONE` / `PROFORMA_STATUS_LABEL` pill with no dropdown — a proforma never gets a financial lifecycle menu. (confirmed)

On the gating key: the dropdown uses `canEditInvoice = allow(can, CAP.invoice.edit)` (`["edit_invoice","manage_invoices"]`). A more granular `CAP.invoice.changeStatus` (`["change_invoice_status","manage_invoices"]`) exists and is used by the bulk-status bar, but the task brief explicitly specifies `CAP.invoice.edit` for this cell and the plan documented the choice. Not a finding. (confirmed)

### 3. Refund cell entry point

`case "refundStatus"` computes `clickable = !!refundEligible && !!canRefundInitiate`, where `refundEligible` is `refundEligibility(inv, invRefunds).eligible` (the single source of truth that already returns false for proforma/draft/cancelled/unpaid/fully-refunded) and `canRefundInitiate = allow(can, CAP.invoice.refundInitiate)`. When clickable, both the `no_refund` state (a "Refund" text affordance) and a derived-status pill become `<button type="button">` controls with `e.stopPropagation(); onRefund?.()` and a focus-visible ring. `onRefund` is `() => setRefundTarget(inv)`, which opens the single `<RefundFlow invoice={refundTarget} open={!!refundTarget} …>` mounted at line 1108 — no second modal, no new state, no new data path. When not clickable the cell keeps the plain muted `—` or the non-interactive `<span>` pill, exactly as before. The overflow-menu "Process Refund" `MenuItem` is preserved under the identical `refundEligible && canRefundInitiate` gate calling the same `onRefund`. (confirmed)

### Scope & data model

The committed change (`11c83d4`) touches only `src/app/(app)/invoice/page.tsx`. The working tree has unrelated modified files (account/productivity pages, inventory components, lead-capture) and untracked task notes, but none were staged into this commit — `git show` confirms a single-file diff. No migration file and no change to `mock-data` / `store` data model were introduced; `deriveRefundStatus` / `refundEligibility` / `updateInvoice` are all reused as-is. (confirmed)

### Verification evidence

The commit message records: `npx tsc --noEmit CLEAN; npm run build OK (/invoice compiled)`. Per the review instructions these were not re-run; the evidence is specific (names both commands and the compiled route) and leaves no articulable doubt, and spot-checks of imports (`Dropdown`, `MenuItem`, `Check`, `InvoiceStatus`), the typed `Object.keys(...) as InvoiceStatus[]` cast, and the callback signatures are all internally consistent. (confirmed)

</details>

<details>
<summary>File map</summary>

- `src/app/(app)/invoice/page.tsx` — column width rebalance (`INV_ALL_COLUMNS`); `canEditInvoice` gate; two trailing args at the `renderInvCell` call site; status cell dropdown + refund cell clickable control in `renderInvCell`; `Check` import added.

Full diff: `git -C "/Users/apple/Desktop/Reapirox dummy2/app" show 11c83d40`

</details>
