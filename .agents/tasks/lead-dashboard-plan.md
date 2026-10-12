# Implementation Plan — Lead Dashboard presentation/layout changes

Four presentation-only changes to the Lead Dashboard page. No business logic,
data, filters, permissions, derivation, or Recent Leads columns/data change.

## Context (verified during exploration)

- **Primary page:** `app/src/app/(app)/lead-management/page.tsx` (the "Lead
  Dashboard"). Default export `LeadDashboardPage`. The whole page is one
  `return (<div className="space-y-5 pb-8"> … </div>)`.
- **Scroll container:** `app/src/components/layout/app-shell.tsx` — the element
  `<div className="flex min-w-0 flex-1 flex-col overflow-y-auto [overscroll-behavior:none]">`
  is the `overflow-y-auto` ancestor. `position: sticky` on page content pins
  relative to THIS element. The topbar lives inside it as
  `<div className="sticky top-0 z-20"> … <Topbar/> </div>`.
- **Topbar height convention:** `.rox-topbar` is `h-[60px]` (topbar.tsx). The
  repo's established "sticky flush below the topbar" offset is **`top-[60px]`**
  — already used by `leads/quotations/page.tsx`, `leads/deals/page.tsx`
  (`sticky top-[60px] z-[6]`) and `components/leads/lead-sticky-context.tsx`
  (`sticky top-[60px] z-30`). Use `top-[60px]`. (The compact-density CSS swaps
  `.rox-topbar` height via a token at 1024–1366px; the `top-[60px]` literal is
  the repo convention and matches the other sticky blocks, so stay consistent
  with it — do NOT invent `top-[72px]`.)
- **App background token:** `bg-[hsl(var(--background))]` (the light cool-gray
  used by the quotations/deals sticky blocks). Use it for the sticky header's
  opaque backing so scrolling content doesn't bleed through.
- **Breathing animation:** `animate-module-breathe` is a real registered
  Tailwind utility — keyframe `module-breathe` + animation `module-breathe 3s
  ease-in-out infinite` are both defined in `app/tailwind.config.ts` (lines ~65
  and ~78). Used in `topbar.tsx` on the module switcher ("Add new"/module) pill.
  Do NOT redefine it. Do NOT use `glow-pulse` (that's the POS button ring).
- **Notepad:** `app/src/components/dashboard/notepad-widget.tsx`
  (`NotepadWidget`). All persistence is via `useNotes()` (shared hook) — purely
  presentational edits only; preserve every handler.
- **"Got a call?" box:** inline JSX in `page.tsx`, inside the RIGHT column, a
  `<Can permission={CAP.lead.create}>` wrapping a gradient card whose text is
  "Got a call?" / "Capture the lead in seconds." + a "Quick Add Lead" button.
  It sits directly ABOVE `<NotepadWidget />`.
- **Verification commands:** from `app/` → `npx tsc --noEmit` and
  `npm run build` (`next build`). No unit-test harness covers this page.

---

## Change 1 — Sticky/frozen header + date-filter strip on scroll

Root: the header `<PageHeader …/>` block and the date-filter block (the
`<div className="flex flex-col gap-3 sm:flex-row …">` that wraps the
`SegmentedTabs`) are two sibling blocks at the top of the page root. The
`DateRangePicker` (modal, portal-like) sits right after them and must stay
OUTSIDE the sticky wrapper (it is an overlay, not part of the pinned strip).

Approach: wrap ONLY the `PageHeader` block + the date-filter strip block in a
single `position: sticky` wrapper with an opaque app-background backing, pinned
at `top-[60px]`.

- [ ] 1. Wrap the header + date-filter strip in a sticky container.
      In `app/src/app/(app)/lead-management/page.tsx`, inside the main
      `return`, group the `<PageHeader …/>` element and the immediately
      following date-filter `<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"> … </div>`
      into ONE new wrapper:
      `<div className="sticky top-[60px] z-[7] -mx-4 bg-[hsl(var(--background))] px-4 pt-2 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">`.
      Rationale for the classes:
        - `sticky top-[60px]` pins flush below the `h-[60px]` topbar in the
          `overflow-y-auto` scroll ancestor (repo convention).
        - `z-[7]` sits above scrolling page content (KPI cards/charts/table) but
          below the topbar wrapper's `z-20`, matching the quotations/deals
          `z-[6]` pattern (use 7 so it clears nothing it shouldn't; both work).
        - `bg-[hsl(var(--background))]` gives an opaque backing (no bleed-through
          of scrolling content). Keep it solid; a blur is optional but solid is
          simplest and matches quotations/deals.
        - Negative page gutters `-mx-4/sm:-mx-6/lg:-mx-8` + matching
          `px-4/sm:px-6/lg:px-8` make the opaque band span the full content
          width edge-to-edge (the page sits inside `.rox-page-main` with those
          gutters) so the sticky band covers the gutter area and nothing peeks
          through at the sides. This prevents the "horizontal shift / sliver"
          artifact.
        - `pt-2 pb-3` gives breathing room; the page root's `space-y-5` between
          siblings is replaced by this wrapper's own padding for the grouped
          pair (the two inner blocks keep their own spacing — see next note).
      Keep the `DateRangePicker` component and everything from the KPI grid
      downward OUTSIDE (below) this wrapper, unchanged.
      Inside the wrapper, the two blocks (PageHeader, filter strip) need a small
      gap: add `mt-3` to the date-filter `<div>` (it previously relied on the
      root `space-y-5`). Do not otherwise restyle them.
      Files: `app/src/app/(app)/lead-management/page.tsx`
      Verify: `npx tsc --noEmit` passes; after `npm run build`, load the Lead
      Dashboard, scroll down — the title row (Quick Add Lead + online pill) and
      the date-filter tabs stay pinned flush under the topbar while KPI cards,
      charts, panels and Recent Leads scroll underneath; no layout jump, no
      horizontal shift; correct at 1366×768 and 80–125% zoom.

Notes / guardrails:
- Do NOT move `LeadActivityFeed` or `SalesAgentsOnline` out of PageHeader —
  they remain in the header actions and pin with it.
- The permission-wall early-return branch (`if (!canView)`) is a separate
  `return` with its own `<PageHeader>` and is untouched.

---

## Change 2 — Breathing effect on the "Quick Add Lead" header pill

There are TWO "Quick Add Lead" buttons: (a) the HEADER pill inside
`PageHeader actions` (the one the user means), and (b) the button inside the
"Got a call?" card (which Change 3 deletes). Only the header pill gets the
effect.

- [ ] 2. Add `animate-module-breathe` to the header Quick Add Lead button.
      In `app/src/app/(app)/lead-management/page.tsx`, in the `PageHeader`
      `actions` prop, the button is:
      `<Button size="sm" className="gap-1.5 rounded-full" onClick={() => setShowCreate(true)}>`.
      Change its `className` to
      `"gap-1.5 rounded-full animate-module-breathe"`.
      This reuses the SAME effect as the topbar module ("Add new") pill
      (`animate-module-breathe`). Do NOT add `glow-pulse` or redefine any
      keyframe.
      Files: `app/src/app/(app)/lead-management/page.tsx`
      Verify: `npx tsc --noEmit` passes; in the running app the header Quick Add
      Lead pill shows the same soft breathing box-shadow pulse as the topbar
      module switcher.

---

## Change 3 — Remove "Got a call?" box, enlarge notepad, yellow theme

Part A (page.tsx) — remove the box and let the notepad take the freed space:

- [ ] 3. Remove the "Got a call?" card from the right column.
      In `app/src/app/(app)/lead-management/page.tsx`, delete the entire
      `<Can permission={CAP.lead.create}> … </Can>` block that contains the
      "Got a call?" card (the `<div className="group relative overflow-hidden
      rounded-2xl border-[2.2px] … ">` with the "Got a call?" / "Capture the
      lead in seconds." text and its inner "Quick Add Lead" `<Button>`). It sits
      directly above `<NotepadWidget />` in the RIGHT column
      (`<div className="space-y-5">`). Leave `<NotepadWidget />` as the content
      that moves up into the freed space (the column's `space-y-5` + the removal
      pulls it up automatically).
      Clean up now-unused imports in `page.tsx`: after removal, verify whether
      `UserPlus` (lucide) is still referenced elsewhere in the file — it is used
      ONLY in the "Got a call?" card and the KPI import list, so grep the file;
      if `UserPlus` has no other usage, remove it from the lucide-react import.
      Do the same check for any other symbol that becomes unused. (`Plus`,
      `CAP`, `Can`, `Button`, `setShowCreate` all remain used elsewhere — keep
      them.)
      Files: `app/src/app/(app)/lead-management/page.tsx`
      Verify: `npx tsc --noEmit` passes with NO "unused variable"/"declared but
      never read" errors (confirms imports were cleaned); the "Got a call?" card
      no longer renders and the Notepad sits higher in the rail.

Part B (notepad-widget.tsx) — enlarge + yellow sticky-note theme, preserve all
behavior:

- [ ] 4. Restyle `NotepadWidget` as a larger yellow legal/sticky notepad.
      Read `app/src/components/dashboard/notepad-widget.tsx` first; change ONLY
      presentation (container classes, header wash, default note color, sizing)
      — keep every hook call and handler (`useNotes`, `addNote`, `updateNote`,
      `deleteNote`, `togglePin`, the `onBlur` save logic, the color picker) and
      the `COLORS` palette intact.
      Specific edits:
        - Outer container: change the card shell from the blue-tinted
          `border-[#B3BFF6]/50 bg-card` to a warm yellow paper look:
          e.g. `border-amber-200/80 bg-amber-50` and keep the existing
          `shadow-[…]`/rounded. (Classic notepad yellow — amber-50 body with an
          amber-100/amber-200 border; stays within the restrained design system,
          this is the ONE intentional color area.)
        - Header strip: replace the blue gradient wash
          `bg-gradient-to-r from-[#F5F7FF] to-transparent` with an amber wash
          `bg-gradient-to-r from-amber-100 to-transparent` and give the icon
          chip a notepad feel (e.g. `bg-amber-400 text-white` or
          `bg-gradient-to-br from-amber-400 to-amber-500 text-white`) instead of
          the blue gradient chip. The "New" button may stay blue `#4361EE`
          (brand action) OR switch to amber — keep it readable; prefer keeping
          the brand blue action for consistency.
        - Make it LARGER / more prominent now that it has the freed space:
          increase the body textarea height from `rows={3}` to `rows={5}` in
          `NoteCard`, and give the notes list more room — change the inner
          `<div className="p-4">` to `p-5` and the empty-state padding `py-9`
          can stay. Optionally raise note spacing `space-y-2.5` → `space-y-3`.
          Keep it tasteful; the goal is "bigger, real notepad", not oversized.
        - Default new-note color: `addNote({ color: COLORS[0].token })` already
          uses `COLORS[0]` = `amber` — leave as-is (new notes are yellow by
          default, matching the theme). Do NOT remove the other palette colors;
          the per-note color picker stays functional.
      Do NOT change `useNotes`, note persistence, pin/delete, or the color
      tokens list.
      Files: `app/src/components/dashboard/notepad-widget.tsx`
      Verify: `npx tsc --noEmit` passes; in the app the Notepad reads as a warm
      yellow sticky/legal notepad, is visibly larger (taller note bodies), and
      still saves text, adds/pins/deletes notes, and changes per-note colors
      exactly as before.

---

## Change 4 — Recent Leads fills the full width (esp. with "All")

Root cause (verified, not guessed): the main content grid is
`<div className="grid grid-cols-1 gap-5 xl:grid-cols-3">`. The Recent Leads
`SectionCard` lives in the LEFT column `<div className="space-y-5 xl:col-span-2">`
(2/3 of page width). The RIGHT column (1/3) holds the Follow-up Panel +
(removed) Got-a-call + Notepad. This 2:1 split is FIXED regardless of the date
filter. Recent Leads is therefore permanently capped at 2/3 page width, while
the KPI cards above span the full width (`xl:grid-cols-7`). With "All" selected
(more rows across all time) the mismatch is most noticeable: the table looks
narrow with empty space to its right where the shorter right-column rail has
already ended. The table itself is already `w-full` inside its column — the
constraint is the column span, not the table.

Fix (pure layout, works in EVERY date state, never breaks others): move the
Recent Leads `SectionCard` OUT of the `xl:col-span-2` left column and render it
as a FULL-WIDTH card BELOW the main grid, so it spans the entire content width
and aligns with the full-width KPI row above.

- [ ] 5. Move Recent Leads to a full-width row below the main grid.
      In `app/src/app/(app)/lead-management/page.tsx`:
        - Cut the entire Recent Leads `<SectionCard title="Recent Leads" …> …
          </SectionCard>` block (including its `recentLeads.length === 0`
          empty-state and the whole `overflow-x-auto` table) out of the LEFT
          column (`<div className="space-y-5 xl:col-span-2">`).
        - Paste it as a new sibling of the main grid
          (`<div className="grid grid-cols-1 gap-5 xl:grid-cols-3"> … </div>`),
          placed immediately AFTER that grid's closing tag and before the
          `<Can permission={CAP.lead.create}><LeadCaptureFlow …/></Can>` at the
          end. Because the page root is `space-y-5`, the moved card gets correct
          vertical spacing automatically and now spans full content width.
        - No change to the table markup, `colgroup`, columns, data
          (`recentLeads`), or `openLead` handler. The `min-w-[720px]` +
          `overflow-x-auto` stays (horizontal scroll safety on narrow screens);
          at full width the `%`-based columns now stretch across the whole page.
      This fills the end-to-end width in all date states (All / Today / etc.),
      aligns Recent Leads with the KPI cards above, and does not touch the
      left/right 2:1 split for the charts/panels above it.
      Files: `app/src/app/(app)/lead-management/page.tsx`
      Verify: `npx tsc --noEmit` passes; after `npm run build`, with the "All"
      filter the Recent Leads table spans the full content width (no large empty
      gap on the right) and aligns with the KPI row; with Today/This Month/etc.
      the table is still full-width and correct; the charts + follow-up panel
      above keep their 2:1 layout; usable at 1366×768 and 80–125% zoom.

Rejected alternative: toggling the left column to `xl:col-span-3` only when
`dateRange === "all"` — rejected because (a) it couples layout to business
state (the filter), (b) it would still leave the right-column rail stacked
awkwardly, and (c) the user wants Recent Leads full-width/aligned generally,
which the move achieves cleanly in every state.

---

## Verification (run from `app/`)

- [ ] 6. Type-check and build.
      Run `npx tsc --noEmit` — expect no errors (especially no unused-import
      errors after Change 3).
      Run `npm run build` — expect a successful `next build`.
      Then manually confirm in the running app:
        1. Scrolling pins the header + date tabs flush under the topbar (no jump
           / no horizontal shift), at 1366×768 and 80–125% zoom.
        2. Header "Quick Add Lead" pill breathes like the topbar module pill.
        3. "Got a call?" box is gone; Notepad is higher, larger, and yellow, and
           still saves/pins/deletes/colors notes.
        4. Recent Leads fills full width under "All" and every other date state.
      Files: (none — verification only)
      Verify: both commands succeed and the four manual checks pass.

---

## Loop stop contract

The implement/review loop writes its verdict to
`app/.agents/tasks/review.json` with jsonPath `verdict` = `APPROVED` when the
four changes above are implemented and verification passes. This plan does not
restructure the workflow.
