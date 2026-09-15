"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pin, PinOff, Trash2, StickyNote } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { useNotes, type Note } from "@/lib/use-notes";
import { useStoreContext } from "@/lib/store-context";

/* Personal, per-store sticky notes. Each user sees only their OWN notes, and
   the board is independent per store (and for the consolidated All-Shops view).
   Data lives in public.notes (RLS = owner-only) with a localStorage fallback. */

const COLORS: { token: string; className: string; label: string }[] = [
  { token: "amber",   className: "bg-amber-50 border-amber-200",   label: "Amber" },
  { token: "emerald", className: "bg-emerald-50 border-emerald-200", label: "Green" },
  { token: "sky",     className: "bg-sky-50 border-sky-200",       label: "Blue" },
  { token: "rose",    className: "bg-rose-50 border-rose-200",     label: "Rose" },
  { token: "violet",  className: "bg-violet-50 border-violet-200", label: "Violet" },
];

function colorClass(token: string | null): string {
  return COLORS.find((c) => c.token === token)?.className ?? "bg-card border-border";
}

export default function Page() {
  const { notes, ready, addNote, updateNote, deleteNote, togglePin } = useNotes();
  const { activeStore, isAllShops } = useStoreContext();

  const scopeLabel = isAllShops ? "All Shops" : activeStore?.name ?? "This store";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shop Management"
        title="Notes"
        subtitle={`Your personal sticky notes for ${scopeLabel}. Only you can see these, and they're kept separate for each store.`}
        actions={
          <Button
            variant="soft"
            size="md"
            className="rounded-full"
            onClick={() => addNote({ color: COLORS[0].token })}
          >
            <Plus className="h-4 w-4" /> New note
          </Button>
        }
      />

      {ready && notes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <StickyNote className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold">No notes yet for {scopeLabel}</p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
            Jot down reminders, follow-ups, or anything personal. They stay private to your account and to this store.
          </p>
          <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => addNote({ color: COLORS[0].token })}>
            <Plus className="h-4 w-4" /> Add your first note
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className={`group relative flex min-h-[190px] flex-col rounded-2xl border p-4 shadow-card ${colorClass(note.color)}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== note.title && onChange({ title })}
          placeholder="Title"
          className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onTogglePin}
            title={note.pinnedAt ? "Unpin" : "Pin to top"}
            className="rounded-lg p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground"
          >
            {note.pinnedAt ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="rounded-lg p-1 text-muted-foreground hover:bg-rose-100 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => body !== note.body && onChange({ body })}
        placeholder="Write a note…"
        className="flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />

      <div className="mt-3 flex items-center gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c.token}
            type="button"
            title={c.label}
            onClick={() => onChange({ color: c.token })}
            className={`h-4 w-4 rounded-full border ${c.className} ${note.color === c.token ? "ring-2 ring-offset-1 ring-foreground/30" : ""}`}
          />
        ))}
        {note.pinnedAt && <Pin className="ml-auto h-3 w-3 text-muted-foreground" />}
      </div>
    </motion.div>
  );
}
