"use client";

/* ──────────────────────────────────────────────────────────────────────────
   IssueSelector — shared Issue Master picker.

   ONE reusable control over the single shared Issue Master (store.issueLibrary,
   seeded from lib/issue-library DEFAULT_ISSUES). It supports:
     • typing to search existing issues
     • selecting one or more existing issues (pills)
     • adding a NEW issue when it doesn't exist — persisted to the SAME master via
       addIssueToStore, so it becomes immediately selectable in Walk-In AND
       Ticket (and any future module) with no page reload.

   The value is stored as a comma-separated string (parseIssueString /
   serializeIssues) exactly like the Ticket form already does, so existing
   walk-in / ticket records remain compatible.

   This mirrors the interaction that previously lived inline in the ticket new
   page so both modules share one implementation and one data source.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseIssueString, serializeIssues } from "@/lib/issue-library";
import { cn } from "@/lib/utils";

export function IssueSelector({
  value,
  onChange,
  className,
  placeholder,
  /** When true, users may create a brand-new issue on the shared master. */
  allowCreate = true,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  allowCreate?: boolean;
}) {
  const { issueLibrary, addIssueToStore } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = parseIssueString(value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(
    () =>
      issueLibrary
        .filter(
          (item) =>
            item.toLowerCase().includes(query.trim().toLowerCase()) &&
            !selected.some((s) => s.toLowerCase() === item.toLowerCase()),
        )
        .sort((a, b) => a.localeCompare(b)),
    [issueLibrary, query, selected],
  );

  const addIssue = (issue: string) => {
    const trimmed = issue.trim();
    if (!trimmed) return;
    if (selected.some((s) => s.toLowerCase() === trimmed.toLowerCase())) { setQuery(""); return; }
    onChange(serializeIssues([...selected, trimmed]));
    addIssueToStore(trimmed); // persist to the shared master → selectable everywhere
    setQuery("");
    inputRef.current?.focus();
  };

  const removeIssue = (issue: string) => {
    onChange(serializeIssues(selected.filter((s) => s.toLowerCase() !== issue.toLowerCase())));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      if (allowCreate || issueLibrary.some((i) => i.toLowerCase() === query.trim().toLowerCase())) addIssue(query);
    }
    if (e.key === "Backspace" && !query && selected.length > 0) removeIssue(selected[selected.length - 1]);
  };

  const showCreate =
    allowCreate && query.trim() && !issueLibrary.some((i) => i.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        className={cn(
          "flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-3 py-2 text-sm transition focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/20",
          className,
        )}
      >
        {selected.map((issue) => (
          <span
            key={issue}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1 text-[13px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/40"
          >
            {issue}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeIssue(issue); }}
              className="grid h-4 w-4 place-items-center rounded-full hover:bg-[#4361EE]/10 transition"
              aria-label={`Remove ${issue}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? (placeholder ?? "Search or add issues…") : "Add more…"}
          className="min-w-[100px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && (
        <div className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          {showCreate && (
            <button
              type="button"
              onClick={() => addIssue(query)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#4361EE]" />
              <span>Add new issue “<span className="font-semibold">{query.trim()}</span>”</span>
            </button>
          )}
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => addIssue(item)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
              >
                {item}
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
