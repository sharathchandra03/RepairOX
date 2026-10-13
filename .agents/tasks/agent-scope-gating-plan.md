# Agent Performance — cross-agent scope gating leak + dropdown height

Investigation only produced this document. No code was changed in this step.

## Summary

An **individual Sales Agent** can still see/use the cross-agent controls on
Lead Management → Agent Performance (the page agent dropdown + the
`All Agents / Individual` toggle). The topbar "Agents" pill is already correctly
hidden for them, but the **page** is not, and the view-as-agent lens can
actually take effect for them. Root cause is confirmed below. The fix is the
compound guard the task describes, applied to BOTH surfaces, plus a tightening
of `canViewAsAgent`, plus the dropdown height cap.

---

## 1. CONFIRMED root cause of the leak

### The CAP OR-set (verbatim, `app/src/lib/capabilities.ts`)

```ts
// CAP.lead
performanceOwn: ["leads_performance_view_own", "leads_view", "manage_sales"],
performanceAll: ["leads_performance_view_all", "leads_view_all", "view_sales_reports", "manage_reports"],
```

`allow(can, keys)` returns true if the user holds **any** key, and `can()`
already implies `full_access` / `*`.

### Does a Sales Agent hold a coarse key in the `performanceAll` set?

- **Migration `0049_sales_agent_lead_ownership.sql` (Section 1)** grants the
  built-in `sales_agent` role: `leads_sales_agent, leads_view, leads_create,
  leads_edit, leads_followup, leads_assign, leads_stage_change,
  leads_priority_change, leads_pin, leads_performance_view_own`, plus comms /
  customers / contacts / catalog / dashboard / account / notifications keys.
  It does **NOT** include `leads_performance_view_all`, `leads_view_all`,
  `view_sales_reports`, or `manage_reports`. So the *built-in* role, by its DB
  default, does **not** resolve `performanceAll`.

- **The leak comes from the permission MATRIX, not the 0049 default.** In
  `app/src/lib/permission-levels.ts`, the Leads module **`view` tier** is:

  ```ts
  view: ["leads_view", "deals_view", "quotations_view", "companies_view",
         "contacts_view", "comms_activities_view", "leads_inbox_view",
         "leads_map_view", "view_sales_reports", "leads_performance_view_own"],
  ```

  It bundles **`view_sales_reports`** — which is a coarse member of
  `CAP.lead.performanceAll`. So **any role set to Leads = "view" tier (or higher)
  in Roles & Permissions resolves `allow(can, CAP.lead.performanceAll) === true`.**
  A Sales-type role that was configured through the matrix "view" tier (rather
  than the exact 0049 grant list) therefore passes the `performanceAll` gate.
  This is the confirmed source of the symptom.

### Which of (a)/(b)/(c) is happening — all three contribute

- **(a) TRUE and is the trigger.** `CAP.lead.performanceAll` contains the coarse
  `view_sales_reports`, and the Leads "view" matrix tier grants that key, so
  `performanceAll` resolves truthy for the affected individual agent.
- **(b) Not the fault.** `currentUserIsSalesAgent(activeStoreId)` →
  `isAgentEligible(salesAgents, currentUserId, storeId)` correctly returns true
  for an eligible Sales Agent in the active store. (Watch the known edge cases:
  it is false before the directory loads — `salesAgentsReady` — and when the
  agent's authorized stores don't include the active store. Those are timing /
  scope conditions, not the primary cause.)
- **(c) TRUE and is the real gap on the page.**
  `agent-scope-selector.tsx` has the extra guard
  `if (currentUserIsSalesAgent(activeStoreId)) return null;` AFTER the
  `performanceAll` check — so the topbar pill is hidden. But
  `app/src/app/(app)/leads/performance/page.tsx` gates the picker + toggle on
  **`canAll = allow(can, CAP.lead.performanceAll)` ALONE**, with **no
  `currentUserIsSalesAgent` guard**. So the page's `AgentScopePicker` and
  `tabToggle` still render for the agent whose role carries the coarse
  `view_sales_reports`.

### Secondary correctness problem (view-as lens leaks too)

In `app/src/lib/leads-context.tsx`:

```ts
const canViewAsAgent = canSeeAllLeads || allow(can, CAP.lead.performanceAll);
const effectiveViewAsId = canViewAsAgent ? viewAsAgentId : "";
```

Because `performanceAll` is truthy for the leaking agent, `canViewAsAgent` is
also truthy, so `setViewAsAgent(otherId)` would actually take effect and
`scopedLeads` would scope to another agent — i.e. the individual agent could
view **another agent's** data, not just see a stray control. The fix must also
exclude a current Sales Agent from `canViewAsAgent`.

---

## 2. The exact compound guard (apply in BOTH files)

The rule for showing any cross-agent control:

```
allow(can, CAP.lead.performanceAll) && !currentUserIsSalesAgent(activeStoreId)
```

### 2a. `app/src/app/(app)/leads/performance/page.tsx`

