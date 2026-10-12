# Deal-conversation comment shortcut + unread dots

This change extends the already-shipped internal deal-conversation feature with three read-signals: a chat-icon shortcut in the Lead Table Last Action cell, a red unread dot at the start of each Lead row (desktop + mobile), and the (pre-existing) unread dot on each Deal row. All three read from the ONE shared `useDealConversationSeen` tracker and clear via `markSeen` after the conversation is opened. The feature was genuinely extended, not rebuilt — exactly one `DealConversation` component and one unread tracker remain.

Watch for: (likely) the Lead Table's `dealConvoByLead` memo does not recompute purely on a `markSeen` call because the `hasUnread` callback identity is stable; this is masked today because the only list-page `markSeen` path (`handleAction("comment")`) navigates away immediately, so the stale memo is never user-observable. The Deals-page dot and the View Lead section do clear reactively. (possible) the Deal-row dot is amber (`bg-amber-500`) while the Lead-row dots are rose — a pre-existing semantic choice left intact, not introduced here.

**Verdict**: APPROVED

## High-level view

The shortcut lives in `LeadActionsMenu` as a presentational `MessageSquare` button that renders only when the list page passes `hasDealConversation`. The list page computes that per lead in a `dealConvoByLead` memo: for each lead with a current deal it resolves the deal id, whether any comment exists, and whether the latest comment is unread for the current user via the shared `hasUnread` rule. Clicking fires `onAction("comment", lead)`, which marks the deal seen and routes to the full-page `/leads/<id>#deal-conversation` — never a drawer.

Unread dots are driven entirely off that same `dealConvoByLead` signal: a rose dot before the pin/lead-number in the desktop `case "id"` cell and in the mobile card header. The Deal-queue page keeps its own inline `hasUnread` dot (from the prior commit) and clears it with a `markSeen(openId)` effect when the review drawer opens. The View Lead page marks the deal seen on mount and renders the conversation inline inside an `id="deal-conversation"` `DetailSection` (which carries `scroll-mt-28`), so the deep link lands below the sticky topbar and the dot clears.

Single source of truth holds: one `DealConversation`, one tracker, three consumers, every open path calling `markSeen`. No permission, notification, approval, discount, or revision logic was touched; the thread stays internal and gated by the existing `CAP.deal.*` keys.

<details>
<summary>Issues (2)</summary>

1. **List-page memo not reactive to `markSeen`** — `dealConvoByLead` depends on `[leads, deals, comments, dealHasUnread]`, and `dealHasUnread` keeps a stable identity across `markSeen` (it reads `seenRef.current`, not state). The list dots therefore won't clear in-place from a `markSeen` alone. Non-blocking because the comment shortcut navigates away and the page re-hydrates on return; worth a comment or a `seen`-derived dep if a future in-page mark-seen is added.
2. **Deal-row dot colour differs** — Deal rows use `bg-amber-500`, Lead rows use `bg-rose-500`. Pre-existing (prior commit) and matches the Deal section's amber accent; left intact per the task. Cosmetic only.

</details>

<details>
<summary>Details</summary>

### Shortcut button is correctly conditional and presentational

