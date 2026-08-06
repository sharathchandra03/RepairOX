"use client";

import { useCallback, useEffect, useState } from "react";
import { usePermissions } from "@/lib/permissions-context";

/**
 * useActivityCollapse — Per-user collapse/expand state for the Recent Activity widget.
 *
 * Persists to localStorage keyed by user id. Default: expanded (false).
 */

const LOCAL_STORAGE_PREFIX = "repairox-activity-collapsed-";

export function useActivityCollapse() {
  const { currentUser } = usePermissions();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const localKey = currentUser?.id ? `${LOCAL_STORAGE_PREFIX}${currentUser.id}` : null;

  // Load saved state on mount / user change
  useEffect(() => {
    if (!localKey) {
      setHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(localKey);
      if (raw !== null) {
        setIsCollapsed(JSON.parse(raw) === true);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, [localKey]);

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (localKey) {
        try {
          localStorage.setItem(localKey, JSON.stringify(next));
        } catch {
          // quota exceeded — non-critical
        }
      }
      return next;
    });
  }, [localKey]);

  return { isCollapsed, toggle, hydrated };
}
