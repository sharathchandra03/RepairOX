"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Lead Management header search (Lead Intelligence Search).

   Replaces the Tickets-scoped UniversalSearch ONLY while the Lead Management
   workspace is active (topbar.tsx). Searches customers, leads, CRM contacts and
   follow-ups through the server RPC lead_search() — ranking, normalisation and
   visibility are server-side; this component only renders and navigates.

   Searching / opening a result is read-only: it never writes a lead, activity,
   follow-up or status (viewing is not a sales activity).
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, Users, AlertTriangle, ArrowRight, UserPlus, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { useLeadSearch } from "@/hooks/use-lead-search";
import { SegmentedTabs } from "@/components/ui/tabs";
import {
  flattenResults, hrefForRow, searchPageHref, MIN_QUERY_LENGTH, type LeadSearchEntity, type FlatRow,
} from "@/lib/lead-search";
import { LeadQuickView } from "@/components/leads/search/lead-quick-view";
import {
  CustomerHitBody, LeadHitBody, ContactHitBody, FollowUpHitBody,
} from "@/components/leads/search/lead-search-parts";

const PLACEHOLDER = "Search customers, mobile, email, Lead ID, device...";

const GROUP_LABEL: Record<FlatRow["kind"], string> = {
  customer: "Customers", lead: "Leads", contact: "CRM Contacts", followup: "Follow-ups",
};

