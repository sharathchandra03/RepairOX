# Agent Performance — cross-agent scope gating + agent-picker dropdown height

The change stops an individual Sales Agent from reaching the cross-agent scope controls on Lead Management → Agent Performance, and caps the page's agent-picker dropdown to ~half the viewport with internal scroll. The leak was real: `CAP.lead.performanceAll` is an OR-set that carries the coarse `view_sales_reports`, which the Leads "view" matrix tier grants, so `canAll` resolved truthy for an individual agent and the page rendered the picker + the All/Individual toggle for them (the topbar pill was already guarded, the page was not). The fix adds the compound guard `canAll && !currentUserIsSalesAgent(activeStoreId)` on the page, tightens `canViewAsAgent` in the context so the view-as lens can never scope a sales agent to another agent, and forces own-scope (tab + `scopedAgent`) so a `?agent=<other>&view=individual` deep link renders the agent's own data. The CAP OR-set is deliberately left intact.

Watch for: nothing blocking — the remaining `canAll` references on the page (All-Agents leaderboard copy, filters, `showReport`, `onReport`) are confirmed unreachable for an individual agent because the All-Agents render branch only runs when `tab === "all"`, and an individual agent is pinned to `tab === "individual"` (confirmed).

**Verdict**: APPROVED

## High-level view

The root-cause analysis in the plan and verification note is accurate and I confirmed it in the live tree: `capabilities.ts:282` still lists `view_sales_reports` in `performanceAll`, and the fix correctly chose the surgical compound guard over removing that coarse key — so report-viewer / manager roles that rely on it are unregressed.

The same compound guard now gates both surfaces. The topbar `agent-scope-selector.tsx` already carried both early-returns (`!performanceAll → null`, `currentUserIsSalesAgent → null`) and was not touched. The page derives `canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId)` and routes the toggle, the picker, the initial tab, the `scopedAgent` memo and the `viewAsAgentId` sync effect through it.

The deep-link / forced-scope path is fully covered at two layers. On the page, `scopedAgent` returns `selfAgent` whenever `!canCrossAgent`, the initial tab is forced to `individual`, and the sync effect re-pins to `individual`. In the context, `canViewAsAgent` now excludes any current sales agent store-independently, collapsing `effectiveViewAsId` to `""`, so `scopedLeads` stays own-scoped regardless of a stale or forced `viewAsAgentId` — defence-in-depth that agrees with RLS.

The owner / full-access experience is unregressed: `canCrossAgent` equals `canAll` for a non-sales-agent, so the All/Individual toggle, the agent picker, the All-Agents leaderboard, filters and `onReport` drill-down all behave as before. The dropdown is unchanged except the new height cap.

The dropdown height fix wraps the mapped agent `MenuItem`s in `max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll`, preserving the avatar chip, name, role label, `bg-[#EEF1FD]` selected highlight and the `Check` mark. It stays a `Dropdown` (no modal) and reuses the existing primitives — design-system faithful. `rox-rail-scroll` exists in `globals.css`.

Type safety and scope are clean: `currentUserIsSalesAgent` is declared on the context interface and exposed in the provider value, the commit touches only the two source files (+ two docs), and `capabilities.ts` / `permission-levels.ts` are untouched. The recorded tsc (exit 0) and build (clean after a documented stale-`.next` rebuild) evidence is present and internally consistent.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking findings.

</details>

<details>
<summary>Details</summary>

### Compound guard parity across both surfaces

Page (`src/app/(app)/leads/performance/page.tsx:219`):

```ts
const canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId);
```

`activeStoreId` is destructured from `useStoreContext()` at line 198, and `currentUserIsSalesAgent` is destructured from `useLeads()` at line 203 — both in scope at line 219. The toggle (331), the picker (493), the initial tab (236), the `scopedAgent` memo (292) and the sync effect (258) all read `canCrossAgent`.

Topbar (`src/components/layout/agent-scope-selector.tsx`) carries the identical rule as two early returns:

```ts
if (!allow(can, CAP.lead.performanceAll)) return null;
if (currentUserIsSalesAgent(activeStoreId)) return null;
```

This file was not in the commit (diff-stat confirms), which is correct — it was already compliant. Both surfaces now express the same `performanceAll && !currentUserIsSalesAgent(activeStoreId)` rule. (confirmed)

