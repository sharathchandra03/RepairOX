# Design Review — Sales Agent Attendance, Break Management & Productivity

**Reviewed design:** `app/.agents/tasks/attendance-design.md`
**Against:** `app/.agents/tasks/attendance-requirements.md` + `app/.agents/tasks/attendance-codebase-notes.md`
**Review type:** fresh, independent review (verifying repository claims against live source, not taking the design's word)
**Prior history:** the design has already resolved 11 findings (pass 1) + 9 findings (pass 2). This is pass 3.

---

## Verdict

**CHANGES_REQUESTED** — 1 MEDIUM + 1 NIT.

The design is comprehensive, internally consistent, and its repository claims are accurate (see Verified Assumptions). The two prior review passes closed the schema/RLS/state-machine/time-engine/idempotency/logout concerns thoroughly. One genuine specification gap remains in the owner-report API route: because it reads through the **service-role client (RLS bypassed)**, the hand-written scope filter is the *only* data boundary and it is not specified concretely enough to implement safely. That is a MEDIUM. One NIT about the touch-route realtime-suppression being stated as optional.

---

## Findings

### 1. [MEDIUM] Owner report/export route bypasses RLS (service-role client) but the replacement scope filter is underspecified

**Where:** §4.2 `POST /api/work-session/report` and §9 (export reads the same route).

**Problem.** Verified in `app/src/lib/account-security.ts`: `requireUser` returns a **service-role admin client** (`createAdminClient()`), and `requirePermission` (`app/src/lib/api-auth.ts`) is a capability check, not a client that enforces RLS. So any query the report route runs through that client **bypasses the `work_sessions`/`work_session_breaks` RLS policies entirely** (`auth_work_sessions_see`, `auth_branch_visible`, org isolation). The design acknowledges this ("read through the service-role client but re-constrained to the caller's authorized scope ... so the API never returns wider data than RLS would") but never specifies the concrete filter. This is the one place where "UI = server = RLS must agree" (NFR §49) is NOT backstopped by RLS — the application-code filter is the sole boundary, and it is exactly the kind of hand-rolled scope replication that silently leaks cross-store/cross-org data when an implementer gets a predicate wrong.

Open sub-questions the design leaves unanswered:
- Exact query: which columns are filtered on, and how is `auth_work_sessions_see`'s three-part rule (org = caller org; AND (self OR (branch-visible AND has team/all key))) reproduced in SQL/JS?
- How is the caller's store scope obtained server-side? The design says "the caller's `staff_store_ids`" but `staff_store_ids(uuid)` is `revoke all ... from public, anon, authenticated` (verified in migration 0049) — it is internal/not client-callable, so the route cannot simply RPC it as the user. The route must resolve scope another way (e.g. the admin client calling it, or replicating `auth_store_ids`).
- Cross-branch callers: how is `auth_can_cross_branch()` (= `multi_store_access`) honored so an owner with multi-store access sees all org stores, while a store-manager with only `work_sessions_view_team` is held to in-store + null-branch rows?
- Null-branch rows: the §1.5 null-branch rule (org-wide rows visible to team/all/reports-key holders) must be reproduced here too, or the route will diverge from RLS.

**Concrete fix (choose one, specify it in §4.2):**
- **(Preferred) Enforce via RLS, not hand-rolled filtering.** Have the report route create a **user-scoped Supabase client bound to the caller's bearer token** (RLS active) rather than the service-role client, then just `SELECT` the rows — RLS (`work_sessions_sel` → `auth_work_sessions_see`) does all the scoping, and the route adds only the agent/date/store *filters* on top. This makes the owner route obey the exact same policy as every other read, eliminating the duplicate-scope-logic risk. Confirm the repo has a token-bound client factory (the self routes use the admin client because they re-filter by `staff_id` in code; the report route is the case where RLS should be the boundary). If no such factory exists, add one or document creating a client with the caller's JWT.
- **(If the service-role client must be used)** write out the exact scope SQL in the design: `organization_id = <caller org>` AND `(staff_id = <caller staff id> OR (<branch-visible test incl. null> AND <caller holds team/all/reports key>))`, with the branch-visible test spelled out (caller branch OR cross-branch scope OR row branch is null), the agent set intersected with `lead_sales_agents()`, and an explicit statement that this duplicates `auth_work_sessions_see` and MUST be kept in lockstep with it. Add this to the steering lockstep note (§11) alongside the existing CAP↔RLS lockstep rule.

---

### 2. [NIT] Touch-route realtime suppression stated as "chosen default" but with an acceptable-churn fallback — pin it as mandatory

**Where:** §4.2 `touch` route decision and §8 realtime decision.

**Problem.** The design says the realtime handler ignores `last_seen_at`/`updated_at`-only changes ("the local-patch path is the chosen default"), but then adds: "If that column-diff is not implemented, the 60s cadence for the single owning user is acceptable churn." Leaving it optional invites an implementer to skip the column-diff, producing a guaranteed refetch-of-the-open-session every 60 seconds for every working user — small per user, but it is avoidable churn that also risks a visible flicker on the live indicator. Since §4.2 already fully specifies the touch write and the suppression logic, there is no reason to leave the suppression optional.

**Concrete fix.** Change the wording so the heartbeat-only suppression is **required**, not a default-with-fallback: "The realtime handler MUST compare `old`→`new` and, when the only changed columns are `last_seen_at`/`updated_at`, patch `last_seen_at` locally without a refetch." Drop the "acceptable churn" escape clause (or keep it only as a note that the engine math is unaffected either way).

---

## Verified Assumptions (checked against live source)

1. **`topbar.tsx` `handleLogout()` is synchronous** (`logout(); router.push("/login");`) and invoked from `onClick={() => { handleLogout(); close(); }}`. ✅ Confirmed — the §4.4 async-logout change and its description are accurate.
2. **`permission-levels.ts` `levels` is `Partial<Record<AccessLevel, PermissionKey[]>>`**, and the `sales_agent` module declares only `{ work: [...] }` and `account` only `{ work: [...] }`. ✅ Confirmed — declaring a subset of tiers (and omitting `work` in §2.3) is an established pattern. `supportedLevels` filters `(module.levels[lv]?.length ?? 0) > 0` and `levelToKeys` guards the key loop, so a missing/empty tier is safely skipped. ✅
3. **`manage_attendance`** exists in the union, in a `PERMISSION_GROUPS` def, and at the `employees` module **`manage`** tier. ✅ Confirmed — valid as the coarse `CAP` fallback (§2.4) and the design's decision NOT to reuse the `employees` matrix module is sound.
4. **`auth_branch_visible(b) = auth_can_cross_branch() or b is null or b = auth_branch_id()`** (migrations 0001/0034). ✅ Confirmed — so `auth_branch_visible(null)` is `true` for every caller, exactly as the §1.5 null-branch decision states; the "org-wide for null-branch rows" framing is accurate and matches the existing per-store tables.
5. **`auth_can_cross_branch()` = `multi_store_access`** (migrations 0030/0034/0039). ✅ Confirmed.
6. **Partial-unique-index-as-concurrency-guard precedent** exists: `lead_deals_one_open_per_lead` (migration 0063) is a partial unique index on `(lead_id) where status in (...)`. ✅ Confirmed — the `work_sessions_one_open_per_staff on (staff_id) where ended_at is null` and `work_session_breaks_one_open_per_session on (session_id) where ended_at is null` designs are correct and WILL prevent 2 open sessions / 2 open breaks atomically; a `23505` on race → resume is the right mapping.
7. **`lead_sales_agents(p_branch_id uuid default null)` RPC** exists, returns the eligible active sales-agent directory, and is `grant execute ... to authenticated` (migration 0049). ✅ Confirmed — correct source for the owner agent selector (requirement §34).
8. **`requireUser`** exists in `account-security.ts` (async, verifies any bearer token, returns a service-role client). ✅ Confirmed — correct for the self-scoped session routes; **this is also the root of Finding 1** (service-role client bypasses RLS for the owner report).
9. **`requirePermission`** exists in `api-auth.ts` (async, resolves live from `role_permissions`). ✅ Confirmed.
10. **`downloadXLSX` is `export async function`**; `downloadCSV` / `toCSV` are synchronous (`csv-utils.ts`). ✅ Confirmed — the §9 `await downloadXLSX(...)` inside `try/catch` and synchronous `downloadCSV(..., toCSV(...))` are both correct.
11. **`StoreSettings.timeZone`** exists, default `"Asia/Kolkata"`, mapped from the `timezone` column. ✅ Confirmed — the engine taking the IANA tz string as a parameter (§3.3) is correct and keeps the engine pure.
12. **Migration numbering**: last is `0074`, so `0075_work_sessions.sql` is correct. ✅ Confirmed (codebase notes; consistent with the migration directory convention cited).

---

## Unverified / Wrong Assumptions

None found. Every repository-specific claim the design makes that I spot-checked (logout shape, permission-levels typing + tier-subset precedent, `manage_attendance` placement, `auth_branch_visible` null behavior, `auth_can_cross_branch`, the partial-unique-index precedent, `lead_sales_agents` RPC, `requireUser`/`requirePermission`, `downloadXLSX` async, `StoreSettings.timeZone`) was accurate against live source.

The two prior passes' fixes all still hold:
- Time engine: `net = max(0, elapsed − break)`, interrupted cutoff = `lastSeenAt` (not `now`), open-healthy cutoff = `now`, midnight split in org tz without inventing events, and the added test 10 (interrupted + midnight) correctly locks the engine's correctness per requirements §20–25. ✅
- Idempotency across refresh/tabs/reconnect via the three layers (in-tab `useRef` single-flight → server open-session SELECT → partial unique index resume). ✅
- Logout closes break + session before auth logout, bounded by `Promise.race` so it never traps the user; local-mode synchronous flush documented as the one NFR §46 exception. ✅
- Presence vs Work Status kept strictly separate (dedicated postgres-changes subscription scoped to the user's own rows, never the presence channel). ✅
- Owner view is analysis-only (no impersonation), agent selector from the eligibility RPC. ✅ (The *data boundary* for that view is Finding 1.)
- Capability wiring across all five layers (union + group def + new `work_session` matrix module + `CAP.workSession` + `requirePermission` + RLS), with the CAP↔RLS `auth_has_any` lockstep stated. ✅
- Append-only corrections (no update/delete policy on `work_session_events`, `previous` snapshot, mandatory reason, `work_sessions_correct` gate, store-scoped corrector branch). ✅
