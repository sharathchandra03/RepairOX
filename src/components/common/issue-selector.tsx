"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — shared Issue multi-select (pill input).

   The canonical "issues as pills" control, extracted from the Ticket intake
   flow so Tickets, Walk-In and Quotations all capture issues the SAME way:
   searchable pills backed by the shared Issue Master (useStore().issueLibrary),
   with inline "create new" that persists to the master. The stored value is the
   canonical comma-separated issue string (parseIssueString / serializeIssues).

   This is the ONE issue picker — reuse it wherever a device issue is captured
   rather than re-implementing the pattern.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { X, Plus, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseIssueString, serializeIssues } from "@/lib/issue-library";
import { cn } from "@/lib/utils";
import { SearchDropdownPanel } from "@/components/common/search-dropdown-panel";

export function IssueSelector({
  value,
  onChange,
  className,
  placeholder,
  pillClassName,
}: {
  /** Canonical comma-separated issue string. */
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  /** Optional extra classes applied to each selected issue pill (compact use). */
  pillClassName?: string;
}) {
  const { issueLibrary, addIssueToStore } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = parseIssueString(value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // The dropdown ALWAYS opens downward. When the field sits low in the modal,
  // scroll the modal body so the FIELD moves toward the TOP of the visible
  // area — freeing the whole height below it for the downward panel. Scrolling
  // the field up (rather than the panel into view) guarantees room regardless
  // of the panel's height, and never flips the panel upward.
  useEffect(() => {
    if (!open) return;
    const run = () => {
      const panel = panelRef.current;
      const field = containerRef.current;
      if (!field) return;
      // Nearest scrollable ancestor (the modal body).
      let scroller: HTMLElement | null = field.parentElement;
      while (scroller) {
        const style = getComputedStyle(scroller);
        const oy = style.overflowY;
        if ((oy === "auto" || oy === "scroll") && scroller.scrollHeight > scroller.clientHeight) break;
        scroller = scroller.parentElement;
      }
      if (!scroller) { (panel ?? field).scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }

      const scRect = scroller.getBoundingClientRect();
      const fieldRect = field.getBoundingClientRect();
      const panelH = panel?.offsetHeight ?? 280;
      const TOP_GAP = 16;   // breathing room above the field after scrolling
      const BOTTOM_GAP = 12;
      // Space currently below the field inside the scroller.
      const spaceBelow = scRect.bottom - fieldRect.bottom;
      const needed = panelH + BOTTOM_GAP;
      if (spaceBelow >= needed) return; // already enough room below
      // Scroll the field up by the shortfall, but no further than putting the
      // field TOP_GAP below the scroller's top.
      const maxUp = (fieldRect.top - scRect.top) - TOP_GAP;
      const delta = Math.min(needed - spaceBelow, Math.max(0, maxUp));
      if (delta > 0) scroller.scrollBy({ top: delta, behavior: "smooth" });
    };
    // Run after the panel paints (so offsetHeight is real), and once more on the
    // next frame in case height settles after content renders.
    const id1 = requestAnimationFrame(() => { run(); });
    const id2 = requestAnimationFrame(() => requestAnimationFrame(run));
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
  }, [open]);

  const filtered = issueLibrary
    .filter(
      (item) =>
        !selected.some((s) => s.toLowerCase() === item.toLowerCase()) &&
        item.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b));

  const addIssue = (issue: string) => {
    const trimmed = issue.trim();
    if (!trimmed) return;
    if (selected.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
    const updated = [...selected, trimmed];
    onChange(serializeIssues(updated));
    addIssueToStore(trimmed);
    setQuery("");
  };

  const removeIssue = (issue: string) => {
    const updated = selected.filter((s) => s.toLowerCase() !== issue.toLowerCase());
    onChange(serializeIssues(updated));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      addIssue(query);
    }
    if (e.key === "Backspace" && !query && selected.length > 0) {
      removeIssue(selected[selected.length - 1]);
    }
  };

  const showCreate = query.trim() && !issueLibrary.some((i) => i.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={cn(
          "flex min-h-[44px] max-h-[110px] w-full flex-wrap items-center gap-1.5 overflow-y-auto rounded-xl border bg-card px-3 py-2 text-sm transition-all duration-150 cursor-text",
          "border-input hover:border-[#4361EE]/40 focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/10",
          className,
        )}
      >
        {selected.map((issue) => (
          <span
            key={issue}
            className={cn("inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-[13px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/40", pillClassName)}
          >
            {issue}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeIssue(issue); }}
              className="grid h-4 w-4 place-items-center rounded-full hover:bg-[#4361EE]/10 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? (placeholder || "Search or add issues…") : "Add more…"}
          className="min-w-[100px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-0"
        />
      </div>

      {open && (
        <SearchDropdownPanel ref={panelRef} label="Issues" onClose={() => setOpen(false)}>
          {showCreate && (
            <button
              type="button"
              onClick={() => addIssue(query)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#4361EE]" />
              <span>Create &ldquo;<span className="font-medium text-[#4361EE]">{query.trim()}</span>&rdquo;</span>
            </button>
          )}
          {filtered.length > 0 ? (
            filtered.slice(0, 15).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => addIssue(item)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground opacity-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">{item}</span>
              </button>
            ))
          ) : !showCreate ? (
            <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No issues found</p>
          ) : null}
        </SearchDropdownPanel>
      )}
    </div>
  );
}