- `useStoreContext()` already provides `activeStoreId` (destructured in the
  component). `currentUserIsSalesAgent` is available from `useLeads()` — add it
  to the existing destructure:
  ```ts
  const { salesAgents, leads, followUps, viewAsAgentId, setViewAsAgent,
          currentUserIsSalesAgent } = useLeads();
  ```
- Introduce a single derived flag right after `canAll` / `canOwn`:
  ```ts
  const canAll = allow(can, CAP.lead.performanceAll);
  const canOwn = allow(can, CAP.lead.performanceOwn);
  // A user who is themselves an eligible Sales Agent never gets cross-agent
  // scope on this page, even if their role carries a coarse reporting key
  // (e.g. view_sales_reports from the Leads "view" tier). Mirrors the topbar
  // AgentScopeSelector guard.
  const canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId);
  ```
- Gate the **toggle** on `canCrossAgent` instead of `canAll`:
  ```ts
  const tabToggle = canCrossAgent ? ( <SegmentedTabs … /> ) : null;
  ```
- Gate the **picker** on `canCrossAgent` instead of `canAll` (Individual header
  actions):
  ```tsx
  {canCrossAgent && <AgentScopePicker … />}
  ```
- **Keep the leaderboard itself available** to both own + all users: the
  `if (!canAll && !canOwn) return <Restricted />` check, the All-Agents table
  copy that branches on `canAll`, and `showReport={canAll}` /
  `onReport={canAll ? …}` stay as-is (an agent still sees the shared ranked
  leaderboard read-only — that is intended per the page comment). Only the
  **cross-agent SCOPE controls** (toggle + picker) switch to `canCrossAgent`.

### 2b. `app/src/components/layout/agent-scope-selector.tsx`

- Already correct in spirit, but make it a single explicit compound guard for
  clarity/consistency (behaviour unchanged):
  ```ts
  if (!allow(can, CAP.lead.performanceAll)) return null;
  if (currentUserIsSalesAgent(activeStoreId)) return null;
  ```
  (These two early-returns already exist; keep them. No functional change
  needed here beyond confirming they remain.)

---

## 3. Force-scope correctness (individual agent → always own data)

Even with the controls hidden, the page/context must *force* the agent to their
own data for every entry path (default view, deep link, stale lens).

### 3a. Context — tighten `canViewAsAgent` (`app/src/lib/leads-context.tsx`)

`currentUserIsSalesAgent` is defined in this provider; `useStoreContext` is not
currently consumed here, so resolve "is a sales agent" **store-independently**
to avoid cross-store ambiguity — pass no store id so it is true if the user is
an eligible Sales Agent in ANY authorized store:

```ts
// A user who is themselves an eligible Sales Agent is always own-scoped: the
// view-as-agent lens is an owner-only tool and must never let an agent scope
// to another agent, even if their role carries a coarse performanceAll key.
const canViewAsAgent =
  !currentUserIsSalesAgent() &&
  (canSeeAllLeads || allow(can, CAP.lead.performanceAll));
```

With this, `effectiveViewAsId` collapses to `""` for an individual agent, so
`setViewAsAgent(other)` is a no-op and `scopedLeads` never scopes to another
agent. (`currentUserIsSalesAgent` with no arg → `isAgentEligible(..., undefined)`
→ `agentsForStore(agents, undefined)` returns ALL agents, i.e. membership check
across every store the directory returned for the caller.)

### 3b. Page — force tab + self scope for an individual agent

Extend the existing `!canAll` own-scope path so it ALSO forces self when the
user is an individual Sales Agent even if a coarse `performanceAll` key is
present. Two spots:

- **Initial `tab` state** — a Sales Agent must never open on `all`:
  ```ts
  const forceOwnScope = !canAll || currentUserIsSalesAgent(activeStoreId);
  const [tab, setTab] = useState<"individual" | "all">(
    forceOwnScope
      ? "individual"
      : (viewAsAgentId || initialViewParam === "individual" || initialAgentParam
          ? "individual" : "all"),
  );
  ```
  (Compute `forceOwnScope` as a `const` before `useState`; it only reads values
  already available at first render — `canAll`, `currentUserIsSalesAgent`,
  `activeStoreId`.)

- **`scopedAgent` memo** — extend the guard so a `?agent=<other>` deep link by
  an individual agent still resolves to THEIR OWN row:
  ```ts
  const scopedAgent = useMemo(() => {
    if (!canCrossAgent) return selfAgent;   // was: if (!canAll)
    const pick = scopeAgentId || selfAgent.id;
    return eligibleAgents.find((a) => a.id === pick)
      ?? (eligibleAgents.find((a) => a.id === selfAgent.id) ?? eligibleAgents[0] ?? selfAgent);
  }, [canCrossAgent, scopeAgentId, selfAgent, eligibleAgents]);
  ```

