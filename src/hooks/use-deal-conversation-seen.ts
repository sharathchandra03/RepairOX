"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — useDealConversationSeen: PER-USER "last seen" tracker for the
   internal Deal conversation.

   A lightweight, per-user signal so a Sales Agent / approver can tell at a
   glance that the OTHER party has posted a new message on a deal they're
   watching. It stores, PER USER, a map of dealId → the ISO timestamp the user
   last opened/viewed that deal's conversation.

   Persistence mirrors the other lead-history hooks (use-lead-kanban /
   use-frozen-columns): localStorage keyed by the signed-in user id
   (`repairox-deal-conversation-seen::<userId>`). It is deliberately a v1 local
   store — NO new DB table — but the shape (userId → dealId → ISO) is promotable
   to a DB column later WITHOUT changing this surface.

   It carries NO business meaning: it never touches the deal, the comments, the
   approval decision, or any metric. It is purely a personal read-marker.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeadDeal } from "@/lib/lead-deals";

const STORAGE_PREFIX = "repairox-deal-conversation-seen::";

type SeenMap = Record<string, string>; // dealId → ISO timestamp last seen

function storageKeyFor(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${userId ?? "anon"}`;
}

function readSeen(key: string): SeenMap {
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

function writeSeen(key: string, map: SeenMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* quota / unavailable */
  }
}

export interface DealConversationSeen {
  /** Record that the user has now seen the conversation up to "now". */
  markSeen: (dealId: string) => void;
  /** True when the latest comment is newer than the user's last-seen for this
   *  deal AND the latest comment was NOT authored by the current user. */
  hasUnread: (deal: LeadDeal, latestCommentIso: string | null | undefined, latestAuthorId?: string | null) => boolean;
}

/**
 * Per-user Deal conversation read-marker.
 * @param userId  the signed-in user's id (keeps one user's markers isolated).
 */
export function useDealConversationSeen(userId: string | null | undefined): DealConversationSeen {
  const key = storageKeyFor(userId);
  const [seen, setSeen] = useState<SeenMap>({});
  const seenRef = useRef<SeenMap>({});
  seenRef.current = seen;

  // Hydrate when the user (key) changes.
  useEffect(() => {
    setSeen(readSeen(key));
  }, [key]);

  const markSeen = useCallback((dealId: string) => {
    if (!dealId) return;
    setSeen((prev) => {
      const next = { ...prev, [dealId]: new Date().toISOString() };
      writeSeen(key, next);
      return next;
    });
  }, [key]);

  const hasUnread = useCallback(
    (deal: LeadDeal, latestCommentIso: string | null | undefined, latestAuthorId?: string | null) => {
      if (!deal || !latestCommentIso) return false;
      // Never flag the user's own last message as "unread".
      if (latestAuthorId && userId && latestAuthorId === userId) return false;
      const lastSeen = seenRef.current[deal.id];
      if (!lastSeen) return true; // never opened → the latest message is unread
      const seenAt = new Date(lastSeen).getTime();
      const commentAt = new Date(latestCommentIso).getTime();
      if (isNaN(seenAt) || isNaN(commentAt)) return false;
      return commentAt > seenAt;
    },
    [userId],
  );

  return { markSeen, hasUnread };
}
