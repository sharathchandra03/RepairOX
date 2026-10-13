# Agent Performance — cross-agent scope gating leak + dropdown height — VERIFICATION

Iteration: **FIRST** (no `agent-scope-gating-review.json` present at start).
Implemented per `.agents/tasks/agent-scope-gating-plan.md`.

---

## 1. Confirmed root cause of the leak

The page `src/app/(app)/leads/performance/page.tsx` gated the cross-agent SCOPE
controls (the `AgentScopePicker` dropdown + the `All Agents / Individual`
`tabToggle`) on **`canAll = allow(can, CAP.lead.performanceAll)` ALONE**, with no
`currentUserIsSalesAgent` guard.

`CAP.lead.performanceAll` is an OR-set that includes the coarse legacy key
`view_sales_reports` (`capabilities.ts`):

```ts
performanceAll: ["leads_performance_view_all", "leads_view_all", "view_sales_reports", "manage_reports"],
```

The Leads module **`view` matrix tier** (`permission-levels.ts`) bundles
`view_sales_reports`. So any role configured at Leads = "view" tier (or higher)
resolves `allow(can, CAP.lead.performanceAll) === true` — including an individual
Sales-type role set up through the matrix. That coarse key is the trigger: it
makes `canAll` truthy for an individual agent, so the page rendered the picker +
toggle for them.

The topbar pill (`agent-scope-selector.tsx`) was already correct — it carries
the extra `if (currentUserIsSalesAgent(activeStoreId)) return null;` guard — but
the page did not, and `canViewAsAgent` in `leads-context.tsx` was also truthy for
the leaking agent (`canSeeAllLeads || allow(can, CAP.lead.performanceAll)`), which
would have let the view-as lens actually scope them to another agent's data.

Per the plan + permission-matrix steering, the coarse key is intentionally kept
in the OR-set (other report-viewer/manager roles rely on it). The surgical fix is
the compound guard `performanceAll && !currentUserIsSalesAgent`, not removing the
key.

---

## 2. The compound guard applied in BOTH surfaces

Rule: show a cross-agent control only when
`allow(can, CAP.lead.performanceAll) && !currentUserIsSalesAgent(activeStoreId)`.

### `src/app/(app)/leads/performance/page.tsx`
- Destructured `currentUserIsSalesAgent` from `useLeads()`.
- New derived flag:
  ```ts
  const canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId);
  ```
- `tabToggle` gated on `canCrossAgent` (was `canAll`).
- `{canCrossAgent && <AgentScopePicker … />}` in the Individual header (was `canAll`).

### `src/components/layout/agent-scope-selector.tsx`
- **No functional change required** — the two early-returns already implement the
  compound guard:
  ```ts
  if (!allow(can, CAP.lead.performanceAll)) return null;
  if (currentUserIsSalesAgent(activeStoreId)) return null;
  ```
  Confirmed present and unchanged.

---

## 3. How an individual agent is now forced to their own Individual view

Hiding the UI is not enough — the page + context now also FORCE own-scope so a
stale lens or a deep link cannot cross agents:

- **Context (`leads-context.tsx`)** — `canViewAsAgent` tightened so a current
  Sales Agent can never use the view-as lens, even with a coarse `performanceAll`
  key:
  ```ts
  const canViewAsAgent =
    !currentUserIsSalesAgent() &&
    (canSeeAllLeads || allow(can, CAP.lead.performanceAll));
  ```
  (`currentUserIsSalesAgent()` with no store id → eligible in ANY authorized
  store.) This collapses `effectiveViewAsId` to `""` for an individual agent, so
  `setViewAsAgent(other)` is a no-op and `scopedLeads` never scopes to another
  agent.

- **Page initial `tab`** — a forced-own-scope user never opens on `all`:
  ```ts
  !canCrossAgent
    ? "individual"
    : (viewAsAgentId || initialViewParam === "individual" || initialAgentParam ? "individual" : "all")
  ```

