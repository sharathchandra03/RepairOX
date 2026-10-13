# Verification — Fix the RepairOX login notification-toast burst

## Required outcome (restated)

A freshly-logged-in user must NOT get toast popups for pre-existing/historical
events. Toasts fire ONLY for events that occur during the active session. The
durable bell feed still shows legitimately-targeted history. Dedupe
(`dedupeKey`) stays intact. Legitimate live in-session toasts are preserved
(e.g. an owner routing a lead to a store while a reception user is logged in
still live-toasts that reception user).

Iteration: FIRST (no `login-toast-notif-review.json` present) — implemented the
plan from scratch.

---

## Confirmed trigger of the login toast burst (file / line)

The burst is produced by the two global headless follow-up watchers mounted in
the `(app)` layout. Both iterate the ENTIRE dataset on first mount and call
`toast.info(...)` + sound for every currently Due/Overdue follow-up, with **no
session-start guard**:

1. **Primary — Lead Follow-Up Watcher.**
   `src/components/leads/lead-followup-watcher.tsx`, the announce `useEffect` on
   `[now, followUps, leads, currentUserId]`.
   - `syncLeadFollowUpDueInstants(dueInstants)` (`src/lib/lead-followup-engine.ts`
     ~line 72–79) calls `emitClock()` immediately whenever the due-instant set
     changes, so `now` ticks on mount and the announce effect runs right away.
   - The loop (pre-fix lines ~108–135) fired `toast.info(title, …)` and
     `playWalkInSound(...)` for every `scheduled` follow-up whose
     `followUpLifecycle(fu, asOf)` is `Due`/`Overdue` and whose
     `recipientId (= fu.followUpUserId || lead.assignedTo)` equals
     `currentUserId`.
   - Guards were only the module `announced` set + `hasNotification(key)`. For a
     newly-assigned / first-time user those keys never existed in a prior
     session, so BOTH miss and the whole backlog toasts at once.

2. **Secondary (same bug class) — Walk-In Follow-Up Watcher.**
   `src/components/walk-in/walk-in-followup-watcher.tsx`, the announce `useEffect`
   on `[now, walkIns]`. Identical shape: `syncFollowUpDueInstants` emits an
   immediate tick (`src/lib/walk-in-followup-engine.ts`), the loop fired
   `toast.info("Walk-In follow-up due", …)` + sound for each active, due, unread
   follow-up (recipient `w.salesPersonId`). Guards were `announced` +
   `hasNotification(key)` + `w.followUpReadAt` only — no session-start guard.

The durable bell feed (`notification-bell.tsx`) is a dropdown and never toasts,
so it is NOT the symptom. `route-lead-dialog.tsx` toasts only at route time (a
legitimate live event) and is NOT the symptom. The assignment watcher in
`leads-context.tsx` already has a correct baseline guard (`notifyReadyRef`) and
is NOT the cause.

---

## Exact fix applied (mount-time / session-start backlog guard)

A one-time `sessionStart` timestamp is captured at watcher mount. For each
newly-due event we compute its **due instant** and compare to `sessionStart`:

- `isBacklog = dueTs < sessionStart` → the event became due BEFORE this session.
- Backlog events STILL call `notify(...)` unconditionally (the durable bell
  record is preserved, so history still shows).
- Only `toast.info(...)` and `playWalkInSound(...)` are wrapped in
  `if (!isBacklog) { … }`.
- `dedupeKey` and the `announced` / `hasNotification` idempotency are untouched.

"After mount" is measured against each follow-up's **due instant**, not the
notification `ts`, because that is the precise, user-meaningful "did this become
due before I logged in?" check:
- Lead watcher: `dueTs = new Date(fu.dueAt).getTime()`.
- Walk-In watcher: `dueTs = followUpDueAt(w)?.getTime() ?? 0`.

`sessionStart` is captured once per mount with a lazily-initialised ref
(`sessionStartRef`), stable across the many clock-driven re-runs. The Lead
watcher additionally re-baselines when `currentUserId` changes
(`sessionUserRef`), so switching user establishes a fresh baseline rather than
inheriting the previous user's.

### Lead Follow-Up Watcher
```tsx
const sessionStartRef = useRef<number | null>(null);
const sessionUserRef = useRef<string | undefined>(undefined);
...
if (sessionStartRef.current === null || sessionUserRef.current !== currentUserId) {
  sessionStartRef.current = Date.now();
  sessionUserRef.current = currentUserId;
}
const sessionStart = sessionStartRef.current;
...
const dueTs = new Date(fu.dueAt).getTime();
const isBacklog = dueTs < sessionStart;
...
notify({ ... });            // UNCONDITIONAL — bell history preserved
if (!isBacklog) {
  toast.info(title, { ... });
  playWalkInSound(soundPrefsRef.current);
}
```

### Walk-In Follow-Up Watcher
```tsx
const sessionStartRef = useRef<number | null>(null);
...
if (sessionStartRef.current === null) sessionStartRef.current = Date.now();
const sessionStart = sessionStartRef.current;
...
const dueTs = followUpDueAt(w)?.getTime() ?? 0;
const isBacklog = dueTs < sessionStart;
...
notify({ ... });            // UNCONDITIONAL — bell history preserved
if (!isBacklog) {
  toast.info("Walk-In follow-up due", { ... });
  playWalkInSound(soundPrefsRef.current);
}
```

---

## Code trace — fresh login vs in-session event

