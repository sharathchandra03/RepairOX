# Deal Conversation — Internal communication channel

Adds a two-way INTERNAL approval conversation between the Sales Agent and the Deal approver/manager, with working notifications routed to the *other* party, a single shared `DealConversation` thread component, a View Lead Deal section that embeds that thread inline, and a per-user "new message" unread dot on the Deals queue and the View Lead Deal header. The change is additive and presentation/communication only — no approval logic, discount-value separation, revision history, approver-authority, or permission keys were touched.

Watch for: nothing blocking. The author uses an empty dependency array on `notifyCommentPosted` (confirmed safe — it only closes over module-level constants), and the View Lead Deal `DetailSection` is not individually wrapped in `<Reveal>` (confirmed correct — `DetailSection` wraps its own body in `<Reveal>`).

**Verdict**: APPROVED

## High-level view

The notification path reuses the existing shared `notify()` system rather than introducing a second channel. A new `deal_comment` kind is added to the union, and `addDealComment` now derives direction from the comment's author (agent → approvers, approver → the sales agent), never notifies the author, dedupes on the comment id, and also writes an activity-log entry. Both the DB-insert and localStorage-fallback branches call the same `afterComment` side-effect helper, which resolves the deal from a live ref and silently skips notify/audit if the deal can't be found — the comment is still stored, nothing throws.

The thread UI is consolidated into exactly one shared component, `deal-conversation.tsx`. The old inline thread/composer markup inside `deal-review-panel.tsx` is fully removed and replaced with `<DealConversation deal={deal} />`, positioned below the decision actions/banner and above the Approval History revision list. The composer is gated on `CAP.deal.comment` and the read-only lens; the thread is append-only with internal-only wording.

View Lead renders a `DetailSection accent="amber"` in the left column only when a deal exists and the user holds `CAP.deal.view`, shows a concise summary via `formatDealDiscount`, embeds the same shared conversation inline (not a drawer, no empty band), and honours `viewAsReadOnly`.

The unread signal is a per-user `localStorage` last-seen tracker (`use-deal-conversation-seen.ts`) with `markSeen`/`hasUnread`. It flags unread only when the latest comment is newer than last-seen and authored by someone other than the current user; opening the deal (queue drawer or View Lead section) marks it seen. No new DB table.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking issues identified.

</details>

<details>
<summary>Details</summary>

### 1. Notification routing in `addDealComment` (CORE)

`notifyCommentPosted(deal, comment)` derives `authorIsAgent` from `authorId === deal.salesAgentId || authorId === deal.createdBy`. Agent-authored comments notify every role in `APPROVER_ROLES` (the same targeting as the existing `notifyApprovers`); approver-authored comments notify `deal.salesAgentId` (the same targeting as `notifyAgent`), with an explicit self-skip (`if (!deal.salesAgentId || deal.salesAgentId === authorId) return;`). The author is never notified of their own message. `dedupeKey` is `deal_comment:<comment.id>:<role>` for the approver fan-out and `deal_comment:<comment.id>` for the agent — one comment yields one notification per recipient, and the shared `notify()` idempotency guard enforces it. `afterComment` also calls `logActivity` with a "Deal Comment" action. Confirmed by reading the diff plus `lead-deals-context.tsx` (APPROVER_ROLES @42, notify/logActivity imports @29-30, refs @134-140). **confirmed, non-blocking (satisfied).**

