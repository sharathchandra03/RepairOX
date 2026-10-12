# Implementation Plan — Four Lead/Deal Fixes

Scope: four discrete fixes in the RepairOX app (`app/`). Work the user's checkout
directly (NO worktree). Do NOT change anything the user sees or how the system
behaves beyond these four items. Honor the steering standards called out per item.

Verification baseline for every item (run from `app/`):
- `npx tsc --noEmit` — no new type errors.
- `npm run build` — Next.js build succeeds.
- `npm run lint` — no new lint errors in touched files.
Manual DB-mode checks are described per item (they require a running Supabase +
a signed-in user, so where the sandbox can't run them, state that and rely on the
type/build checks + a careful read of the RLS/guard logic).

---

## Investigation findings (root causes, confirmed by reading the code)

**Item 1 — status not persisting.** The inline Lead Table status pill
(`LeadSelectCell`, `app/src/app/(app)/leads/list/page.tsx` ~line 1699) calls
`applyLeadStatus` → `useLeads().changeLeadStatus` (`leads-context.tsx` ~1776).
`changeLeadStatus` calls `updateLead({ status })` → `persistLeadPatch`
(`leads-context.tsx` ~1279). `persistLeadPatch` does the optimistic
`setLeads(...)` FIRST, then in DB mode runs
`await db.from("leads").update(row).eq("id", id)` **without `.select()` and
without checking the affected-row count**. `status` IS mapped by `leadToRow`
(col `status`) and is NOT in `LEAD_OPTIONAL_COLUMNS`, so it is never healed away.
The real failure: when the signed-in user does not satisfy the `leads_upd` RLS
`USING` clause (migration `0049_sales_agent_lead_ownership.sql` ~line 509 —
`auth_lead_see_all() OR created_by/assigned_to/assigned_user_id/follow_up_agent_id
= me OR auth_is_lead_followup_agent(id)`), Postgres matches **0 rows** and
PostgREST returns **`error: null`** (an RLS-filtered UPDATE is not an error). So
`persistLeadPatch` returns `true`, the optimistic state shows the new status, but
nothing is written — and the next realtime `reload` (`leads-context.tsx` ~987,
re-selects `leads` on any change) or a refresh reverts the row to its stored
status. The lead-qualification guard (`0060`) and ownership guard (`0049`) do NOT
block a plain status change (the ownership guard only raises on owner/follow-up/
delete changes; the qualification guard only on not-qualified-reason / gated-link
contradictions). So the fix is to make the lead UPDATE **observable**: request the
updated row back and treat a 0-row result as a real failure (roll back optimistic
state + surface the existing error toast), AND continue writing
`lead_status_history` + terminal timestamps (already present in `changeLeadStatus`).
Action/Result are derived and untouched.

**Item 2 — pill pushed up by subtext.** In the Lead Table the `<td>` uses
`align-middle` (`leads/list/page.tsx` ~line 2211, `pad = "... align-middle ..."`)
and the row is `h-[68px]`. The STATUS cell renders `LeadSelectCell` + an optional
`Deal → <stage>` subtext inside `<div className="min-w-0">` (~line 1699). Because
the TD vertically centers its content, adding the subtext line re-centers the
whole group and shifts the pill UP relative to rows without subtext. Fix: give the
pill a stable top-anchored Y inside the cell so adding subtext grows DOWNWARD only.

**Item 3 — approve must ask final approved amount + struck Customer Offer.**
`approveDeal(dealId, { approvedDiscount, approvedDiscountType, comment })`
(`lead-deals-context.tsx` ~399) already persists an approver-set approved discount
(DB-stamps `approver_id/approver_name/decided_at/approved_discount` via the
`lead_deals_guard` trigger, migration `0063_lead_deals.sql` §6; local mode writes
the revision via `writeLocalRevision`). The **DealReviewPanel**
(`deal-review-panel.tsx`) ALREADY has a proper "Approve → enter Approved Price →
Confirm Approval" flow and is reused by `lead-deal-panel.tsx` (View Lead). The gap
is the **Deals queue inline Approve** (`leads/deals/page.tsx` `inlineApprove`
~line 180 + the `DealStatusCell` "Approve (at requested)" button ~line 797), which
approves at the requested discount with NO prompt. Also the **Customer Offer**
column (~line 551) always shows the requested-offer breakdown, never the new
approved price with the old (requested) price struck through. `customerOfferBreakdown`
(local to the page, ~line 58) only knows the requested side.

