# One-shot pop+wiggle animation for the Lead temperature emoji

A new presentation-only component, `AnimatedTemperatureGlyph`, wraps the temperature emoji (🔥/🌤️/❄️) and plays a single ~2.5s scale+rotate pop when the temperature value actually changes, then rests. It is wired into the four required surfaces (Lead Table Lead Nature pill, View Lead hero pill, sticky context pill, temperature-section current-state pill) and the temperature-history event glyph is deliberately left static. The component takes an already-resolved glyph node plus a raw-value change key, so it owns no temperature/data logic and fabricates no emoji. It reuses the existing `framer-motion` dependency and `useReducedMotion`.

Watch for: nothing blocking. The change detection is sound (mount never animates, per-row isolation holds because rows are keyed by `lead.id`), reduced-motion renders instantly, and the layout is transform-only inside a fixed `shrink-0` slot. One minor cosmetic note (confirmed): in the temperature section the change key is the raw value while the glyph is the bucketed level, so a raw-value change that maps to the same bucket pops an unchanged emoji — harmless and arguably correct.

**Verdict**: APPROVED

## High-level view

The whole change is a single ~80-line client component plus four call sites. The component tracks the previous value in a ref initialised to the first value, so the initial mount is never counted as a change; a one-shot `motion.span` keyed by an incrementing counter replays only when a non-empty value transitions to a different non-empty value. This is the correct shape for "animate on real change, never on mount/scroll."

Per-row correctness in the dense Lead Table rests on the table keying each `<motion.tr>` by `lead.id` and rendering a paginated slice (not a virtualized window). Component identity therefore stays bound to a lead across re-sorts and re-renders, so changing one lead's temperature animates only that lead's glyph; paging mounts fresh instances that re-initialise their prev-ref and stay static.

The motion is transform-only (scale + rotate) inside the same fixed `shrink-0` glyph slot the static span occupied, with the default className matching the original exactly, so the pill width, tone, truncation and the trailing chevron/lock do not move. Reduced-motion and the pre-first-change state both short-circuit to a plain static `<span>`.

Scope is respected: only the Lead Nature pill in the table opts in (`animated=true`); Status/Contact Status cells pass no `glyphFor` and are untouched; option-list rows, the stepped indicator, and the history event glyph remain static. No data, derivation, permission, or history logic is touched, and no dependency is added.

<details>
<summary>Issues (1)</summary>

1. **Change key vs bucketed glyph in the temperature section** (non-blocking, cosmetic) — the section passes `changeKey={current}` (raw `lead.leadNature`) while rendering `temperatureGlyph(level)` (bucketed). A raw-value change that resolves to the same bucket will pop an unchanged emoji. Harmless; no action required.

</details>

<details>
<summary>Details</summary>

### Change detection: mount-safe, change-only

`prevRef` is initialised to the first `changeKey`, and `animKey` starts at 0 (the static branch). The effect returns early when the value is unchanged, and only bumps `animKey` when `prevRef.current !== "" && changeKey !== ""` — a non-empty→different-non-empty transition. This correctly excludes three non-changes: initial mount (prev equals current), first-set-from-empty, and clear-to-empty. The replay mechanism is `key={animKey}` on the `motion.span`, which remounts and plays the single `animate` array once; there is no `repeat`, `whileInView`, or `AnimatePresence`, so re-render/scroll cannot re-trigger it. Constraint (1) satisfied — confirmed.

### Per-row isolation in the Lead Table

This is the constraint most likely to break, and it holds. The table body renders `paged.map((lead) => <motion.tr key={lead.id}>)` (list page ~2143/2179) over a page slice (`filteredLeads.slice(...)`, ~1279) — pagination, not row virtualization. Because each row is keyed by the stable `lead.id`, React preserves the `LeadSelectCell` → `AnimatedTemperatureGlyph` instance (and its `prevRef`) for that lead across re-sorts and re-renders. When `updateLead` changes one lead's `leadNature`, only that lead's component observes a new `changeKey`; siblings keep theirs and stay still. Scrolling within a page does not unmount rows, so no scroll-driven re-trigger. Paging to a new set mounts fresh instances whose `prevRef` initialises to the current value, so page changes never falsely animate. Constraint (2) satisfied — confirmed.

### Reduced motion

