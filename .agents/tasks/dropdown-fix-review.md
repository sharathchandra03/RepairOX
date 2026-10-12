# Portal the Lead Table stage dropdown so it anchors to its pill

The Lead Table's inline stage dropdown (`LeadSelectCell`) rendered its `position: fixed` menu inside the frozen-column data grid, whose sticky/`overflow` ancestors created a new containing block — so the menu detached from its pill and floated over the Agent column. The fix renders the menu (backdrop + `motion.div`) through `createPortal(..., document.body)` so the fixed coordinates resolve against the viewport, adds a client-mount guard for SSR, and recomputes the menu position on capture-phase scroll + resize so it stays glued to the pill as the grid scrolls. A horizontal clamp keeps a right-edge pill's menu on screen. The pill, options list, inline reason box, search/Clear, and permission gating are untouched.

Watch for: nothing blocking. The portal, mount guard, listener lifecycle, and clamp all match the required spec (confirmed). One harmless redundancy: `computePos()` runs both in `handleOpen` and in the open effect (confirmed, cosmetic only).

**Verdict**: APPROVED

## High-level view

The root cause is a classic `position: fixed` containing-block trap: a `fixed` element is normally viewport-relative, but an ancestor with a transform/filter/`will-change` (common in sticky frozen-column grids and `AnimatePresence`/`motion` wrappers) re-roots it. Portalling the menu to `document.body` removes it from that ancestor chain, which is the correct and standard remedy — not a hack.

Positioning logic was extracted from the inline `handleOpen` into a memoized `computePos` callback and is now also driven by a scroll+resize effect while the menu is open, so the menu tracks the pill during grid scrolling instead of only being placed once at open time. This is a behavioral improvement the original lacked.

The fix lives entirely in the shared `LeadSelectCell`, so it applies uniformly to all five reusing columns (Status, Contact Status, Lead Category, Sub Category, Lead Type) with no per-column work. Visual geometry, the options/reason/search/Clear UI, and gating were not modified — the diff only wraps the existing menu JSX in a portal and swaps the one-shot placement for the shared compute function.

<details>
<summary>Issues (1)</summary>

1. **Redundant initial computePos call** — `handleOpen` calls `computePos()` and the open effect also calls `computePos()` on mount; harmless double-compute, no action required (cosmetic).

</details>

<details>
<summary>Details</summary>

### Portal + SSR mount guard

The menu is now `mounted && createPortal(<AnimatePresence>…</AnimatePresence>, document.body)`. `mounted` starts `false` and flips `true` in a `useEffect(() => { setMounted(true); }, [])`, so the portal never runs during Next.js server render (where `document` is undefined) and only attaches after hydration (confirmed). This is the correct guard for an App Router `"use client"` component. The `createPortal` import comes from `react-dom` (confirmed).

Rendering the menu into `document.body` is the actual fix for the reported glitch: the frozen-column grid establishes sticky/overflow (and the surrounding motion layers establish transform) containing blocks, which capture a `position: fixed` descendant. Moving the node to `<body>` guarantees the fixed `top/bottom/left` resolve against the viewport, so the menu lands under its pill instead of over the Agent column.

### Viewport-aware positioning preserved

`computePos` reads `btnRef.current.getBoundingClientRect()` and reproduces the original logic exactly: `dropUp = window.innerHeight - r.bottom < 280`, `top = r.bottom + 6` (drop-down) or `bottom = window.innerHeight - r.top + 6` (drop-up). The drop-up threshold and 6px offset are unchanged from the pre-fix inline version (confirmed against the diff's removed line).

The new piece is the horizontal clamp: `left = Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8))` with `menuWidth = reasonStep ? 260 : 220`. This matches the required `left + menuWidth <= window.innerWidth - 8` invariant and also floors `left` at `8` so a left-edge pill can't go negative. The `220`/`260` widths line up with the menu's own `w-[220px]`/`w-[260px]` classes on the `motion.div` (confirmed), so the clamp uses the true rendered width.

Because `computePos` is `useCallback`-memoized on `[reasonStep]`, entering the reason step (which widens the menu to 260px) produces a new callback, re-runs the open effect, and re-clamps for the wider menu — so a right-edge reason box also stays on screen (confirmed).

### Listener lifecycle

A single `useEffect` keyed on `[open, computePos]` installs the trackers only while the menu is open: `window.addEventListener("scroll", onScroll, true)` (capture phase, so the inner grid scroll container's scroll events are caught, not just `window`) and `window.addEventListener("resize", onResize)`. The cleanup removes both with matching signatures — crucially the capture-phase `true` flag is passed to `removeEventListener` as well, so the listener is actually removed (a common bug the author avoided). The effect returns early when `!open`, and React runs the cleanup on close and on unmount, so there is no leaked listener (confirmed).

### Scope: nothing outside positioning changed

The diff is a wrapper swap plus the extracted compute logic. The removed code is only the inline rect math inside `handleOpen`; the added code is the `mounted` guard, `computePos`, the tracking effect, and the `createPortal(...)` wrapper around the pre-existing `<AnimatePresence>` subtree. The pill button (`flex h-7 w-full min-w-0 … rounded-full px-2.5`, truncating label, trailing `ChevronDown`), the read-only pill branch, the options list, the inline reason textarea + Save/Cancel, the sticky search box + Clear-search `X`, and the bottom Clear button are byte-for-byte the same inside the portal (confirmed by reading the final file). `onChange` / `onChangeWithReason` / `pickOption` / `reasonPromptFor` data paths and the `readOnly` gating are unchanged (confirmed).

### Applies to every reusing column

`LeadSelectCell` is a single shared component consumed by the Contact Status cell and, in the grid `renderCell` switch, by `qualification` (Lead Category), `subCategory` (Sub Category), `leadNature` (Lead Type), and `status` (Status) — all gated via `NACell` where appropriate (confirmed via grep). Fixing the shared component fixes all five columns with no per-column change.

### Build / type evidence

The commit message for `2b0fa96` records: `Verified: npx tsc --noEmit (pass), npm run build (pass).` Per the task instructions I did not re-run either; the evidence is present and specific, so no finding is recorded for it.

</details>

<details>
<summary>File map</summary>

- `src/app/(app)/leads/list/page.tsx` — `LeadSelectCell`: added `createPortal` import, `mounted` SSR guard, memoized `computePos` (with horizontal clamp), scroll(capture)+resize tracking effect, and wrapped the existing menu subtree in `createPortal(..., document.body)`. +49 / −12.

Full diff: `git show 2b0fa96 -- "src/app/(app)/leads/list/page.tsx"` in the `app/` repo.

</details>
