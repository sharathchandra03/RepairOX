# Lead Table Action ↔ Deal-approval sync + "Deal → stage" sub-indicator

The change makes the Lead Table's system-derived **Action** reflect the Deal (discount-approval) lifecycle, and adds a muted "Deal → \<current stage\>" sub-line under the Action pill once an approved-deal lead has moved to a downstream stage. In `deriveLeadWorkflow` the pending/changes-requested deal now surfaces as "In Approval" / "Changes Requested", a decided deal as "Deal Approved" / "Deal Rejected", and a new independent `LeadWorkflow.dealLineage` field (`approved | rejected | pending | null`) is computed once up front and threaded through the `mk(...)` builder so every winning branch carries it. `ActionCell` reads that field to render the sub-line, guarded so it never shows a redundant "Deal → Deal Approved". Result semantics are untouched (always "In Pipeline" for deal states) and Action stays read-only / system-derived.

Watch for:
- (possible) The pending-deal branch (§3b) is deliberately slotted ABOVE pickup/onsite/walk-in intent — a documented, intended re-ordering, not a regression of the real-record priority chain. Confirmed below.
- (confirmed) A fallback `deriveLeadWorkflow(lead, workflowSources)` call with no `deal` opt exists in the row renderer; in that path the sub-line is suppressed. It is a pre-existing safety net that only fires if the memoized map misses a lead, which does not happen in practice. Non-blocking.

**Verdict**: APPROVED

## High-level view

The label change is minimal and correctly localized. `LEAD_ACTION_LABEL.discount_approval` moved from "Discount Approval" to "In Approval", and the two deal branches pass explicit `actionLabel` overrides ("Changes Requested", "In Approval", "Deal Approved", "Deal Rejected"). The `LeadActionKind` union is unchanged — only the human label moved, exactly as the task asked.

The new `dealLineage` field is a required (non-optional) member of `LeadWorkflow`, computed once at the top of `deriveLeadWorkflow` from `opts.deal.status` and defaulted into the `mk` builder's `lineage` parameter, so every branch that returns through `mk` carries it automatically. The decided-deal branch overrides `lineage` to `null`, which is the exact guard that prevents a redundant "Deal → Deal Approved" sub-line. Because the field is required, the only other derivation caller (View Lead `[id]/page.tsx`) had to be checked — it only consumes the returned object and never constructs a `LeadWorkflow` literal, so it needs no change, and it already passes `deal` into opts so the labels stay consistent there too.

The priority cascade is preserved for real operational records: invoice (§1) > ticket (§2) > field job (§3). The pending-deal branch was inserted at §3b — below those real records but above the routing *intents* (pickup/onsite §4, walk-in §5). This is the documented intent ("approval must happen first"), not a break of the highest-outcome-wins chain, since nothing real was demoted. The decided-deal branch (§6) remains below all intents, so an approved deal only becomes the primary pill when no downstream stage exists; otherwise the stage wins and the deal rides along as `dealLineage`.

`ActionCell` wraps the former single `<span>` pill in a `<div>` and appends a conditional `<p>` sub-line. The pill markup (Lock glyph, `flex-1 truncate` label, tone, title tooltip, `h-7 w-full`) is preserved byte-for-byte inside the wrapper. The sub-line is `text-[10px]` muted, full-width, `truncate` with its own title tooltip, rendered below the pill — it cannot widen the column because the column width is driven by the `<colgroup>`, and both pill and sub-line are `min-w-0 w-full`.

<details>
<summary>Issues (2)</summary>

1. **Opt-less fallback suppresses the sub-line** — `deriveLeadWorkflow(lead, workflowSources)` at the row renderer (page.tsx ~2065) passes no `deal`, so `dealLineage` is `null` there. Only reachable if the `workflowByLead` memo misses a lead (does not happen in practice). Non-blocking; could pass `deal` for symmetry.
2. **View Lead shows the new labels but no sub-line** — `[id]/page.tsx` renders Action via a `DerivedBadge` using `wf.actionLabel`, so "In Approval"/"Deal Approved"/"Deal Rejected" appear, but the "Deal → stage" sub-line is a Lead-Table-only affordance. Consistent with the task scope (sub-line specified for `ActionCell`); informational only.

</details>

<details>
<summary>Details</summary>

### Requirement 1 — deal-aware action labels

`LEAD_ACTION_LABEL.discount_approval` is now `"In Approval"` (was "Discount Approval"); the union key stays `discount_approval`. The pending branch (§3b) sets the label to `"Changes Requested"` for `changes_requested` and `"In Approval"` for `pending_approval`, and the decided branch (§6) sets `"Deal Approved"` / `"Deal Rejected"`. All four pass through `mk(...)`'s `actionLabel` override, so the pill text matches the task exactly.

The reason tooltip is preserved on both branches — pending: `"Discount approval {dealNo} is pending approval / awaiting requested changes — the lead is in the Deal approval workflow."`; decided: `"Discount approval {dealNo} was approved/rejected by the manager."`. Result is `{ kind: "pipeline", primary: "In Approval"/"Changes Requested" }` on the pending branch and `{ kind: "pipeline", primary: "In Pipeline" }` on the decided branch — neither is a conversion, matching §24/§25 and the lead-workflow-derivation standard. No stored action/result column was introduced; everything is computed at read time.

