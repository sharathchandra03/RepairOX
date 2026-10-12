# In-place deal chat popover + unread-count badges + soft-red row dots

The change turns the Last Action deal-conversation shortcut into an in-place chat popover (no navigation to View Lead), adds a matching comment shortcut to the Deals queue Quick Actions, replaces the previous bright-red / amber row markers with one soft-red (rose-400) unread dot shared by both surfaces, and makes the per-user "seen" tracker reactive so marking a deal seen on any surface clears every dot and count badge instantly. It touches six files and reuses the single `DealConversation` thread and single `useDealConversationSeen` tracker throughout — no forked thread UI, no second tracker.

Watch for: the chat-icon count **badge** uses `bg-rose-500` while the row **dots** use `bg-rose-400` (confirmed). This is a deliberate, defensible split (a number pill needs stronger contrast than a presence dot) and the spec's "one soft-red value" rule applies to the row dots, which are consistent — non-blocking.

**Verdict**: APPROVED

## High-level view

The in-place popover is a new shared component (`deal-conversation-popover.tsx`) that is portalled to `document.body`, positioned from the trigger's live `getBoundingClientRect`, flips above when there's no room below, closes on Esc and outside-click, and renders the one `DealConversation` as its body via new `compact` / `threadMaxHeight` props. Both the Lead Table comment action and the Deals Quick Actions comment button open this same popover; neither does a `router.push`.

Unread tracking is now a module-level reactive store inside `use-deal-conversation-seen.ts`: a version counter plus `useSyncExternalStore`, with an in-memory cache mirrored to per-user localStorage. `markSeen` bumps the version, so every mounted consumer (lead rows, deal rows, both chat icons) re-renders and clears without refresh or navigation. The hook gained an `unreadCount(deal, comments)` that counts only comments newer than last-seen and not authored by the current user; `hasUnread` is preserved.

The row dots on both the Lead Table (desktop + mobile) and the Deals queue use the identical `bg-rose-400 ring-2 ring-rose-100` soft-red, shown only when `unreadCount > 0`, replacing the earlier bright red (leads) and amber (deals). The chat icons carry a numeric unread pill that disappears at 0 and shows `9+` past nine.

The deal data contracts are untouched: `LeadDealComment` already carries `dealId` / `authorId` / `createdAt`, so the new counting path type-checks against real fields; approval, discount, revision, and notification logic are not modified, and `CAP.deal.view` / `CAP.deal.comment` gating is reused as-is.

<details>
<summary>Issues (1)</summary>

1. **Badge vs dot shade** — count badges use `bg-rose-500`, row dots use `bg-rose-400`. Intentional contrast split; the spec's single-soft-red rule targets the dots, which are consistent. No action required.

</details>

<details>
<summary>Details</summary>

### Requirement 1 — Last Action shortcut opens an in-place popover (no navigation)

Confirmed. `lead-actions-menu.tsx` renders `DealConversationButton` only when `hasDealConversation` is true, and its click calls `onAction("comment", lead, e.currentTarget)` — forwarding the trigger element, never a route. The list page's `handleAction` `case "comment"` resolves the lead's deal, calls `markDealSeen(info.dealId)`, and sets `dealChat` with `anchor.getBoundingClientRect()`; there is no `router.push` on that path. The popover is rendered at the bottom of the page via `DealConversationPopover` with `anchorRect={dealChat.rect}` and `onClose={() => setDealChat(null)}`.

`deal-conversation-popover.tsx` portals to `document.body` (`createPortal`), positions from the anchor rect with viewport clamping and a drop-up flip, closes on Esc (keydown listener) and outside-click (a `fixed inset-0` shield that stops propagation then calls `onClose`). Its body is `<DealConversation deal={deal} readOnly={readOnly} heading={false} compact threadMaxHeight={300} />` — the one shared thread, not a fork. `markSeen` is called by the opener, matching the spec ("opening is the caller's cue to markSeen").

The chat icon shows a count badge only when `unreadCount > 0` (`hasUnread = unreadCount > 0`), rendering `{unreadCount > 9 ? "9+" : unreadCount}`; at 0 there is no badge. The icon itself renders only when `hasDealConversation` (the list derives `hasConvo` as `dealComments.length > 0`), so it appears only for a lead whose deal has ≥1 comment.

### Requirement 2 — Lead row soft-red dot

