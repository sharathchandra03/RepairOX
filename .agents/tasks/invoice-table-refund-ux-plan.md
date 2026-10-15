# Invoice Table — Refund UX & Status Dropdown Implementation Plan

Surgical plan for three changes to the Invoice list page. All work is in ONE
component file plus its existing imports — **no new modal, no new data path, no
migration**. Refund status stays DERIVED and never user-editable.

**Primary file:** `src/app/(app)/invoice/page.tsx`
**Confirmed state:** `git -C "/Users/apple/Desktop/Reapirox dummy2/app" status` shows
`src/components/invoice/refund-flow.tsx` already modified by other work — DO NOT
touch/revert it or any other unrelated modified file. This task edits only
`invoice/page.tsx`.

## Verified facts (from reading the code)

- Column defs: `INV_ALL_COLUMNS` (~line 63). Current: `{ id: "customer", width: "w-[20%]" }`,
  `{ id: "status", width: "w-[130px]" }`, `{ id: "refundStatus", label: "Refund", width: "w-[150px]" }`.
- There is **no `<colgroup>`**. Widths are applied via `col.width` Tailwind classes
  on each `<th>` and `<td>` under `<table className="w-full text-sm table-fixed">`
  (thead ~line 998, tbody row `<td>` map ~line 1028). So "size the width" = change
  the `width` string on the column def; it propagates to both th and td.
- `renderInvCell(colId, inv, ticketType, onView, onEdit, onDuplicate, onDelete,
  onPrint, onDownloadPdf, onPin, linkedTicketNo?, onOpenTicket?, statusColors?,
  store?, onConvertProforma?, onOpenConvertedInvoice?, refundStatusValue?,
  refundEligible?, canRefundInitiate?, onRefund?)` — defined ~line 1263. It is a
  plain function (NOT a component), so it cannot call `useStore()`/`usePermissions()`
  hooks itself. New capability flags + `updateInvoice` must be PASSED IN as args
  (same pattern already used for `canRefundInitiate` / `onRefund`).
- Call site: ~line 1034, inside the tbody `<td>` IIFE, already computes
  `invRefundStatus` and `invRefundEligible` and passes `canRefundInitiate` +
  `() => setRefundTarget(inv)`.
- `status` case (~line 1343): proforma → read-only `PROFORMA_STATUS_TONE` pill
  (`PROFORMA_STATUS_LABEL`); normal → `invoiceStatusPillStyle(statusHex)` pill or
  `INVOICE_STATUS_TONE` ring pill. All currently read-only `<span>`.
- `refundStatus` case (~line 1367): `rs === "no_refund"` → `—`; otherwise a
  full-width-in-cell pill (`inline-flex h-7 w-full min-w-0 … truncate` + `title`).
- Labels: `INVOICE_STATUS_LABEL` = Draft/Sent/Paid/Partial/Overdue/Cancelled.
  `REFUND_STATUS_LABEL` longest = **"Refund Failed / Reversed"** (24 chars), next
  "Partially Refunded" (18). `PROFORMA_STATUS_LABEL` = Proforma / Converted to Invoice.
- `updateInvoice(id, updates): Promise<void>` (store.tsx) already surfaces its OWN
  failure toast ("Changes not saved", DB error). It also runs the "→ paid" loyalty
  side effect, so the handler MUST no-op when status is unchanged.
- `refundEligibility(inv, refunds).eligible` already returns `false` for
  proforma/draft/cancelled/unpaid/fully-refunded — it is the single source of
  truth for "can start a refund". `canRefundInitiate = allow(can, CAP.invoice.refundInitiate)`
  already exists in the page body (~line 215).
- `canChangeInvoiceStatus` does NOT yet exist in the page body; `CAP.invoice.edit`
  resolves `["edit_invoice","manage_invoices"]`.
- Canonical inline status dropdown pattern = `WalkInFinalStatusCell` in
  `src/app/(app)/walk-in/page.tsx` (~line 1319): `Dropdown` whose `trigger` is a
  pill-shaped `<button>` with `focus-visible:ring-2 focus-visible:ring-[#4361EE]/40`
  + a `ChevronDown`, and `MenuItem`s each showing a colour dot + label.

---

## Implementation checklist