### The remaining page `canAll` references are intentional and unreachable for an agent

`grep` shows `canAll` still used at lines 327 (`!canAll && !canOwn → Restricted`), 543/544 (leaderboard title/subtitle copy), 561 (owner-only filters), 576 (`showReport`), 580 (`onReport` → `setViewAsAgent`). Lines 543–580 live inside the ALL AGENTS VIEW block, which is only rendered after the `if (tab === "individual") { … return }` branch at line 445 — i.e. only when `tab === "all"`.

An individual agent (`canCrossAgent === false`) can never set `tab = "all"`: the initial state forces `"individual"` (`!canCrossAgent ? "individual" : …`), the toggle that would set `"all"` is `null`, and the sync effect does `if (!canCrossAgent) { setTab("individual"); return; }`. So the `onReport` path that calls `setViewAsAgent(r.agentId)` is unreachable for them, and the `canAll` leaderboard copy is cosmetic for owners only. Line 327's `!canAll && !canOwn` restriction correctly keeps the read-only leaderboard available to own-scope users, which the plan intends. (confirmed)

### View-as lens is a no-op for a sales agent (defence-in-depth)

`src/lib/leads-context.tsx:2064`:

```ts
const canViewAsAgent =
  !currentUserIsSalesAgent() &&
  (canSeeAllLeads || allow(can, CAP.lead.performanceAll));
const effectiveViewAsId = canViewAsAgent ? viewAsAgentId : "";
```

`currentUserIsSalesAgent()` with no store id → `isAgentEligible(agents, userId, undefined)` → `agentsForStore(agents, undefined)` returns the full directory (verified in `sales-agents.ts:82-91`), so it is true if the user is an eligible agent in ANY authorized store — the store-independent resolution the plan specifies. With `effectiveViewAsId` collapsed to `""`, `scopedLeads` (2078) falls through to the own-scope filter (`createdBy/assignedTo/followUpAgentId/follow-up`), so even a forced `setViewAsAgent(other)` or a stale `viewAsAgentId` cannot cross agents. This is the layer that makes the deep-link path safe independent of the page UI. (confirmed)

### Dropdown height cap

`AgentScopePicker` (page.tsx ~166) now wraps the mapped rows:

```tsx
<div className="max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll">
  {agents.map((a) => ( <MenuItem …> avatar · name · roleLabel · Check </MenuItem> ))}
</div>
```

~half the viewport (capped 320px), internal scroll via the thin brand-blue `rox-rail-scroll` utility (present at `globals.css:298`). The empty-state message is left outside the scroll wrapper. Selected highlight (`bg-[#EEF1FD]`), avatars, role labels and the `Check` mark are all preserved; it remains a `Dropdown`/`MenuItem` composition (no modal, no new visual language). (confirmed)

### CAP OR-set unchanged; scope and type safety

`capabilities.ts:281-282` still carries the coarse keys (`view_sales_reports`, `leads_view_all`, `manage_reports`) in `performanceAll` — the compound guard was preferred over narrowing the capability, so report-viewer/manager roles are unaffected. The commit touches only `page.tsx` and `leads-context.tsx` (plus the two task docs); no unrelated refactor. `currentUserIsSalesAgent` is on the context interface (483) and in the provider value (2377/2387), so the new destructure type-checks. The verification note records `tsc --noEmit` exit 0 and a clean `npm run build` after a documented stale-`.next` rebuild — present and consistent; no re-run needed. (confirmed)

</details>

<details>
<summary>File map</summary>

- `src/app/(app)/leads/performance/page.tsx` — destructure `currentUserIsSalesAgent`; add `canCrossAgent`; route toggle/picker/initial-tab/`scopedAgent`/sync-effect through it; wrap agent-picker rows in a capped scroll container.
- `src/lib/leads-context.tsx` — tighten `canViewAsAgent` to exclude any current sales agent (store-independent).
- `src/components/layout/agent-scope-selector.tsx` — unchanged (already compliant; confirmed).
- `src/lib/capabilities.ts`, `src/lib/permission-levels.ts` — unchanged (coarse keys intentionally kept).

Full diff: `git show 288a8e8`.

</details>