One cosmetic note: on the *pending* branch the `LeadResult.primary` is set to the label ("In Approval" / "Changes Requested") rather than "In Pipeline". The task text for Requirement 1 is about approved/rejected keeping Result "In Pipeline" (satisfied on §6). The pending branch surfacing the pending label as the Result primary is pre-existing behavior carried over from the old branch (the old code set `primary: label` too), is still `kind: "pipeline"` (not a won/lost outcome), and is not called out by the task as a defect. Not a regression.

### Requirement 2 — `dealLineage` field + sub-line

`dealLineage` is added to the `LeadWorkflow` interface as a required member and computed once from `opts.deal.status` near the top of `deriveLeadWorkflow`:

```ts
const dealLineage =
  dealForLineage?.status === "approved" ? "approved"
    : dealForLineage?.status === "rejected" ? "rejected"
    : (dealForLineage?.status === "pending_approval" || dealForLineage?.status === "changes_requested") ? "pending"
    : null;
```

It is threaded through `mk(...)` via a defaulted `lineage` parameter (`= dealLineage`) and assigned to the returned object. Every branch that returns through `mk` therefore carries the lineage without per-branch wiring — satisfying "every winning branch carries it." The decided-deal branch passes `lineage = null` explicitly (and `fieldStatus = null` positionally before it), which is the guard against a redundant self-referential sub-line.

Because the field is non-optional, I verified the only other `deriveLeadWorkflow` consumer, `leads/[id]/page.tsx`, does not build a `LeadWorkflow` literal — it destructures the returned `wf`. No type break there; consistent with the recorded clean `tsc`.

`ActionCell`:

```tsx
const showDealLineage = wf.dealLineage === "approved" && wf.action !== "discount_approval";
```

This is exactly the task's condition: show only when the deal is approved AND the primary action is a downstream stage (not the deal pill). The sub-line is `<p className="mt-0.5 w-full min-w-0 truncate px-0.5 text-[10px] font-medium text-muted-foreground">` with a `title` tooltip, rendered beneath the pill inside a `min-w-0` wrapper `<div>`. The pill itself is unchanged. Column width is `<colgroup>`-driven, so neither element widens the column.

### Six scenarios traced through the code

- **(a) pending + no downstream** → §3b wins → label "In Approval", `dealLineage="pending"`. `showDealLineage` requires `"approved"`, so no sub-line. ✓
- **(b) approved + Status still "Deal"** → no invoice/ticket/field, no pickup/walk-in intent, no pending deal → falls to §6 → label "Deal Approved", `lineage` forced `null` → no redundant sub-line. ✓ (The `isDealLead` §6b branch is never reached because §6 handles approved/rejected first.)
- **(c) approved + Pickup Assigned** → §4 intent wins → `actionLabel` "In Transit" (pickup), `dealLineage="approved"` (default) → sub-line "Deal → In Transit". ✓ (The displayed label is the pickup action label; sub-line mirrors it, per the "Deal → {wf.actionLabel}" spec.)
- **(d) approved + Walkin Assigned** → §5 wins → label "Walkin Assigned", `dealLineage="approved"` → sub-line "Deal → Walkin Assigned". ✓
- **(e) approved + finalized invoice** → §1 wins (highest outcome) → label "Invoice Created" / "Visited Store", `dealLineage="approved"` (default via `mk`) → sub-line still present. ✓
- **(f) rejected** → §6 → label "Deal Rejected", Result "In Pipeline" (not lost), `lineage=null`. Downstream branches (§1–§5) all sit above §6, so once an operational record/intent exists it supersedes the rejected-deal pill — downstream still works, and for a rejected deal `showDealLineage` is false regardless. ✓

### Priority / standards compliance

Real-record priority is intact: §1 invoice > §2 ticket > §3 field job, all ABOVE the new §3b pending-deal. The pending deal was placed above the routing intents (pickup/onsite/walk-in) by design — the commit message and inline comments document this as "approval must happen first," and it demotes no real record. Decided deals (§6) remain below every intent, so a stage always wins the primary pill and the deal becomes context. Action/Result remain system-derived, read-only (Lock glyph, `cursor-default select-none`, reason tooltip), and non-stored — compliant with the lead-workflow-derivation standard and the pill standard (full-width `h-7`, `flex-1 truncate`, tone from `leadActionTone`, no inline widening).

### Build / type evidence

The commit message records: "Verified: npx tsc --noEmit clean; npm run build compiles successfully (135/135 pages)." Per the review instructions I did not re-run the suites. Spot-checks confirm the new field's required-ness is satisfied (only `mk` constructs the object; the sole other caller consumes it), all `DealStatus` literals used (`pending_approval`, `changes_requested`, `approved`, `rejected`) exist, `LeadDeal.dealNo`/`.status` exist, and `LeadActionKind` still contains `discount_approval` — consistent with a clean type-check.

</details>

<details>
<summary>Files changed</summary>

- `src/lib/lead-workflow.ts` — add `LeadWorkflow.dealLineage`; relabel `discount_approval` → "In Approval"; split deal handling into pending (§3b, blocking, above intents) and decided (§6, below intents) branches with "Deal Approved"/"Deal Rejected" labels; thread `lineage` through `mk`.
- `src/app/(app)/leads/list/page.tsx` — `ActionCell` wraps the pill in a `<div>` and conditionally renders the "Deal → {label}" muted sub-line gated on `dealLineage === "approved" && action !== "discount_approval"`.

Full diff: `git show 73952eb`.

</details>