- **Page `scopedAgent` memo** — a `?agent=<other>` deep link still resolves to
  self:
  ```ts
  if (!canCrossAgent) return selfAgent;   // was: if (!canAll)
  ```

- **Page `viewAsAgentId` sync effect** — a stray lens can't flip them into All /
  another agent:
  ```ts
  if (!canCrossAgent) { setTab("individual"); return; }   // was: if (!canAll) return;
  ```

Net: an individual Sales Agent has NO topbar Agents pill, NO page agent dropdown,
NO All/Individual toggle; they see their OWN Individual workspace; and
`/leads/performance?agent=<otherAgentId>&view=individual` renders THEIR OWN data.
`canOwn` / the own-scope individual experience and the shared read-only
leaderboard (`canAll` branches on the All-Agents table copy, `showReport`,
`onReport`, the summary cards) are untouched.

---

## 4. Dropdown height fix (Part 3)

In `AgentScopePicker` (`performance/page.tsx`) the agent rows were rendered in a
plain `<div className="py-0.5">` with no inner cap, so a long roster grew very
tall before the panel-level cap engaged. The mapped rows are now wrapped in a
capped, internally-scrolling container (empty-state message unchanged):

```tsx
<div className="max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll">
  {agents.map((a) => ( /* unchanged MenuItem: avatar, name, roleLabel,
     selected highlight bg-[#EEF1FD], Check mark */ ))}
</div>
```

- `max-h-[min(50vh,320px)]` ≈ half the viewport (adapts to small screens, caps at
  320px), matching the topbar selector's `max-h-[280px] overflow-y-auto` pattern.
- `rox-rail-scroll` = the repo's thin 4px brand-blue scrollbar utility
  (`globals.css`).
- Still a Dropdown (no modal); selected-item highlight, avatars, roles and the
  check mark preserved. Usable at 13-inch / 80–125% zoom.

---

## 5. Files changed

1. **`src/app/(app)/leads/performance/page.tsx`**
   - Destructure `currentUserIsSalesAgent` from `useLeads()`.
   - Add `const canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId);`
   - `tabToggle`: `canAll` → `canCrossAgent`.
   - Individual-header picker: `{canAll && …}` → `{canCrossAgent && …}`.
   - Initial `tab`: default `!canCrossAgent ? "individual" : …`.
   - `scopedAgent` memo: `if (!canAll)` → `if (!canCrossAgent)` (+ dep update).
   - `viewAsAgentId` sync effect: `if (!canAll) return;` → `if (!canCrossAgent) { setTab("individual"); return; }` (+ dep update).
   - `AgentScopePicker` list wrapped in `max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll`.

2. **`src/lib/leads-context.tsx`**
   - `canViewAsAgent` tightened to
     `!currentUserIsSalesAgent() && (canSeeAllLeads || allow(can, CAP.lead.performanceAll))`.

3. **`src/components/layout/agent-scope-selector.tsx`** — inspected, already
   compliant (both guards present); **no change made**.

Not edited (coarse keys intentionally kept): `capabilities.ts`,
`permission-levels.ts`.

---

## 6. Verification results (exact)

### `npx tsc --noEmit`
- Command: `npx tsc --noEmit` (cwd `/Users/apple/Desktop/Reapirox dummy2/app`)
- Exit status: **0** — no errors.

### `npm run build`
- First run (stale `.next`): compiled + types valid, but failed late in
  "Collecting page data" with `PageNotFoundError: Cannot find module for page:
  /api/feature-visibility` (also `/api/lead-kanban`, `/api/dashboard-preferences`).
  Those route files EXIST and are untouched by this work; this is the known
  Next.js 14 stale-`.next`-cache artifact already documented in
  `.agents/tasks/four-fixes-verification.md`.
- Fix: `rm -rf .next && npm run build`.
- Clean run: **SUCCESS** — `✓ Compiled successfully`, types valid, all pages
  generated (full route table printed, incl. `/leads/performance`). Exit 0.

Both checks pass. Change is scoped to gating + dropdown height; no unrelated
refactor. TypeScript is clean and all touched call sites/types updated.
