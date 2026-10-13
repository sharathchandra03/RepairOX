# Agent Performance — restore the SHARED leaderboard for individual agents (perf-gating fix)

## Problem

Commit `288a8e8` correctly stopped an INDIVIDUAL Sales Agent from drilling into
OTHER agents' data, but it over-corrected: it tied BOTH the `All Agents /
Individual` toggle AND the ability to reach `tab === "all"` to `canCrossAgent`,
so an individual Sales Agent could no longer see the shared All-Agents
leaderboard **at all**. The page docstring intends Agent Performance to be the
ONE surface where everyone — owner AND individual agent — gets the ranked
comparison + the toggle (so an agent can see where they rank).

## Correct intended behaviour (now implemented)

Two capabilities, gated SEPARATELY:

1. **See the All-Agents leaderboard + the toggle** — SHARED, available to
   EVERYONE past the Restricted guard (owner AND individual Sales Agent). Gated
   on `canViewLeaderboard = canAll || canOwn`.
2. **Drill into ANOTHER agent's individual report** (in-header `AgentScopePicker`
   + the owner `view as agent` lens + per-row `View Details`) — OWNER /
   full-access ONLY. Gated on `canCrossAgent = allow(can, CAP.lead.performanceAll)
   && !currentUserIsSalesAgent(activeStoreId)`.

Net: an individual Sales Agent CAN toggle to All Agents (read-only ranked table,
their own row highlighted) and CAN view their own Individual report — but CANNOT
pick/drill into any other agent's individual data.

## Verification commands & results (EXACT)

Run from `/Users/apple/Desktop/Reapirox dummy2/app`.

1. `npx tsc --noEmit`
   - **Result: exit 0, no errors.** TypeScript is clean.

2. `rm -rf .next && npm run build`
   - **First run:** `✓ Compiled successfully` + `Checking validity of types ...`
     passed, then a page-data collection `PageNotFoundError: Cannot find module
     for page: /accounts/banking`. This is the KNOWN transient stale-`.next`
     route-group page-data quirk (same one documented in
     `agent-scope-gating-verification.md`), NOT caused by this change:
       - `/accounts/banking` has an existing `page.tsx` (dated Jul 29), untouched
         by this change.
       - `git status --short` shows only
         `src/app/(app)/leads/performance/page.tsx` as the modified tracked file.
   - **Re-run `npm run build` (warm cache): exit 0, full success.**
     `✓ Compiled successfully`, types valid, and `/accounts/banking` compiled
     cleanly (`○ /accounts/banking  5.06 kB`). Final `BUILD EXIT: 0`.

   The build succeeds; the first-pass error was the documented stale-cache
   artifact and clears on a warm rebuild.

## Behaviour traced in code

### (a) An individual agent can reach `tab === "all"` and render the ranked leaderboard READ-ONLY

- `const canViewLeaderboard = canAll || canOwn;` (page.tsx ~224). Any user past
  the `if (!canAll && !canOwn) return <Restricted/>;` guard has
  `canViewLeaderboard === true`.
- `tabToggle` is now `canViewLeaderboard ? <SegmentedTabs .../> : null` (~341) —
  so an individual agent SEES the `All Agents / Individual` toggle.
- The `useEffect` (~262) no longer pins them: the `!canCrossAgent` branch is now
  `if (!canCrossAgent) return;` — it does NOTHING, leaving the user's own toggle
  choice (`setTab`) to stand. Only the OWNER lens (`viewAsAgentId`) drives the
  tab for a cross-agent user.
- Inside the ALL AGENTS render block the table is read-only for them:
  `showReport={canCrossAgent}` and `onReport={canCrossAgent ? ... : undefined}`
  (~586/593) → an individual agent (`canCrossAgent === false`) gets NO per-row
  "View Details" drill. `highlightAgentId={currentUserId}` highlights their own
  row. The owner-only filters block stays `canAll && (...)` per spec.

### (b) An individual agent in `tab === "individual"` sees ONLY their own data, no picker, deep link safe

- `AgentScopePicker` in the Individual header is gated `canCrossAgent && <AgentScopePicker .../>`
  (~503) — hidden for an individual agent.
- `scopedAgent` (~297) returns `selfAgent` whenever `!canCrossAgent` — so a
  `?agent=<other>&view=individual` deep link STILL renders the agent's own data
  (the real UI-layer guard, unchanged).
- Defence-in-depth in `leads-context.tsx` (~2064): `canViewAsAgent =
  !currentUserIsSalesAgent() && (...)` → an individual agent's view-as lens is a
  no-op (`effectiveViewAsId === ""`), so `scopedLeads` stays own-scoped
  regardless of any stale/forced `viewAsAgentId`. UNCHANGED by this fix (kept
  from the prior commit) — RLS remains the real boundary.

### (c) Owner experience intact (picker, per-row drill-down, topbar lens)

- For a non-sales-agent owner, `canCrossAgent === canAll`, so:
  - `AgentScopePicker` renders (~503).
  - `showReport` / `onReport` per-row "View Details" render and switch scope
    in-place via `setScopeAgentId` + `setTab("individual")` + `setViewAsAgent`
    (~586/593).
  - The `useEffect` (~262) follows the topbar lens: `viewAsAgentId` →
    Individual on that agent; cleared → All Agents.
- The topbar `agent-scope-selector.tsx` is UNCHANGED (still owner-only via its
  two early returns) — the pill stays owner-only; individual agents never get it.
- The `AgentScopePicker` dropdown height cap
  (`max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll`) is UNCHANGED.

## Files changed

### `src/app/(app)/leads/performance/page.tsx` (ONLY tracked source change)

Key diffs:

1. **New `canViewLeaderboard` flag** (after `canCrossAgent`):
   ```ts
   const canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId);
   const canViewLeaderboard = canAll || canOwn;   // NEW — shared leaderboard gate
   ```

2. **Initial `tab` state** — comment clarified it is a DEFAULT, not a pin. Logic
   unchanged (individual agents still DEFAULT to `"individual"`; owners to
   `"all"`), but they are no longer forced to stay there (see toggle + effect).

3. **`useEffect`** — removed the `setTab("individual")` forcing:
   ```ts
   // before: if (!canCrossAgent) { setTab("individual"); return; }
   // after:
   if (!canCrossAgent) return;              // leave the user's own toggle choice alone
   if (viewAsAgentId) { setScopeAgentId(viewAsAgentId); setTab("individual"); }
   else { setTab("all"); }
   ```

4. **`tabToggle` gating** — `canCrossAgent` → `canViewLeaderboard`:
   ```ts
   const tabToggle = canViewLeaderboard ? ( <SegmentedTabs .../> ) : null;
   ```

5. **Per-row drill-down gating** — `canAll` → `canCrossAgent` (tighter):
   ```ts
   showReport={canCrossAgent}
   onReport={canCrossAgent ? (r) => { setScopeAgentId(r.agentId); setTab("individual"); setViewAsAgent(r.agentId); } : undefined}
   ```

Unchanged (correct, left as-is): `scopedAgent` own-scope forcing,
`AgentScopePicker` `canCrossAgent` gate, the dropdown height cap, the owner-only
filters (`canAll && (...)`), `leads-context.tsx` `canViewAsAgent` tightening,
`agent-scope-selector.tsx` (owner-only topbar pill).