Scenario: a newly-assigned user logs in and lands on the Lead Dashboard. Their
backlog has a lead follow-up that became due yesterday (`fu.dueAt` =
yesterday), and no live events yet.

**On first mount (login):**
1. `syncLeadFollowUpDueInstants(dueInstants)` → `emitClock()` → `now` ticks →
   the announce effect runs.
2. `sessionStartRef.current === null` → set `sessionStart = Date.now()` (≈ now,
   today).
3. Loop reaches the backlog follow-up. `state` is `Overdue` (yesterday),
   `recipientId === currentUserId` → it is a candidate.
4. `dueTs = new Date(fu.dueAt).getTime()` = yesterday < `sessionStart` (today)
   → `isBacklog = true`.
5. `notify({ ... })` is called → the durable notification is recorded, so the
   **bell feed still lists this item as history** (idempotent via `dedupeKey`).
6. The `if (!isBacklog)` block is SKIPPED → **no `toast.info`, no sound.**
   ⇒ No login toast burst. ✓

**During the session (live event):**
A follow-up is scheduled for ~1 minute in the future, or an owner routes a lead
to a store (via `route-lead-dialog`) so this logged-in user becomes the
recipient. When its time is reached:
1. The precise timer fires `emitClock()` → the announce effect runs on that
   tick.
2. `sessionStart` is already set (today, at login) and does not change.
3. The event's `dueTs` = the just-reached instant ≥ `sessionStart` →
   `isBacklog = false`.
4. `notify({ ... })` records the bell item, AND the `if (!isBacklog)` block runs
   → `toast.info(...)` + sound fire ONCE.
   ⇒ Legitimate live in-session toast preserved. ✓

The route-lead-dialog's own route-time `toast` is unchanged and still fires at
route time (independent of these watchers).

**Dedupe intact:** the `announced` module set + `hasNotification(key)` +
`dedupeKey` logic is byte-for-byte unchanged; the new guard only decides
whether a *toast/sound* accompanies an already-deduped announce.

---

## Per-user store scoping — applied? NO (and why)

Per-user keying of the notification store was **NOT applied**, matching the
plan's analysis:

- The Lead watcher filters strictly by `recipientId === currentUserId` and the
  Walk-In watcher by `w.salesPersonId`, so a user is only ever toasted about
  THEIR OWN items. The burst is a *backlog replay on mount*, not another user's
  data leaking in.
- The shared `STORAGE_KEY = "repairox-notifications"` and the broadcast /
  role-targeted semantics in `isForRecipient` are intentional for the durable
  bell history (role/broadcast history is meant to be visible). Scoping the
  store per user would REMOVE legitimate bell history and is out of scope for
  this symptom.
- Therefore the session-start guard alone fixes the symptom without touching
  targeting, broadcast semantics, or the store key.

The assignment watcher (`leads-context.tsx`) already establishes a baseline on
first load via `notifyReadyRef` (no toast on first pass) and only toasts
newly-appearing assignments afterward — confirmed correct, left unchanged.

---

## Files changed

`git diff --stat`:
```
 src/components/leads/lead-followup-watcher.tsx     | 44 +++++++---
 src/components/walk-in/walk-in-followup-watcher.tsx| 45 +++++++++---
 2 files changed, 68 insertions(+), 21 deletions(-)
```

Exactly the two watcher files — no changes to `notifications.ts`,
`notification-bell.tsx`, `route-lead-dialog.tsx`, or `leads-context.tsx`.

### Key diffs

**`src/components/leads/lead-followup-watcher.tsx`**
- Added `sessionStartRef` + `sessionUserRef`.
- Baseline (re-)established at the top of the announce effect; re-baselines on
  `currentUserId` change.
- Added `const dueTs = new Date(fu.dueAt).getTime(); const isBacklog = dueTs < sessionStart;`.
- `notify(...)` kept unconditional; `toast.info(...)` + `playWalkInSound(...)`
  wrapped in `if (!isBacklog) { … }`.

**`src/components/walk-in/walk-in-followup-watcher.tsx`**
- Added `sessionStartRef`.
- Baseline established on the first announce-effect run.
- Added `const dueTs = followUpDueAt(w)?.getTime() ?? 0; const isBacklog = dueTs < sessionStart;`.
- `notify(...)` kept unconditional; `toast.info(...)` + `playWalkInSound(...)`
  wrapped in `if (!isBacklog) { … }`.

---

## Build gate results (exact)

Run from `/Users/apple/Desktop/Reapirox dummy2/app`:

1. `npx tsc --noEmit`
   - Exit code: **0** (no errors).

2. `npm run build`
   - Exit code: **0** — succeeded.
   - Key output: `✓ Compiled successfully`, `✓ Generating static pages (135/135)`.
   - The stale `.next` cache issue did NOT recur; no cache removal was needed.

---

## Runtime reproduction note (plan item 5)

Interactive runtime reproduction (`npm run dev`, logging in as a freshly-assigned
user) requires a live browser session and is not executable in this
non-interactive environment. The behavior is instead confirmed by the static
code trace above, which proves:
(a) backlog items on login call `notify` but NOT `toast`/sound → no burst;
(b) the bell feed still records those items as history;
(c) a follow-up crossing its time live (`dueTs >= sessionStart`) still toasts once;
(d) an owner routing a lead to a store live-toasts a logged-in recipient
    (same `dueTs >= sessionStart` path; route-lead-dialog's own toast unchanged).