`LeadActionsMenu` gained two presentational props, `hasDealConversation` and `dealUnread`, and a nested `DealConversationButton`. The button renders only when `hasDealConversation` is true, in both the normal and the owner read-only branches (the read-only branch only navigates/reads, which is correct — the thread's own composer is gated by `CAP.deal.comment` inside `DealConversation`). No empty slot is ever rendered: the `{hasDealConversation && <DealConversationButton .../>}` guard collapses to nothing. `"comment"` was added to the `LeadAction` union, and the icon matches the eye/pin sizing (`h-7 w-7`, `h-3.5 w-3.5` glyph).

The "has a deal with an existing conversation" rule is enforced on the list side: `dealConvoByLead[lead.id].hasConvo` is `!!latest` where `latest` is the newest comment for the lead's current deal. So the icon appears only when a deal exists AND it has at least one comment — matching the requirement exactly.

### Open path marks seen then navigates full-page

`handleAction`'s `"comment"` case reads `dealConvoByLead[lead.id]`, calls `markDealSeen(info.dealId)`, then `router.push(/leads/<id>#deal-conversation)`. This is a full-page navigation, not a drawer, and it clears the marker before leaving. The `#deal-conversation` target is the `DetailSection id="deal-conversation"` on the View Lead page, which is gated by `CAP.deal.view` and only renders when a deal exists; `DetailSection` applies `scroll-mt-28` so the anchor clears the sticky topbar. (The task spec named `scroll-mt-24`; `scroll-mt-28` is a larger offset and satisfies the same intent.)

### Dot reactivity, by surface

The unread rule is centralised in `useDealConversationSeen.hasUnread(deal, latestIso, latestAuthorId)`: unseen-ever or latest-comment-newer-than-last-seen, and never the user's own last message. `markSeen` writes `dealId → now` to per-user localStorage and updates `seen` state.

- **Deals page** — the dot is computed inline in the row render (`hasUnread(d, latest?.createdAt, latest?.authorId)`), not memoised. When `markSeen(openId)` fires on drawer open, the state update re-renders and the inline call reads the freshly-updated `seenRef`, so the dot clears reactively. Correct.
- **View Lead** — a `useEffect` marks the deal seen on `dealId` / latest-comment change, and the section's "New message" badge reads `hasUnread` on each render. Correct.
- **Lead Table** — the dots read `dealConvoByLead`, a `useMemo` keyed on `[leads, deals, comments, dealHasUnread]`. `dealHasUnread` does not change identity when `markSeen` runs (it closes over `userId` only and reads `seenRef.current`), so the memo does not recompute on a bare `markSeen`. In the current wiring this is invisible: the sole list-page mark-seen is the comment shortcut, which immediately `router.push`es away, and the component re-hydrates `seen` from localStorage on remount. The memo still recomputes correctly when `comments` change (new message arrives). This is the one spot where "tracker state drives a re-render" is only indirectly true on the list; acceptable as-is but noted.

### Single source of truth confirmed

`grep` shows exactly one `export function DealConversation` (`deal-conversation.tsx`) and one `export function useDealConversationSeen` (`use-deal-conversation-seen.ts`), consumed by `leads/list`, `leads/deals`, and `leads/[id]`. No duplicate thread or tracker was created. `deal-conversation.tsx` was not modified by this task (last touched in the prior conversation commit) and keeps its `CAP.deal.comment` gate and append-only nature.

### No logic/permission regressions

No new permission keys: `deals_comment` already existed in `permissions.ts` from the prior feature, and the shortcut/dots use no capability of their own beyond the thread's existing `CAP.deal.*`. Notification, approval, discount, and revision code are untouched. Store-scope/RLS is unaffected — the dots derive from the already-scoped `deals`/`comments` from `useDeals()`.

### Table / design-system standards intact

No new column was added — the chat icon lives inside the existing right-anchored actions cell, and the `"comment"` entry in the column list / `LEFT_COLS` / `LEFT_HEADERS` is the pre-existing left-aligned text Comment column, unchanged. Deal rows keep `h-[68px]`, `border-t border-zinc-500`, and the colgroup widths. The dots are subtle (`h-2 w-2` / `h-1.5 w-1.5`, `shrink-0`) and don't disturb alignment since they only render when unread. Frozen/sticky behaviour is untouched.

### Verification evidence

The coder's note records `npx tsc --noEmit` → exit 0 and `npm run build` → compiled successfully, plus the grep invariants above. The note also explains the `Map`-shadow avoidance (lucide `Map` icon is imported in the list page, so the new per-deal lookups use plain `Record` objects rather than `new Map()`); the code matches this (`Record<string, ...>` in both `workflowByLead` and `dealConvoByLead`, lucide `Map` imported at line 9, no `new Map` collision). Evidence is present and credible; the suites were not re-run per instruction.

</details>

<details>
<summary>File map</summary>

- `src/components/leads/lead-actions-menu.tsx` — added `"comment"` to `LeadAction`; new presentational `DealConversationButton` + `hasDealConversation`/`dealUnread` props; icon shown in normal + read-only branches.
- `src/app/(app)/leads/list/page.tsx` — `useDealConversationSeen` consumer; `dealConvoByLead` memo; rose unread dot in `case "id"` and the mobile card; `handleAction("comment")` marks seen + routes to `/leads/<id>#deal-conversation`; wires props into desktop + mobile `LeadActionsMenu`.
- `src/app/(app)/leads/[id]/page.tsx` — `id="deal-conversation"` on the Deal `DetailSection`; marks the deal seen on mount; inline `DealConversation` + "New message" badge.
- `src/app/(app)/leads/deals/page.tsx` — unread dot + `markSeen(openId)` effect are pre-existing (prior commit) and left intact; the uncommitted column-reorder here is a separate workstream, not part of this task's feature.
- `src/hooks/use-deal-conversation-seen.ts` / `src/components/deals/deal-conversation.tsx` — unchanged by this task; remain the single tracker / single component.

Full diff: `git show ce96d3d` plus the uncommitted list-page/View-Lead edits for this feature.

</details>
