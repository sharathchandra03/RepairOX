# Implementation Plan — Deal comment unread badge + Lead Stage pill lineage caption

Two scoped Lead Table fixes. Both live in
`src/app/(app)/leads/list/page.tsx`. No structural rewrite, no changes to the
Deals page, View Lead, or the shared `useDealConversationSeen` hook. Follow the
pill / table design-system standard — reuse `LeadSelectCell` and the existing
`text-[10px] text-muted-foreground` caption style; introduce no new pill look.

Build: `npx tsc --noEmit` and `npm run build` (= `next build`), run from
`/Users/apple/Desktop/Reapirox dummy2/app`.

---

## Investigation summary (confirmed against the real code)

### Issue 1 — root cause CONFIRMED (candidate d: stale memo)

- Shared hook `src/hooks/use-deal-conversation-seen.ts`:
  - Module-level `version` counter + `useSyncExternalStore(subscribe, getVersion, getVersion)`
    (lines ~45–119). `markSeen` → `writeSeen` → `emit()` bumps `version` and
    notifies every subscriber, so **every mounted consumer re-renders** on
    markSeen.
  - `markSeen` useCallback deps `[key]` (line ~124); `unreadCount` useCallback
    deps `[key, userId]` (line ~149). Neither callback changes identity when
    markSeen fires — only the `version` snapshot changes. The hook returns a
    NEW object literal `{ markSeen, hasUnread, unreadCount }` each render, but
    the destructured `dealUnreadCount` function identity is stable across a
    markSeen bump.
  - `unreadCount(deal, comments)` counts comments newer than last-seen AND
    authored by someone other than `userId` (lines ~127–147). This "someone
    else's newer message" rule must be preserved.

- Lead Table `src/app/(app)/leads/list/page.tsx`:
  - `const { currentUser, can } = usePermissions();` (line ~937).
  - `const { markSeen: markDealSeen, unreadCount: dealUnreadCount } = useDealConversationSeen(currentUser?.id);`
    (line ~954).
  - Badge value is produced by the `dealConvoByLead` useMemo (lines ~1003–1020)
    with deps `[leads, deals, comments, dealUnreadCount]`. It calls
    `dealUnreadCount(deal, dealComments)` inside the memo and stores
    `unread` per lead.
  - The `'comment'` action handler (lines ~1377–1388) correctly calls
    `markDealSeen(info.dealId)` on open, then opens the chat popover.
  - Consumers of the badge: `LeadActionsMenu` props
    `dealUnreadCount={dealConvoByLead[lead.id]?.unread ?? 0}` at lines ~1737
    and ~2312.

- **Root cause:** `markDealSeen` bumps `version` and re-renders the component,
  but NONE of the `dealConvoByLead` memo deps (`leads`, `deals`, `comments`,
  or the stable `dealUnreadCount` identity) change, so the memo returns its
  cached value and the badge keeps the stale `unread` count. The Deals page
  does NOT have this bug because it calls `unreadCount(...)` INLINE during
  render (`src/app/(app)/leads/deals/page.tsx` lines ~480 and ~623), so the
  version-bump re-render recomputes it live.

- **User-id key — verified identical across all three surfaces** (no mismatch):
  - Lead Table: `usePermissions().currentUser?.id`.
  - Deals page: `usePermissions().currentUser?.id || ""` (`meId`, line ~118).
  - View Lead (`src/app/(app)/leads/[id]/page.tsx` line ~196):
    `useSession().id`, and `useSession()` resolves `id` from
    `usePermissions().currentUser?.id` (`src/lib/use-session.ts`). Same stable
    id. No divergence to fix.

### Issue 2 — confirmed layout defect

- Status column case, `src/app/(app)/leads/list/page.tsx` lines ~1685–1724:
  the pill is wrapped in
  `<div className="flex min-h-[42px] min-w-0 flex-col items-stretch justify-start">`.
  The forced `min-h-[42px]` reserves sub-label height on EVERY status cell,
  including rows WITHOUT the `Deal → <stage>` caption, so the pill sits higher
  than pill-only cells and is misaligned vs the Action/Result pill cells. The
  caption `<p className="mt-0.5 w-full min-w-0 truncate px-0.5 text-[10px] font-medium text-muted-foreground" title={...}>`
  renders only when `showDealLineage` is true. Row rhythm is `h-[68px]`
  (confirmed by the design-system standard and the `action`/`result`/`storeCol`
  cells which render the bare pill with no wrapper height).

---

## Plan

