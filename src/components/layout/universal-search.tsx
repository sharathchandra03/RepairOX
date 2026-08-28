"use client";

import { useRef, useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ChevronDown, Ticket, FileText, Settings, Loader2,
  Phone, Smartphone, Hash, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useUniversalSearch,
  SEARCH_SCOPES,
  type SearchScope,
  type SearchResult,
  type TicketResult,
  type InvoiceResult,
  type SettingsResult,
} from "@/hooks/use-universal-search";
import {
  STATUS_LABEL, STATUS_TONE,
  INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE,
  INVOICE_TYPE_LABEL,
} from "@/lib/mock-data";

/* ─── Scope Icon Map ─────────────────────────────────────────────────── */

const SCOPE_ICON: Record<SearchScope, typeof Ticket> = {
  tickets: Ticket,
  invoices: FileText,
  settings: Settings,
};

/* ─── Highlight Helper ───────────────────────────────────────────────── */

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-[#4361EE]/15 text-[#4361EE] rounded-sm px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

/* ─── Result Row Components ──────────────────────────────────────────── */

function TicketResultRow({ result, query, isActive }: { result: TicketResult; query: string; isActive: boolean }) {
  const statusLabel = STATUS_LABEL[result.status] ?? result.status;
  const statusTone = STATUS_TONE[result.status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200";

  return (
    <div className={cn("flex items-start gap-3 px-4 py-3 transition-colors", isActive && "bg-[#4361EE]/5")}>
      {/* Icon */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Ticket className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-zinc-900">
            <Highlight text={result.displayId ?? result.id} query={query} />
          </span>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", statusTone)}>
            {statusLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-600 truncate">
          <Highlight text={result.customer} query={query} />
          {result.phone && (
            <span className="text-zinc-400 ml-2">
              <Highlight text={result.phone} query={query} />
            </span>
          )}
        </p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
          {result.model && (
            <span className="flex items-center gap-1">
              <Smartphone className="h-3 w-3" />
              <Highlight text={result.model} query={query} />
            </span>
          )}
          {result.amount > 0 && (
            <span className="font-medium text-zinc-700">₹{result.amount.toLocaleString("en-IN")}</span>
          )}
          {result.dueDate && (
            <span className="text-zinc-400">
              Due: {new Date(result.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceResultRow({ result, query, isActive }: { result: InvoiceResult; query: string; isActive: boolean }) {
  const statusLabel = INVOICE_STATUS_LABEL[result.status] ?? result.status;
  const statusTone = INVOICE_STATUS_TONE[result.status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200";
  const typeLabel = INVOICE_TYPE_LABEL[result.invoiceType as keyof typeof INVOICE_TYPE_LABEL] ?? result.invoiceType;

  return (
    <div className={cn("flex items-start gap-3 px-4 py-3 transition-colors", isActive && "bg-[#4361EE]/5")}>
      {/* Icon */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <FileText className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-zinc-900">
            <Highlight text={result.reference || result.id} query={query} />
          </span>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", statusTone)}>
            {statusLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-600 truncate">
          <Highlight text={result.customer} query={query} />
          {result.phone && (
            <span className="text-zinc-400 ml-2">
              <Highlight text={result.phone} query={query} />
            </span>
          )}
        </p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
            {typeLabel}{result.category ? ` · ${result.category}` : ""}
          </span>
          <span className="font-medium text-zinc-700">₹{result.amount.toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  );
}

function SettingsResultRow({ result, query, isActive }: { result: SettingsResult; query: string; isActive: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 px-4 py-3 transition-colors", isActive && "bg-[#4361EE]/5")}>
      {/* Icon */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
        <Settings className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-zinc-900">
            <Highlight text={result.label} query={query} />
          </span>
          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
            <Highlight text={result.section} query={query} />
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-500 truncate">
          <Highlight text={result.description} query={query} />
        </p>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────── */

export function UniversalSearch() {
  const router = useRouter();
  const { scope, setScope, query, setQuery, results, isLoading, resetSearch } = useUniversalSearch();

  const [isOpen, setIsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setScopeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close scope dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) {
        setScopeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Reset active index on results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  // Global keyboard shortcut ⌘+S or ⌘+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      // For tickets and invoices, navigate to the list page with a search filter
      // instead of opening the record detail page directly
      if (result.type === "ticket") {
        router.push(`/tickets?search_id=${encodeURIComponent(result.id)}`);
      } else if (result.type === "invoice") {
        router.push(`/invoice?search_id=${encodeURIComponent(result.id)}`);
      } else {
        router.push(result.href);
      }
      setIsOpen(false);
      resetSearch();
    },
    [router, resetSearch]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            navigateToResult(results[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (query) {
            resetSearch();
          } else {
            setIsOpen(false);
            inputRef.current?.blur();
          }
          break;
        case "Tab":
          // Cycle scope with Tab (no shift) when panel is open
          if (!e.shiftKey && isOpen && !query) {
            e.preventDefault();
            const scopes: SearchScope[] = ["tickets", "invoices", "settings"];
            const idx = scopes.indexOf(scope);
            setScope(scopes[(idx + 1) % scopes.length]);
          }
          break;
      }
    },
    [isOpen, results, activeIndex, query, scope, navigateToResult, resetSearch, setScope]
  );

  const ScopeIcon = SCOPE_ICON[scope];
  const scopeLabel = SEARCH_SCOPES.find((s) => s.id === scope)?.label ?? "Tickets";

  const showResults = isOpen && (query.trim().length > 0 || isLoading);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-[420px]">
      {/* Search Input */}
      <div
        className={cn(
          "relative flex h-9 items-center rounded-full border transition-all duration-200",
          isOpen
            ? "border-[#4361EE]/40 bg-white shadow-[0_0_0_3px_rgba(67,97,238,0.10)]"
            : "border-border bg-slate-100/80 hover:bg-slate-100"
        )}
      >
        {/* Scope selector (inside the pill) */}
        <div ref={scopeRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setScopeOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-l-full pl-3 pr-2 py-1.5 text-[11px] font-semibold transition-colors border-r",
              isOpen
                ? "border-[#4361EE]/20 text-[#4361EE] bg-[#4361EE]/5"
                : "border-border text-zinc-500 hover:text-zinc-700"
            )}
            aria-label="Select search scope"
          >
            <ScopeIcon className="h-3 w-3" />
            <span className="hidden sm:inline">{scopeLabel}</span>
            <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", scopeOpen && "rotate-180")} />
          </button>

          {/* Scope Dropdown */}
          {scopeOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-40 rounded-xl border border-border bg-white shadow-lg shadow-black/8 py-1.5 animate-in fade-in-0 zoom-in-95 duration-150">
              {SEARCH_SCOPES.map((s) => {
                const Icon = SCOPE_ICON[s.id];
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setScope(s.id);
                      setScopeOpen(false);
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-[12px] transition-colors",
                      s.id === scope
                        ? "text-[#4361EE] bg-[#4361EE]/5 font-semibold"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {s.label}
                    {s.id === scope && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#4361EE]" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className={cn("ml-2 h-3.5 w-3.5 shrink-0 transition-colors", isOpen ? "text-[#4361EE]" : "text-zinc-400")} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={`Search ${scopeLabel.toLowerCase()}...`}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-zinc-800 placeholder:text-zinc-400 outline-none focus:outline-none focus:ring-0"
            aria-label={`Search ${scopeLabel}`}
            aria-expanded={showResults}
            aria-controls="universal-search-results"
            role="combobox"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
          />
          {query && (
            <button
              onClick={() => {
                resetSearch();
                inputRef.current?.focus();
              }}
              className="mr-1 grid h-5 w-5 place-items-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 transition"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Keyboard hint */}
        {!isOpen && (
          <kbd className="mr-3 hidden shrink-0 items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 ring-1 ring-zinc-200 sm:inline-flex">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Results Panel */}
      {showResults && (
        <div
          id="universal-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 max-h-[420px] overflow-y-auto rounded-2xl border border-border bg-white shadow-xl shadow-black/10 animate-in fade-in-0 slide-in-from-top-2 duration-200"
        >
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[12px]">Searching {scopeLabel.toLowerCase()}...</span>
            </div>
          )}

          {/* No results */}
          {!isLoading && query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
              <Search className="h-8 w-8 mb-2 text-zinc-300" />
              <p className="text-[13px] font-medium text-zinc-500">No results in {scopeLabel}</p>
              <p className="text-[11px] mt-0.5">Try a different search term or scope</p>
            </div>
          )}

          {/* Results list */}
          {!isLoading && results.length > 0 && (
            <>
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-zinc-50/90 backdrop-blur-sm px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {scopeLabel}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Items */}
              <div className="py-1">
                {results.map((result, idx) => (
                  <button
                    key={result.type === "settings" ? result.href : result.id}
                    id={`search-result-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    onClick={() => navigateToResult(result)}
                    className={cn(
                      "w-full text-left cursor-pointer transition-colors",
                      idx === activeIndex ? "bg-[#4361EE]/5" : "hover:bg-zinc-50"
                    )}
                  >
                    {result.type === "ticket" && (
                      <TicketResultRow result={result} query={query} isActive={idx === activeIndex} />
                    )}
                    {result.type === "invoice" && (
                      <InvoiceResultRow result={result} query={query} isActive={idx === activeIndex} />
                    )}
                    {result.type === "settings" && (
                      <SettingsResultRow result={result} query={query} isActive={idx === activeIndex} />
                    )}
                  </button>
                ))}
              </div>

              {/* Footer hints */}
              <div className="sticky bottom-0 flex items-center gap-4 border-t border-border bg-zinc-50/90 backdrop-blur-sm px-4 py-2">
                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <kbd className="rounded bg-zinc-200 px-1 py-0.5 text-[9px] font-medium">↑↓</kbd> navigate
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <kbd className="rounded bg-zinc-200 px-1 py-0.5 text-[9px] font-medium">↵</kbd> open
                </span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <kbd className="rounded bg-zinc-200 px-1 py-0.5 text-[9px] font-medium">esc</kbd> close
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
