# Implementation Plan — Lead Temperature Emoji Change Animation

## Decision (answering the user)

The user asked: animate the temperature emoji (🔥 Hot / 🌤️ Warm / ❄️ Cold) for
2–3 seconds **when it changes**, or run it **non-stop** — and which is better.

**Decision: animate for ~2.3–2.6s ONLY when the value CHANGES, then rest.**
Not continuous. Reasons:
- The Lead Table is a dense, virtualized data grid with thousands of rows; a
  non-stop loop on every visible temperature pill is constant visual noise and
  destroys scan-ability.
- The repo's motion rules (`view-lead-page` §27, `reveal.tsx`) explicitly ban
  "continuous pulsing, spinning, scaling" and require motion to *communicate*,
  not decorate. A one-shot change animation communicates "this just changed";
  a loop communicates nothing.
- A change-triggered pop is exactly the "2 to 3 seconds when we change" option
  the user leaned toward.

This is a **presentation-only** change. No data, derivation, permission, or
history logic is touched. We reuse the existing `leadNatureGlyph` /
`temperatureGlyph` outputs — no new emoji or values are fabricated.

## Approach decision (dependency)

Reuse **Framer Motion** — it is already a dependency and already used across the
app (`reveal.tsx`, `lead-sticky-context.tsx`, `leads/[id]/page.tsx` via
`useReducedMotion`, `LeadSelectCell`'s own menu in `leads/list/page.tsx`). Do
NOT add a CSS-keyframe approach or any new dependency.

Why Framer over raw CSS keyframes here: we need (a) a `prefers-reduced-motion`
short-circuit that renders the final glyph instantly, and (b) a reliable
"animate once, only when the value actually changed, never on mount, never on
re-render/scroll/virtualization." Framer's `key`-remount + `initial`/`animate`
one-shot (no `AnimatePresence`, no `whileInView`, no `loop`) plus a tracked
`prevValue` ref gives us all of this deterministically. We will NOT use
`whileInView` (that would re-fire on scroll) and NOT use `repeat`.

## The shared component

A single tiny client component used by all four surfaces:
`AnimatedTemperatureGlyph`.

Core mechanism:
- Props: `glyph: React.ReactNode` (the already-resolved emoji),
  `changeKey: string` (the raw value that identifies "which temperature" —
  e.g. `lead.leadNature || ""`, or the resolved level), and optional
  `className`.
- Track the previous `changeKey` in a `useRef`, initialized to the first
  `changeKey` on mount so **mount is never counted as a change**.
- Maintain an incrementing `animKey` number in state. In a `useEffect` keyed on
  `changeKey`: if `prevRef.current !== changeKey` AND `prevRef.current` was a
  non-empty previous value (so first-set-from-empty can be treated as a change
  per the brief — see note below), bump `animKey` and update `prevRef.current`.
  Otherwise just sync `prevRef.current` without bumping.
  - Brief says "changes from a previous non-empty value to a new different
    value." Implement exactly that: only bump when
    `prevRef.current !== "" && prevRef.current !== changeKey`. Setting from an
    empty value does NOT animate. Clearing to empty does NOT animate.
- Render a Framer `motion.span` with `key={animKey}` so a bump remounts it and
  replays the one-shot. When `animKey === 0` (initial, no change yet) render a
  plain `<span>` (or a `motion.span` with no `initial`/`animate` difference) so
  there is zero mount animation.
- The one-shot keyframes (subtle pop + wiggle, runs ONCE, ease-out, total
  ~2.3–2.6s):
  - `animate`: `scale: [1, 1.35, 1, 1]`, `rotate: [0, -8, 8, 0]` with
    `transition.times` front-loading the pop/wiggle into the first ~0.55s and
    holding `1`/`0` for the remainder, OR simpler: a ~0.6s pop+wiggle followed
    by a settle, with the component staying visually "fresh" for the full
    2.3–2.6s via a `times` array that ends at ~1.0 of a `duration: 2.4`. Keep
    the actual movement short and gentle; the brief's "~2.3–2.6s total" is the
    settle window, not 2.6s of continuous motion.
  - `transition`: `{ duration: 2.4, ease: "easeOut", times: [0, 0.12, 0.3, 1] }`
    (tune within 2.3–2.6s). No `repeat`.
  - Layout safety: the `motion.span` MUST be `inline-block` with
    `transform-origin: center`, `will-change: transform`, and
    `pointer-events-none` is not needed. It animates `transform` ONLY (scale +
    rotate) — never width/height/margin/font-size — so it cannot change the
    pill's width or push the trailing chevron/lock. Wrap in a fixed-size
    `shrink-0` span exactly where the current glyph `<span>` sits.
- `prefers-reduced-motion`: call `useReducedMotion()`. When true, render the
  glyph in a plain `<span className={className}>` with NO motion, NO transform,
  NO key-remount effect side-effects that transform — the final glyph shows
  instantly. (Still safe to run the prevRef bookkeeping; just never apply a
  transform.)

File location: `app/src/components/leads/animated-temperature-glyph.tsx`
(new file, `"use client"`). It imports `motion, useReducedMotion` from
`framer-motion`, `cn` from `@/lib/utils`, and `React` hooks. It does NOT import
any temperature/data logic — callers pass the already-resolved glyph + key.

- [ ] 1. Create the shared `AnimatedTemperatureGlyph` component.
      Build the component described in "The shared component" above:
      `prevRef`-tracked change detection (bump only on
      non-empty→different), `animKey`-remounted one-shot `motion.span`
      (scale+rotate pop/wiggle, `duration` 2.3–2.6s, `ease` easeOut, NO
      `repeat`, NO `whileInView`), `transform`-only (never layout), wrapped so
      it keeps the glyph's `shrink-0` fixed slot, and a `useReducedMotion()`
      short-circuit that renders the final glyph instantly. Keep it generic:
      `{ glyph, changeKey, className? }`.
      Files: `app/src/components/leads/animated-temperature-glyph.tsx` (new)
      Verify: `cd app && npx tsc --noEmit` passes (no type errors in the new
      file). Then `npx next lint --file src/components/leads/animated-temperature-glyph.tsx`
      (or the project's lint command) reports no errors.

- [ ] 2. Wire the Lead Table "Lead Nature" pill (MUST-HAVE primary case) via
      `LeadSelectCell.leadGlyph`.
      In `LeadSelectCell` (around the `leadGlyph` helper, ~line 408), when a
      `glyphFor` is provided, render the glyph through
      `AnimatedTemperatureGlyph` instead of the plain
      `<span className="shrink-0 text-[12px] leading-none">{glyphFor(v)}</span>`.
      Pass `glyph={glyphFor(v)}`, `changeKey={v}`, and keep the same
      `className="shrink-0 text-[12px] leading-none"` so geometry is unchanged.
      Because the glyph is used in BOTH the pill button and each option row,
      scope the animation to the PILL only: either (a) add a boolean param to
      `leadGlyph` (e.g. `leadGlyph(v, dot, animated)`) and call it with
      `animated` true only for the pill button render (the `{value ? leadGlyph(value, dotColor) : ...}`
      spot) and false for the option-row render, or (b) leave the option-list
      glyphs as the current plain span and only swap the pill-button glyph.
      Prefer (a) with a default of `false` so option rows and the read-only pill
      stay static unless we opt in. The read-only pill (locked/gated rows) may
      also use the animated glyph — it still only animates on real value change,
      which is fine; but to stay conservative, wire animation to the editable
      pill button first.
      This is generic to `LeadSelectCell` (also used by Status / Contact Status
      / qualification), but those callers pass no `glyphFor` or a non-temperature
      `glyphFor`; the animation is harmless there because it only fires on
      change. Confirm Status/Contact Status still behave (they use the colour
      dot path, not `glyphFor`, so they are unaffected).
      Files: `app/src/app/(app)/leads/list/page.tsx`
      Verify: `cd app && npx tsc --noEmit` passes. Then `npm run build`
      (project build) succeeds. Manual: in the Lead Table, change a row's Lead
      Type (Lead Nature) from Warm→Hot and confirm the 🔥 pops once (~2.5s) then
      rests; other rows do not animate; the pill width/chevron do not shift;
      scrolling does not re-trigger.

- [ ] 3. Wire the View Lead hero temperature pill.
      In the hero pill (`leads/[id]/page.tsx`, ~line 410, the
      `temperatureTone(tLevel)` pill containing
      `<span>{temperatureGlyph(tLevel)}</span>`), replace the inner
      `<span>{temperatureGlyph(tLevel)}</span>` with
      `<AnimatedTemperatureGlyph glyph={temperatureGlyph(tLevel)} changeKey={lead.leadNature || ""} />`.
      Use `lead.leadNature` as the change key (the raw value) so a Warm→Hot
      change animates even if both map to adjacent levels; `tLevel` is fine too
      but the raw value is the authoritative "changed" signal. Add the import.
      The file already imports `useReducedMotion` from framer-motion for
      `RevenueValue`; no new framer import needed at the page level (the
      reduced-motion handling lives inside the component).
      Files: `app/src/app/(app)/leads/[id]/page.tsx`
      Verify: `cd app && npx tsc --noEmit` passes. Manual: open a Lead, change
      its temperature via the Temperature section; the hero pill glyph pops once
      and the hero layout does not shift.

- [ ] 4. Wire the sticky context bar temperature pill.
      In `lead-sticky-context.tsx` (~line 71, the `temperatureTone(tLevel)` pill
      with `<span>{temperatureGlyph(tLevel)}</span>`), replace the inner
      `<span>{temperatureGlyph(tLevel)}</span>` with
      `<AnimatedTemperatureGlyph glyph={temperatureGlyph(tLevel)} changeKey={lead.leadNature || ""} />`
      and add the import. (This file already imports framer-motion; the new
      component handles reduced motion internally.)
      Files: `app/src/components/leads/lead-sticky-context.tsx`
      Verify: `cd app && npx tsc --noEmit` passes. Manual: on a long Lead page,
      scroll until the sticky bar appears, change temperature, confirm the
      sticky glyph pops once and the bar layout is stable.

- [ ] 5. Wire the Temperature section CURRENT-STATE pill (and confirm the
      history glyph stays static).
      In `lead-temperature-section.tsx`, the current-state pill (~line 243, the
      `temperatureTone(level)` pill with `<span>{temperatureGlyph(level)}</span>`
      above `{current || "Not set"}`): replace the inner
      `<span>{temperatureGlyph(level)}</span>` with
      `<AnimatedTemperatureGlyph glyph={temperatureGlyph(level)} changeKey={current || ""} />`
      (where `current` is the raw current leadNature string used by this
      section) and add the import.
      Do NOT touch `HistoryRow` (~line 108): its
      `<span className="text-[12px] leading-none">{temperatureGlyph(ev.toLevel)}</span>`
      stays a plain static span — history events must never animate.
      Files: `app/src/components/leads/lead-temperature-section.tsx`
      Verify: `cd app && npx tsc --noEmit` passes. Manual: in the Temperature
      section press "Change temperature", pick a different level, Save; the
      current-state pill glyph pops once; every row in the Temperature History
      list below stays completely static.

- [ ] 6. Full build + reduced-motion check.
      Run the project build and a reduced-motion sanity check.
      Files: none (verification only).
      Verify: `cd app && npx tsc --noEmit` passes and `npm run build` succeeds.
      Manual: enable OS "Reduce motion" (or DevTools emulate
      prefers-reduced-motion: reduce) and confirm all four surfaces render the
      correct final emoji instantly with NO pop/rotate on change. Confirm no
      surface loops, no surface animates on initial page load/mount, and no pill
      width changes.

## Notes / guardrails for the implementer
- Reuse `leadNatureGlyph` (table) and `temperatureGlyph` (temperature surfaces)
  exactly as they are — the component receives the already-resolved node, so no
  emoji/value is invented.
- Animate `transform` only (scale + rotate). Never animate width, height,
  margin, padding, or font-size. The animated glyph must live inside the same
  `shrink-0` fixed slot it replaces so the pill's text (`flex-1 truncate`) and
  trailing chevron/lock never move.
- One-shot only: no `repeat`, no `whileInView`, no `AnimatePresence` wrapper for
  the glyph. The replay is driven solely by a `key` bump on real value change.
- Mount must not animate: initialize `prevRef` to the first `changeKey` and only
  bump on a non-empty→different transition.
- `prefers-reduced-motion` → final glyph instantly, no transform.
- Keep the change scoped to the four named surfaces. The Lead Table option-list
  glyphs and the Temperature History glyphs stay static.