**Item 4 — chat must highlight approved/rejected/final-amount.** `DealConversation`
(`deal-conversation.tsx`) renders ONLY `commentsForDeal` — it does NOT render
`revisionsForDeal` at all, so approve/reject decisions never appear in the chat.
The `lead_deal_revisions` stream already carries `action`
(submitted/approved/rejected/changes_requested/…), `statusAfter`, `approvedDiscount`
+ `approvedDiscountType` and `comment` — DB-stamped append-only by the
`lead_deals_record_revision` trigger (`0063` §7), mirrored locally by
`writeLocalRevision` (`lead-deals-context.tsx` ~223). So NO migration is needed:
Item 4 is purely rendering the revision stream, interleaved with comments, with
approved = emerald, rejected = rose, and the final approved amount highlighted.

No new DB migration is required for any item (Item 1 reuses existing columns/
history; Items 3–4 reuse existing deal/revision columns + the DB triggers).

---

## Plan

- [ ] 1. Make the lead UPDATE observable so a status change actually persists (Item 1 root cause).
      In `persistLeadPatch` (`app/src/lib/leads-context.tsx` ~line 1279), change the DB write from
      `db.from("leads").update(row).eq("id", id)` to request the affected row back:
      `db.from("leads").update(row).eq("id", id).select("id")`. After the schema-drift heal loop,
      treat `res.error == null && (res.data?.length ?? 0) === 0` as a FAILURE (RLS matched no row):
      log it, call the existing `reportLeadError("Changes not saved", ...)`, roll the optimistic state
      back by re-fetching the authoritative row (the existing `db.from("leads").select("*").eq("id",id).maybeSingle()`
      + `applyFulfilmentOverlay` block already does this on error — reuse it), and `return false`.
      Keep the existing error-path behavior unchanged. This surfaces the true cause (RLS visibility)
      instead of a silent fake success, and guarantees a persisted status survives refresh when the
      user is authorized. Do NOT touch `changeLeadStatus`'s `lead_status_history` insert or the
      `qualified_at/converted_at/lost_at` terminal-timestamp writes (already correct, ~1795-1817).
      Files: `app/src/lib/leads-context.tsx`
      Verify: `npx tsc --noEmit` + `npm run build`. DB-mode manual check (if a Supabase instance is
      available): as a user who OWNS/created the lead, change a lead's status (e.g. Deal → Pickup
      Assigned) in the Lead Table, hard-refresh — the new status persists; confirm a new
      `lead_status_history` row (from_status/to_status) exists. As a user who does NOT satisfy
      `leads_upd` (not owner/creator/follow-up, no see-all) the change now shows the "Changes not
      saved" toast and reverts, instead of silently reverting on refresh. If no DB is reachable,
      state that and rely on the type/build checks + the RLS reasoning above.

