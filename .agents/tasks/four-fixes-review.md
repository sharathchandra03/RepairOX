# Four Lead/Deal fixes — code review

Review of commit `c9cd3d8` ("fix: persist lead status, top-anchor pill, approve-amount prompt, highlight deal chat decisions") against `four-fixes-plan.md` and the original four-item user request. Five files changed, +361/−31: `leads-context.tsx`, `leads/list/page.tsx`, `lead-deals.ts`, `leads/deals/page.tsx`, `deals/deal-conversation.tsx`. No migration added.

The implementation is faithful to the plan and standards-compliant on all four behavioral items. The one blocking issue is non-code: there is no recorded verification evidence (no `tsc`/build output in the commit, no verification file in the task directory), and the review instruction is explicit that missing evidence must be returned as a finding rather than having the reviewer run the suites.

**Watch for:** no verification evidence recorded for this commit (confirmed); a benign duplicate `lucide-react` import and inline prefill math in the new approve modal (confirmed, non-blocking).

**Verdict**: NEEDS_CHANGES (one MEDIUM: missing verification evidence)

## High-level view

Item 1 (status not persisting) is fixed at the right layer. `persistLeadPatch` now issues the lead UPDATE with `.select("id")` and treats `error == null && 0 rows` as a real failure — the exact silent-success-under-RLS case the plan diagnosed. On that path it surfaces the existing `reportLeadError` toast and re-reads the authoritative row to roll back the optimistic state. The schema-drift heal loop is correctly excluded via a `healedAway` flag so a fully-healed-away write is not misread as an RLS block. `changeLeadStatus`'s `lead_status_history` insert and terminal-timestamp writes are untouched, and Action/Result remain derived/read-only (not touched at all). Correct.

Item 2 (pill pushed up) uses plan approach (a): the status cell wrapper became a top-anchored `flex min-h-[42px] flex-col justify-start`. The wrapper is a fixed height whether or not the `Deal → stage` subtext renders, so the vertically-centered `<td>` centers a constant-height block and the pill's Y is stable in both states; the subtext grows downward. `LeadSelectCell` (the canonical `h-7`/`rounded-full`/ring/truncation pill) is unchanged, as is the `h-[68px]` row. Correct.

Item 3 (approve asks final amount + struck Customer Offer) is implemented end to end. The Deals-queue inline Approve no longer approves silently at the requested discount; it opens `ApproveAmountModal`, which collects the final approved price (prefilled to the requested price, validated to not exceed the quote) and only on confirm calls `approveDeal`. The approval decision stays server-stamped — `approveDeal` is unchanged and the DB `lead_deals_guard` trigger owns `approver/decided_at/approved_discount`; the client only supplies the chosen amount. Reject and Request Changes still route to the drawer, so the prompt is Approve-only. The Customer Offer column strikes the requested price and shows the approved price only when `approvedVsRequestedOffer(d).changed` (approved AND different), via the new `lead-deals.ts` helper rather than inline math. Requested / approved / actual-invoice discounts stay distinct. Correct.

Item 4 (highlight approved/rejected/final-amount in chat) renders the `revisionsForDeal` stream interleaved with comments on one chronological timeline. Approved entries are emerald with the final approved amount prominent, rejected are rose, changes-requested is a restrained indigo, submitted/resubmitted/cancelled stay neutral, and ordinary comments keep the existing neutral card. It is pure append-only display of existing revision history — nothing is mutated or overwritten. Correct.

Permission gating reuses `allow(can, CAP.deal.*)`; no raw role checks were introduced. No Supabase migration was added (none required — the plan reuses existing columns/triggers).

<details>
<summary>Issues (2)</summary>

1. **Missing verification evidence (MEDIUM)** — The commit message is a single line and no `four-fixes-verification.md` exists in the task directory; there is no recorded `tsc --noEmit` / `npm run build` / lint output. The review contract requires rejecting with a finding when evidence is absent rather than running the suites. Record the tsc + build + lint results (and the Item 1 / Item 3 DB-mode or RLS-reasoning note) and re-submit.
2. **Minor DRY nits in the Deals page (LOW)** — `deal-conversation.tsx` has two separate `import … from "lucide-react"` statements (benign; `next/core-web-vitals` does not enable `no-duplicate-imports`), and `ApproveAmountModal` recomputes the requested-price prefill and price→discount inline instead of reusing `dealCustomerPrice`. Neither affects correctness; fold if convenient.

</details>

<details>
<summary>Details</summary>

### Item 1 — status change persists (leads-context.tsx)

The write changed from `db.from("leads").update(row).eq("id", id)` to `…​.select("id")`, and a new guarded block treats a null-error / zero-row result as failure:

```ts
if (!healedAway && (res.data?.length ?? 0) === 0) {
  console.error("[leads] updateLead affected 0 rows (likely RLS visibility).");
  reportLeadError("Changes not saved", …);
  const { data: fresh } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (fresh) setLeads((prev) => prev.map((l) => (l.id === id ? applyFulfilmentOverlay([rowToLead(fresh)])[0] : l)));
  return false;
}
```

This is exactly the plan's root-cause fix: an RLS-filtered UPDATE returns `error: null` with 0 rows, which previously read as a fake success and reverted on the next realtime reload. The `healedAway` flag (set when the schema-drift loop empties `row`) correctly prevents a legitimately-empty write from being misread as an RLS block — the healed-away branch now sets `{ error: null, data: [] }` and short-circuits. The error-path rollback (`res.error`) is unchanged. An authorized owner's status change now round-trips and survives refresh; an unauthorized write surfaces the toast and reverts immediately instead of silently later.

