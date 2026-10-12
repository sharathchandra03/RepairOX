"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — useDealConversationSeen: PER-USER "last seen" tracker for the
   internal Deal conversation.

   A lightweight, per-user signal so a Sales Agent / approver can tell at a
   glance that the OTHER party has posted new message(s) on a deal they're
   watching. It stores, PER USER, a map of dealId → the ISO timestamp the user
   last opened/viewed that deal's conversation.

   Persistence mirrors the other lead-history hooks (use-lead-kanban /
   use-frozen-columns): localStorage keyed by the signed-in user id
   (`repairox-deal-conversation-seen::<userId>`). It is deliberately a v1 local
   store — NO new DB table — but the shape (userId → dealId → ISO) is promotable
   to a DB column later WITHOUT changing this surface.

   It carries NO business meaning: it never touches the deal, the comments, the
   approval decision, or any metric. It is purely a personal read-marker.

   REACTIVITY: the store is backed by a module-level version counter + a
   useSyncExternalStore subscription so that calling markSeen on ANY surface
   (lead table row, deal row, chat popover, View Lead section) instantly
   re-renders every mounted consumer — the dots / count badges clear without
   navigating or refreshing. There is exactly ONE tracker; every surface uses it.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useSyncExternalStore } from "react";
import type { LeadDeal } from "@/lib/lead-deals";

const STORAGE_PREFIX = "repairox-deal-conversation-seen::";

type SeenMap = Record<string, string>; // dealId → ISO timestamp last seen

function storageKeyFor(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${userId ?? "anon"}`;
}

/* ── Module-level reactive store ──────────────────────────────────────────
   A single version counter + listener set. markSeen bumps the version, which
   notifies every subscribed consumer so badges/dots re-render immediately. The
   in-memory cache (by storage key) is the authoritative snapshot the hooks read
   synchronously; localStorage is the persistence mirror. */
let version = 0;
const listeners = new Set<() => void>();
const cache = new Map<string, SeenMap>();

function emit() {
  version += 1;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getVersion(): number {
  return version;
}

function readSeenFromStorage(key: string): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

function getSeen(key: string): SeenMap {
  const cached = cache.get(key);
  if (cached) return cached;
  const fromStorage = readSeenFromStorage(key);
  cache.set(key, fromStorage);
  return fromStorage;
}

function writeSeen(key: string, map: SeenMap): void {
  cache.set(key, map);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify(map));
    } catch {
      /* quota / unavailable */
    }
  }
  emit();
}

export interface DealConversationSeen {
  /** Record that the user has now seen the conversation up to "now". Reactive —
   *  every mounted consumer re-renders so dots/badges clear instantly. */
  markSeen: (dealId: string) => void;
  /** True when the latest comment is newer than the user's last-seen for this
   *  deal AND the latest comment was NOT authored by the current user. */
  hasUnread: (deal: LeadDeal, latestCommentIso: string | null | undefined, latestAuthorId?: string | null) => boolean;
  /** The NUMBER of comments on this deal newer than the user's last-seen AND
   *  authored by someone other than the current user. 0 when all read / none.
   *  Pass the deal's own comments (e.g. commentsForDeal(deal.id)). */
  unreadCount: (deal: LeadDeal, comments: Array<{ createdAt: string; authorId?: string | null; dealId?: string }>) => number;
}

/**
 * Per-user Deal conversation read-marker.
 * @param userId  the signed-in user's id (keeps one user's markers isolated).
 */
export function useDealConversationSeen(userId: string | null | undefined): DealConversationSeen {
  const key = storageKeyFor(userId);

  // Subscribe to the module store so markSeen (from any surface) re-renders
  // this consumer. The snapshot is the version counter — cheap and stable.
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const markSeen = useCallback((dealId: string) => {
    if (!dealId) return;
    const prev = getSeen(key);
    writeSeen(key, { ...prev, [dealId]: new Date().toISOString() });
  }, [key]);

  const unreadCount = useCallback(
    (deal: LeadDeal, comments: Array<{ createdAt: string; authorId?: string | null; dealId?: string }>) => {
      if (!deal || !comments || comments.length === 0) return 0;
      const seen = getSeen(key);
      const lastSeen = seen[deal.id];
      const seenAt = lastSeen ? new Date(lastSeen).getTime() : 0;
      let count = 0;
      for (const c of comments) {
        // Defensive: only count comments belonging to this deal.
        if (c.dealId !== undefined && c.dealId !== deal.id) continue;
        // Never count the user's own messages.
        if (c.authorId && userId && c.authorId === userId) continue;
        const at = new Date(c.createdAt).getTime();
        if (isNaN(at)) continue;
        if (at > seenAt) count += 1;
      }
      return count;
    },
    [key, userId],
  );

  const hasUnread = useCallback(
    (deal: LeadDeal, latestCommentIso: string | null | undefined, latestAuthorId?: string | null) => {
      if (!deal || !latestCommentIso) return false;
      // Never flag the user's own last message as "unread".
      if (latestAuthorId && userId && latestAuthorId === userId) return false;
      const seen = getSeen(key);
      const lastSeen = seen[deal.id];
      if (!lastSeen) return true; // never opened → the latest message is unread
      const seenAt = new Date(lastSeen).getTime();
      const commentAt = new Date(latestCommentIso).getTime();
      if (isNaN(seenAt) || isNaN(commentAt)) return false;
      return commentAt > seenAt;
    },
    [key, userId],
  );

  return { markSeen, hasUnread, unreadCount };
}
