# Verification — Lead Temperature Emoji Change Animation

Iteration: first (no `lead-temp-emoji-anim-review.json` present when started).

## What was implemented

A small, reusable, **presentation-only** animated-glyph treatment for the Lead
temperature emoji (🔥 Hot / 🌤️ Warm / ❄️ Cold). The glyph plays a **one-shot**
pop + wiggle for ~2.5s when the value **actually changes**, then rests. It is
**not** continuous. No data / derivation / history / permission logic was
touched.

### Decision (answering the user)
Animate for ~2.5s **only when the value changes**, not non-stop — matching the
plan and the repo's motion rules (no continuous pulsing/spinning on a dense
data grid).

### New shared component
`app/src/components/leads/animated-temperature-glyph.tsx` — `AnimatedTemperatureGlyph`
- Props: `{ glyph: ReactNode, changeKey: string, className? }`. Caller passes
  the already-resolved emoji (from `temperatureGlyph` / `leadNatureGlyph`) — no
  emoji/value is fabricated here.
- Change detection: a `prevRef` initialised to the first `changeKey` so **mount
  never animates**; an `animKey` (starts at 0 = static) bumps only on a
  **non-empty → different non-empty** transition. First-set-from-empty and
  clear-to-empty do NOT animate.
- Replay: `motion.span key={animKey}` remounts and plays the one-shot. No
  `repeat`, no `whileInView`, no `AnimatePresence` — so scroll / re-render /
  virtualization never re-trigger it.
- Motion: `scale: [1, 1.35, 1, 1]`, `rotate: [0, -8, 8, 0]`,
  `transition: { duration: 2.5, ease: "easeOut", times: [0, 0.12, 0.3, 1] }` —
  movement front-loaded into the first ~0.55s, the rest is settle (within the
  2.3–2.6s window). **Transform only** (scale + rotate); never width/height/
  margin/font-size, inside an `inline-block` `shrink-0` slot so the pill width
  and trailing chevron/lock never move.
- `prefers-reduced-motion`: `useReducedMotion()` → renders the final glyph in a
  plain `<span>` with no transform/animation. Information is never hidden.

### Surfaces wired (4, per plan)
1. **Lead Table Lead Nature pill (MUST-HAVE)** — `app/src/app/(app)/leads/list/page.tsx`,
   `LeadSelectCell.leadGlyph`. Added an `animated` param (default `false`); the
   editable **pill button** and the **read-only pill** pass `animated=true`.
   Option-list rows stay the plain static span. Status / Contact Status /
   qualification cells pass no temperature `glyphFor`, so they are unaffected.
   Only the row whose value changed animates (keyed on the value, prev tracked).
2. **View Lead hero pill** — `app/src/app/(app)/leads/[id]/page.tsx` (~line 410);
   `changeKey={lead.leadNature || ""}`.
3. **Sticky context bar pill** — `app/src/components/leads/lead-sticky-context.tsx` (~line 71);
   `changeKey={lead.leadNature || ""}`.
4. **Temperature section current-state pill** — `app/src/components/leads/lead-temperature-section.tsx` (~line 243);
   `changeKey={current}`.

Left **un-animated** (as required): the Temperature History event glyph
(`HistoryRow`, ~line 108) — still a plain static span.

### Dependency
Reused **Framer Motion** (already a dependency / already used in these files).
No new dependency added. No CSS keyframes added.

## Commands run (from `app/`)
- `npx tsc --noEmit` → **exit 0** (no type errors).
- `npm run build` → **exit 0**, `✓ Compiled successfully`.

## Expected visual behavior
- Changing a row's Lead Type (temperature) in the Lead Table pops that one
  row's emoji once (~2.5s) then rests; other rows do not animate; the pill
  width and chevron/lock do not shift; scrolling does not re-trigger it.
- Changing temperature in the Temperature section pops the hero pill, the
  current-state pill, and (when visible) the sticky-bar pill once each; History
  rows stay static.
- With OS/DevTools "Reduce motion" on, all four show the final emoji instantly
  with no pop/rotate.
- No surface loops; no surface animates on initial page load/mount.
