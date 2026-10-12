# Lead Dashboard — sticky header, breathing pill, yellow notepad, full-width Recent Leads (v2)

Four presentation/layout changes to the Lead Dashboard (`app/src/app/(app)/lead-management/page.tsx` and `app/src/components/dashboard/notepad-widget.tsx`). The header title row and date-filter strip are grouped into a single `position: sticky` band pinned flush below the app topbar; the Quick Add Lead header pill gains the shared `animate-module-breathe` effect; the "Got a call?" card is removed and the notepad moved up, enlarged and restyled as a warm yellow legal/sticky notepad; and Recent Leads is relocated out of the 2/3 left column to a full-width row below the main grid. The changes are purely visual/structural — no lead data, derivation, filters, permissions, or Recent Leads columns were touched.

This is the second review pass. The prior pass raised two findings — (1) blocking: missing recorded verification evidence; (2) non-blocking: cosmetic indentation on the SegmentedTabs wrapper. Both are now resolved: the coder added `lead-dashboard-verification.md` recording `npx tsc --noEmit` PASS and `npm run build` PASS, and the SegmentedTabs wrapper is now correctly nested/indented inside the sticky band.

Watch for: nothing blocking. The code was already sound in v1; v2 closes the evidence gap and tidies the indentation. (The build log notes one pre-existing, unrelated `themeColor` metadata warning that does not fail the build and is unconnected to these changes.)

**Verdict**: APPROVED

## High-level view

The sticky header is implemented correctly, not just slapped on. The wrapper uses `sticky top-[60px] z-[7] bg-[hsl(var(--background))]` with negative page gutters — this reuses the exact repo convention already proven in `leads/quotations/page.tsx` and `leads/deals/page.tsx` (`sticky top-[60px] z-[6] bg-[hsl(var(--background))]`). The `top-[60px]` offset matches the real topbar height (`.rox-topbar` is `h-[60px]` in `topbar.tsx:55`), it pins relative to the shell's `overflow-y-auto` container (`app-shell.tsx:198`), and `z-[7]` sits above scrolling content yet below the topbar wrapper's `z-20` (`app-shell.tsx:199`). The negative gutters make the opaque band span full content width so nothing bleeds through at the edges, and no layout jump is introduced.

The breathing effect is the right one: `animate-module-breathe` is applied to the header pill, the identical utility used on the topbar "Add new"/module pill. The keyframe (`tailwind.config.ts:65`) and animation (`:78`) are both already registered and were reused, not redefined. `glow-pulse` (the POS ring) is correctly absent from the page.

The "Got a call?" card is fully gone — no leftover JSX, and the now-unused `UserPlus` import was removed (0 references remain). All notepad functionality is preserved: the restyle touched only container/header/empty-state classes and the textarea `rows`, leaving `useNotes`, add/update/delete/pin, the `onBlur` saves, and the `COLORS` palette untouched. The yellow theme (amber-50 body, amber-200 border, amber header wash, amber icon chip) is tasteful and stays within the design system's "one intentional color area" allowance.

Recent Leads is moved to a full-width `SectionCard` below the main grid, addressing the actual root cause (the table was capped at the fixed `xl:col-span-2` left column regardless of date filter) rather than coupling layout to the date-filter business state. The markup, colgroup, columns, data, and `openLead` handler are byte-for-byte unchanged — only the DOM position moved.

Verification evidence is now present and credible: `lead-dashboard-verification.md` records both commands passing (tsc exit 0, build `✓ Compiled successfully`). Per the review contract I did not re-run the full suites; I independently confirmed the structural claims (topbar height, animation registration, import cleanup, unchanged handlers) via targeted greps.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking issues remain. Both v1 findings are resolved.

</details>

<details>
<summary>Details</summary>

### Prior findings — resolution

1. **Missing recorded verification evidence (was blocking) — RESOLVED.** The task directory now contains `lead-dashboard-verification.md`, which records: `npx tsc --noEmit` → PASS (exit 0, no output); `npm run build` → PASS (exit 0, `✓ Compiled successfully`, `/lead-management` route built at 25.4 kB / 480 kB first load). The single emitted warning is a pre-existing Next.js `themeColor` metadata-location convention warning, unrelated to any changed markup/animation, and does not fail the build. Evidence is present and consistent with my independent v1 spot-check (`tsc --noEmit` clean).
2. **Cosmetic indentation on SegmentedTabs wrapper (was non-blocking) — RESOLVED.** The current file (read from disk) shows the date-filter `<div className="mt-3 flex flex-col …">` and its `SegmentedTabs` child correctly nested inside the sticky band with consistent indentation and matching closing tags.

### Change 1 — Sticky header band

The implementation groups `PageHeader` and the date-filter strip into one wrapper:

```
<div className="sticky top-[60px] z-[7] -mx-4 bg-[hsl(var(--background))] px-4 pt-2 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
```

Verified against the codebase:

