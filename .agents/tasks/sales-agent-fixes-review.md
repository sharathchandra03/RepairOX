# Sales-agent store scope + Add User defaults

The change fixes three related RepairOX glitches reported by the user: (1) sales agents whose home store is Indiranagar only appeared on the Agent Performance page under "All Shops", never when Indiranagar itself was selected; (2) the Add User form defaulted the Home store to BEL Road instead of Indiranagar; (3) the Add User form defaulted the Assign role to Reception instead of Branch/Store Manager. The approach is a targeted root-cause fix on the Agent Performance page (match eligible agents against the *selected* store, `activeStoreId`, rather than `stores[0]`) plus two default-preference tweaks on the Add User form. No store scope, RLS, or permission surface is widened.

Watch for: the Issue 3 role chain probes `store_manager` and `branch_manager` ids that do not exist in the built-in role catalog (only `shop_owner_branch_manager` does) — this is confirmed harmless but worth noting as forward-compat speculation.

**Verdict**: APPROVED

## High-level view

Issue 1 is the substantive fix and it addresses the real root cause. The page previously computed `eligibleAgents = agentsForStore(salesAgents, stores[0]?.id)`. `stores` is sorted active-first then alphabetical, so `stores[0]` is "BEL Road", never the user's selection. `agentsForStore` filters agents whose `storeIds` (branch ids from the RLS-scoped `lead_sales_agents` RPC) include the passed id — so the list was always filtered to BEL Road, and Indiranagar agents only reappeared under All Shops where the id is `undefined` (which short-circuits to "all agents"). The fix swaps `stores[0]?.id` for `activeStoreId`, the actually-selected store id, with `isAllShops` (defined as `activeStoreId === null`) still mapping to the org-wide `undefined`. The matching is id-vs-id and the activeStoreId-vs-null handling is correct.

Scope is not loosened. `salesAgents` still comes from the RLS-scoped RPC, so the user can only ever see agents in stores they are already authorized to view; the change only corrects *which authorized store* is used for the client-side filter. The owner read-only lens is untouched by this edit.

Issue 2 defaults the Home store to a store named "Indiranagar" (trim + lowercase match) and falls back to `stores[0]`. The `branch` state is a store *name* everywhere in this form (the select binds names, the id is resolved at submit via `stores.find(s => s.name === branch)`), so name-based matching is the correct dimension here.

Issue 3 changes the default Assign role from `reception` to a store/branch manager, preferring `store_manager`, then `branch_manager`, then `shop_owner_branch_manager`, then the existing `assignableRoles[0] ?? allRoles[0]` tail — all constrained to `assignableRoles`. In the built-in catalog only `shop_owner_branch_manager` ("Shop Owner / Branch Manager") exists, so the real resolved default is that role, which matches the user's request.

<details>
<summary>Issues (1)</summary>

1. **Speculative role ids (non-blocking)** — the Issue 3 chain probes `store_manager`/`branch_manager`, which aren't built-in role ids; only `shop_owner_branch_manager` is. Harmless because the chain falls through to it and all probes are constrained to `assignableRoles`, but the first two probes are dead for the default catalog. No action required unless those custom roles are expected.

</details>

<details>
<summary>Details</summary>

### Issue 1 — root cause of the store-scope mismatch

`agentsForStore(agents, storeId)` (src/lib/sales-agents.ts) returns all agents when `storeId` is falsy, otherwise `agents.filter(a => a.anyStore || a.storeIds.includes(storeId))`. `storeIds` are branch ids mapped from the `lead_sales_agents` RPC row (`rowToSalesAgent`), so the argument must be a branch *id*. `activeStoreId` from `useStoreContext` is exactly that — a `string | null` store id, `null` in All Shops mode — and `isAllShops` is literally defined as `activeStoreId === null`. So:

- All Shops → `isAllShops` true → `undefined` → every eligible agent (org-wide). Unchanged.
- Indiranagar selected → `activeStoreId` = Indiranagar's id → agents whose `storeIds` include it. An agent with home store = Indiranagar is included. This is the exact example from the bug report and it now resolves correctly.

The old `stores[0]?.id` was wrong because `sortStores` orders active-first then alphabetical, making `stores[0]` deterministically "BEL Road" (alphabetically before "Indiranagar") regardless of selection. That is why the agents surfaced only under All Shops before. The fix is the correct minimal change, and the `useMemo` dependency array was updated in lockstep (`[salesAgents, isAllShops, activeStoreId]`).

The `?? undefined` after `activeStoreId` is redundant (when `isAllShops` is false, `activeStoreId` is already non-null) but harmless and defensive. No concern.

Store scope / RLS / permissions are not loosened: the agent set still originates from the RLS-scoped RPC; this edit only selects which authorized store id is used for an in-memory filter. Showing a user agents in the store they explicitly selected is within what they are already authorized to view.

### Issue 2 — Home store default

The effect only re-defaults when the current `branch` is not a valid store name (`!stores.some(s => s.name === branch)`), so it fires once on load (placeholder doesn't match) and never clobbers a manual selection. It now prefers the Indiranagar store by case/whitespace-insensitive name and otherwise keeps the prior `stores[0]` behavior. Name-based matching is correct here because `branch` is a name throughout the form and is resolved to `homeStoreId` at submit.

### Issue 3 — Assign role default

The chain prefers `store_manager` → `branch_manager` → `shop_owner_branch_manager` → `assignableRoles[0]?.id` → `allRoles[0].id`, each `.find` scoped to `assignableRoles`, so the default can never be a role the server would reject (the delegation-authority guard still applies). In the built-in catalog the effective default is `shop_owner_branch_manager` = "Shop Owner / Branch Manager", satisfying the user's "Branch manager/store manager" request. The `store_manager`/`branch_manager` probes only matter if an org has custom roles with those ids; otherwise they are no-ops. Non-blocking.

### Verification evidence

The commit message records: `npx tsc --noEmit` passed (exit 0) and `npm run build` compiled successfully (exit 0), both run in `app/`. Per instructions these were not re-run. The diff is minimal (2 files, +24/-10), matches the surrounding code style (same `useMemo`/effect patterns, same comment density), and introduces no new imports beyond swapping `stores` for `activeStoreId` from the already-imported `useStoreContext`.

</details>

<details>
<summary>Files changed</summary>

- `src/app/(app)/leads/performance/page.tsx` — eligible-agent filter now keys off `activeStoreId` (selected store) instead of `stores[0]`; `useStoreContext` destructure and `useMemo` deps updated.
- `src/app/(app)/settings/roles-permissions/add-user/page.tsx` — Home store default prefers "Indiranagar"; Assign role default prefers store/branch-manager roles within `assignableRoles`.

Full diff: `git show ad2f605`

</details>