`useReducedMotion()` short-circuits to a plain `<span className={className}>{glyph}</span>` with no transform and no `motion` element, so the final glyph is shown instantly and no information is hidden. This matches the repo's established pattern (the hook is already used in `reveal.tsx`, `lead-sticky-context.tsx`, the view-lead page, etc.). Constraint (3) satisfied — confirmed.

### No data / derivation / permission changes

The component imports only `react`, `framer-motion`, and `cn`. It receives a pre-resolved `glyph` node and a `changeKey` string; it never calls `updateLead`, never reads `leadNature`/`status`, never touches history, derivation, or permissions. The four call sites pass glyphs from the existing `temperatureGlyph` / `leadNatureGlyph` helpers (reused, not re-implemented). The editable table pill's `onChange={(v) => updateLead(lead.id, { leadNature: v })}` is unchanged by this diff. Constraint (4) satisfied — confirmed.

### Layout / pill integrity

The animated span is `inline-block` with `style={{ transformOrigin: "center", willChange: "transform" }}` and animates only `scale` and `rotate` — never width/height/margin/font-size. In the table it uses the default className `"shrink-0 text-[12px] leading-none"`, identical to the static span it replaces, and sits in the same slot before the `min-w-0 flex-1 truncate` label and the `shrink-0` ChevronDown. The hero/sticky/section call sites pass `"shrink-0 leading-none"`. Pill shape, tone, truncation and sizing are untouched, and the trailing chevron/lock cannot be displaced because the glyph's box size is constant. Constraint (5) satisfied — confirmed.

### No new dependency

`framer-motion@11.3.19` is already in `package.json` and already imported in these files. No new dependency, no CSS keyframes. Constraint (6) satisfied — confirmed.

### History glyph untouched

`lead-temperature-section.tsx` `HistoryRow` (~109) and the stepped indicator (~72) still render `<span>{temperatureGlyph(...)}</span>` statically; only the current-state pill (~244) and the option-list rows (~273, static `<span>`) are in the same file, and only the current-state pill is animated. Constraint (7) satisfied — confirmed.

### Scope: table opt-in

`LeadSelectCell.leadGlyph` gained an `animated` param defaulting to `false`; only the editable pill button (~515) and the read-only pill (~496) pass `true`, and only when `glyphFor` is present. The Lead Nature column is the sole caller passing `glyphFor={leadNatureGlyph}` (~1691); Status (~1717) and Contact Status cells pass no `glyphFor`, so their `leadGlyph` falls to the dot branch and the `animated` flag is inert. Option-list rows (~616) use their own plain static span. Only the Lead Nature pill animates, as required.

### Minor: change key vs bucketed glyph

In the temperature section, `changeKey={current}` is the raw `lead.leadNature` while the rendered glyph is `temperatureGlyph(level)` (bucketed). If an admin-renamed raw value changes but maps to the same temperature bucket, the key changes and the pop fires on a visually unchanged emoji. This is cosmetic and arguably correct (the value did change). The table path aligns key and glyph on the same raw value (`changeKey={v}`, `glyphFor={leadNatureGlyph}`), so it is unaffected. No action required.

### Verification evidence

The coder's committed note (`lead-temp-emoji-anim-verification.md`) records `npx tsc --noEmit` → exit 0 and `npm run build` → exit 0 (`✓ Compiled successfully`). Per instructions these suites were not re-run; the diff is small, self-contained, uses only already-present imports/APIs, and nothing in it raises a specific articulable doubt that would warrant a spot-check. Evidence is present and credible.

</details>

<details>
<summary>Files changed</summary>

- `src/components/leads/animated-temperature-glyph.tsx` — new ~80-line presentation-only component (change-keyed one-shot pop, reduced-motion short-circuit, transform-only).
- `src/app/(app)/leads/list/page.tsx` — `LeadSelectCell.leadGlyph` gains an `animated` param; editable + read-only Lead Nature pills opt in.
- `src/app/(app)/leads/[id]/page.tsx` — View Lead hero temperature pill uses the animated glyph.
- `src/components/leads/lead-sticky-context.tsx` — sticky-bar temperature pill uses the animated glyph.
- `src/components/leads/lead-temperature-section.tsx` — current-state pill uses the animated glyph; history/stepper left static.
- `.agents/tasks/lead-temp-emoji-anim-verification.md` — coder's verification note (tsc + build, exit 0).

Full diff: `git show 721d997`.

</details>
