"use client";

import { useState, useCallback, useEffect } from "react";

const DEFAULT_STORAGE_KEY = "repairox-ticket-pinned-filters";

/**
 * Hook to manage pinned filter IDs for a list view (Tickets, Walk-Ins, …).
 * Persists selections to localStorage so they survive refreshes and sessions.
 * Pass a distinct `storageKey` per module so their pins don't collide; the
 * default preserves the Ticket List's existing key.
 */
export function usePinnedFilters(storageKey: string = DEFAULT_STORAGE_KEY) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount (and whenever the key changes)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setPinnedIds(parsed);
        }
      }
    } catch {
      // ignore parse errors
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist whenever pinnedIds changes (only after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(pinnedIds));
    } catch {
      // storage full or unavailable
    }
  }, [pinnedIds, hydrated, storageKey]);

  const pin = useCallback((id: string) => {
    setPinnedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const unpin = useCallback((id: string) => {
    setPinnedIds((prev) => prev.filter((p) => p !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }, []);

  const isPinned = useCallback(
    (id: string) => pinnedIds.includes(id),
    [pinnedIds]
  );

  return { pinnedIds, pin, unpin, togglePin, isPinned, hydrated };
}