- [ ] 1. **Rebalance column widths (Change 1).**
      In `INV_ALL_COLUMNS` (~line 63) change the `refundStatus` width from
      `w-[150px]` to **`w-[116px]`** and the `customer` width from `w-[20%]` to
      **`w-[25%]`**. Rationale: the Refund pill is `text-[11px]` and already
      truncates with a `title` tooltip (per the PILL standard), so it does not need
      to fit the full 24-char "Refund Failed / Reversed" without wrapping — "Refund
      Pending" / "Fully Refunded" fit at 116px and the longest label truncates
      safely with the tooltip intact. The ~34px recovered goes to Customer. Leave
      the inner `customer` name wrapper `max-w-[180px]` as-is (it already
      `line-clamp-2` + `title`); widening the column just gives those two lines more
      room before clamping.
      Files: `src/app/(app)/invoice/page.tsx`
      Verify: `cd "/Users/apple/Desktop/Reapirox dummy2/app" && npx tsc --noEmit` passes;
      `npm run build` succeeds. Manual: at 1366×768 the table stays inside its
      `border-2 border-zinc-300` frame with no horizontal scrollbar; customer names
      get more width; the longest refund label truncates with a hover tooltip, never
      clipped-without-tooltip. (If build/manual shows Customer still tight, the
      fallback is `customer: w-[26%]` / `refundStatus: w-[112px]` — pick the pair
      that keeps the sum within the frame under `table-fixed`.)

- [ ] 2. **Add the status-change capability flag + extend `renderInvCell`'s signature.**
      In the page body near the other gates (~line 213, beside `canRefundInitiate`)
      add `const canEditInvoice = allow(can, CAP.invoice.edit);`. Extend the
      `renderInvCell` parameter list (~line 1263) with two new trailing params:
      `canChangeStatus?: boolean,` and
      `onChangeStatus?: (next: InvoiceStatus) => void,`. (`InvoiceStatus` is already
      imported.) Keeping them trailing/optional preserves every existing positional
      call.
      Files: `src/app/(app)/invoice/page.tsx`
      Verify: `npx tsc --noEmit` passes (no unused-param or arity errors).

- [ ] 3. **Pass the new args at the call site.**
      In the tbody `<td>` IIFE (~line 1034) append two arguments to the
      `renderInvCell(...)` call, after `() => setRefundTarget(inv)`:
      `canEditInvoice` and `(next: InvoiceStatus) => { if (next === inv.status) return; void updateInvoice(inv.id, { status: next }); }`.
      The `next === inv.status` guard makes it a no-op on same-status (and avoids a
      spurious "→ paid" loyalty side effect). `updateInvoice` already surfaces its
      own failure toast, so no extra try/catch is needed here.
      Files: `src/app/(app)/invoice/page.tsx`
      Verify: `npx tsc --noEmit` passes.

- [ ] 4. **Status cell → clickable lifecycle dropdown for NORMAL invoices (Change 2).**
      Rewrite the NON-proforma branch of `case "status"` (~line 1352). Keep the
      **proforma branch exactly as-is** (read-only `PROFORMA_STATUS_TONE` pill — a
      proforma never gets a financial dropdown). For a normal invoice:
      - If `!canChangeStatus` → render the EXISTING read-only pill unchanged
        (view-tier user sees the plain pill; honours view-vs-edit).
      - If `canChangeStatus` → wrap the pill as a `Dropdown` trigger, modelled on
        `WalkInFinalStatusCell`:
        - `trigger`: a pill-shaped `<button type="button" onClick={toggle}>` reusing
          the SAME tone classes already used for the normal pill (either
          `invoiceStatusPillStyle(statusHex)` inline style when `statusHex`, else the
          `INVOICE_STATUS_TONE[inv.status]` ring classes), plus
          `transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40`,
          the status dot, `INVOICE_STATUS_LABEL[inv.status]`, and a trailing
          `<ChevronDown className="h-3 w-3 opacity-70" />` (already imported). No
          heavy idle blue box — border/accent only on focus (PILL/control standard).
        - `Dropdown` props: `align="left" width="w-44"` (menu width independent of
          the trigger — the Dropdown already measures/clamps).
        - Children: map ALL `INVOICE_STATUS_LABEL` entries (draft, sent, paid,
          partial, overdue, cancelled) to a `MenuItem`; indicate the current one
          (e.g. a `Check` glyph or bold/`bg-[#EEF1FD]`), and show a colour dot using
          `INVOICE_STATUS_TONE[key]` like the walk-in menu rows. `onClick`:
          `onChangeStatus?.(key); close();`.
      - This dropdown sets ONLY `inv.status` via the passed `onChangeStatus`
        (→ `updateInvoice(inv.id, { status })`). It must NOT expose the derived
        refund state — that is untouched here.
      Note: `Object.keys(INVOICE_STATUS_LABEL)` is `string[]`; cast each key to
      `InvoiceStatus` (or iterate a typed `(Object.keys(INVOICE_STATUS_LABEL) as InvoiceStatus[])`)
      so `onChangeStatus` stays typed.
      Files: `src/app/(app)/invoice/page.tsx`
      Verify: `npx tsc --noEmit` + `npm run build` pass. Manual: a normal invoice's
      Status pill opens a menu of all six statuses with the current one marked;
      choosing a different one updates the row (and KPIs) immediately; choosing the
      same one does nothing; a proforma row still shows its read-only Proforma pill
      with no menu; a view-tier user (no `edit_invoice`/`manage_invoices`) sees a
      static pill with no chevron and no menu.

