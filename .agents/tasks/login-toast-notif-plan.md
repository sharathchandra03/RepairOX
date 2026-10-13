# Fix: fresh/newly-assigned user gets a BURST of toast popups on the Lead Dashboard at login

## Summary of the confirmed cause

The login-time toast burst is produced by the two global headless **follow-up
watchers** mounted in the `(app)` layout, which iterate the whole dataset on
first mount and call `toast(...)` for every currently Due/Overdue follow-up —
with **no session-start guard**. On a fresh/newly-assigned user's first login
their backlog of already-due items all toast at once.

The bell feed itself does NOT toast (it is a dropdown), and `route-lead-dialog`
toasts only at route time — so neither of those is the login symptom. The
assignment watcher in `leads-context.tsx` already has a correct baseline guard
and is NOT the cause (kept as the reference pattern).

### Evidence (file / line)

1. **Primary trigger — Lead Follow-Up Watcher.**
   `app/src/components/leads/lead-followup-watcher.tsx`, the `useEffect` on
   `[now, followUps, leads, currentUserId]` (lines ~90–140). On mount:
   - `collectLeadDueInstants(followUps)` → `syncLeadFollowUpDueInstants(...)`
     calls `emitClock()` immediately (see
     `app/src/lib/lead-followup-engine.ts`, `syncLeadFollowUpDueInstants`, lines
     ~63–80: `if (sig !== lastSynced) { lastSynced = sig; emitClock(); }`), so
     `now` ticks right away.
   - The effect then loops ALL `followUps`; for each `scheduled` follow-up whose
     `followUpLifecycle(fu, asOf)` is `Due`/`Overdue` and whose
     `recipientId (= fu.followUpUserId || lead.assignedTo)` equals
     `currentUserId`, it fires `notify(...)` **and `toast.info(title, …)`** and a
     sound (lines ~118–135).
   - The only guards are the module `announced` set and `hasNotification(key)`.
     For a **newly-assigned / first-time** user those keys were never created in
     a prior session for these events, so both guards miss and the entire
     backlog toasts on first render. There is **no mount/session-start
     timestamp guard**, unlike the assignment watcher.

2. **Secondary (same bug class) — Walk-In Follow-Up Watcher.**
   `app/src/components/walk-in/walk-in-followup-watcher.tsx`, the `useEffect` on
   `[now, walkIns]` (lines ~90–140). Same shape: `syncFollowUpDueInstants` emits
   an immediate tick (`app/src/lib/walk-in-followup-engine.ts`, lines ~69–81),
   the effect loops all `walkIns`, and for each active, due, unread follow-up
   (recipient `w.salesPersonId`) fires `notify(...)` + `toast.info(...)` + sound.
   Guards are `announced` + `hasNotification(key)` + `w.followUpReadAt` only — no
   session-start guard. This is the "Walk-In follow-up due" popup in the same
   burst. Fix it with the identical guard.

3. **Which notifications a fresh user matches.** `isForRecipient`
   (`app/src/lib/notifications.ts`, lines ~179–186): a notification with NEITHER
   `recipientId` nor `recipientRole` is a broadcast (everyone); a role-targeted
   one (e.g. `recipientRole: "reception"` from
   `app/src/components/leads/route-lead-dialog.tsx` line ~99, or
   `field_manager` in `field-context.tsx`) is visible to anyone with that role.
   So a newly-assigned user with a matching role DOES match historical
   role-targeted records **in the bell feed**. This is correct for the durable
   bell (history is meant to be visible) and is NOT the toast symptom — the bell
   never toasts. Do not change `isForRecipient`.

4. **Shared, non-user-scoped `STORAGE_KEY`.** `app/src/lib/notifications.ts`
   line ~70: `STORAGE_KEY = "repairox-notifications"` wrapped only by
   `demoKey(...)` — not scoped per user id. All users on one browser profile
   share one notification store, and the two `announced` sets
   (`repairox-walkin-followup-announced`,
   `repairox-lead-followup-announced`) are also browser-global.
   **Assessment: cross-user store leakage is NOT the root of THIS symptom.** The
   lead watcher already filters strictly by `recipientId === currentUserId`, and
   the walk-in watcher by `w.salesPersonId`, so a user is only ever toasted
   about their OWN items. The burst is a *backlog replay on mount*, not another
   user's data. **Per-user store keying is therefore NOT required for this fix**
   and is explicitly out of scope (the shared bell history is also intended
   behaviour). The session-start guard alone fixes the symptom.

## The fix (mount-time / session-start guard)

Add a one-time `sessionStart` timestamp captured at watcher mount, and only
TOAST (and play sound) for a newly-due event whose follow-up **became due at or
after** `sessionStart`. The **durable `notify(...)` bell record must still be
written for backlog items** (so the bell feed shows history), but the toast +
sound must be suppressed for anything already due before this session started.
Live in-session events (a follow-up crossing its time while logged in, or an
owner routing a lead to a store so a logged-in reception user should still get a
live toast) still toast because their due instant is `>= sessionStart`.

Keep the existing `dedupeKey` idempotency and the `announced` set exactly as-is
(they prevent duplicates); the new guard only adds the "don't replay the backlog
as toasts on mount" rule.

### Decision: how "after mount" is measured

Measure against each follow-up's **due instant**, not the notification `ts`:
compute the event's effective due time and compare to `sessionStart`.
- Lead watcher: `dueTs = new Date(fu.dueAt).getTime()` (Overdue transition is
  already in the past, so it is correctly treated as backlog).
- Walk-In watcher: `dueTs = followUpDueAt(w)?.getTime() ?? 0`.
Rationale: this is the precise, user-meaningful "did this become due before I
logged in?" check and avoids coupling to notification record timestamps. An
event that becomes due AFTER mount (the live case) has `dueTs >= sessionStart`
and still toasts.

