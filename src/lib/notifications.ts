"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Notifications (lightweight, user-targeted).

   RepairOX had no notification system beyond transient toasts. Field
   Management needs durable, targeted notifications (Sales, Field Manager,
   Ninja, Store) with a bell + read/unread. This is a small module singleton
   (same shape as activity-log.ts) backed by localStorage, with a React 18
   useSyncExternalStore hook. It is intentionally storage-light and offline —
   no new backend dependency — and coexists with the toast channel (a new
   notification can also fire a toast for immediacy).

   Targeting: each notification carries `recipientId` (a staff/user id) and/or
   `recipientRole` (a role id). A consumer filters to notifications addressed to
   the current user (by id) or their role. This keeps "users only see relevant
   notifications" without a server.
   ────────────────────────────────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";
import { demoKey } from "@/lib/demo-mode";

export type NotificationKind =
  | "lead_routed"
  | "lead_assigned"
  | "lead_followup_due"
  | "lead_followup_overdue"
  /* Walk-In follow-up (its own kind so it is classified under "Follow-ups",
     not "Others"). Every module's follow-up uses a `*_followup_due` /
     `*_followup_overdue` kind so the ONE classifier groups them all. */
  | "walkin_followup_due"
  | "walkin_followup_overdue"
  | "store_handoff"
  | "field_new_job"
  | "field_assignment"
  | "field_reschedule"
  | "field_cancel"
  | "pickup_reminder"
  | "pickup_delayed"
  | "pickup_done"
  | "device_received"
  | "repair_done"
  | "ready_for_drop"
  | "drop_assignment"
  | "drop_reminder"
  | "drop_done"
  /* Deal / discount-approval workflow (attached to a lead). */
  | "deal_approval_requested"
  | "deal_changes_requested"
  | "deal_approved"
  | "deal_rejected"
  | "deal_resubmitted"
  | "deal_comment"
  /* Security: an employee signed in on a device (owner-facing alert). */
  | "employee_login"
  | "generic";

export interface AppNotification {
  id: string;
  ts: number;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Target a specific user by staff id. */
  recipientId?: string;
  /** Target everyone with this role id (e.g. "field_manager"). */
  recipientRole?: string;
  /** Deep-link href opened when the notification is clicked. */
  href?: string;
  /** Related entity reference for display (e.g. FJ-001). */
  reference?: string;
  /** Optional link back to a specific follow-up record (lead_followup_history).
   *  Lets a follow-up-due notification deep-link to that exact follow-up while
   *  reusing this single notifications feed — no separate system. */
  followUpId?: string;
  /** Stable idempotency key. When set, a second notify() with the same key
   *  will NOT create a duplicate record — it returns the existing one. Used to
   *  guarantee "one follow-up due event → one notification". */
  dedupeKey?: string;
  read: boolean;
}

export type NotificationInput = Omit<AppNotification, "id" | "ts" | "read"> & { ts?: number };

/** True for EVERY follow-up kind (due / overdue), regardless of the module it
 *  came from — Leads, Walk-In, and any future module — so they ALL fall under
 *  the "Follow-ups" tab of the bell and never land in "Others". Any kind named
 *  `<module>_followup_due` / `<module>_followup_overdue` is treated as a
 *  follow-up, so a new module is grouped correctly without editing this
 *  function. Kept here so every feed UI classifies a notification identically.
 */
export function isFollowUpNotification(n: AppNotification): boolean {
  return n.kind.endsWith("_followup_due") || n.kind.endsWith("_followup_overdue");
}

const STORAGE_PREFIX = "repairox-notifications";
const MAX = 300;

/* ──────────────────────────────────────────────────────────────────────────
   Per-account isolation. The feed is PRIVATE to the signed-in account: the
   localStorage key carries the active user id, so account A and account B on
   the same browser never share a feed, a read-state, or a dedupe set. The store
   is rebound on login/logout via setNotificationUser(). Before any user is
   known (or for a signed-out shell) a neutral "anon" bucket is used.
   ────────────────────────────────────────────────────────────────────────── */
let currentUserKey = "anon";

/** localStorage key for the ACTIVE account's notifications. */
function storageKey(): string {
  return demoKey(`${STORAGE_PREFIX}::${currentUserKey}`);
}

let items: AppNotification[] = [];
let hydrated = false;
const listeners = new Set<() => void>();
let _counter = 0;

function persist() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(storageKey(), JSON.stringify(items.slice(0, MAX))); } catch { /* quota */ }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(storageKey());
    items = raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch { items = []; }
  hydrated = true;
}

/**
 * Bind the notification store to a specific account. Called whenever the
 * signed-in user changes (login / logout / account switch). When the user id
 * changes we re-hydrate from THAT account's bucket and notify subscribers, so
 * one account can never see another account's notifications on a shared
 * browser. Idempotent: a no-op when the user hasn't changed.
 */