- **Offset is correct, not guessed.** `topbar.tsx:55` renders `<div className="rox-topbar flex h-[60px] …">`, so `top-[60px]` pins flush beneath it. Established repo convention — `leads/quotations/page.tsx:266` and `leads/deals/page.tsx:302` both use `sticky top-[60px] z-[6] bg-[hsl(var(--background))]`.
- **Correct scroll container.** `app-shell.tsx:198` is the `overflow-y-auto` ancestor; its topbar child at `:199` is `sticky top-0 z-20`. The band's `z-[7]` is above scrolling page content and below the topbar's `z-20`, so the topbar always wins the stacking contest. `position: sticky` resolves against that `overflow-y-auto` container.
- **No bleed-through / no horizontal shift.** `bg-[hsl(var(--background))]` is opaque and matches the app background; the negative gutters with matching padding make the band span full content width edge-to-edge, covering the `.rox-page-main` gutters.
- **Overlay correctly excluded.** `DateRangePicker` and the KPI grid downward stay below/outside the sticky wrapper. The `custom`-range button and the full date-filter state machine remain functionally intact inside the band.
- The nested `overflow-x-auto` on the SegmentedTabs wrapper is a horizontal-only scroll container *inside* the sticky element — not an ancestor — so it does not interfere with the vertical `position: sticky`.

### Change 2 — Breathing pill

`animate-module-breathe` is applied to the header Quick Add Lead `<Button>` (`className="gap-1.5 rounded-full animate-module-breathe"`). Confirmed this is the same utility used on the topbar module pill, and that the keyframe (`tailwind.config.ts:65`) + animation (`:78`) are both registered — reused, not redefined. `glow-pulse` does not appear in `page.tsx` (grep count 0).

### Change 3 — Remove "Got a call?", enlarge + yellow notepad

The entire `<Can permission={CAP.lead.create}>` "Got a call?" gradient card was deleted from the right column. `grep` for `UserPlus` in `page.tsx` returns 0 occurrences and the import line was trimmed to drop it — no unused-import error (confirmed by the recorded clean `tsc` run and my v1 run).

The notepad restyle (`notepad-widget.tsx`) is presentation-only:
- Shell: `border-[#B3BFF6]/50 bg-card` → `border-amber-200/80 bg-amber-50` (shadow swapped to `shadow-card`).
- Header wash: blue gradient → `bg-gradient-to-r from-amber-100 to-transparent`; icon chip → `from-amber-400 to-amber-500`.
- Empty state: amber dashed border + amber chip (`border-amber-300/70 bg-amber-100/40`, `bg-amber-100 text-amber-600`).
- Size: body padding `p-4` → `p-5`, note spacing `space-y-2.5` → `space-y-3`, textarea `rows={3}` → `rows={5}`.

A targeted grep of the diff for `useNotes|addNote|updateNote|deleteNote|togglePin|onBlur|COLORS|onChange(` in added/removed lines returned nothing — every behavior is intact: `useNotes()` destructures the same handlers, the `COLORS` palette (amber first) is unchanged, and the `onBlur` saves (`body !== note.body && onChange({ body })`, `title !== note.title && onChange({ title })`) are preserved. No persistence or input behavior was lost.

### Change 4 — Full-width Recent Leads

The Recent Leads `SectionCard` was cut from `<div className="space-y-5 xl:col-span-2">` and re-rendered as a sibling after the `xl:grid-cols-3` grid closes, before the `LeadCaptureFlow`. This addresses the real root cause named in the plan: the table was permanently capped at the 2/3 left column irrespective of the date filter, leaving a gap on the right (most visible under "All"). Moving it full-width fixes every date state uniformly and avoids the rejected hack of toggling `col-span` on `dateRange === "all"`. The table markup, `colgroup`, seven columns, `recentLeads` data, `scopedFollowUps`, and `openLead` handler are unchanged — only the DOM position moved (confirmed by the diff: the removed and re-added blocks are identical except for position and the explanatory comment). `min-w-[720px]` + `overflow-x-auto` are retained for narrow-screen safety.

### Business-logic / data integrity

No change to lead data, derivation, filters, permissions, or Recent Leads columns/data. The `<Can permission={CAP.lead.create}>` gates and `viewAsReadOnly` lens are preserved on both the header pill and the capture flow. The date filter state machine (`setDateRange`, custom-range handling, `DATE_OPTIONS`) is untouched.

### Verification evidence

`lead-dashboard-verification.md` records `npx tsc --noEmit` PASS and `npm run build` PASS from `app/`. Per the review contract I did not re-run the full suites; the recorded evidence is present, internally consistent, and matches my independent v1 `tsc` spot-check. No articulable doubt remained that would justify a further narrow re-run.

</details>

<details>
<summary>File map</summary>

- `app/src/app/(app)/lead-management/page.tsx` — sticky header band wrapper added; `animate-module-breathe` on header pill; "Got a call?" card removed; `UserPlus` import dropped; Recent Leads moved to full-width row below the grid; SegmentedTabs wrapper indentation tidied.
- `app/src/components/dashboard/notepad-widget.tsx` — yellow sticky-note restyle (container, header, empty state) + larger sizing (`p-5`, `space-y-3`, `rows={5}`); all hooks/handlers preserved.
- `app/.agents/tasks/lead-dashboard-verification.md` — added: recorded `tsc` + `build` PASS results.

Full diff: `git show 4f3d304` (commit on branch `main`).

</details>
