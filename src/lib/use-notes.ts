"use client";

/* ──────────────────────────────────────────────────────────────────────────
   useNotes — Personal, per-store sticky notes (notepad).

   Notes are PERSONAL (account-to-account): a user only ever sees their OWN
   notes, and the set is INDEPENDENT per store. The active store
   (useStoreContext) scopes which notes are shown and stamps new notes; the
   All-Shops view (activeStoreId null) is its own personal board.

   Dual-mode (mirrors the rest of the app):
   • Supabase configured → reads/writes public.notes (RLS restricts rows to the
     owner via owner_staff_id; branch_id scopes per store). Realtime keeps it in
     sync across the user's own devices.
   • Not configured → localStorage, keyed per user per store.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { toast } from "@/components/ui/toaster";

export interface Note {
  id: string;
  title: string;
  body: string;
  color: string | null;
  pinnedAt: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

const LOCAL_PREFIX = "repairox-notes-";

function rowToNote(r: any): Note {
  return {
    id: r.id,
    title: r.title ?? "",
    body: r.body ?? "",
    color: r.color ?? null,
    pinnedAt: r.pinned_at ? new Date(r.pinned_at).getTime() : null,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
  };
}

function sortNotes(list: Note[]): Note[] {
  return [...list].sort((a, b) => {
    // Pinned first (newest pin on top), then by sort order, then newest.
    if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
    if (a.pinnedAt && b.pinnedAt && a.pinnedAt !== b.pinnedAt) return b.pinnedAt - a.pinnedAt;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.createdAt - a.createdAt;
  });
}

function genId(): string {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useNotes() {
  const { currentUser } = usePermissions();
  const { activeStoreId, activeStore, ready: storeReady } = useStoreContext();

  const staffId = currentUser?.id ?? null;
  // Owning org: prefer the active store's org, else the user's resolved org.
  const orgId = (activeStore as any)?.organizationId ?? null;
  const storeBucket = activeStoreId ?? "all";
  const localKey = staffId ? `${LOCAL_PREFIX}${staffId}::${storeBucket}` : null;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const useDb = isSupabaseConfigured && !!supabase;
  const localKeyRef = useRef(localKey);
  useEffect(() => { localKeyRef.current = localKey; }, [localKey]);

  const readLocal = useCallback((): Note[] => {
    if (!localKey || typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(localKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [localKey]);

  const writeLocal = useCallback((list: Note[]) => {
    if (!localKeyRef.current || typeof window === "undefined") return;
    try { localStorage.setItem(localKeyRef.current, JSON.stringify(list)); } catch { /* quota */ }
  }, []);

  /* ── Load + realtime ── */
  useEffect(() => {
    if (!storeReady) return;
    let active = true;

    async function load() {
      setLoading(true);

      if (!useDb) {
        if (active) { setNotes(sortNotes(readLocal())); setLoading(false); }
        return;
      }

      // DB mode. RLS already restricts to the owner; we additionally filter by
      // the active store (branch_id). All-Shops (null) → the personal board
      // whose notes carry branch_id NULL.
      let query = supabase!.from("notes").select("*");
      query = activeStoreId ? query.eq("branch_id", activeStoreId) : query.is("branch_id", null);
      const { data, error } = await query;
      if (!active) return;
      // TEMP DEBUG — remove after diagnosis.
      // eslint-disable-next-line no-console
      console.log("[RepairOX debug] notes load — store =", activeStoreId ?? "(All Shops)", "| rows =", data?.length ?? 0, "| error =", error?.message ?? "none");
      if (error) {
        // Table not migrated yet or transient error → fall back to local.
        setNotes(sortNotes(readLocal()));
      } else {
        setNotes(sortNotes((data ?? []).map(rowToNote)));
      }
      setLoading(false);
    }

    load();

    if (!useDb) return () => { active = false; };

    const channel = supabase!
      .channel(`notes-${storeBucket}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "notes" }, (payload: any) => {
        if (!active) return;
        const row = payload.new ?? payload.old;
        if (!row) return;
        // Only react to the active store's board.
        const rowStore = row.branch_id ?? null;
        if ((activeStoreId ?? null) !== rowStore) return;
        setNotes((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((n) => n.id !== row.id);
          const note = rowToNote(row);
          const idx = prev.findIndex((n) => n.id === note.id);
          const next = idx === -1 ? [note, ...prev] : prev.map((n) => (n.id === note.id ? note : n));
          return sortNotes(next);
        });
      })
      .subscribe();

    return () => { active = false; supabase!.removeChannel(channel); };
  }, [useDb, storeReady, storeBucket, activeStoreId, readLocal]);

  /* ── Mutations ── */
  const addNote = useCallback(async (partial?: Partial<Pick<Note, "title" | "body" | "color">>) => {
    const now = Date.now();
    const optimistic: Note = {
      id: genId(),
      title: partial?.title ?? "",
      body: partial?.body ?? "",
      color: partial?.color ?? null,
      pinnedAt: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (!useDb) {
      setNotes((prev) => { const next = sortNotes([optimistic, ...prev]); writeLocal(next); return next; });
      return optimistic.id;
    }

    // DB insert. Stamp owner_staff_id explicitly (don't rely solely on the DB
    // default auth_staff_id(), which silently fails if it can't resolve) and
    // branch_id with the active store (NULL in All-Shops). organization_id
    // still defaults from auth_org_id() server-side.
    const insertRow: Record<string, unknown> = {
      title: optimistic.title,
      body: optimistic.body,
      color: optimistic.color,
      branch_id: activeStoreId ?? null,
    };
    if (staffId) insertRow.owner_staff_id = staffId;
    if (orgId) insertRow.organization_id = orgId;
    const { data, error } = await supabase!
      .from("notes")
      .insert(insertRow)
      .select("*")
      .single();
    if (!error && data) {
      const saved = rowToNote(data);
      setNotes((prev) => sortNotes([saved, ...prev.filter((n) => n.id !== saved.id)]));
      return saved.id;
    }
    // Surface the failure instead of hiding it (a silent RLS/auth failure is
    // exactly what makes notes look "shared" via the local fallback).
    if (error) {
      console.error("[notes] insert failed:", error.code, error.message);
      toast.error("Note not saved to the server", {
        description: `DB error [${error.code ?? "?"}]: ${error.message}`,
      });
    }
    // Fallback: keep locally so the user doesn't lose the note.
    setNotes((prev) => sortNotes([optimistic, ...prev]));
    return optimistic.id;
  }, [useDb, activeStoreId, staffId, orgId, writeLocal]);

  const updateNote = useCallback(async (id: string, patch: Partial<Pick<Note, "title" | "body" | "color" | "pinnedAt">>) => {
    setNotes((prev) => {
      const next = sortNotes(prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
      if (!useDb) writeLocal(next);
      return next;
    });
    if (useDb) {
      const dbPatch: Record<string, unknown> = {};
      if ("title" in patch) dbPatch.title = patch.title;
      if ("body" in patch) dbPatch.body = patch.body;
      if ("color" in patch) dbPatch.color = patch.color;
      if ("pinnedAt" in patch) dbPatch.pinned_at = patch.pinnedAt ? new Date(patch.pinnedAt).toISOString() : null;
      await supabase!.from("notes").update(dbPatch).eq("id", id);
    }
  }, [useDb, writeLocal]);

  const togglePin = useCallback((id: string) => {
    const note = notes.find((n) => n.id === id);
    updateNote(id, { pinnedAt: note?.pinnedAt ? null : Date.now() });
  }, [notes, updateNote]);

  const deleteNote = useCallback(async (id: string) => {
    setNotes((prev) => { const next = prev.filter((n) => n.id !== id); if (!useDb) writeLocal(next); return next; });
    if (useDb) await supabase!.from("notes").delete().eq("id", id);
  }, [useDb, writeLocal]);

  const ready = useMemo(() => storeReady && !loading, [storeReady, loading]);

  return { notes, loading, ready, addNote, updateNote, deleteNote, togglePin };
}