export function LeadSearch() {
  const router = useRouter();
  const { can } = usePermissions();
  const canCustomers = allow(can, CAP.lead.customerHistory);
  const { query, setQuery, entity, setEntity, status, result, errorMessage, resetSearch, canSearch } = useLeadSearch();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const rows = useMemo(() => flattenResults(result), [result]);
  const q = query.trim();
  const hasQuery = q.length >= MIN_QUERY_LENGTH;
  const showPanel = isOpen && q.length > 0;

  // Outside click closes the panel.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Cmd/Ctrl + K focuses the search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { setActiveIndex(-1); }, [result, entity]);

  const close = useCallback(() => { setIsOpen(false); }, []);

  const [quickViewLeadId, setQuickViewLeadId] = useState<string | null>(null);

  const openRow = useCallback((row: FlatRow) => {
    if (row.kind === "lead") { setQuickViewLeadId(row.id); close(); return; }
    if (row.kind === "followup") { setQuickViewLeadId(row.item.lead_id); close(); return; }
    router.push(hrefForRow(row));
    close();
    resetSearch();
  }, [router, close, resetSearch]);

  const viewAll = useCallback(() => {
    if (!hasQuery) return;
    router.push(searchPageHref(q, entity));
    close();
  }, [router, hasQuery, q, entity, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (query) resetSearch(); else { close(); inputRef.current?.blur(); }
      return;
    }
    if (!showPanel) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((p) => (rows.length === 0 ? -1 : p < rows.length - 1 ? p + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((p) => (rows.length === 0 ? -1 : p > 0 ? p - 1 : rows.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && rows[activeIndex]) openRow(rows[activeIndex]);
      else viewAll();
    }
  };

  // Keep the active row scrolled into view while arrowing.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`lead-search-row-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!canSearch) return null;

  // Group rows (already ordered customers → leads → contacts → follow-ups).
  let lastKind: FlatRow["kind"] | null = null;

  return (
    <div ref={containerRef} className="relative w-[400px] max-w-[34vw] min-w-[280px] shrink-0">
      <div
        className={cn(
          "relative flex h-9 items-center rounded-full border transition-all duration-200",
          isOpen
            ? "border-[#4361EE]/40 bg-white shadow-[0_0_0_3px_rgba(67,97,238,0.10)]"
            : "border-border bg-slate-100/80 hover:bg-slate-100",
        )}
      >
        {/* Static scope label — Lead Management only searches Lead Management data */}
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-l-full border-r py-1.5 pl-3 pr-2 text-[11px] font-semibold",
            isOpen ? "border-[#4361EE]/20 bg-[#4361EE]/5 text-[#4361EE]" : "border-border text-zinc-500",
          )}
        >
          <Users className="h-3 w-3" />
          <span className="hidden sm:inline">Leads</span>
        </span>
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className={cn("ml-2 h-3.5 w-3.5 shrink-0", isOpen ? "text-[#4361EE]" : "text-zinc-400")} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (!isOpen) setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={PLACEHOLDER}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-zinc-800 outline-none placeholder:text-zinc-400 focus:outline-none focus:ring-0"
            aria-label="Search customers, mobile, email, Lead ID or device"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="lead-search-results"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `lead-search-row-${activeIndex}` : undefined}
          />
          {query && (
            <button
              type="button"
              onClick={() => { resetSearch(); inputRef.current?.focus(); }}
              className="mr-1 grid h-5 w-5 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-600"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {!isOpen && (
          <kbd className="mr-3 hidden shrink-0 items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-zinc-200 sm:inline-flex">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        )}
      </div>

      {showPanel && (
        <div
          id="lead-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 min-w-[min(560px,92vw)] overflow-hidden rounded-2xl border border-border bg-white shadow-xl shadow-black/10 animate-in fade-in-0 slide-in-from-top-2 duration-200"
        >
          {/* Result-type filter */}
          <div
            className="flex items-center justify-between gap-2 border-b border-border bg-zinc-50/90 px-3 py-2"
            onMouseDown={(e) => e.preventDefault() /* keep input focus */}
          >
            <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <SegmentedTabs
                size="sm"
                value={entity}
                onChange={(v) => setEntity(v as LeadSearchEntity)}
                options={[
                  { label: "All", value: "all" },
                  ...(canCustomers ? [{ label: "Customers", value: "customers" }] : []),
                  { label: "Leads", value: "leads" },
                  { label: "Contacts", value: "contacts" },
                  { label: "Follow-ups", value: "followups" },
                ]}
              />
            </div>
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {!hasQuery && (
              <p className="px-4 py-6 text-center text-[12px] text-zinc-500">Type at least {MIN_QUERY_LENGTH} characters to search.</p>
            )}

            {hasQuery && status === "loading" && rows.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[12px]">Searching customers and leads…</span>
              </div>
            )}

            {hasQuery && status === "error" && (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <AlertTriangle className="h-6 w-6 text-rose-500" />
                <p className="text-[13px] font-medium text-zinc-700">Search failed</p>
                <p className="text-[11.5px] text-zinc-500">{errorMessage || "Please try again."}</p>
              </div>
            )}

            {hasQuery && status === "forbidden" && (
              <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
                <ShieldAlert className="h-6 w-6 text-amber-500" />
                <p className="text-[13px] font-medium text-zinc-700">Lead search isn&rsquo;t enabled for your role</p>
              </div>
            )}

            {hasQuery && status === "ready" && rows.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-9 text-center">
                <Search className="h-8 w-8 text-zinc-300" />
                <p className="text-[13px] font-medium text-zinc-600">No existing customer or Lead found.</p>
                <button
                  type="button"
                  onClick={() => {
                    const isPhone = /^[+0-9()\s.-]{6,}$/.test(q);
                    const isEmail = q.includes("@");
                    const p = new URLSearchParams({ action: "new" });
                    if (isPhone) p.set("phone", q); else if (isEmail) p.set("email", q); else p.set("name", q);
                    router.push(`/leads/list?${p.toString()}`);
                    close();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#4361EE] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3450D8]"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Create Lead
                </button>
              </div>
            )}

            {rows.length > 0 && (
              <div className={cn("py-1", status === "loading" && "opacity-60")}>
                {rows.map((row, idx) => {
                  const header = row.kind !== lastKind;
                  lastKind = row.kind;
                  return (
                    <div key={`${row.kind}-${row.id}`}>
                      {header && (
                        <div className="flex items-center justify-between bg-zinc-50/70 px-4 py-1.5">
                          <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">{GROUP_LABEL[row.kind]}</span>
                          <span className="text-[10.5px] text-zinc-400">
                            {row.kind === "customer" && result.customers.total}
                            {row.kind === "lead" && result.leads.total}
                            {row.kind === "contact" && result.contacts.total}
                            {row.kind === "followup" && result.followups.total}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        id={`lead-search-row-${idx}`}
                        role="option"
                        aria-selected={idx === activeIndex}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => openRow(row)}
                        className={cn("w-full cursor-pointer px-4 py-2.5 text-left transition-colors", idx === activeIndex ? "bg-[#4361EE]/5" : "hover:bg-zinc-50")}
                      >
                        {row.kind === "customer" && <CustomerHitBody item={row.item} query={q} />}
                        {row.kind === "lead" && <LeadHitBody item={row.item} query={q} compact />}
                        {row.kind === "contact" && <ContactHitBody item={row.item} query={q} />}
                        {row.kind === "followup" && <FollowUpHitBody item={row.item} query={q} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="flex items-center justify-between border-t border-border bg-zinc-50/90 px-4 py-2">
              <span className="hidden text-[10.5px] text-zinc-400 sm:inline">↑↓ navigate · Enter open · Esc close</span>
              <button
                type="button"
                onClick={viewAll}
                className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline"
              >
                View all results <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
      <LeadQuickView leadId={quickViewLeadId} onClose={() => setQuickViewLeadId(null)} />
    </div>
  );
}
