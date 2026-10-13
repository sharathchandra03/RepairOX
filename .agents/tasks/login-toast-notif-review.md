# Session-start backlog guard for follow-up toast watchers

The two headless follow-up watchers mounted in the `(app)` layout were replaying a freshly-logged-in user's entire backlog of already-due follow-ups as a burst of toast popups + sound. Both watchers iterate the full dataset on first mount — the follow-up engines emit an immediate clock tick on `sync`, so the announce effect runs right away — and the only guards (`announced` set + `hasNotification(dedupeKey)`) miss for a first-time/newly-assigned user because those keys never existed in a prior session. The fix captures a one-time `sessionStart` timestamp at mount and compares each event's **due instant** to it: backlog events (`dueTs < sessionStart`) still write the durable bell notification but skip `toast.info` + `playWalkInSound`; live/in-session events (`dueTs >= sessionStart`) toast as before.

Watch for: nothing blocking. The approach is correct and tightly scoped; the one minor thing worth noting is the walk-in `dueTs ?? 0` fallback (confirmed benign below).

**Verdict**: APPROVED

## High-level view

The change is scoped to exactly two files — `lead-followup-watcher.tsx` and `walk-in-followup-watcher.tsx` — plus the verification doc. The four protected files (`notifications.ts`, `notification-bell.tsx`, `route-lead-dialog.tsx`, `leads-context.tsx`) are confirmed untouched, so targeting, broadcast semantics, the shared `STORAGE_KEY`, and the already-correct assignment-watcher baseline are all preserved. No per-user store scoping was applied, which matches the plan's analysis: the watchers already filter strictly by recipient, so the symptom is a mount-time backlog replay, not cross-user leakage.

The guard measures backlog against the follow-up's **due instant**, not the notification `ts`. This is the right choice: an Overdue follow-up has a `dueAt` in the past, so it is correctly classified as backlog on login, while a follow-up that crosses its time live (or an owner routing a lead to a logged-in reception user) has a due instant at/after `sessionStart` and still toasts once. The `notify(...)` call stays unconditional in both watchers, so the durable bell feed keeps showing legitimately-targeted history, and `dedupeKey` + the `announced` set are byte-for-byte unchanged, so idempotency is intact.

The lead watcher re-baselines `sessionStart` when `currentUserId` changes (via `sessionUserRef`), so switching user on the same browser profile establishes a fresh baseline instead of inheriting the previous user's — a nice correctness detail given the browser-global `announced` set. The walk-in watcher has no user id in scope and baselines once per mount, which is appropriate since it filters by `w.salesPersonId`.

<details>
<summary>Issues (1)</summary>

1. **Walk-in `dueTs ?? 0` fallback** (possible, non-blocking) — `followUpDueAt(w)?.getTime() ?? 0` yields `0` when a due date can't be resolved, which would classify such an event as backlog (`0 < sessionStart`) and suppress its toast. Confirmed benign because the loop already requires `isFollowUpDue(w, asOf)` and `hasActiveFollowUp(w)` to pass before this line, so a null due date cannot reach it in practice. No action required.

</details>

<details>
<summary>Details</summary>

### Backlog guard correctness (fresh login produces no burst)

The claimed trigger is verified. `syncLeadFollowUpDueInstants` / `syncFollowUpDueInstants` call `emitClock()` immediately whenever the instant set changes (confirmed in `lead-followup-engine.ts` lines ~64–73), so the announce effect runs on first mount. In the pre-fix code the loop called `toast.info(...)` + `playWalkInSound(...)` for every due/overdue recipient-matched follow-up, gated only by `announced` + `hasNotification` — both of which miss for a user with no prior session.

The fix captures `sessionStartRef.current = Date.now()` at the top of the announce effect on the first run, reads it into a local `sessionStart`, and for each candidate computes `isBacklog = dueTs < sessionStart`. The `notify(...)` call is left outside the new conditional; only the `toast.info(...)` + `playWalkInSound(...)` pair is wrapped in `if (!isBacklog) { … }`. On a fresh login every already-due item has `dueTs` in the past (strictly less than `Date.now()` captured microseconds later), so every backlog item is `isBacklog = true` → bell record written, no toast, no sound. The burst is eliminated.

