"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  rpcLeadSearch, localLeadSearch, isDbSearch, EMPTY_SEARCH, MIN_QUERY_LENGTH,
  type LeadSearchResponse, type LeadSearchEntity,
} from "@/lib/lead-search";
import { useLeads } from "@/lib/leads-context";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { useSession } from "@/lib/use-session";

export type SearchStatus = "idle" | "loading" | "ready" | "error" | "forbidden";

/**
 * Debounced Lead Intelligence Search. Never fetches whole tables: in Supabase
 * mode it calls the lead_search() RPC (server-side ranking + RLS-aware
 * visibility + the opt-in shared-reference key); in local/demo mode it ranks
 * the already-loaded, already-scoped `leads` array client-side.
 */
export function useLeadSearch(debounceMs = 250) {
  const { leads } = useLeads();
  const { id: currentUserId } = useSession();
  const { can } = usePermissions();
  const canSearch = allow(can, CAP.lead.search);

  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState<LeadSearchEntity>("all");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [result, setResult] = useState<LeadSearchResponse>(EMPTY_SEARCH);
  const [errorMessage, setErrorMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const run = useCallback(
    async (q: string, ent: LeadSearchEntity) => {
      const mySeq = ++seq.current;
      if (!canSearch) { setStatus("forbidden"); setResult(EMPTY_SEARCH); return; }
      if (q.trim().length < MIN_QUERY_LENGTH) { setStatus("idle"); setResult(EMPTY_SEARCH); return; }
      setStatus("loading");
      try {
        const r = isDbSearch()
          ? await rpcLeadSearch({ query: q, entity: ent, limit: 6 })
          : localLeadSearch(q, leads, currentUserId || "");
        if (mySeq !== seq.current) return; // a newer request superseded this one
        if (r.forbidden) { setStatus("forbidden"); setResult(EMPTY_SEARCH); return; }
        setResult(r);
        setStatus("ready");
      } catch (e) {
        if (mySeq !== seq.current) return;
        setErrorMessage(e instanceof Error ? e.message : "Search failed");
        setStatus("error");
      }
    },
    [canSearch, leads, currentUserId],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(query, entity), debounceMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, entity, debounceMs]);

  const resetSearch = useCallback(() => {
    seq.current++;
    setQuery("");
    setStatus("idle");
    setResult(EMPTY_SEARCH);
  }, []);

  return { query, setQuery, entity, setEntity, status, result, errorMessage, resetSearch, canSearch };
}
