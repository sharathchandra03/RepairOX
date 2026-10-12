# Deal Comment Shortcut + Unread Dots — Verification Note

Extension of the already-shipped deal-communication feature. Reused the existing
shared `DealConversation` and the existing `useDealConversationSeen` tracker — no
second thread, no second tracker.

## What changed

1. **Last Action comment shortcut** (`src/components/leads/lead-actions-menu.tsx`
   + `src/app/(app)/leads/list/page.tsx`)
   - Added `"comment"` to the `LeadAction` union.
   - `LeadActionsMenu` now accepts presentational props `hasDealConversation` and
     `dealUnread`. It renders a `MessageSquare` chat icon button ONLY when the
     lead has a deal with an existing conversation (deal exists AND
     `commentsForDeal(deal.id).length > 0`); otherwise nothing (no empty slot).
     A small red dot (`bg-rose-500`) sits on the icon when there are unread
     messages. Shown in both the normal and the owner read-only branches (it only
     opens the read-only thread). Matches the eye/pin icon sizing/colour.
   - Clicking fires `onAction("comment", lead)`. The list-page `handleAction`
     `"comment"` case calls `markDealSeen(deal.id)` then
     `router.push(/leads/<id>#deal-conversation)` — opens the FULL-PAGE View Lead
     conversation, never a drawer.

2. **Red unread dot at the START of the LEAD row** (`list/page.tsx`, `case "id"`)
   - A ~8px rose dot renders before the pin + lead number when the lead's deal
     conversation has unread messages for the current user (shared
     `hasUnread(deal, latestIso, latestAuthorId)`). Nothing renders otherwise,
     keeping alignment stable.
   - Same leading dot added in the MOBILE card header (next to the pin + name).

3. **Red unread dot at the START of each DEAL row** — already present from the
   prior commit (`leads/deals/page.tsx`, first cell of the `<motion.tr>`, cleared
   by the existing `markSeen(openId)` effect). Left intact.

4. **`id="deal-conversation"` anchor** added to the View Lead Deal `DetailSection`
   (`src/app/(app)/leads/[id]/page.tsx`). `DetailSection` already applies
   `scroll-mt-28`, so the `#deal-conversation` deep link clears the sticky topbar.
   The View Lead page's existing seen-on-view effect marks the deal seen on mount,
   so the dot clears after reading.

## Single source of truth

- ONE `DealConversation` — `src/components/deals/deal-conversation.tsx` (used by
  the View Lead Deal section and `deal-review-panel.tsx` / Deals drawer).
- ONE unread tracker — `src/hooks/use-deal-conversation-seen.ts`, consumed by
  `leads/list`, `leads/deals`, and `leads/[id]`. Every dot reads from it; every
  open path (Last Action shortcut, Deals drawer open, View Lead deal section)
  calls `markSeen(dealId)`. After reading, all dots for that deal clear for that
  user (the hook's `useState` + localStorage re-render drives it; on return to the
  list the hook re-hydrates from localStorage).

## Not touched

Notification logic, approval/discount logic, revision history, permission keys
(reused `CAP.deal.*`), store-scope/RLS respect, and the internal-only
agent↔approver nature of the thread.

## Commands run (from `/Users/apple/Desktop/Reapirox dummy2/app`)

- `npx tsc --noEmit` → exit 0, no errors (after fixing a `Map`-shadow typing: the
  file shadows JS `Map` with the lucide `Map` icon, so the per-deal latest-comment
  lookup uses a plain record).
- `npm run build` → compiled successfully (all routes built; exit 0).
- Grep invariants:
  - `export function DealConversation` → 1 match (deal-conversation.tsx).
  - `export function useDealConversationSeen` → 1 match (use-deal-conversation-seen.ts).
  - No duplicate thread or tracker created.