The baseline capture sits before the loop and is guarded so the many clock-driven re-runs don't move it: `if (sessionStartRef.current === null ...) sessionStartRef.current = Date.now();`. Because the ref persists across re-renders, `sessionStart` is stable for the life of the mount.

### Live in-session events still toast

For an event that becomes due during the session, the precise timer fires `emitClock()` at the due instant; the announce effect runs on that tick with `sessionStart` already fixed at login time. The event's `dueTs` equals the just-reached instant, which is `>= sessionStart`, so `isBacklog = false` and both the toast and sound fire once (deduped by `dedupeKey`/`announced`). The owner-routes-a-lead case travels the same path: when the routed lead's follow-up reaches its time while the reception user is logged in, its due instant is after `sessionStart` and it toasts. `route-lead-dialog.tsx`'s own route-time toast is untouched (file not in the diff), so that independent live toast also still works.

### Durable bell feed and dedupe intact

`notify(...)` is unconditional in both watchers — backlog items are still recorded, so the bell dropdown continues to list legitimately-targeted history. `notifications.ts` is not in the diff, so `isForRecipient`, `STORAGE_KEY`, and `demoKey` are unchanged; role-targeted and broadcast history semantics are preserved. The `dedupeKey` passed to `notify` and the module-level `announced` set + `hasNotification(key)` short-circuit are byte-for-byte identical to before; the new guard only decides whether a toast/sound accompanies an already-deduped announce. There is no double-record and no path where a backlog item is dropped from the bell.

### Per-user store scoping — correctly NOT applied

No per-user keying of the notification store was introduced, matching the plan. The lead watcher filters `recipientId !== currentUserId → continue` and the walk-in watcher filters by `w.salesPersonId`, so a user is only toasted about their own items; the symptom was a backlog replay, not another user's data. Scoping the shared store per user would have removed intended role/broadcast bell history and is out of scope. Delivery/targeting for legitimately-targeted users is unaffected.

One subtle correctness win: because the browser-global `announced` set is shared across users on one profile, the lead watcher re-baselines `sessionStart` on `currentUserId` change (`sessionUserRef`). This means switching user doesn't inherit a stale baseline. The walk-in watcher baselines once per mount, which is fine — it has no user dimension and relies on `salesPersonId` filtering plus `followUpReadAt`.

### Type safety and scope

The additions are a `useRef<number | null>(null)`, a `useRef<string | undefined>(undefined)` (lead only), two local `const`s (`dueTs: number`, `isBacklog: boolean`), and an `if` wrapper. No new imports, no signature changes, no `any`. The verification note records `npx tsc --noEmit` exit 0 and `npm run build` exit 0 (`✓ Compiled successfully`, 135/135 static pages). Per instructions I did not re-run the suites; the recorded evidence is specific and consistent with a change of this size and shape. `git diff HEAD~1 HEAD --name-only` confirms the scope: only the two watcher files and the verification doc.

</details>

<details>
<summary>File map</summary>

- `src/components/leads/lead-followup-watcher.tsx` — added `sessionStartRef` + `sessionUserRef`, baseline (re-)capture on user change, `dueTs`/`isBacklog` computed from `fu.dueAt`, toast+sound gated behind `if (!isBacklog)`; `notify` left unconditional.
- `src/components/walk-in/walk-in-followup-watcher.tsx` — added `sessionStartRef`, baseline capture on first run, `dueTs`/`isBacklog` from `followUpDueAt(w)`, toast+sound gated; `notify` left unconditional.
- `.agents/tasks/login-toast-notif-verification.md` — coder's verification note (build gate results, code trace).

Full diff: `git diff HEAD~1 HEAD`.

</details>
