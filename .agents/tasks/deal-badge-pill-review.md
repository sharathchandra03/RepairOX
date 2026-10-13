# Reactive deal-unread badge + stabilized Lead Stage pill layout

The change fixes two Lead Table defects in one commit (`a5d51fd`). First, the deal-comment unread badge on a Lead Table row did not clear when the conversation was opened in-place, because the per-row count lives in a `useMemo` (`dealConvoByLead`) whose dependencies never changed on `markSeen` — the shared tracker re-rendered the component, but the memo returned its cached stale count. The fix exposes the tracker's existing `useSyncExternalStore` version as `seenVersion` and adds it to the memo deps, so the count recomputes live. Second, the Lead Stage status cell reserved a fixed `min-h-[42px]` on every row to hold an optional "Deal → …" caption, which pushed the pill up relative to the caption-less Action/Result pill cells; the fix drops the reserved height and positions the caption absolutely below the pill.

Watch for: nothing blocking. The unread rule is untouched (confirmed), the single shared tracker is preserved (confirmed), the user-id key matches across all three surfaces (confirmed), and the change is scoped to exactly the two files plus the evidence doc (confirmed). The build/type evidence was recorded by the coder (tsc exit 0, next build exit 0) and is accepted per instruction.

**Verdict**: APPROVED

## High-level view

Issue 1 is solved at the right layer. The root cause is a classic memo-staleness bug: `useSyncExternalStore` re-renders the consumer on `markSeen`, but a `useMemo` guarding the count had no dependency that moved, so it never recomputed. Rather than tearing the memo out or duplicating the count inline, the fix threads the store's version counter (already maintained for the subscription) out as `seenVersion` and lists it in the memo deps. This is the minimal reactive fix and it keeps the one-tracker design intact.

The unread counting rule is genuinely unchanged. `unreadCount` still skips comments authored by the current user and counts only those with `createdAt` after the per-deal last-seen timestamp — the "someone else's newer message" semantics are verbatim what they were. The `seenVersion` addition is purely additive to the returned object and the interface; the two other consumers (Deals page, View Lead) destructure only the fields they use and are unaffected.

The user-id key is consistent. All three surfaces key the tracker on the same `currentUser.id` value (Lead Table and Deals via `usePermissions().currentUser?.id`, View Lead via `useSession().id`, which returns `currentUser.id`), so a mark-seen on one surface clears the badge on the others.

Issue 2 is a layout-parity fix. The Action and Result cells render a bare `h-7` pill directly into a vertically-centered `td`. The status cell previously wrapped its pill in a `min-h-[42px]` flex column so a caption could grow downward, but that reserved height made the status cell taller than its siblings and shifted the pill's Y. The new wrapper (`relative min-w-0`) has no intrinsic height beyond the pill, matching the sibling cells exactly; the caption is taken out of flow (`absolute … top-full`) so it renders below the pill without resizing the cell or shifting neighbouring columns. The shared `LeadSelectCell` pill and the `text-[10px] text-muted-foreground` caption style are unchanged, and `truncate` + `title` are kept.

<details>
<summary>Issues (1)</summary>

1. **Anonymous-user storage-key divergence (non-blocking, pre-existing, out of scope)** — Deals page passes `currentUser?.id || ""` while Lead Table/View Lead pass `currentUser?.id` (`undefined` when absent). Because `storageKeyFor` uses `userId ?? "anon"`, an empty string resolves to the `""` key while `undefined` resolves to `"anon"` — a theoretical mismatch only for a never-signed-in user, who has no deals to track. Not introduced by this change; no action required for this fix.

</details>

<details>
<summary>Details</summary>

### Issue 1 — reactive badge clear via `seenVersion`

The tracker (`use-deal-conversation-seen.ts`) is a module-level store with a `version` counter, a listener set, and an in-memory cache mirrored to localStorage. `markSeen → writeSeen → emit()` bumps `version` and notifies subscribers. The hook subscribes with `useSyncExternalStore(subscribe, getVersion, getVersion)`.

Before the fix, that subscription re-rendered the Lead Table on every `markSeen`, but the per-row count was computed in `dealConvoByLead` with deps `[leads, deals, comments, dealUnreadCount]` — none of which change on a mark-seen (the `dealUnreadCount` callback identity is stable, deps `[key, userId]`). So the memo kept returning the stale count and the badge stayed lit until something else invalidated it.

