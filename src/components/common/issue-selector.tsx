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
import { createPortal } from "react-dom";
import { Plus, Search, X } from "lucide-react";
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
  /** Optional override for the selected-issue pill (e.g. a thinner vertical size). */
  pillClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  allowCreate?: boolean;
  pillClassName?: string;
}) {
  const { issueLibrary, addIssueToStore } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Portal panel position (fixed, computed from the trigger rect) so the
  // dropdown escapes any modal/drawer `overflow-hidden` and is never clipped.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const selected = parseIssueString(value);

  // Position the portal panel from the trigger's rect; flip up when there's not
  // enough room below so long lists never get clipped by the viewport edge.
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 280 && r.top > spaceBelow;
    setPos(openUp
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6 }
      : { left: r.left, width: r.width, top: r.bottom + 6 });
  };

  // Close on outside click (trigger OR portal panel are both "inside").
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Keep the panel glued to the trigger while an ancestor (modal body) scrolls
  // or the viewport resizes. Capture phase catches inner-scroller scrolls too.
  useEffect(() => {
    if (!open) return;
    place();
    const onReflow = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      place();
    };
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        onClick={() => { place(); setOpen(true); inputRef.current?.focus(); }}
        className={cn(
          "flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-input bg-card px-3 py-2 text-sm transition-all duration-150 hover:border-[#4361EE]/40 focus-within:border-[#4361EE] focus-within:ring-1 focus-within:ring-[#4361EE]/10",
          className,
        )}
      >
        {selected.map((issue) => (
          <span
            key={issue}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1 text-[13px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/40",
              pillClassName,
            )}
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
          onChange={(e) => { setQuery(e.target.value); if (!open) { place(); setOpen(true); } }}
          onFocus={() => { place(); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? (placeholder ?? "Search or add issues…") : "Add more…"}
          className="min-w-[100px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none focus-visible:shadow-none focus-visible:ring-0"
        />
      </div>

      {/* Dropdown — portalled to <body> with fixed positioning so it is never
          clipped by a modal/drawer `overflow-hidden` ancestor (spec: match the
          lead form's ConfigurableSelect / AgentPicker portal behaviour). */}
      {mounted && open && createPortal(
        <div
          ref={panelRef}
          data-lead-popover-open="true"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="fixed z-[10041] overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
        >
          {/* Dedicated search bar inside the panel — mirrors the other lead
              pickers and makes "search issues" explicit. */}
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or add issues…"
              className="w-full bg-transparent text-[13px] outline-none !shadow-none focus-visible:!shadow-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
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
            {/* "Add new issue" pinned to the END of the list. */}
            {showCreate && (
              <>
                {filtered.length > 0 && <div className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  onClick={() => addIssue(query)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]/60 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-[#4361EE]" />
                  <span>Add new issue “<span className="font-semibold">{query.trim()}</span>”</span>
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