- [ ] 2. Top-anchor the Status/Action pill so subtext flows beneath without moving the pill (Item 2).
      In `app/src/app/(app)/leads/list/page.tsx`, the STATUS cell wrapper (~line 1699,
      `<div className="min-w-0">` holding `LeadSelectCell` + the `Deal → stage` `<p>`): add a fixed
      top offset so the pill sits at the SAME Y whether or not the subtext renders. Simplest robust
      approach that preserves `h-[68px]` and the canonical pill (h-7, rounded-full, ring, truncation
      — do NOT touch `LeadSelectCell`'s pill classes): wrap the cell content in a block that is
      top-anchored within the vertically-centered `<td>`. Two acceptable options — pick ONE and apply
      it consistently to any cell that stacks a pill + sub-label:
        (a) Give the status cell wrapper a fixed min-height equal to "pill + max one subtext line"
            and `flex flex-col items-stretch justify-start` so the pill is always at the top and the
            subtext (when present) grows downward; OR
        (b) Keep the `<td align-middle>` but reserve the subtext space in BOTH states by always
            rendering a fixed-height sub-label slot (the subtext text when present, otherwise an
            empty spacer of the same height), so the group's total height — and thus the pill's
            centered Y — is identical with and without subtext.
      Prefer (a) (no empty DOM; the pill is explicitly top-anchored and the Y is independent of the
      TD centering). Verify the Action column (`ActionCell`, ~794) and any other pill-with-sub-label
      cell behave the same; the Action cell currently has no sub-label, so only wrap it if a sub-label
      is actually added — otherwise leave it. Do NOT change pill shape/ring/`h-7`/truncation/tone
      helpers (design-system Pill standard).
      Files: `app/src/app/(app)/leads/list/page.tsx`
      Verify: `npx tsc --noEmit` + `npm run build`. Visual: in the Lead Table, a row WITH a
      `Deal → stage` subtext and a row WITHOUT it must show the status pill at the identical vertical
      position; the row stays `h-[68px]`; the pill shape/size is unchanged.

- [ ] 3a. Add a shared Customer-Offer price helper to `lead-deals.ts` (no inline math in components).
      In `app/src/lib/lead-deals.ts`, add an exported helper next to `formatDealDiscount` that, given
      `leadValue` (quote) + a discount (value+type), returns the customer-facing PRICE (quote − off,
      clamped ≥ 0), reusing the same math as the page's `customerOfferBreakdown` and the review
      panel's inline `discountToPrice`. Suggested signatures:
        `dealCustomerPrice(leadValue: number|null, discount: number|null, type: "amount"|"percent"): number|null`
        `approvedVsRequestedOffer(deal: LeadDeal): { requestedPrice: number|null; approvedPrice: number|null; changed: boolean }`
      `changed` is true only when the deal is approved AND the approved price differs from the
      requested price (so an equal approval shows no redundant struck price — Item 3 rule).
      Keep requested vs approved vs actual-invoice discounts conceptually distinct (deal-approval
      standard) — this helper only derives the two CUSTOMER-OFFER prices from the deal's own fields.
      Files: `app/src/lib/lead-deals.ts`
      Verify: `npx tsc --noEmit`. (Optionally add a tiny usage from the page in step 3c.)

- [ ] 3b. Make the Deals-queue inline Approve prompt for the FINAL APPROVED AMOUNT (only on Approve).
      In `app/src/app/(app)/leads/deals/page.tsx`: replace the current `inlineApprove` (~line 180,
      which approves at `d.requestedDiscount` with no prompt) and the `DealStatusCell` "Approve (at
      requested)" button so that choosing Approve opens a small prompt/modal (a compact modal or a
      popover step — reuse the app's existing modal/`RoxCenteredForm`-style or a lightweight inline
      step like `DealStatusCell`'s existing popover) that collects the final APPROVED PRICE (absolute
      ₹, prefilled with the requested price, same validation as `deal-review-panel.tsx`: cannot exceed
      the quote). Only on confirming does it call `approveDeal(d.id, { approvedDiscount, approvedDiscountType:"amount",
      comment? })` where `approvedDiscount = round(quote − enteredPrice)` (fall back to
      `d.requestedDiscount` when the quote is unknown). Reject and Request Changes keep routing to the
      drawer (`setOpenId`) — the prompt is shown ONLY for Approve. Do NOT fabricate the decision on
      the client: `approveDeal` already DB-stamps approver/decided_at/approved_discount via the
      `lead_deals_guard` trigger (0063 §6); the client only supplies the approver's chosen amount.
      Rename the button label from "Approve (at requested)" to "Approve…" to signal the prompt.
      Keep the self-approval rule intact (`canDecideDeal` already blocks approving your own unless
      owner-override) — the prompt must still appear when a top-authority owner approves their own.
      Files: `app/src/app/(app)/leads/deals/page.tsx`
      Verify: `npx tsc --noEmit` + `npm run build`. Behavior: clicking Approve in the queue opens the
      final-amount prompt; confirming persists the approved amount (visible after the realtime refresh
      / on the review drawer's "Approved Price"); Reject/Changes show NO amount prompt.

- [ ] 3c. Show the new approved Customer-Offer price with the previous (requested) price struck through.
      In `app/src/app/(app)/leads/deals/page.tsx` CUSTOMER OFFER column (~line 551), after approval
      with a different final amount, render the NEW approved price prominently and the previous
      (requested) price with `line-through` + muted color (old → new). Use the step-3a helper
      (`approvedVsRequestedOffer(d)`): when `d.status === "approved" && changed`, show approved price
      as the headline and the requested price struck through above/beside it; when approved equals
      requested (or not yet approved), keep the existing requested-offer breakdown exactly as-is (no
      redundant struck price). Keep the column width (`w-[118px]` colgroup) and the right-aligned
      `tabular-nums` layout; do not fabricate numbers (null quote still shows "—").
      Files: `app/src/app/(app)/leads/deals/page.tsx`
      Verify: `npx tsc --noEmit` + `npm run build`. Visual: approve a deal at a DIFFERENT amount → the
      Customer Offer cell shows the previous price struck through and the new approved price prominent;
      approve at the SAME amount → no struck price; a pending/rejected deal is unchanged.

- [ ] 4. Render the revision stream in the Deal chat and highlight approved / rejected / final-amount.
      In `app/src/components/deals/deal-conversation.tsx`, additionally read `revisionsForDeal` from
      `useDeals()` and build ONE chronological timeline merging `commentsForDeal` + `revisionsForDeal`
      (sort by `createdAt`; a revision's `action` drives its style). Render:
        • `approved` revision → EMERALD highlighted entry showing "Approved" + the final approved
          amount prominently (reuse `formatDealDiscount(r.approvedDiscount, r.approvedDiscountType)`
          and/or the step-3a price helper for the customer price) + optional `comment`.
        • `rejected` revision → ROSE/red highlighted entry ("Rejected" + reason/`comment`).
        • `changes_requested` → a restrained indigo entry; `submitted`/`resubmitted` → a neutral
          "requested" entry (keep these subtle — only approved/rejected/final-amount are strongly
          highlighted per the user's ask).
        • Normal `commentsForDeal` entries keep the EXISTING neutral card style unchanged.
      Use the restrained semantic tones already used across the app (emerald/rose families, e.g.
      `dealStatusTone` in `lead-deals.ts`), NO neon. Preserve the composer, read-only lens
      (`CAP.deal.comment`), auto-scroll, and `compact`/`threadMaxHeight` props. This is append-only
      display of existing history — never overwrite/mutate a revision (deal-approval rule 11). Since
      the approved revision already carries `approvedDiscount` (DB trigger 0063 §7 + local
      `writeLocalRevision`), NO change to `approveDeal` or any migration is needed to emit the final
      amount into the chat.
      Files: `app/src/components/deals/deal-conversation.tsx`
      Verify: `npx tsc --noEmit` + `npm run build`. Behavior: in the deal chat (via
      `deal-conversation-popover.tsx` and the View Lead Deal section) the Approved message shows in
      emerald with the final amount, the Rejected message in rose, and normal comments stay neutral;
      the thread stays chronological and the composer still posts comments.

- [ ] 5. Final verification pass across all four items.
      Files: (none — verification only)
      Verify: from `app/`, run `npx tsc --noEmit`, then `npm run build`, then `npm run lint`; confirm
      no new errors. Re-check that Action/Result cells are untouched (Item 1/2), the Pill shape/ring/
      h-7/tone helpers are unchanged (Items 2–4), and no DB migration was added. If a Supabase
      instance is available, run the Item 1 and Item 3 DB-mode manual checks above; otherwise record
      that they were validated by code/RLS reasoning + the type/build checks.