- **The `viewAsAgentId` sync effect** — guard on `canCrossAgent` so a stray lens
  can't flip an individual agent into `all` / another agent:
  ```ts
  useEffect(() => {
    if (!canCrossAgent) { setTab("individual"); return; }
    if (viewAsAgentId) { setScopeAgentId(viewAsAgentId); setTab("individual"); }
    else { setTab("all"); }
  }, [viewAsAgentId, canCrossAgent]);
  ```

Net effect: an individual Sales Agent is pinned to `tab="individual"` and
`scopedAgent = selfAgent`; a `?agent=<other>&view=individual` deep link renders
their own data. RLS remains the real boundary (`scopedLeads` for a non-see-all
user is already own-scoped), but the UI now agrees with it.

---

## 4. Do NOT broadly remove the coarse key from the CAP OR-set

Prefer the compound-guard approach above. **Do not remove `view_sales_reports`
(or `leads_view_all`) from `CAP.lead.performanceAll`** in this change:

- Per the permission-matrix steering, `CAP` OR-sets intentionally carry coarse
  legacy keys so pre-existing roles keep working; `performanceAll` is also used
  to resolve the owner All-Agents leaderboard data scope and `canViewAsAgent`.
- Removing `view_sales_reports` would silently revoke the All-Agents comparison
  from genuine report-viewer / manager roles that rely on that coarse key, a
  broad behavioural change beyond this bug.
- The `!currentUserIsSalesAgent(...)` guard is the correct, surgical fix: it
  excludes exactly the individual-agent case without touching the capability
  model. Leave the OR-set unchanged.

(If a future cleanup wants to narrow `performanceAll`, that is a separate,
matrix-wide decision — out of scope here.)

---

## 5. Dropdown height fix (`AgentScopePicker` in performance/page.tsx)

The shared `<Dropdown>` panel already caps its total height to the viewport
(`maxHeight` + `overflow-y-auto`), but `AgentScopePicker` renders its rows in a
plain `<div className="py-0.5">` with no inner cap, so with many agents the list
grows very tall before the panel-level cap engages. Match the topbar selector's
pattern (`max-h-[280px] overflow-y-auto`) and cap to ~half the viewport with the
repo scrollbar utility.

- File: `app/src/app/(app)/leads/performance/page.tsx`, `AgentScopePicker`
  render body. Wrap the agent **rows** in a capped, internally-scrolling
  container (keep the empty-state message as-is):

  ```tsx
  {(close) => (
    <div className="py-0.5">
      {agents.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-muted-foreground">No sales agents available</p>
      ) : (
        <div className="max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll">
          {agents.map((a) => ( /* …unchanged MenuItem with avatar, name,
             roleLabel, selected highlight (bg-[#EEF1FD]) and the Check mark… */ ))}
        </div>
      )}
    </div>
  )}
  ```

- `rox-rail-scroll` (globals.css) is the thin 4px brand-blue scrollbar utility —
  the right fit here. (`max-h-[260px]` is an acceptable fixed alternative; the
  `min(50vh,320px)` form adapts to small screens.)
- Keep it a Dropdown (no modal). Keep selected-item highlight, avatars, roles,
  and the check mark — only the wrapper changes.
- Optional polish: pass an explicit `width="w-64"` to this `<Dropdown>` so the
  agent names/roles have room (currently it uses the default `w-56`). Not
  required for the height fix.

---

## Files to change (exact)

1. `app/src/app/(app)/leads/performance/page.tsx`
   - Destructure `currentUserIsSalesAgent` from `useLeads()`.
   - Add `const canCrossAgent = canAll && !currentUserIsSalesAgent(activeStoreId);`
   - Gate `tabToggle` and `{canCrossAgent && <AgentScopePicker…/>}` on `canCrossAgent`.
   - Force own-scope: `forceOwnScope` in initial `tab`; `scopedAgent` memo on
     `canCrossAgent`; the `viewAsAgentId` sync effect on `canCrossAgent`.
   - Cap `AgentScopePicker`'s agent list with
     `max-h-[min(50vh,320px)] overflow-y-auto rox-rail-scroll`.

2. `app/src/lib/leads-context.tsx`
   - Tighten `canViewAsAgent` to `!currentUserIsSalesAgent() && (canSeeAllLeads || allow(can, CAP.lead.performanceAll))`.

3. `app/src/components/layout/agent-scope-selector.tsx`
   - No functional change required (guards already present). Confirm the two
     early-returns remain: `performanceAll` AND `!currentUserIsSalesAgent(activeStoreId)`.

Do NOT edit `capabilities.ts` or `permission-levels.ts` (coarse keys stay).

## Verification (after implementation, in a later step)

- `cd app && npx tsc --noEmit` — clean.
- `cd app && npm run build` — succeeds.
- Manual/role check: an individual Sales Agent on
  `/leads/performance` sees NO topbar Agents pill, NO page agent dropdown, NO
  All/Individual toggle; the page shows their own Individual workspace; a
  `/leads/performance?agent=<otherAgentId>&view=individual` deep link still
  renders THEIR OWN data. An owner / full-access user keeps all controls and the
  agent dropdown scrolls internally at ~half height.
```