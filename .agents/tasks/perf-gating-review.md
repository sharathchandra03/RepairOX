# Agent Performance gating fix — restore shared leaderboard + toggle for individual agents

Commit `24d332f` corrects an over-correction introduced by `288a8e8`. The prior commit stopped individual Sales Agents drilling into other agents' data, but it fused two distinct capabilities onto a single `canCrossAgent` flag — so an individual agent also lost the shared All-Agents leaderboard and the `All Agents / Individual` toggle entirely, and was pinned to the Individual view. This change splits "see the shared leaderboard + toggle" (`canViewLeaderboard = canAll || canOwn`, available to everyone past the Restricted guard) from "pick/drill into another agent's data" (`canCrossAgent = canAll && !currentUserIsSalesAgent(...)`, owner-only). The result: an individual agent can toggle to a read-only ranked leaderboard with their own row highlighted, while all cross-agent affordances (header picker, per-row View Details, topbar lens) stay owner-only.

Watch for: nothing blocking. The split is applied consistently across the toggle, the initializer, the lens effect, the header picker, and the per-row drill. The per-row `onReport` was additionally tightened from `canAll` to `canCrossAgent` (confirmed), closing a latent leak where an individual with a coarse `performanceAll` key could have drilled into others.

**Verdict**: APPROVED

## High-level view

The toggle (`tabToggle`) is now gated on `canViewLeaderboard`, not `canCrossAgent`, so an individual agent sees and can use it. They can reach `tab === "all"` and render the ranked table; it is read-only for them because `showReport` and `onReport` are both gated on `canCrossAgent`, and their own row is highlighted via `highlightAgentId={currentUserId}`.

The initial `tab` is a role-driven default (individuals → `individual`, owners → `all`) but no longer a pin: the lens `useEffect` now early-returns on `!canCrossAgent` instead of calling `setTab("individual")`, leaving the individual's own toggle choice intact and driving the tab only from the owner `viewAsAgentId` lens.

Own-data isolation for individuals is unchanged and correct: `scopedAgent` forces `selfAgent` when `!canCrossAgent` (so a `?agent=<other>` deep link still renders their own data), the header `AgentScopePicker` stays gated on `canCrossAgent`, and the all-tab owner filters stay gated on `canAll`. The `leads-context.tsx` `canViewAsAgent` tightening (an eligible sales agent is always own-scoped) and the owner-only topbar pill in `agent-scope-selector.tsx` are preserved — the latter untouched by this commit.

The `AgentScopePicker` dropdown now wraps its items in `max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll`, capping height with an internal scroll.

Recorded tsc/build evidence in `perf-gating-verification.md` substantiates a clean `tsc --noEmit` (exit 0) and a successful warm `npm run build` (exit 0); the first-pass `/accounts/banking` `PageNotFoundError` is a documented stale-`.next` route-group artifact unrelated to this single-file change.

<details>
<summary>Issues (0)</summary>

No blocking or actionable findings. The change implements the intended capability split correctly and consistently.

</details>

<details>
<summary>Details</summary>

### Shared leaderboard + toggle for individual agents (confirmed)

`canViewLeaderboard = canAll || canOwn` is introduced alongside `canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId)`. The toggle changed from `const tabToggle = canAll ? (...)` (and, in the intermediate commit, `canCrossAgent ?`) to `const tabToggle = canViewLeaderboard ? (...)`. Any user past the `if (!canAll && !canOwn) return <Restricted />` guard therefore sees the `All Agents / Individual` toggle. Requirement 1 met.

### Read-only all-tab for individuals, owner-only drill (confirmed)

In the ALL AGENTS render block, the `PerformanceTable` is fed `showReport={canCrossAgent}` and `onReport={canCrossAgent ? (r) => {...} : undefined}`, with `highlightAgentId={currentUserId ?? undefined}`. For an individual (`canCrossAgent === false`) this yields a ranked table with no per-row View Details and their own row highlighted. The header title/subtitle branch on `canAll` ("Agent Performance — All Agents" vs "Sales Leaderboard"), and the all-tab filter panel is gated `{canAll && (...)}`, so an individual gets no filters and no Agent filter (the `tab === "all"` Agent SelectField lives inside that owner-gated panel). The intermediate commit gated `onReport` on `canAll`; this fix tightens it to `canCrossAgent`, closing a latent cross-agent drill for a coarse-key individual. Requirement 2 met.

