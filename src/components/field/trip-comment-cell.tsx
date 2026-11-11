"use client";
/* RepairOX — Pickup & Drop COMMENT cell. Same look + behaviour as the Lead
   table's comment box (amber sticky-note surface with an accent stripe, latest
   note previewed, click → a portalled thread popover with a composer), but the
   thread is the trip's append-only notes: the Sales Agent's customer-
   communication note (from Route Lead), trip comments and any cancel reason. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { useField } from "@/lib/field-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import type { FieldJob } from "@/lib/field-data";

type Entry = { id: string; kind: "communication" | "comment" | "note"; text: string; who: string; at?: string };

const fmtTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export function TripCommentCell({ job }: { job: FieldJob }) {
  const { can } = usePermissions();
  const { events, addJobNote } = useField();
  const canCompose = allow(can, CAP.field.updateStatus);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const e of events) {
      if (e.jobId !== job.id || (e.kind !== "communication" && e.kind !== "comment") || !e.note.trim()) continue;
      out.push({ id: e.id, kind: e.kind, text: e.note.trim(), who: e.actorName || "Team", at: e.occurredAt });
    }
    out.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    // The job's own notes (e.g. a cancellation reason) lead the thread.
    if (job.notes?.trim()) out.unshift({ id: `notes:${job.id}`, kind: "note", text: job.notes.trim(), who: job.createdByName || "Team", at: job.createdAt });
    return out;
  }, [events, job.id, job.notes, job.createdByName, job.createdAt]);

  const latest = entries[entries.length - 1];
  const preview = latest?.text ?? "";

  /* Portal positioning — flips above when there isn't room below. */
  useEffect(() => {
    if (!open) return;
    const GAP = 6, MARGIN = 8, WIDTH = 340;
    const place = () => {
      const btn = btnRef.current; if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const popH = popRef.current?.offsetHeight || 380;
      const below = vh - r.bottom - GAP - MARGIN, above = r.top - GAP - MARGIN;
      let top: number, maxHeight: number;
      if (below >= popH || below >= above) { top = r.bottom + GAP; maxHeight = Math.max(220, below); }
      else { maxHeight = Math.max(220, above); top = r.top - GAP - Math.min(popH, maxHeight); }
      top = Math.max(MARGIN, Math.min(top, vh - MARGIN - Math.min(popH, maxHeight)));
      setPos({ top, left: Math.max(MARGIN, Math.min(r.left, vw - WIDTH - MARGIN)), maxHeight });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [open, entries.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try { if (await addJobNote(job.id, text, "comment", "field_app")) setDraft(""); } finally { setBusy(false); }
  };

  // Nothing to show and nothing to add → a centred muted dash (no tinted box).
  if (entries.length === 0 && !canCompose) return <span className="block text-zinc-300">—</span>;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title="View & add comments"
        className="group/cmt relative flex min-h-[48px] w-full items-center gap-2 overflow-hidden rounded-lg border border-amber-300 bg-amber-100/90 py-1.5 pl-3 pr-2.5 text-left shadow-[0_1px_2px_rgba(146,64,14,0.12)] transition hover:border-amber-400 hover:bg-amber-100"
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3.5px] bg-amber-500" />
        <div className="min-w-0 flex-1">
          {preview ? (
            <p className="line-clamp-2 w-full whitespace-pre-line break-words text-[13px] font-medium leading-snug text-amber-950" title={preview}>{preview}</p>
          ) : (
            <p className="text-[12px] italic text-amber-700/80">No comments yet — click to add</p>
          )}
          {entries.length > 1 && <p className="mt-0.5 text-[10.5px] font-semibold text-amber-800">{entries.length} notes · tap to view</p>}
        </div>
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-700" />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={popRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 340, maxHeight: pos.maxHeight }}
              className="z-[9999] flex flex-col overflow-hidden rounded-2xl border border-zinc-300/80 bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-100 text-amber-700"><MessageSquare className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold leading-none">Comments</p>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{job.jobNo} · {job.customer || "Customer"}</p>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-muted/20 p-3">
                {entries.length === 0 ? (
                  <p className="py-6 text-center text-[12px] text-muted-foreground">No comments yet.</p>
                ) : entries.map((e) => (
                  <div key={e.id} className={cn("rounded-xl border px-3 py-2", e.kind === "communication" ? "border-sky-200 bg-sky-50/70" : "border-amber-200 bg-amber-50/70")}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                        e.kind === "communication" ? "bg-sky-100 text-sky-700 ring-sky-200" : "bg-amber-100 text-amber-700 ring-amber-200")}>
                        {e.kind === "communication" ? "Customer communication" : e.kind === "note" ? "Trip note" : "Comment"}
                      </span>
                      {e.at && <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{fmtTime(e.at)}</span>}
                    </div>
                    <p className="whitespace-pre-line break-words text-[12.5px] leading-snug text-foreground/90">{e.text}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Avatar name={e.who} size={16} />
                      <span className="truncate text-[10.5px] font-medium text-muted-foreground">{e.who}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="shrink-0 border-t border-border p-2.5">
                {!canCompose ? (
                  <p className="px-1 py-1.5 text-[11px] text-muted-foreground">You don&apos;t have permission to add trip comments.</p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
                      placeholder={`Add a comment to ${job.jobNo}…`}
                      className="min-h-[38px] flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20"
                    />
                    <button onClick={() => void send()} disabled={!draft.trim() || busy} title="Add comment (Cmd/Ctrl+Enter)"
                      className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg bg-[#4361EE] text-white transition hover:bg-[#3550d8] disabled:opacity-50">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