Confirmed. Both the desktop ID cell (`page.tsx:1595`) and the mobile card (`page.tsx:2268`) render `className="h-2 w-2 shrink-0 rounded-full bg-rose-400 ring-2 ring-rose-100"`, gated on `(dealConvoByLead[lead.id]?.unread ?? 0) > 0`. 8px (`h-2 w-2`), soft rose-400, per-user unread only, replacing the former bright red. One value, two render sites, identical.

### Requirement 3 — Deal row soft-red dot

Confirmed. `deals/page.tsx:473` renders the same `bg-rose-400 ring-2 ring-rose-100` dot gated on `unreadCount(d, commentsByDeal.get(d.id) ?? []) > 0`, replacing the previous amber marker. It clears reactively because `unreadCount` reads the reactive tracker and the row re-renders when `markSeen` bumps the version.

### Requirement 4 — Deals Quick Actions comment button

Confirmed. `DealQuickActions` renders a comment `<button>` whose `onComment(e.currentTarget)` (wired in the row) calls `markSeen(d.id)` and sets `chatDeal` with the anchor rect, opening the SAME `DealConversationPopover`/`DealConversation`. It carries the unread count pill (`bg-rose-500`, `9+` cap) shown only when `unread > 0`.

### Requirement 5 — One source of truth, reactive

Confirmed by grep: exactly one `export function DealConversation` (`deal-conversation.tsx`), one `DealConversationPopover`, one `useDealConversationSeen`, and `addDealComment` appears only in the shared component and its context source. `DealConversation` is reused by View Lead (`leads/[id]/page.tsx`), the review panel, and the popover.

Reactivity: `use-deal-conversation-seen.ts` holds a module-level `version` counter, a `listeners` set, and a `cache` map; `writeSeen` persists and calls `emit()` which increments the version and notifies all listeners. Each hook instance subscribes via `useSyncExternalStore(subscribe, getVersion, getVersion)`, so `markSeen` on any surface re-renders every consumer and clears dots/badges with no refresh or navigation. `unreadCount` skips comments from other deals (defensive `dealId` check), skips the current user's own messages (`authorId === userId`), and counts those newer than last-seen; `hasUnread` is preserved and treats "never opened" as unread.

### Constraints

No approval/discount/revision/notification logic changed — the diff is confined to presentation (dots, badges, popover) plus the tracker's reactivity and one count helper. `CAP.deal.comment` / read-only lens gating is unchanged inside `DealConversation`; the popover forwards `readOnly={viewAsReadOnly}`. The data-grid structure is intact: deal rows keep `h-[68px]`, `border-t border-zinc-500`, `py-4` cells; the lead-table dot sits inside the existing ID button without altering column widths or the colgroup. The popover is portalled, so the grid `overflow` cannot clip it. The thread stays internal agent↔approver and append-only (unchanged `DealConversation`/context).

### Verification evidence

The task required the coder to run the checks and record results rather than the reviewer re-running them. The commit message for `f344b9e` records: `npx tsc --noEmit (exit 0)` and `npm run build (Compiled successfully)`, both from `app/`, plus a grep confirmation of one `DealConversation` + one tracker. Narrow corroboration performed here: grep confirms single definitions and single `addDealComment` site; `LeadDealComment` exposes `dealId`/`authorId`/`createdAt` so `unreadCount`'s signature type-checks against real fields; the deals context exposes `dealById`, `comments`, `commentsForDeal`, `addDealComment` used by the new paths. No full rebuild was run, per instructions.

</details>

<details>
<summary>File map</summary>

- `src/components/deals/deal-conversation-popover.tsx` — new portalled in-place chat popover reusing `DealConversation`.
- `src/components/deals/deal-conversation.tsx` — added `compact` / `threadMaxHeight` props (one thread, no fork).
- `src/hooks/use-deal-conversation-seen.ts` — reactive module store + `unreadCount`; `hasUnread` preserved.
- `src/components/leads/lead-actions-menu.tsx` — comment button opens popover; count badge; shown only with a deal conversation.
- `src/app/(app)/leads/list/page.tsx` — `dealConvoByLead` memo, `comment` action, soft-red dots (desktop + mobile), popover render.
- `src/app/(app)/leads/deals/page.tsx` — soft-red deal-row dot, Quick Actions comment button + count badge, popover render.

Full diff: `git show f344b9e`.

</details>
