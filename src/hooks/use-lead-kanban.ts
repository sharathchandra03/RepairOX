"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — useLeadKanban: PERSONAL Kanban board state (per-user).

   Manages the signed-in user's personal Kanban boards → columns → card
   placement/order. Persisted PER USER in localStorage (mirrors
   use-frozen-columns.ts / store-multi-select "save as default"): keyed
   `repairox-lead-kanban::<userId>`. One user's configuration NEVER affects
   another. Ready to promote to a DB-backed table later without changing the
   consuming UI (the state shape is the API).

   The hook NEVER mutates canonical lead data. It only stores lead ids +
   personal placement/order. Reconciliation auto-places authorized leads and
   prunes leads that left the user's scope.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  type KanbanBoard, type KanbanColor, type KanbanColumn, type KanbanState, type NoteColor,
  kUid, makeBoard, makeDefaultBoard, duplicateBoard, reconcileBoard, moveCard as moveCardPure,
  deleteColumn as deleteColumnPure, setNoteColor as setNoteColorPure,
} from "@/lib/lead-kanban";

const STORAGE_PREFIX = "repairox-lead-kanban::";

function storageKeyFor(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${userId ?? "anon"}`;
}

function isValidState(parsed: any): parsed is KanbanState {
  return !!parsed && Array.isArray(parsed.boards);
}

function readLocalState(key: string): KanbanState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidState(parsed) ? (parsed as KanbanState) : null;
  } catch {
    return null;
  }
}

function writeLocalState(key: string, state: KanbanState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* quota / unavailable */
  }
}

/* ── DB persistence (Supabase mode) ──────────────────────────────────────────
   The whole KanbanState is stored as ONE per-user JSONB blob via the
   /api/lead-kanban route (service-role, scoped to auth.user.id). The shape is
   unchanged from localStorage — the DB is just a durable, cross-device home. */
async function loadDbState(): Promise<KanbanState | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/lead-kanban", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return isValidState(json?.state) ? (json.state as KanbanState) : null;
  } catch {
    return null;
  }
}

async function saveDbState(state: KanbanState): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return;
    await fetch("/api/lead-kanban", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state }),
    });
  } catch {
    /* network error — localStorage still holds the latest copy */
  }
}

export interface UseLeadKanban {
  hydrated: boolean;
  boards: KanbanBoard[];
  activeBoard: KanbanBoard | null;
  activeBoardId: string | null;
  setActiveBoard: (boardId: string) => void;

  /* Board CRUD (personal) */
  createBoard: (name: string, color: KanbanColor) => string;
  renameBoard: (boardId: string, name: string) => void;
  setBoardColor: (boardId: string, color: KanbanColor) => void;
  duplicateActiveBoard: () => string | null;
  deleteBoard: (boardId: string) => void;

  /* Column CRUD (personal) */
  addColumn: (name: string, color: KanbanColor) => void;
  renameColumn: (columnId: string, name: string) => void;
  setColumnColor: (columnId: string, color: KanbanColor) => void;
  reorderColumns: (orderedColumnIds: string[]) => void;
  removeColumn: (columnId: string, fallbackColumnId?: string | null) => void;

  /* Card placement (personal — never touches lead business data) */
  moveCard: (leadId: string, toColumnId: string, toIndex: number) => void;

  /** Set the PERSONAL sticky-note color for a lead on the active board
   *  ("default" clears it). Purely visual — never touches lead business data. */
  setCardNoteColor: (leadId: string, color: NoteColor) => void;

  /** Reconcile the ACTIVE board against the authorized lead ids (auto-place new,
   *  prune gone). Call whenever the visible lead set changes. */
  reconcile: (authorizedLeadIds: string[]) => void;
}

export function useLeadKanban(userId: string | null | undefined): UseLeadKanban {
  const storageKey = storageKeyFor(userId);
  const [state, setState] = useState<KanbanState>({ boards: [], activeBoardId: null });
  const [hydrated, setHydrated] = useState(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  // Guards against the hydration race that used to "reset all cards to column 1"
  // on refresh: we only start persisting AFTER the authoritative load (DB in
  // Supabase mode, else localStorage) has completed for a KNOWN user.
  const loadedForKeyRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Hydrate on mount / when the user changes ──
     In Supabase mode the DB row (per auth user) is the source of truth; we fall
     back to any local copy, then seed a default board. In local mode we read
     localStorage. We WAIT for a real userId before hydrating under a user key
     so a fleeting "anon" pass can never seed/overwrite the real layout. */
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    loadedForKeyRef.current = null;

    // In Supabase mode, WAIT for the real authenticated user id before touching
    // storage. Hydrating under the transient "anon" key (before useSession
    // resolves) is exactly what used to seed/overwrite the real layout on
    // refresh. In local mode "anon" is a legitimate stable key, so we proceed.
    if (isSupabaseConfigured && (userId === null || userId === undefined)) {
      return () => { cancelled = true; };
    }

    (async () => {
      let loaded: KanbanState | null = null;

      // Supabase mode: prefer the DB; migrate any older local copy up on first
      // load (so a user who had localStorage boards keeps them).
      if (isSupabaseConfigured && supabase) {
        loaded = await loadDbState();
        if (cancelled) return;
        if (!loaded) {
          const local = readLocalState(storageKey);
          if (local && local.boards.length > 0) {
            loaded = local;
            // Push the migrated local copy up to the DB so it's durable.
            void saveDbState(local);
          }
        }
      } else {
        // Local mode.
        loaded = readLocalState(storageKey);
      }

      if (cancelled) return;

      if (loaded && loaded.boards.length > 0) {
        const activeOk = loaded.boards.some((b) => b.id === loaded!.activeBoardId);
        setState({
          boards: loaded.boards,
          activeBoardId: activeOk ? loaded.activeBoardId : loaded.boards[0].id,
        });
      } else {
        // First run for this user → seed a sensible default personal board.
        const def = makeDefaultBoard(userId ?? "anon");
        setState({ boards: [def], activeBoardId: def.id });
      }

      loadedForKeyRef.current = storageKey;
      setHydrated(true);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  /* ── Persist on change ──
     Only after the authoritative load for THIS user key finished (prevents the
     initial seed/reconcile from overwriting the just-loaded layout). Writes
     localStorage immediately (fast cache / local-mode home) and debounces the
     DB write. */
  useEffect(() => {
    if (!hydrated) return;
    if (loadedForKeyRef.current !== storageKey) return;

    writeLocalState(storageKey, state);

    if (isSupabaseConfigured && supabase) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const snapshot = state;
      saveTimerRef.current = setTimeout(() => { void saveDbState(snapshot); }, 400);
    }
  }, [state, hydrated, storageKey]);

  // Flush any pending debounced DB save on unmount.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const activeBoard = useMemo(
    () => state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0] ?? null,
    [state.boards, state.activeBoardId],
  );

  /* ── Internal: update one board immutably ── */
  const patchBoard = useCallback((boardId: string, fn: (b: KanbanBoard) => KanbanBoard) => {
    setState((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id === boardId ? { ...fn(b), updatedAt: new Date().toISOString() } : b)),
    }));
  }, []);

  const patchActive = useCallback((fn: (b: KanbanBoard) => KanbanBoard) => {
    setState((prev) => {
      const id = prev.activeBoardId ?? prev.boards[0]?.id;
      if (!id) return prev;
      return {
        ...prev,
        boards: prev.boards.map((b) => (b.id === id ? { ...fn(b), updatedAt: new Date().toISOString() } : b)),
      };
    });
  }, []);

  /* ── Board CRUD ── */
  const setActiveBoard = useCallback((boardId: string) => {
    setState((prev) => (prev.boards.some((b) => b.id === boardId) ? { ...prev, activeBoardId: boardId } : prev));
  }, []);

  const createBoard = useCallback((name: string, color: KanbanColor): string => {
    const board = makeBoard(userIdRef.current ?? "anon", name, color, 0);
    setState((prev) => ({
      boards: [...prev.boards, { ...board, order: prev.boards.length }],
      activeBoardId: board.id,
    }));
    return board.id;
  }, []);

  const renameBoard = useCallback((boardId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchBoard(boardId, (b) => ({ ...b, name: trimmed }));
  }, [patchBoard]);

  const setBoardColor = useCallback((boardId: string, color: KanbanColor) => {
    patchBoard(boardId, (b) => ({ ...b, color }));
  }, [patchBoard]);

  const duplicateActiveBoard = useCallback((): string | null => {
    let newId: string | null = null;
    setState((prev) => {
      const src = prev.boards.find((b) => b.id === prev.activeBoardId);
      if (!src) return prev;
      const copy = duplicateBoard(src, prev.boards.length);
      newId = copy.id;
      return { boards: [...prev.boards, copy], activeBoardId: copy.id };
    });
    return newId;
  }, []);

  const deleteBoard = useCallback((boardId: string) => {
    setState((prev) => {
      const target = prev.boards.find((b) => b.id === boardId);
      // The permanent default board can't be deleted; and never delete the last board.
      if (!target || target.isDefault || prev.boards.length <= 1) return prev;
      const boards = prev.boards.filter((b) => b.id !== boardId);
      const activeBoardId = prev.activeBoardId === boardId ? (boards[0]?.id ?? null) : prev.activeBoardId;
      return { boards, activeBoardId };
    });
  }, []);

  /* ── Column CRUD (on the active board) ── */
  const addColumn = useCallback((name: string, color: KanbanColor) => {
    const col: KanbanColumn = { id: kUid(), name: name.trim() || "New Column", color, cardIds: [] };
    patchActive((b) => ({ ...b, columns: [...b.columns, col] }));
  }, [patchActive]);

  const renameColumn = useCallback((columnId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    patchActive((b) => ({ ...b, columns: b.columns.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c)) }));
  }, [patchActive]);

  const setColumnColor = useCallback((columnId: string, color: KanbanColor) => {
    patchActive((b) => ({ ...b, columns: b.columns.map((c) => (c.id === columnId ? { ...c, color } : c)) }));
  }, [patchActive]);

  const reorderColumns = useCallback((orderedColumnIds: string[]) => {
    patchActive((b) => {
      const byId = new Map(b.columns.map((c) => [c.id, c]));
      const next = orderedColumnIds.map((id) => byId.get(id)).filter(Boolean) as KanbanColumn[];
      // Keep any columns not present in the ordered list (safety).
      for (const c of b.columns) if (!orderedColumnIds.includes(c.id)) next.push(c);
      return { ...b, columns: next };
    });
  }, [patchActive]);

  const removeColumn = useCallback((columnId: string, fallbackColumnId?: string | null) => {
    patchActive((b) => deleteColumnPure(b, columnId, fallbackColumnId));
  }, [patchActive]);

  /* ── Card placement — personal ONLY ── */
  const moveCard = useCallback((leadId: string, toColumnId: string, toIndex: number) => {
    patchActive((b) => moveCardPure(b, leadId, toColumnId, toIndex));
  }, [patchActive]);

  /* ── Personal sticky-note color — visual ONLY ── */
  const setCardNoteColor = useCallback((leadId: string, color: NoteColor) => {
    patchActive((b) => setNoteColorPure(b, leadId, color));
  }, [patchActive]);

  /* ── Reconcile the active board against authorized leads ── */
  const reconcile = useCallback((authorizedLeadIds: string[]) => {
    setState((prev) => {
      const id = prev.activeBoardId ?? prev.boards[0]?.id;
      if (!id) return prev;
      const set = new Set(authorizedLeadIds);
      let touched = false;
      const boards = prev.boards.map((b) => {
        if (b.id !== id) return b;
        const { board, changed } = reconcileBoard(b, set);
        if (changed) touched = true;
        return board;
      });
      return touched ? { ...prev, boards } : prev;
    });
  }, []);

  return {
    hydrated,
    boards: state.boards,
    activeBoard,
    activeBoardId: activeBoard?.id ?? null,
    setActiveBoard,
    createBoard,
    renameBoard,
    setBoardColor,
    duplicateActiveBoard,
    deleteBoard,
    addColumn,
    renameColumn,
    setColumnColor,
    reorderColumns,
    removeColumn,
    moveCard,
    setCardNoteColor,
    reconcile,
  };
}