The Individual-view monthly `PerformanceTable` carries an unconditional `showReport`, but that drills into the scoped agent's own months via `leadListHref({ month })` (`rowKind="period"`), not cross-agent — not a leak.

### Tab default, not a pin (confirmed)

Initializer: `!canCrossAgent ? "individual" : (viewAsAgentId || initialViewParam === "individual" || initialAgentParam ? "individual" : "all")`. Individuals default to Individual, owners to All (unless a lens/deep-link opens Individual). The lens `useEffect` changed from `if (!canCrossAgent) { setTab("individual"); return; }` (commit `288a8e8`, verified via `git show`) to `if (!canCrossAgent) return;`, then drives the tab only from `viewAsAgentId`. Individuals are no longer forced/pinned. Requirement 3 met.

### Individual own-data isolation + deep link safety (confirmed)

`scopedAgent` returns `selfAgent` whenever `!canCrossAgent`, so a `?agent=<other>&view=individual` deep link still renders the agent's own data. The header `AgentScopePicker` is gated `{canCrossAgent && <AgentScopePicker .../>}` — hidden for individuals. Defence-in-depth: `leads-context.tsx` `canViewAsAgent = !currentUserIsSalesAgent() && (canSeeAllLeads || allow(can, CAP.lead.performanceAll))` makes an individual's view-as lens a no-op. Requirement 4 met.

### Owner experience unregressed (confirmed)

For a non-sales-agent owner, `canCrossAgent === canAll`, so the header `AgentScopePicker` renders, the all-tab per-row View Details renders and switches scope in-place (`setScopeAgentId` + `setTab("individual")` + `setViewAsAgent`), and the lens `useEffect` follows the topbar `viewAsAgentId`. The all-tab owner filters render under `canAll`. Requirement 5 met.

### Dropdown height cap (confirmed)

The `AgentScopePicker` menu items are wrapped in `<div className="max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll">`, matching the required cap and the thin brand-blue scrollbar utility. Requirement 6 met.

### Preserved guards in context + topbar (confirmed)

`leads-context.tsx` `canViewAsAgent` retains the `!currentUserIsSalesAgent() && (...)` tightening from the prior commit (not loosened). `agent-scope-selector.tsx` is unchanged in this commit and still returns null for non-leads workspaces, for users without `CAP.lead.performanceAll`, and for eligible sales agents (`currentUserIsSalesAgent(activeStoreId)`) — the pill stays owner-only. Requirement 7 met.

### tsc / build evidence (confirmed, read not re-run)

`perf-gating-verification.md` records `npx tsc --noEmit` → exit 0, no errors; and `npm run build` → warm-cache exit 0 full success. The first-pass `/accounts/banking` `PageNotFoundError` is attributed to the known stale-`.next` route-group page-data quirk (same as documented in `agent-scope-gating-verification.md`), with `git status --short` confirming only `performance/page.tsx` as the modified tracked source. The evidence substantiates a clean tsc and build without re-running them. Requirement 8 met.

</details>

<details>
<summary>File map</summary>

- `src/app/(app)/leads/performance/page.tsx` — split `canViewLeaderboard` (toggle/leaderboard) from `canCrossAgent` (picker/drill/lens); un-pin individual tab; tighten per-row `onReport` to `canCrossAgent`; wrap agent-picker list in a height-capped scroll container.
- `src/lib/leads-context.tsx` — `canViewAsAgent` gated on `!currentUserIsSalesAgent()` (from prior commit, preserved).
- `src/components/layout/agent-scope-selector.tsx` — unchanged this commit; owner-only topbar pill preserved.
- `.agents/tasks/perf-gating-verification.md` — recorded tsc/build evidence.

Full diff: `git diff 288a8e8^ 24d332f`.

</details>