Capture `sessionStart` once per mount with a ref initialized lazily:
`const sessionStartRef = useRef<number>(Date.now());` set on first effect run
guarded by a `readyRef` (mirrors `notifyReadyRef` in `leads-context.tsx`), so it
is stable across the many re-runs the clock causes. Capture it when
`currentUserId`/data are ready (lead watcher), so switching user re-baselines.

## Implementation plan

- [ ] 1. Add a session-start / backlog guard to the Lead Follow-Up Watcher.
      In `app/src/components/leads/lead-followup-watcher.tsx`: add
      `const sessionStartRef = useRef<number | null>(null);`. At the top of the
      announce `useEffect`, if `sessionStartRef.current === null` set it to
      `Date.now()` (this is the session baseline). Inside the per-follow-up loop,
      after computing `state` and `recipientId` and BEFORE the toast/sound,
      compute `const dueTs = new Date(fu.dueAt).getTime();` and set a boolean
      `const isBacklog = dueTs < (sessionStartRef.current ?? 0);`. Keep the
      existing `notify(...)` call unconditional (so the bell still records
      history), but wrap ONLY the `toast.info(...)` and
      `playWalkInSound(...)` calls in `if (!isBacklog) { … }`. Preserve the
      `announced`/`hasNotification(key)` dedupe exactly as-is.
      Files: `app/src/components/leads/lead-followup-watcher.tsx`
      Verify: `npx tsc --noEmit` passes; code review confirms backlog items
      (dueAt before mount) call `notify` but not `toast`/sound, and a follow-up
      crossing its time live (dueAt >= mount) still toasts.

- [ ] 2. Add the identical guard to the Walk-In Follow-Up Watcher.
      In `app/src/components/walk-in/walk-in-followup-watcher.tsx`: add
      `const sessionStartRef = useRef<number | null>(null);`, baseline it on the
      first announce-effect run, compute
      `const dueTs = followUpDueAt(w)?.getTime() ?? 0;` and
      `const isBacklog = dueTs < (sessionStartRef.current ?? 0);` per walk-in,
      keep `notify(...)` unconditional and gate `toast.info(...)` +
      `playWalkInSound(...)` behind `if (!isBacklog)`. Keep
      `announced`/`hasNotification`/`followUpReadAt` logic unchanged.
      Files: `app/src/components/walk-in/walk-in-followup-watcher.tsx`
      Verify: `npx tsc --noEmit` passes; review confirms the same backlog-vs-live
      split as item 1.

- [ ] 3. (Confirm-only, no change expected) Assignment watcher already guarded.
      Re-read `app/src/lib/leads-context.tsx` lines ~1011–1037. It already uses
      `notifyReadyRef` to establish a baseline on first load (no toast) and only
      toasts newly-appearing assignments after that. Leave it unchanged. If the
      runtime check in item 5 shows "New Lead Assigned" toasts STILL burst on
      login, treat that as a separate finding: the likely cause would be
      `notifyReadyRef`/`notifiedRef` resetting due to a provider remount; in that
      case apply the same session-start-timestamp approach (only toast
      assignments whose `assignedAt >= sessionStart`). Record findings; do not
      pre-emptively change it.
      Files: none (investigation) — change only if item 5 proves it.
      Verify: covered by item 5 runtime reproduction.

- [ ] 4. Do NOT change `notifications.ts` targeting or add per-user store keying.
      Confirm no edits to `isForRecipient`, `STORAGE_KEY`, or `demoKey` are made.
      The bell feed must keep showing historical role/broadcast notifications;
      only the toast replay is suppressed by items 1–2.
      Files: none (guard rail — assert nothing here changed).
      Verify: `git diff --stat` shows only the two watcher files (plus optionally
      `leads-context.tsx` if item 3 was triggered).

- [ ] 5. Runtime reproduction + verification (needs-verification-during-
      implementation — do NOT skip even if code looks correct).
      Run the app (`npm run dev` in `app/`). Reproduce: create/assign a user with
      due/overdue lead and/or walk-in follow-ups, then log in as that user and
      land on the Lead Dashboard. BEFORE the fix, confirm the toast burst
      ("Lead follow-up due", "Walk-In follow-up due", and any "assigned" popups).
      AFTER items 1–2, confirm: (a) NO backlog toast burst on login; (b) the bell
      feed still lists those items as history; (c) a follow-up whose time is set
      to ~1 minute in the future, reached while logged in, DOES toast once; (d) an
      owner routing a lead to a store still live-toasts a logged-in reception user
      (route-lead-dialog path). If "New Lead Assigned" still bursts, execute item 3.
      Files: none (runtime).
      Verify: manual runtime pass of (a)–(d) above.

- [ ] 6. Final build gate.
      Files: none.
      Verify: `cd app && npx tsc --noEmit` and `npm run build` both succeed with
      no new errors.

## Files to change (minimal set)
- `app/src/components/leads/lead-followup-watcher.tsx` (primary)
- `app/src/components/walk-in/walk-in-followup-watcher.tsx` (same bug class)
- `app/src/lib/leads-context.tsx` — ONLY if item 5 proves the assignment toast
  also bursts; otherwise untouched.

## Explicitly NOT changing
- `app/src/lib/notifications.ts` — targeting, broadcast semantics, and the
  shared `STORAGE_KEY` are intentional for the durable bell history. Per-user
  store keying is NOT needed for this symptom.
- `app/src/components/layout/notification-bell.tsx` — bell is a dropdown feed,
  not a toaster; it is not part of the symptom.
- `app/src/components/leads/route-lead-dialog.tsx` — its toast is a legitimate
  live route-time event and must keep working.