- [ ] 5. **Refund cell → clickable entry point into the mounted RefundFlow (Change 3).**
      Edit `case "refundStatus"` (~line 1367). Define
      `const clickable = !!refundEligible && !!canRefundInitiate;` (both already
      passed in). Then:
      - **`rs === "no_refund"` branch:** today returns a muted `—`. When `clickable`,
        instead render a keyboard-accessible control that calls `onRefund?.()`:
        a `<button type="button" onClick={(e) => { e.stopPropagation(); onRefund?.(); }}
        title="Start refund">` styled as a subtle affordance consistent with the
        app's clickable cells (e.g. `text-[13px] text-[#4361EE] hover:underline
        cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40 rounded`)
        with a short label like `Refund` (or a `—` that reveals the affordance on
        hover). When NOT `clickable`, keep the plain muted `—` (unchanged).
      - **Derived-pill branch (`rs !== "no_refund"`):** keep the SAME full-width pill
        markup (`h-7 w-full min-w-0 … truncate` + `title`). When `clickable`, make
        the pill a `<button type="button" onClick={(e) => { e.stopPropagation();
        onRefund?.(); }}>` carrying the identical pill classes plus
        `transition hover:brightness-95 cursor-pointer focus:outline-none
        focus-visible:ring-2 focus-visible:ring-[#4361EE]/40`; when NOT `clickable`
        keep it as the non-interactive `<span>` it is today (e.g. a
        `partially_refunded` row for a user without initiate rights).
      - Both paths call the SAME `onRefund` = `() => setRefundTarget(inv)`, opening
        the already-mounted `<RefundFlow>` at Step 1 (scope → amount → reason). Do NOT
        add a second modal or new state. `e.stopPropagation()` is required because the
        whole `<tr>` has an `onClick` row-navigation to `/invoice/${inv.id}`.
      Files: `src/app/(app)/invoice/page.tsx`
      Verify: `npx tsc --noEmit` + `npm run build` pass. Manual: for a refund-eligible
      invoice held by a user with `refunds_initiate`/`manage_refunds`, clicking the
      Refund cell (both the `—`/"Refund" state and a derived-status pill) opens the
      RefundFlow popup at Step 1 WITHOUT navigating to the invoice detail; a
      not-eligible row (proforma/draft/unpaid/cancelled/fully-refunded) or a user
      lacking initiate rights shows a plain non-clickable pill / `—`.

- [ ] 6. **Keep the overflow-menu "Process Refund" item (no regression).**
      Leave the existing `MenuItem icon={RotateCcw} … Process Refund` (~line 1439),
      which already renders when `refundEligible && canRefundInitiate` and calls the
      same `onRefund`. Both entry points (cell + menu) open the one mounted RefundFlow.
      Files: `src/app/(app)/invoice/page.tsx` (verification only — no edit)
      Verify: `npm run build` passes; the overflow menu still shows "Process Refund"
      for eligible rows and opens the same popup.

- [ ] 7. **Final full verification.**
      Files: `src/app/(app)/invoice/page.tsx`
      Verify: from `/Users/apple/Desktop/Reapirox dummy2/app`, run
      `npx tsc --noEmit` and `npm run build` — both succeed with no new errors.
      Confirm `git status` still shows only `src/app/(app)/invoice/page.tsx` newly
      modified for this task (unrelated pre-existing modified files untouched).

---

## Standards honoured

- **PILL / status-chip standard:** per-column stable `<colgroup>`-equivalent width
  (the `width` class under `table-fixed`), full-width-in-cell refund pill with
  `truncate` + `title`, no `inline-flex whitespace-nowrap` for the refund pill, no
  heavy idle blue box on the status/refund controls (focus-ring only).
- **permission-matrix + view-vs-edit:** Status dropdown gated on `CAP.invoice.edit`
  (view-tier → static pill); Refund entry gated on `CAP.invoice.refundInitiate`
  AND eligibility; the overflow item uses the same gates.
- **invoice-refund steering:** refund status stays DERIVED via `deriveRefundStatus`
  and is NEVER made user-editable; the Status dropdown changes only the financial
  lifecycle (`inv.status`) and never the refund state. Reuses the mounted
  `RefundFlow` + `refundTarget` and `updateInvoice` — no new modal, data path, or
  migration.

## Open assumptions

- Status dropdown gated on `CAP.invoice.edit` per the task brief. (`CAP.invoice.changeStatus`
  is the more granular key, but the brief specifies `edit`; following the brief.)
- Refund `w-[116px]` / Customer `w-[25%]` is the primary target; fall back to
  `w-[112px]` / `w-[26%]` only if the build/manual check shows Customer still tight.