export function setNotificationUser(userId?: string | null) {
  const key = userId && userId.trim() ? userId.trim() : "anon";
  if (key === currentUserKey && hydrated) return;
  currentUserKey = key;
  hydrated = false;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(storageKey());
      items = raw ? (JSON.parse(raw) as AppNotification[]) : [];
    } catch { items = []; }
    hydrated = true;
  } else {
    items = [];
  }
  emitChange();
}

function emitChange() {
  for (const l of listeners) l();
}

/** Add a notification (module-level; callable from non-React code). */
export function notify(input: NotificationInput): AppNotification {
  hydrate();
  // Idempotency: if a notification with the same dedupeKey already exists, don't
  // create a duplicate. This is the single guarantee that one due event yields
  // exactly one notification, no matter how many times the caller fires.
  if (input.dedupeKey) {
    const existing = items.find((n) => n.dedupeKey === input.dedupeKey);
    if (existing) return existing;
  }
  const n: AppNotification = {
    id: `ntf-${Date.now()}-${(_counter++).toString(36)}`,
    ts: input.ts ?? Date.now(),
    kind: input.kind,
    title: input.title,
    body: input.body,
    recipientId: input.recipientId,
    recipientRole: input.recipientRole,
    href: input.href,
    reference: input.reference,
    followUpId: input.followUpId,
    dedupeKey: input.dedupeKey,
    read: false,
  };
  items = [n, ...items].slice(0, MAX);
  persist();
  emitChange();
  return n;
}

/** True when a notification with this dedupeKey already exists (any read state). */
export function hasNotification(dedupeKey: string): boolean {
  hydrate();
  return items.some((n) => n.dedupeKey === dedupeKey);
}

export function markRead(id: string) {
  hydrate();
  let changed = false;
  items = items.map((n) => { if (n.id === id && !n.read) { changed = true; return { ...n, read: true }; } return n; });
  if (changed) { persist(); emitChange(); }
}

/**
 * Mark the current account's notifications read.
 * @param predicate  optional category classifier (e.g. isFollowUpNotification)
 * @param wantMatch  when a predicate is given, only mark items where
 *                   predicate(n) === wantMatch — lets the UI mark a single
 *                   category (Follow-ups OR Others) read independently.
 */
export function markAllRead(
  recipientId?: string,
  recipientRole?: string,
  predicate?: (n: AppNotification) => boolean,
  wantMatch = true,
) {
  hydrate();
  let changed = false;
  items = items.map((n) => {
    if (n.read) return n;
    if (!isForRecipient(n, recipientId, recipientRole)) return n;
    if (predicate && predicate(n) !== wantMatch) return n;
    changed = true;
    return { ...n, read: true };
  });
  if (changed) { persist(); emitChange(); }
}

export function clearNotification(id: string) {
  hydrate();
  const before = items.length;
  items = items.filter((n) => n.id !== id);
  if (items.length !== before) { persist(); emitChange(); }
}

/**
 * Remove the current account's notifications addressed to the given user/role
 * at once (a "clear all" for the bell feed), optionally scoped to one category
 * via `predicate`/`wantMatch`. Broadcast notifications (no recipient) are
 * cleared too, matching what {@link isForRecipient} shows the user. Items for
 * OTHER recipients are left untouched.
 */
export function clearAllForRecipient(
  recipientId?: string,
  recipientRole?: string,
  predicate?: (n: AppNotification) => boolean,
  wantMatch = true,
) {
  hydrate();
  const before = items.length;
  items = items.filter((n) => {
    if (!isForRecipient(n, recipientId, recipientRole)) return true; // keep others' items
    if (predicate && predicate(n) !== wantMatch) return true;        // keep the other category
    return false;                                                    // drop this one
  });
  if (items.length !== before) { persist(); emitChange(); }
}

/** True when a notification is addressed to the given user id or role. */
export function isForRecipient(n: AppNotification, recipientId?: string, recipientRole?: string): boolean {
  // A notification with neither target is broadcast (visible to everyone).
  if (!n.recipientId && !n.recipientRole) return true;
  if (n.recipientId && recipientId && n.recipientId === recipientId) return true;
  if (n.recipientRole && recipientRole && n.recipientRole === recipientRole) return true;
  return false;
}

function getSnapshot(): AppNotification[] {
  hydrate();
  return items;
}
const EMPTY: AppNotification[] = [];
function getServerSnapshot(): AppNotification[] { return EMPTY; }

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Subscribe to the full notification list (React 18 external store). */
export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Notifications addressed to the given user/role, newest first. */
export function useNotificationsFor(recipientId?: string, recipientRole?: string): AppNotification[] {
  const all = useNotifications();
  return all.filter((n) => isForRecipient(n, recipientId, recipientRole));
}