`changeLeadStatus` is untouched: it still early-returns when `status === lead.status`, writes the `qualified_at`/`converted_at`/`lost_at` terminal timestamps, inserts the append-only `lead_status_history` row (`from_status`/`to_status`/`note`), and logs activity. Action and Result are not touched anywhere in the diff, so they remain system-derived and read-only. (Observation, not a change request: the terminal-timestamp UPDATE inside `changeLeadStatus` does not use the new `.select("id")` observability, but that is pre-existing and out of scope.)

### Item 2 — pill top-anchored (leads/list/page.tsx)

```diff
- <div className="min-w-0">
+ <div className="flex min-h-[42px] min-w-0 flex-col items-stretch justify-start">
```

The `h-7` (≈28px) pill plus a `mt-0.5` + `text-[10px]` subtext line fits inside the reserved `min-h-[42px]`, so the wrapper height is constant with or without the `Deal → stage` line. Because the `<td>` is `align-middle`, it centers a fixed-height block and the pill's Y does not move between rows. `justify-start` pins the pill to the top and the subtext grows downward. `LeadSelectCell`'s pill classes and the `h-[68px]` row are unchanged — only the cell's vertical layout changed, as required by the Pill standard.

### Item 3 — approve prompt + struck Customer Offer (lead-deals.ts, leads/deals/page.tsx)

`lead-deals.ts` gains `dealCustomerPrice(leadValue, discount, type)` (quote − off, clamped ≥ 0, null quote → null) and `approvedVsRequestedOffer(deal)` returning `{ requestedPrice, approvedPrice, changed }`, where `changed` is true only when the deal is approved and the approved price differs from the requested price. This keeps the struck-price math in the lib, derives only from the deal's own fields, and keeps the three discount concepts distinct.

In the page, `inlineApprove` (which approved at the requested discount with no prompt) is replaced by `setApproveFor(d)` → `ApproveAmountModal`. The modal collects the final price (prefilled to the requested price, rejects a value above the quote) and on confirm calls `approveDeal(d.id, { approvedDiscount: round(quote − price), approvedDiscountType: "amount", comment? })`. `approveDeal` is unchanged, so the approver/decided_at/approved_discount stamping remains server-owned (DB trigger) and the self-approval guard (`canDecideDeal`) still applies — the owner-override still opens the prompt. Reject/Request Changes route to `setOpenId` (drawer), so the amount prompt is Approve-only. The queue button is relabeled "Approve…".

The Customer Offer column adds a branch before the existing requested-offer rendering: when `approvedOffer.changed` with both prices present, it shows the requested price `line-through`/muted above the emerald approved price; otherwise the existing requested breakdown is unchanged. Null quote still shows "—". Column width/alignment preserved.

### Item 4 — chat decision highlighting (deals/deal-conversation.tsx)

`DealConversation` now also reads `revisionsForDeal` and builds one `timeline` sorted by `createdAt` merging comments and revisions, driving empty-state, auto-scroll, and render off the merged list. Comments render with the original neutral card; revisions render through `DecisionEntry` using a restrained `REV_STYLE` map (approved → emerald + `strong`, rejected → rose + `strong`, changes_requested → indigo, submitted/resubmitted/cancelled → neutral). The approved entry shows the customer price (via `dealCustomerPrice`) when the quote is known, else the discount, with the discount as a secondary note. This is display-only over the existing append-only revision stream; no revision is created or mutated here, satisfying the append-only history rule. Composer, read-only lens (`CAP.deal.comment`), and `compact`/`threadMaxHeight` props are preserved. All referenced exports (`DEAL_REVISION_ACTION_LABEL`, `DealRevisionAction`, `LeadDealComment`, `LeadDealRevision`, `dealCustomerPrice`, `revisionsForDeal`) exist.

### Cross-cutting checks

- Permission gating: `allow(can, CAP.deal.approve/reject/requestChanges)` and `CAP.deal.comment` — existing capabilities, no `role ===` checks introduced (grep clean).
- Migrations: none added; the stat shows only the five source files, consistent with the plan ("no new DB migration is required").
- Imports/props: `Textarea`/`Label` from `@/components/ui/input`, `Button` `size`/`loading`, `CheckCircle2`/`AnimatePresence`/`motion`/`cn`/`formatINR` all resolve.

</details>

<details>
<summary>File map</summary>

- `src/lib/leads-context.tsx` — observable lead UPDATE (`.select("id")`), 0-row-as-failure rollback, `healedAway` guard.
- `src/app/(app)/leads/list/page.tsx` — status cell wrapper top-anchored (`flex min-h-[42px] flex-col justify-start`).
- `src/lib/lead-deals.ts` — new `dealCustomerPrice` + `approvedVsRequestedOffer` helpers.
- `src/app/(app)/leads/deals/page.tsx` — `ApproveAmountModal` (Approve-only final-amount prompt), struck Customer Offer price, button relabel.
- `src/components/deals/deal-conversation.tsx` — merged comment+revision timeline with emerald/rose/indigo/neutral `DecisionEntry`.

Full diff: `git show c9cd3d8`.

</details>
