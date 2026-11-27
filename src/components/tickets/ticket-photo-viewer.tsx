"use client";
/**
 * View Ticket → "Device Photos" section body.
 *
 * One large photo at a time (no crowded grid): ‹ › arrows + counter, a small
 * thumbnail strip to jump between photos, and a full-screen viewer on click
 * (arrow keys / Esc). Authorised users can add photos (up to 3) or remove one.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Expand, X, ImagePlus, Trash2, ImageOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal, Z } from "@/components/ui/modal-portal";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { TicketPhotoUploader } from "@/components/tickets/ticket-photo-uploader";
import {
  TICKET_PHOTO_MAX, formatPhotoSize, uploadTicketPhotos, deleteTicketPhoto, releasePending,
  setTicketPhotoLocalMode, useTicketPhotos, type PendingPhoto, type TicketPhoto,
} from "@/lib/ticket-photos";

export function TicketPhotoViewer({
  ticketId,
  canAdd,
  canDelete,
  onCountChange,
}: {
  ticketId: string;
  canAdd: boolean;
  canDelete: boolean;
  onCountChange?: (n: number) => void;
}) {
  const { isDemoMode, currentUser } = usePermissions();
  useEffect(() => { setTicketPhotoLocalMode(isDemoMode); }, [isDemoMode]);
  const { photos, loading, reload } = useTicketPhotos(ticketId);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TicketPhoto | null>(null);

  useEffect(() => { onCountChange?.(photos.length); }, [photos.length, onCountChange]);
  useEffect(() => { if (index > photos.length - 1) setIndex(Math.max(0, photos.length - 1)); }, [photos.length, index]);

  const count = photos.length;
  const cur = photos[index];
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft" && count > 1) prev();
      if (e.key === "ArrowRight" && count > 1) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, count, prev, next]);

  const closeAdd = () => { pending.forEach(releasePending); setPending([]); setAdding(false); };
  const saveAdd = async () => {
    if (pending.length === 0 || saving) return;
    setSaving(true);
    const { saved, error } = await uploadTicketPhotos(ticketId, pending, currentUser?.name);
    setSaving(false);
    if (error) toast.error(saved ? `${saved} photo(s) saved, some failed` : "Photos not saved", { description: error });
    else toast.success(`${saved} photo${saved === 1 ? "" : "s"} added`);
    pending.forEach(releasePending);
    setPending([]);
    setAdding(false);
    await reload();
    setIndex(Math.max(0, count + saved - 1));
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const err = await deleteTicketPhoto(confirmDelete);
    setConfirmDelete(null);
    if (err) { toast.error("Photo not removed", { description: err }); return; }
    toast.success("Photo removed");
    reload();
  };

  const room = TICKET_PHOTO_MAX - count;

  if (loading && count === 0) {
    return <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-[#4361EE]" /></div>;
  }

  return (
    <div>
      {count === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center">
          <ImageOff className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No device photos</p>
          <p className="text-[12px] text-muted-foreground">Up to {TICKET_PHOTO_MAX} photos, max 1 MB each.</p>
          {canAdd && (
            <Button size="sm" className="mt-1" onClick={() => setAdding(true)}><ImagePlus className="h-3.5 w-3.5" /> Add Photos</Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_132px]">
          {/* Main viewer */}
          <div className="relative overflow-hidden rounded-xl border border-border bg-zinc-950">
            <div className="relative aspect-[16/10]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.button
                  key={cur?.id}
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setLightbox(true)}
                  className="absolute inset-0 cursor-zoom-in"
                  aria-label="Open full screen"
                >
                  {cur?.url ? (
                    <img src={cur.url} alt={cur.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="grid h-full place-items-center text-white/60"><ImageOff className="h-7 w-7" /></div>
                  )}
                </motion.button>
              </AnimatePresence>
              {count > 1 && (
                <>
                  <ArrowBtn side="left" onClick={prev} />
                  <ArrowBtn side="right" onClick={next} />
                </>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white">
                {index + 1} / {count}
              </span>
              <button type="button" onClick={() => setLightbox(true)} aria-label="Full screen"
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/75">
                <Expand className="h-3.5 w-3.5" />
              </button>
            </div>
            {cur && (
              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-zinc-900 px-3 py-2">
                <p className="min-w-0 truncate text-[11px] text-white/75" title={cur.name}>
                  {cur.source === "camera" ? "Captured" : "Uploaded"}
                  {cur.uploadedByName ? ` by ${cur.uploadedByName}` : ""} · {new Date(cur.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {formatPhotoSize(cur.size)}
                </p>
                {canDelete && (
                  <button type="button" onClick={() => setConfirmDelete(cur)} aria-label="Remove photo"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-white/10">
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Thumbnails (vertical on desktop, a row on mobile) + add slot */}
          <div className="flex gap-2 sm:flex-col">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "relative aspect-[4/3] w-1/3 overflow-hidden rounded-lg border-2 bg-zinc-100 transition sm:w-full",
                  i === index ? "border-[#4361EE] ring-2 ring-[#4361EE]/20" : "border-transparent opacity-70 hover:opacity-100"
                )}
              >
                {p.url ? <img src={p.url} alt="" className="h-full w-full object-cover" /> : <ImageOff className="m-auto h-4 w-4 text-muted-foreground" />}
              </button>
            ))}
            {canAdd && room > 0 && (
              <button type="button" onClick={() => setAdding(true)}
                className="grid aspect-[4/3] w-1/3 place-items-center rounded-lg border border-dashed border-border text-[11px] text-muted-foreground transition hover:border-[#4361EE]/50 hover:text-[#4361EE] sm:w-full">
                <span className="flex flex-col items-center gap-1"><ImagePlus className="h-4 w-4" /> Add</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Full-screen viewer */}
      <ModalPortal>
        <AnimatePresence>
          {lightbox && cur && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`fixed inset-0 ${Z.high} flex items-center justify-center bg-black/90 p-6`} onClick={() => setLightbox(false)}
              role="dialog" aria-modal="true" aria-label="Device photo">
              <img src={cur.url} alt={cur.name} onClick={(e) => e.stopPropagation()} className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl" />
              <button type="button" onClick={() => setLightbox(false)} aria-label="Close"
                className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
              <span className="absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold tabular-nums text-white">{index + 1} / {count}</span>
              {count > 1 && (
                <>
                  <ArrowBtn side="left" big onClick={(e) => { e?.stopPropagation(); prev(); }} />
                  <ArrowBtn side="right" big onClick={(e) => { e?.stopPropagation(); next(); }} />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ModalPortal>

      <RoxCenteredForm
        open={adding}
        onClose={closeAdd}
        title="Add Device Photos"
        subtitle={`${count} of ${TICKET_PHOTO_MAX} used · max 1 MB each`}
        icon={ImagePlus}
        width="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeAdd}>Cancel</Button>
            <Button size="sm" onClick={saveAdd} disabled={pending.length === 0 || saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Save Photos
            </Button>
          </div>
        }
      >
        <TicketPhotoUploader pending={pending} onPendingChange={setPending} existing={photos} />
      </RoxCenteredForm>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Remove this photo?"
        description="The photo is deleted from the ticket. This can't be undone."
        confirmLabel="Remove Photo"
      />
    </div>
  );
}

function ArrowBtn({ side, onClick, big }: { side: "left" | "right"; onClick: (e?: React.MouseEvent) => void; big?: boolean }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full border border-black bg-[linear-gradient(180deg,#4361EE_0%,#3B54E8_100%)] text-white shadow-[0_8px_24px_-10px_rgba(67,97,238,0.55)] transition hover:brightness-110",
        big ? "h-12 w-12" : "h-9 w-9",
        side === "left" ? (big ? "left-6" : "left-3") : (big ? "right-6" : "right-3")
      )}
    >
      <Icon className={big ? "h-6 w-6" : "h-4 w-4"} />
    </button>
  );
}
