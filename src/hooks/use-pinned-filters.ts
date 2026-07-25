"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "repairox-ticket-pinned-filters";

/**
 * Hook to manage pinned filter IDs for the Ticket List.
 * Persists selections to localStorage so they survive refreshes and sessions.
 */
export function usePinnedFilters() {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
  }, []);

  // Persist whenever pinnedIds changes (only after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedIds));
    } catch {
      // storage full or unavailable
    }
  }, [pinnedIds, hydrated]);

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