- [ ] 1. **Issue 1 — make the unread badge recompute reactively on markSeen.**
      In `src/app/(app)/leads/list/page.tsx`, add a reactive signal to the
      `dealConvoByLead` memo deps so a `markSeen` version-bump forces a
      recompute. Minimal change keeping ONE shared tracker:
      - Preferred approach (minimal, no hook change required): expose the
        reactive version from the hook and depend on it. Since the hook already
        subscribes via `useSyncExternalStore(subscribe, getVersion, getVersion)`,
        add a lightweight local reactive read of the same version in the page
        and add it to the memo deps. Concretely: in
        `src/hooks/use-deal-conversation-seen.ts`, extend the returned
        `DealConversationSeen` object with a `seenVersion: number` field set to
        the `useSyncExternalStore(...)` snapshot value (the hook already calls
        it internally — capture its return into a const `seenVersion` and return
        it). Then in the Lead Table destructure
        `{ markSeen: markDealSeen, unreadCount: dealUnreadCount, seenVersion: dealSeenVersion }`
        and add `dealSeenVersion` to the `dealConvoByLead` deps array
        (`[leads, deals, comments, dealUnreadCount, dealSeenVersion]`).
      - This keeps the "someone else's newer message" rule untouched
        (`unreadCount` logic is unchanged) and does NOT alter the Deals page or
        View Lead (both ignore the new field; adding an optional returned field
        is backward-compatible). Verify the hook's existing consumers still
        type-check.
      - Alternative (if you prefer not to touch the hook): compute the per-row
        `unread` inline where the badge is consumed (pass
        `dealUnreadCount(deal, dealComments)` directly at the
        `LeadActionsMenu` call sites, lines ~1737 / ~2312) instead of reading
        it from the memo — matching the Deals page's live-recompute. Choose ONE
        approach; the preferred version-dep approach is smaller and keeps the
        single per-lead `dealConvoByLead` lookup intact. Record which approach
        was used in the verification notes.
      Files: `src/hooks/use-deal-conversation-seen.ts` (add `seenVersion` to the
      returned interface + object), `src/app/(app)/leads/list/page.tsx` (memo
      deps + destructure).
      Verify: `npx tsc --noEmit` passes. Manually confirm (dev) that opening the
      deal-comment popover from a Lead Table row clears the red count badge
      immediately without refresh, and that the Deals page / View Lead dots
      still behave as before.

- [ ] 2. **Issue 2 — pill renders identically with and without the lineage
      caption; caption sits below without reserving height on caption-less
      cells.** In the `status` column case
      (`src/app/(app)/leads/list/page.tsx` lines ~1685–1724):
      - Remove the forced `min-h-[42px]` from the wrapper so a pill-only cell is
        just the pill (same intrinsic height as the `action`/`result` pill
        cells). Keep `flex min-w-0 flex-col items-stretch justify-start` (or
        reduce to a plain wrapper) so the pill's Y position matches a bare pill
        cell.
      - Render the `Deal → <stage>` caption so it does NOT alter the cell's
        intrinsic height when present — make the wrapper `relative` and render
        the caption as an absolutely-positioned element below the pill
        (e.g. `absolute left-0 right-0 top-full mt-0.5`), OR keep it in flow but
        ensure the wrapper has no min-height so caption-less cells collapse to
        pill height. Preferred: absolute/margin-only caption so the pill never
        shifts and neighbouring columns never move, staying within the
        `h-[68px]` row rhythm.
      - Keep the shared `LeadSelectCell` pill (no new pill look), the existing
        caption class `text-[10px] font-medium text-muted-foreground`, the
        `truncate` + `title={`Deal → ${stageLabel}`}` tooltip, and the existing
        `showDealLineage` guard (`wf.dealLineage === "approved" && !statusLower.includes("deal")`).
      - Do not touch the `action`, `result`, `storeCol`, or any other column.
      Files: `src/app/(app)/leads/list/page.tsx` (status case only).
      Verify: `npx tsc --noEmit` passes. Manually confirm (dev) that in the
      Lead Table a status cell WITHOUT the caption shows the pill at the exact
      same height/vertical position as a cell WITH the caption, and both align
      with the Action/Result pill cells; the caption sits directly below the
      pill, truncates with a tooltip, and does not push neighbouring columns or
      change row height.

- [ ] 3. **Full verification.** From `/Users/apple/Desktop/Reapirox dummy2/app`
      run `npx tsc --noEmit` (expect no errors) then `npm run build` (expect a
      successful `next build`). If a known stale `.next` cache error recurs
      (e.g. a spurious type/module error that does not match the source),
      remove the cache with `rm -rf .next` and re-run `npm run build`.
      Files: none (verification only).
      Verify: `npx tsc --noEmit` exits 0; `npm run build` completes successfully.

---

## Notes / constraints

- Scope is ONLY these two fixes. Do not modify unrelated columns, the Deals
  page, View Lead, or the `unreadCount` counting rule.
- Keep exactly ONE shared conversation-seen tracker — do not fork a second
  read-marker.
- TypeScript must stay clean. Adding an optional `seenVersion` field to the
  hook's returned interface is backward-compatible with the Deals page and
  View Lead (they destructure only what they use).