The fix captures the subscription's snapshot into `const seenVersion` and returns it (interface extended with `seenVersion: number`). The Lead Table destructures it as `dealSeenVersion` and adds it to the memo deps. On `markSeen`, `version` bumps → the snapshot changes → the component re-renders → the memo sees a new `dealSeenVersion` → it recomputes → `dealUnreadCount(deal, dealComments)` reads the fresh last-seen and returns 0 for the just-opened deal → `LeadActionsMenu` receives `dealUnreadCount={0}`.

The `'comment'` action handler (line ~1386) calls `markDealSeen(info.dealId)` before opening the in-place popover, so the badge clears on the same interaction, no navigation or refresh.

The counting rule in `unreadCount` is identical to before: it continues to skip the user's own comments (`c.authorId === userId`) and count only comments with `createdAt` after `lastSeen`. The "someone else's newer message" rule is intact and not weakened. `hasUnread` is likewise unchanged. Only one tracker exists; no second read-marker was introduced. The Deals page (`{ markSeen, unreadCount }`) and View Lead (`{ markSeen, hasUnread }`) ignore the new field and are behaviorally unchanged — and because they compute their counts inline during render, they never had the staleness bug.

### Issue 2 — pill position parity with/without the lineage caption

`ActionCell` renders a bare pill (`<span className="flex h-7 w-full … rounded-full …">`) straight into the cell; `ResultCell` and the `LeadSelectCell` status pill follow the same intrinsic-height pill shape. The `td` is vertically centered.

Previously the status cell wrapped its pill in `flex min-h-[42px] min-w-0 flex-col items-stretch justify-start`. The reserved 42px floor made the status cell taller than the sibling pill cells, so vertical centering placed the status pill higher than the Action/Result pills — visible even on rows with no caption.

The new wrapper is `relative min-w-0`: no reserved height, so a caption-less status cell is exactly the pill's height, matching Action/Result. The caption becomes `absolute left-0 right-0 top-full mt-0.5 …`, taking it out of normal flow so it sits directly below the pill (`top-full`) without adding to the cell's measured height, without moving the pill's Y, and without widening/pushing neighbouring columns — all inside the `h-[68px]` row. The `showDealLineage` guard (`wf.dealLineage === "approved" && !statusLower.includes("deal")`) is unchanged. The caption's class is unchanged except for the positioning utilities; `truncate` and the `title={`Deal → ${stageLabel}`}` tooltip are preserved. The shared `LeadSelectCell` pill got no new look.

One minor note (not a defect): an absolutely-positioned caption overlaps the pill in the row below only if the caption's text exceeds the gap under the pill within the 68px row. Given a single `text-[10px]` truncated line sitting ~2px below an `h-7` pill inside a 68px row, there is ample vertical room, so no overlap is expected. This matches the behavior the Action/Result columns already have (bare pills with vertical slack).

### Scope and type safety

The commit touches exactly three files: the hook (additive `seenVersion`), the Lead Table page (one destructure + one memo dep + the status-cell wrapper/caption swap), and the evidence doc. No other columns (`action`, `result`, `storeCol`, etc.) are modified. The `LeadActionsMenu` wiring (`hasDealConversation`, `dealUnreadCount`) is unchanged.

Type safety: the new `seenVersion: number` is declared on the `DealConversationSeen` interface and returned; the Lead Table's added memo dep is a `number`. Per instruction, I did not re-run `npx tsc --noEmit` or `npm run build`; the coder's evidence (`deal-badge-pill-verification.md`) records both at exit 0, which I accept as the type/build gate.

</details>

<details>
<summary>Files changed</summary>

- `src/hooks/use-deal-conversation-seen.ts` — captured the existing `useSyncExternalStore` snapshot into `seenVersion`; added it to the `DealConversationSeen` interface and the returned object (additive).
- `src/app/(app)/leads/list/page.tsx` — destructured `seenVersion` as `dealSeenVersion` and added it to the `dealConvoByLead` memo deps (Issue 1); replaced the status-cell `min-h-[42px]` flex wrapper with `relative min-w-0` and made the lineage caption `absolute … top-full` (Issue 2).
- `.agents/tasks/deal-badge-pill-verification.md` — coder's verification/evidence doc (tsc + build at exit 0).

Full diff: `git show a5d51fd`.

</details>
