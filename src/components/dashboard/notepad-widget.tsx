"use client";

/* ──────────────────────────────────────────────────────────────────────────
   NotepadWidget — compact personal sticky-notes card for a dashboard rail.

   Same data + note model as the full Notes page (`/shop/notes`): it reuses the
   shared `useNotes` hook, so notes stay PERSONAL (owner-only) and INDEPENDENT
   per store, and everything a user jots here shows up on the full Notes page
   for the same store (and vice-versa) — one source of truth, no duplication.

   This is the dashboard-rail form factor: a single card that stacks the user's
   notes vertically with inline title/body editing, colour, pin and delete —
   sized to sit beside the other rail cards without dominating the column.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pin, PinOff, Trash2, StickyNote, Check } from "lucide-react";
import { useNotes, type Note } from "@/lib/use-notes";
import { cn } from "@/lib/utils";

/* Per-colour visual system for a note: a soft tinted body, a matching border,
   a saturated left accent stripe and the dot swatch used in the picker. Every
   colour is drawn from the existing RepairOX palette. */
const COLORS: {
  token: string;
  label: string;
  body: string;
  border: string;
  accent: string;
  dot: string;
}[] = [
  { token: "amber",   label: "Amber",  body: "bg-amber-50/70",   border: "border-amber-200/80",   accent: "bg-amber-400",   dot: "bg-amber-400" },
  { token: "emerald", label: "Green",  body: "bg-emerald-50/70", border: "border-emerald-200/80", accent: "bg-emerald-400", dot: "bg-emerald-400" },
  { token: "sky",     label: "Blue",   body: "bg-sky-50/70",     border: "border-sky-200/80",     accent: "bg-sky-400",     dot: "bg-sky-400" },
  { token: "rose",    label: "Rose",   body: "bg-rose-50/70",    border: "border-rose-200/80",    accent: "bg-rose-400",    dot: "bg-rose-400" },
  { token: "violet",  label: "Violet", body: "bg-violet-50/70",  border: "border-violet-200/80",  accent: "bg-violet-400",  dot: "bg-violet-400" },
];

function colorCfg(token: string | null) {
  return COLORS.find((c) => c.token === token) ?? {
    token: "card", label: "Default",
    body: "bg-card", border: "border-border", accent: "bg-[#4361EE]", dot: "bg-[#4361EE]",
  };
}

/* Short, friendly relative timestamp (e.g. "just now", "3h ago", "12 Jun").
   Accepts an epoch-millis value (how the Note model stores timestamps). */
function relativeTime(ts?: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function NotepadWidget() {
  const { notes, ready, addNote, updateNote, deleteNote, togglePin } = useNotes();
  const pinnedCount = notes.filter((n) => n.pinnedAt).length;

  return (
    <div className="overflow-hidden rounded-2xl border-[2.2px] border-[#B3BFF6]/50 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)]">
      {/* Header — tinted strip so the Notepad reads as its own workspace, with a
          gradient icon chip matching the "Got a call?" card. */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-r from-[#F5F7FF] to-transparent px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#4361EE] to-[#6366F1] text-white shadow-sm">
            <StickyNote className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-wider text-foreground">Notepad</h3>
            <p className="text-[11px] text-muted-foreground">
              Private to you · this store
              {pinnedCount > 0 && <span className="ml-1 text-[#4361EE]">· {pinnedCount} pinned</span>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => addNote({ color: COLORS[0].token })}
          title="New note"
          className="inline-flex items-center gap-1 rounded-full bg-[#4361EE] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#3A56D4] active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      <div className="p-4">
        {ready && notes.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#B3BFF6]/70 bg-[#F5F7FF]/50 py-9 text-center">
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]">
              <StickyNote className="h-5 w-5" />
            </div>
            <p className="text-[13px] font-semibold text-foreground">No notes yet</p>
            <p className="mt-0.5 max-w-[220px] text-[11px] text-muted-foreground">
              Jot down reminders or follow-ups. They stay private to you and to this store.
            </p>
            <button
              type="button"
              onClick={() => addNote({ color: COLORS[0].token })}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#4361EE] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#3A56D4]"
            >
              <Plus className="h-3.5 w-3.5" /> Add your first note
            </button>
          </div>
        )}

        {notes.length > 0 && (
          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onChange={(patch) => updateNote(note.id, patch)}
                  onDelete={() => deleteNote(note.id)}
                  onTogglePin={() => togglePin(note.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({
  note,
  onChange,
  onDelete,
  onTogglePin,
}: {
  note: Note;
  onChange: (patch: Partial<Pick<Note, "title" | "body" | "color">>) => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [showPalette, setShowPalette] = useState(false);
  const cfg = colorCfg(note.color);
  const stamp = relativeTime(note.updatedAt ?? note.createdAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border pl-3.5 pr-3 py-2.5 shadow-sm transition-shadow hover:shadow-md",
        cfg.body,
        note.pinnedAt ? "border-[#4361EE]/50 ring-1 ring-[#4361EE]/10" : cfg.border,
      )}
    >
      {/* Saturated left accent stripe — the sticky-note colour cue. */}
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-[3px]", cfg.accent)} />

      <div className="mb-1 flex items-center justify-between gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== note.title && onChange({ title })}
          placeholder="Title"
          className="w-full bg-transparent text-[13px] font-bold text-foreground placeholder:font-medium placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          {note.pinnedAt && (
            <span className="grid h-6 w-6 place-items-center rounded-lg text-[#4361EE] group-hover:hidden">
              <Pin className="h-3.5 w-3.5 fill-[#4361EE]" />
            </span>
          )}
          <div className="hidden items-center gap-0.5 group-hover:flex">
            <button
              type="button"
              onClick={onTogglePin}
              title={note.pinnedAt ? "Unpin" : "Pin to top"}
              className={cn(
                "grid h-6 w-6 place-items-center rounded-lg transition hover:bg-black/5",
                note.pinnedAt ? "text-[#4361EE]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {note.pinnedAt ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Delete"
              className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition hover:bg-rose-100 hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => body !== note.body && onChange({ body })}
        placeholder="Write a note…"
        rows={3}
        className="resize-none bg-transparent text-[12px] leading-relaxed text-foreground/90 placeholder:text-muted-foreground/60 focus:outline-none"
      />

      {/* Footer — timestamp + a compact colour picker that only expands on tap,
          keeping the resting card clean. */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {stamp ? (
          <span className="text-[10px] font-medium text-muted-foreground/70">{stamp}</span>
        ) : <span />}

        <div className="flex items-center gap-1.5">
          {!showPalette ? (
            <button
              type="button"
              onClick={() => setShowPalette(true)}
              title="Change colour"
              className={cn("h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10 transition hover:scale-110", cfg.dot)}
            />
          ) : (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                className="flex items-center gap-1.5 overflow-hidden"
              >
                {COLORS.map((c) => (
                  <button
                    key={c.token}
                    type="button"
                    title={c.label}
                    onClick={() => { onChange({ color: c.token }); setShowPalette(false); }}
                    className={cn(
                      "grid h-4 w-4 place-items-center rounded-full transition hover:scale-110",
                      c.dot,
                      note.color === c.token && "ring-2 ring-offset-1 ring-foreground/30",
                    )}
                  >
                    {note.color === c.token && <Check className="h-2.5 w-2.5 text-white" />}
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
  );
}
