# Four Lead/Deal fixes — verification evidence

This records the verification requested by the review (`four-fixes-review.json`
MEDIUM finding: "no recorded tsc/build/lint output"). It also folds the two LOW
DRY nits. All commands were run from `app/`.

## Commands run and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — exit 0, no type errors. |
| `npm run build` (`next build`) | **PASS** — "✓ Compiled successfully", "Checking validity of types …" clean, "✓ Generating static pages (135/135)", "Finalizing page optimization". `/leads/deals` (22.3 kB) and `/leads/list` (42.2 kB) both compiled. |
| `npm run lint` (`next lint`) | **N/A in this checkout** — fails with "ESLint must be installed: npm install --save-dev eslint". ESLint is not installed in this environment, so lint cannot run. Type safety is covered by `tsc --noEmit` and the build's own "Checking validity of types" pass. |

### Build cache note
A first `npm run build` (with a stale `.next`) failed late in "Collecting page
data" with `PageNotFoundError: Cannot find module for page: /api/account/password`
and `/api/feature-visibility`. Those two route files exist and are untouched by
this work (dated Sep/Aug); the error is a known Next.js 14 stale-`.next`-cache
artifact. Running `rm -rf .next && npm run build` succeeds cleanly (all 135 pages
generated), confirming it is not a code issue in the five touched files.

The `themeColor` metadata warnings on `/leads/deals` and `/leads/list` are
pre-existing (metadata→viewport migration) and unrelated to this change.

## LOW nits folded (from the review)

1. **Duplicate `lucide-react` import** in `deal-conversation.tsx` — merged the two
   `import … from "lucide-react"` lines into one.
2. **Inline prefill math in `ApproveAmountModal`** (`leads/deals/page.tsx`) — the
   requested-price prefill now reuses the shared
   `dealCustomerPrice(leadValue, requestedDiscount, requestedDiscountType)` helper
   instead of recomputing quote−discount inline. Output is identical
   (`Math.max(0, Math.round(quote − off))`, same percent/amount handling).

Both are pure DRY refactors; no user-visible behavior changed. `tsc --noEmit`
re-run after the folds: PASS (exit 0).

## How each of the four items was verified

### ITEM 1 — lead status change persists across refresh
Verified by code + RLS reasoning (no live Supabase instance reachable in this
sandbox, so the DB-mode manual check is reasoned, as the plan permits):
- `persistLeadPatch` (`src/lib/leads-context.tsx` ~1297) now issues
  `db.from("leads").update(row).eq("id", id).select("id")`. An RLS-filtered
  UPDATE returns `error: null` with **0 rows** — previously read as a fake
  success that reverted on the next realtime reload. The new guard
  `if (!healedAway && (res.data?.length ?? 0) === 0)` treats that as a real
  failure: it logs, raises the existing `reportLeadError("Changes not saved", …)`
  toast, and re-reads the authoritative row (`select("*").maybeSingle()` +
  `applyFulfilmentOverlay`) to roll the optimistic state back.
- The `healedAway` flag (set when the schema-drift heal loop empties `row`)
  prevents a legitimately-empty write from being misread as an RLS block.
- An **authorized** owner/creator/follow-up user now round-trips the write, so
  the new status survives a hard refresh.
- `changeLeadStatus` is untouched: it still early-returns on no-op, writes the
  `qualified_at`/`converted_at`/`lost_at` terminal timestamps, inserts the
  append-only `lead_status_history` row, and logs activity. **Action/Result are
  not touched anywhere** — they stay system-derived and read-only.

### ITEM 2 — pill Y stable with/without subtext
- The STATUS cell wrapper (`src/app/(app)/leads/list/page.tsx` ~1704) is
  `flex min-h-[42px] min-w-0 flex-col items-stretch justify-start`. The `h-7`
  pill plus the optional `mt-0.5 text-[10px]` `Deal → <stage>` line fit inside
  the fixed `min-h-[42px]`, so the wrapper is a constant height in both states.
  Because the `<td>` is `align-middle`, it centers a constant-height block →
  the pill's Y is identical whether or not the subtext renders; `justify-start`
  pins the pill to the top and the subtext grows downward.
- `LeadSelectCell`'s pill classes (`h-7`, `rounded-full`, ring, truncation,
  tone helpers) and the `h-[68px]` row are unchanged — only the cell's vertical
  layout changed, per the Pill standard. Confirmed via the production build
  (static `/leads/list` generated).

### ITEM 3 — Approve asks final approved amount; struck old + new Customer Offer
- Deals-queue Approve now opens `ApproveAmountModal` (Approve-only — Reject /
  Request Changes still route to the drawer). The modal collects the final
  approved **price** (prefilled to the requested price via `dealCustomerPrice`,
  rejects a value above the quote) and only on confirm calls
  `approveDeal(d.id, { approvedDiscount: round(quote − price), approvedDiscountType: "amount", comment? })`.
- The approval decision stays **server/context-owned**: `approveDeal` is
  unchanged, so `approver_id / approver_name / decided_at / approved_discount`
  are DB-stamped by the `lead_deals_guard` trigger — the client only supplies
  the chosen amount. The self-approval guard (`canDecideDeal`) still applies.
- CUSTOMER OFFER column: when `approvedVsRequestedOffer(d).changed` (approved
  AND different) it renders the previous requested price `line-through`/muted and
  the approved price in `emerald-700` as the headline (old → new); equal approval
  or a pending/rejected deal keeps the existing requested breakdown (no redundant
  struck price). The approved-vs-requested price math lives in the shared
  `approvedVsRequestedOffer` / `dealCustomerPrice` helpers in `lead-deals.ts`,
  not inline. Requested / approved / actual-invoice discounts stay distinct.

### ITEM 4 — highlighted approved / rejected / final-amount chat entries
- `DealConversation` (`src/components/deals/deal-conversation.tsx`) reads both
  `commentsForDeal` and `revisionsForDeal` and builds ONE chronological timeline
  sorted by `createdAt`. Revisions render via `DecisionEntry` with a restrained
  `REV_STYLE` map: **approved → emerald** (strongly highlighted, showing the
  final approved customer price via `dealCustomerPrice`, else the discount),
  **rejected → rose** (strongly highlighted, with the reason), changes_requested
  → restrained indigo, submitted/resubmitted/cancelled → neutral. Ordinary
  comments keep the existing neutral card.
- This is **append-only display** of the existing revision stream — no revision
  is created, overwritten, or mutated. The approved revision already carries
  `approvedDiscount` (DB trigger + local `writeLocalRevision`), so no change to
  `approveDeal` and no migration is needed to surface the final amount in the
  chat. Tones are the restrained emerald/rose families — no neon.

## Standards re-checked
- Status / Temperature / Action / Result stay separate; Action/Result derived +
  read-only (untouched).
- Requested / approved / actual-invoice discounts kept distinct.
- Approval decision server/context-owned + persisted; revisions append-only.
- Permission gating via existing `CAP.deal.*` / `CAP.lead.*` only — no raw role
  checks introduced (grep clean).
- No Supabase migration added (none required; `git status supabase/migrations/`
  clean).
