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

   Dropdown model — the field IS the search bar (pills + the type-to-search
   input). The option list is a PORTALLED popover (fixed-positioned at the
   field, portalled to <body>) so it is never clipped by a modal/page scroll
   container and never gets separated from the field. The list flips upward
   when there isn't room below and caps its own height to the viewport so it
   scrolls internally — typing / filtering / backspacing never re-clips or
   jumps. The popover repositions on scroll/resize to stay glued to the field.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseIssueString, serializeIssues } from "@/lib/issue-library";
import { cn } from "@/lib/utils";

type PopPos = { left: number; top: number; width: number; maxListH: number };

export function IssueSelector({
  value,
  onChange,
  className,
  placeholder,
  pillClassName,
  fieldClassName,
}: {
  /** Canonical comma-separated issue string. */
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  /** Optional extra classes applied to each selected issue pill (compact use). */
  pillClassName?: string;
  /** Optional extra classes applied to the field/search box itself — lets a
   *  caller render a taller box (e.g. a textarea-sized box) instead of the
   *  compact default. Overrides the default min/max height. */
  fieldClassName?: string;
}) {
  const { issueLibrary, addIssueToStore } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<PopPos | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = parseIssueString(value);

  // ── Positioning ─────────────────────────────────────────────────────────
  // Fixed-position the list popover directly under the field (or above it when
  // there isn't room below), capping its height to the viewport so it scrolls
  // internally. Runs on open and on every scroll/resize so it tracks the field.
  const place = useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    const r = field.getBoundingClientRect();
    const GAP = 6;      // gap between field and list
    const EDGE = 12;    // keep off the viewport edge
    const MIN = 120;
    const MAX = 280;

    const roomBelow = window.innerHeight - r.bottom - GAP - EDGE;
    const roomAbove = r.top - GAP - EDGE;
    const dropUp = roomBelow < MIN && roomAbove > roomBelow;

    const room = dropUp ? roomAbove : roomBelow;
    const maxListH = Math.max(MIN, Math.min(MAX, room));

    setPos({
      left: r.left,
      top: dropUp ? r.top - GAP - maxListH : r.bottom + GAP,
      width: r.width,
      maxListH,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  // Re-place when the pills reflow the field height or the query changes the
  // list — keeps the popover glued to the field.
  useEffect(() => { if (open) place(); }, [open, value, query, place]);

  // Outside-click / Escape to close (field + portalled popover both count).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (fieldRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
      setQuery("");
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
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
    // Keep the popover open so the user can add several issues in a row.
    requestAnimationFrame(() => inputRef.current?.focus());
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
    <div className={cn("relative", className)}>
      {/* The field IS the search bar: pills + type-to-search input. */}
      <div
        ref={fieldRef}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={cn(
          "flex min-h-[44px] max-h-[110px] w-full flex-wrap items-start content-start gap-1.5 overflow-y-auto rounded-xl border bg-card px-3 py-2 text-sm transition-all duration-150 cursor-text",
          "border-input hover:border-[#4361EE]/40 focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/10",
          fieldClassName,
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

      {/* The portalled LIST popover (no second search bar — the field above is
          the search bar). Fixed-positioned so it's never clipped. */}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          data-lead-popover-open="true"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 10099 }}
          className="overflow-hidden rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/[0.03]"
        >
          {/* Floating close × (design-system requirement) — overlaid in the
              top-right corner so no header row wastes vertical space. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setOpen(false); setQuery(""); }}
            className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-card/80 text-muted-foreground backdrop-blur-sm transition hover:bg-muted hover:text-foreground"
            aria-label="Close dropdown"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {/* Option list — scrolls internally, capped to viewport room. */}
          <div className="overflow-y-auto p-1.5" style={{ maxHeight: pos.maxListH }}>
            {showCreate && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addIssue(query)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-[#4361EE]" />
                <span>Create &ldquo;<span className="font-medium text-[#4361EE]">{query.trim()}</span>&rdquo;</span>
              </button>
            )}
            {filtered.length > 0 ? (
              filtered.slice(0, 50).map((item) => (
                <button
                  key={item}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addIssue(item)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
                >
                  <span className="truncate">{item}</span>
                </button>
              ))
            ) : !showCreate ? (
              <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No issues found</p>
            ) : null}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
