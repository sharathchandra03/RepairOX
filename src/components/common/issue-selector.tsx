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

  const selected = parseIssueString(value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-xl border border-border bg-card p-1.5 shadow-xl ring-1 ring-black/[0.03] max-h-60 overflow-y-auto">
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
        </div>
      )}
    </div>
  );
}
