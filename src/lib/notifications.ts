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
  /** Stable idempotency key. When set, a second notify() with the same key
   *  will NOT create a duplicate record — it returns the existing one. Used to
   *  guarantee "one follow-up due event → one notification". */
  dedupeKey?: string;
  read: boolean;
}

export type NotificationInput = Omit<AppNotification, "id" | "ts" | "read"> & { ts?: number };

const STORAGE_KEY = "repairox-notifications";
const MAX = 300;

let items: AppNotification[] = [];
let hydrated = false;
const listeners = new Set<() => void>();
let _counter = 0;

function persist() {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(demoKey(STORAGE_KEY), JSON.stringify(items.slice(0, MAX))); } catch { /* quota */ }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(demoKey(STORAGE_KEY));
    items = raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch { items = []; }
  hydrated = true;
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

export function markAllRead(recipientId?: string, recipientRole?: string) {
  hydrate();
  let changed = false;
  items = items.map((n) => {
    if (n.read) return n;
    if (isForRecipient(n, recipientId, recipientRole)) { changed = true; return { ...n, read: true }; }
    return n;
  });
  if (changed) { persist(); emitChange(); }
}

export function clearNotification(id: string) {
  hydrate();
  const before = items.length;
  items = items.filter((n) => n.id !== id);
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
