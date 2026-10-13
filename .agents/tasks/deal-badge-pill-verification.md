# Verification — Deal comment unread badge + Lead Stage pill lineage caption

Iteration: FIRST (no `deal-badge-pill-review.json` present). Implemented from
scratch per `deal-badge-pill-plan.md`.

## Commands run (from `/Users/apple/Desktop/Reapirox dummy2/app`)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Exit 0 — no errors |
| `npm run build` (= `next build`) | Exit 0 — `✓ Compiled successfully`, full route table printed |

No stale `.next` cache issue recurred, so no `rm -rf .next` was needed.

---

## Issue 1 — Deal comment unread badge not clearing on open from the Lead Table

### Root cause (confirmed)
The Lead Table badge count comes from the `dealConvoByLead` useMemo in
`src/app/(app)/leads/list/page.tsx` (deps were
`[leads, deals, comments, dealUnreadCount]`). When the user opens the deal
conversation popover from a Lead Table row, the `'comment'` action handler calls
`markDealSeen(info.dealId)`. In the shared hook
(`src/hooks/use-deal-conversation-seen.ts`), `markSeen → writeSeen → emit()`
bumps a module-level `version` counter and the `useSyncExternalStore`
subscription re-renders the component — BUT none of the memo deps change:
`leads` / `deals` / `comments` are unchanged, and the `dealUnreadCount`
useCallback identity is stable (deps `[key, userId]`). So the memo returned its
cached value and the badge kept the stale `unread` count.

The Deals page did not have the bug because it calls `unreadCount(...)` INLINE
during render, so the version-bump re-render recomputed it live.

### Fix (version-dep approach — the plan's preferred minimal option)
- `src/hooks/use-deal-conversation-seen.ts`:
  - Captured the `useSyncExternalStore(subscribe, getVersion, getVersion)`
    return into a const `seenVersion`.
  - Added `seenVersion: number` to the `DealConversationSeen` interface and to
    the returned object. This is purely additive and backward-compatible — the
    counting rule in `unreadCount` is UNTOUCHED.
- `src/app/(app)/leads/list/page.tsx`:
  - Destructured `seenVersion: dealSeenVersion` from the hook.
  - Added `dealSeenVersion` to the `dealConvoByLead` memo deps:
    `[leads, deals, comments, dealUnreadCount, dealSeenVersion]`.

### Code trace — opening from the Lead Table now clears the badge reactively
1. User clicks the chat/comment shortcut on a Lead Table row → the `'comment'`
   action handler calls `markDealSeen(info.dealId)`.
2. `markSeen → writeSeen(key, { ...prev, [dealId]: now })` updates the in-memory
   cache and localStorage, then `emit()` increments the module `version` and
   notifies subscribers.
3. The hook instance in the Lead Table is subscribed via
   `useSyncExternalStore`; its snapshot (`seenVersion`) changes from the bump,
   re-rendering `LeadsListPage` AND yielding a new `dealSeenVersion` value.
4. Because `dealSeenVersion` is now a dependency of `dealConvoByLead`, the memo
   recomputes: `dealUnreadCount(deal, dealComments)` reads the fresh last-seen
   timestamp from the shared tracker and returns 0 (the just-seen comments are
   no longer newer than last-seen) → `LeadActionsMenu` receives
   `dealUnreadCount={0}` and the red badge clears immediately, no refresh.

### Rule and other surfaces unchanged
- The "someone else's newer message" rule is preserved verbatim: `unreadCount`
  still skips comments authored by `userId` and counts only those with
  `createdAt > lastSeen`. No logic change.
- ONE shared tracker preserved — no second read-marker introduced.
- Deals page (`{ markSeen, unreadCount }`) and View Lead
  (`{ markSeen, hasUnread }`) destructure only the fields they use; the added
  `seenVersion` is ignored by both — no behavior change.
- User-id key verified identical across all three surfaces (no divergence to
  align): Lead Table `usePermissions().currentUser?.id`; Deals page
  `usePermissions().currentUser?.id || ""` (`meId`); View Lead
  `useSession().id`, which resolves from `usePermissions().currentUser?.id`.

---

## Issue 2 — Deal lineage caption disturbed the Lead Stage pill layout

The forced `min-h-[42px]` on the status-cell wrapper reserved sub-label height
on EVERY status cell, so on pill-only rows the vertically-centered TD pushed the
pill up relative to the bare-pill `action`/`result` cells.

### Fix (status column case only, `src/app/(app)/leads/list/page.tsx`)
Removed the reserved height and made the caption absolutely positioned below the
pill so a caption-less cell is exactly the pill (identical intrinsic height to
the Action/Result pill cells), and a cell WITH the caption keeps the pill at the
same Y while the caption flows below without changing cell height or pushing
neighbouring columns — within the `h-[68px]` row rhythm.

Before:
```tsx
<div className="flex min-h-[42px] min-w-0 flex-col items-stretch justify-start">
  <LeadSelectCell ... />
  {showDealLineage && (
    <p className="mt-0.5 w-full min-w-0 truncate px-0.5 text-[10px] font-medium text-muted-foreground"
       title={`Deal → ${stageLabel}`}>
      Deal → {stageLabel}
    </p>
  )}
</div>
```

After:
```tsx
<div className="relative min-w-0">
  <LeadSelectCell ... />
  {showDealLineage && (
    <p className="absolute left-0 right-0 top-full mt-0.5 w-full min-w-0 truncate px-0.5 text-[10px] font-medium text-muted-foreground"
       title={`Deal → ${stageLabel}`}>
      Deal → {stageLabel}
    </p>
  )}
</div>
```

- Shared `LeadSelectCell` pill unchanged (no new pill look).
- Caption class unchanged (`text-[10px] font-medium text-muted-foreground`),
  plus `absolute left-0 right-0 top-full` to sit directly below without
  reserving height; `truncate` + `title` tooltip preserved.
- `showDealLineage` guard unchanged
  (`wf.dealLineage === "approved" && !statusLower.includes("deal")`).
- No change to `action`, `result`, `storeCol`, or any other column.

---

## Files changed
1. `src/hooks/use-deal-conversation-seen.ts` — added `seenVersion` to the
   `DealConversationSeen` interface and the returned object (captured the
   existing `useSyncExternalStore` snapshot).
2. `src/app/(app)/leads/list/page.tsx` — destructured `seenVersion` as
   `dealSeenVersion` and added it to the `dealConvoByLead` memo deps (Issue 1);
   replaced the status-cell `min-h-[42px]` flex wrapper with a `relative`
   wrapper and an absolutely-positioned lineage caption (Issue 2).