Both branches are covered: the DB branch stores via `setComments` then calls `afterComment` (with an author fallback to `meIdRef`/`meNameRef` in case the row didn't echo them); the localStorage branch stores + writes LS then calls `afterComment`. `afterComment` looks the deal up in `dealsRef.current` and returns early when not found — the comment is already persisted at that point, so an unresolved deal just skips notify/audit without throwing. **confirmed, non-blocking (satisfied).**

### 2. `deal_comment` kind (notifications.ts)

Added to the `NotificationKind` union directly below the other deal kinds. The `notify()` signature already supports `recipientRole`, `recipientId`, `reference`, and `dedupeKey`, so no second system was introduced. **confirmed, non-blocking (satisfied).**

### 3. Single conversation implementation + placement

`deal-conversation.tsx` is the only thread implementation. grep for `Approval Conversation`, `No comments yet`, `newComment`, `postComment`, `commentsForDeal`, `addDealComment` in `deal-review-panel.tsx` returns nothing — the old inline markup is gone. `deal-review-panel.tsx` now renders `<DealConversation deal={deal} />` at line 305, after the decision blocks (`isDecider` @179, `isSelfBlocked` @296) and before the Approval History (@308). `Textarea`/`Label`/`fmt` remain used by the decision composer (no dead imports), which also confirms the decision logic was left intact. **confirmed, non-blocking (satisfied).**

### 4. Permission gating + append-only + internal wording

`DealConversation` computes `canComment = allow(can, CAP.deal.comment) && !readOnly`, so a view-tier or read-only (owner "view as agent") user sees the thread but no composer. The thread only maps comments and calls `addDealComment` — no delete/edit path. Wording is internal ("Deal Conversation", "Message the approver / agent…", "Discuss this discount request with the approver here") with no customer-facing language. **confirmed, non-blocking (satisfied).**

### 5. View Lead Deal section

`src/app/(app)/leads/[id]/page.tsx`: `const deal = lead ? currentDeal(lead.id) : null` (@212). The `DetailSection accent="amber"` renders only under `{deal && allow(can, CAP.deal.view) && ...}` in the left column — no empty band when there is no deal. Summary fields reuse `formatDealDiscount` for requested/approved discount and `DEAL_STATUS_LABEL`/`dealStatusTone` for status. The shared `DealConversation` is embedded inline under a divider (never a drawer) with `readOnly={viewAsReadOnly}`. Reveal is satisfied because `DetailSection` wraps its body in `<Reveal>` internally (`detail-page.tsx` @75), so an extra wrapper would double-animate — the author correctly relies on the built-in. The thread is shown once (no double thread). **confirmed, non-blocking (satisfied).**

### 6. Unread signal

`use-deal-conversation-seen.ts` is a per-user `localStorage` tracker keyed `repairox-deal-conversation-seen::<userId>`, mirroring the existing `use-lead-kanban`/`use-frozen-columns` pattern — no new DB table. `hasUnread` returns false when the latest author is the current user, true when never opened, otherwise compares timestamps. The Deals queue row renders a subtle amber dot next to `d.dealNo` using the latest comment per deal (`latestCommentByDeal` memo over `comments`), and opening the review drawer (`openId`) calls `markSeen`. View Lead shows a "New message" indicator in the section header and marks seen in an effect keyed on `dealId` + latest comment id. **confirmed, non-blocking (satisfied).**

### 7. No altered approval/decision/discount/authority logic, no new keys

The decision handlers, discount converters, `canDecideDeal`/self-block logic, and revision history in `deal-review-panel.tsx` are untouched (only the inline thread was extracted). `CAP.deal.comment` and `CAP.deal.view` already existed in `capabilities.ts` (comment @298, view @290) — no new permission keys invented. **confirmed, non-blocking (satisfied).**

### 8. Recorded verification evidence

The commit message for `4a0e17c` records, run in `app/`: `npx tsc --noEmit -> exit 0 (no errors)` and `npm run build -> Compiled successfully, exit 0`. Per instructions I did not re-run the suites; the spot checks above (dead-import check on the extracted file, context-value exports, CAP keys) are consistent with a clean type-check. **confirmed, non-blocking (satisfied).**

</details>

<details>
<summary>File map</summary>

- `src/lib/notifications.ts` — adds `deal_comment` to the `NotificationKind` union.
- `src/lib/lead-deals-context.tsx` — `notifyCommentPosted` + `afterComment` side effects; `addDealComment` notifies the other party + logs activity in both branches.
- `src/components/deals/deal-conversation.tsx` (new) — the single shared thread + composer, gated by `CAP.deal.comment` + read-only lens, append-only, internal wording.
- `src/components/deals/deal-review-panel.tsx` — removes inline thread; renders `<DealConversation>` below decisions, above Approval History.
- `src/app/(app)/leads/[id]/page.tsx` — View Lead Deal `DetailSection` embeds the conversation inline + unread indicator.
- `src/hooks/use-deal-conversation-seen.ts` (new) — per-user localStorage last-seen tracker.
- `src/app/(app)/leads/deals/page.tsx` — unread dot per queue row; mark seen on open.

Full diff: `git show 4a0e17c` (in `app/`).

</details>
