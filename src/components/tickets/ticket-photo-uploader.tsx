"use client";
/**
 * Ticket wizard → Upload step body.
 *
 * Two sources (built for laptops first):
 *   • Take Photo        — opens the webcam in a centred dialog (getUserMedia);
 *                          falls back to the device camera picker on phones.
 *   • Choose Photos     — drag & drop or browse JPG / PNG / WebP files.
 * Each new photo can be framed (drag + zoom) in the Adjust dialog.
 * Every photo is compressed to a JPEG under 1 MB before it's accepted, and the
 * ticket holds at most 3. Nothing is uploaded here: the wizard uploads the
 * pending photos right after the ticket is saved (lib/ticket-photos.ts).
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ImagePlus, X, Loader2, Trash2, ImageOff, RefreshCw, Crop } from "lucide-react";
import { PhotoAdjustDialog } from "@/components/tickets/photo-adjust-dialog";
import { Button } from "@/components/ui/button";
import { ModalPortal, Z } from "@/components/ui/modal-portal";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  TICKET_PHOTO_MAX, TICKET_PHOTO_ACCEPT, preparePhoto, releasePending, formatPhotoSize,
  type PendingPhoto, type TicketPhoto,
} from "@/lib/ticket-photos";

export function TicketPhotoUploader({
  pending,
  onPendingChange,
  existing = [],
  removedIds = [],
  onRemoveExisting,
}: {
  pending: PendingPhoto[];
  onPendingChange: (next: PendingPhoto[]) => void;
  /** Already-saved photos (edit mode). */
  existing?: TicketPhoto[];
  /** Saved photos the user marked for removal (applied on save). */
  removedIds?: string[];
  onRemoveExisting?: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mobileCamRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const adjusting = pending.find((p) => p.id === adjustId) ?? null;

  const keptExisting = existing.filter((p) => !removedIds.includes(p.id));
  const used = keptExisting.length + pending.length;
  const room = Math.max(0, TICKET_PHOTO_MAX - used);
  const full = room === 0;

  const addBlobs = async (items: { blob: Blob; name: string; source: "camera" | "upload" }[]) => {
    if (items.length === 0) return;
    if (full) { toast.error(`Only ${TICKET_PHOTO_MAX} photos per ticket`, { description: "Remove one to add another." }); return; }
    const take = items.slice(0, room);
    if (items.length > take.length) {
      toast.info(`Only ${TICKET_PHOTO_MAX} photos per ticket`, { description: `Added the first ${take.length}.` });
    }
    setBusy(true);
    const next = [...pending];
    for (const it of take) {
      try { next.push(await preparePhoto(it.blob, it.name, it.source)); }
      catch (e: any) { toast.error("Photo not added", { description: e?.message ?? "Couldn't read that image." }); }
    }
    setBusy(false);
    onPendingChange(next);
    // A single new photo opens straight into Adjust so the user can frame it.
    const added = next.slice(pending.length);
    if (added.length === 1) setAdjustId(added[0].id);
  };

  const applyAdjust = async (crop: PendingPhoto["crop"]) => {
    if (!adjusting) return;
    try {
      const redone = await preparePhoto(adjusting.original, adjusting.originalName, adjusting.source, crop);
      releasePending(adjusting);
      onPendingChange(pending.map((p) => (p.id === adjusting.id ? { ...redone, id: adjusting.id } : p)));
      setAdjustId(null);
    } catch (e: any) {
      toast.error("Couldn't adjust photo", { description: e?.message });
    }
  };

  const onFiles = (files: FileList | null, source: "camera" | "upload") => {
    if (!files) return;
    addBlobs(Array.from(files).map((f) => ({ blob: f, name: f.name, source })));
  };

  const openCamera = () => {
    if (full) { toast.error(`Only ${TICKET_PHOTO_MAX} photos per ticket`, { description: "Remove one to add another." }); return; }
    if (typeof navigator !== "undefined" && !!navigator.mediaDevices && "getUserMedia" in navigator.mediaDevices) setCameraOpen(true);
    else mobileCamRef.current?.click();
  };

  const removePending = (id: string) => {
    const p = pending.find((x) => x.id === id);
    if (p) releasePending(p);
    onPendingChange(pending.filter((x) => x.id !== id));
  };

  const cardBase = "group relative flex items-center gap-4 rounded-2xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-55";
  const iconBase = "grid h-14 w-14 place-items-center rounded-2xl border border-border bg-white text-brand-700 shadow-card transition group-hover:scale-105";

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={openCamera}
          disabled={busy || full}
          className={cn(cardBase, "border-border bg-gradient-to-b from-indigo-50/40 to-white hover:border-indigo-200")}
        >
          <span className={iconBase}><Camera className="h-6 w-6" /></span>
          <div className="flex-1">
            <p className="font-display text-lg font-bold">Take Photo</p>
            <p className="text-sm text-muted-foreground">Use the webcam to capture the device</p>
          </div>
        </motion.button>

        {/* Drop zone — drag photos onto it or click to browse. */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => fileRef.current?.click()}
          disabled={busy || full}
          onDragOver={(e) => { e.preventDefault(); if (!full) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files, "upload"); }}
          className={cn(
            cardBase,
            "border-dashed [&>*]:pointer-events-none",
            dragOver
              ? "border-[#4361EE] bg-[#EEF1FD] ring-4 ring-[#4361EE]/10"
              : "border-[#4361EE]/35 bg-gradient-to-b from-indigo-50/40 to-white hover:border-[#4361EE]/60"
          )}
        >
          <span className={cn(iconBase, dragOver && "scale-105 text-[#4361EE]")}><ImagePlus className="h-6 w-6" /></span>
          <div className="flex-1">
            <p className="font-display text-lg font-bold">{dragOver ? "Drop to add" : "Choose Photos"}</p>
            <p className="text-sm text-muted-foreground">
              Drag &amp; drop here or <span className="font-semibold text-[#4361EE]">browse</span> · JPG, PNG, WebP
            </p>
          </div>
        </motion.button>
      </div>
      <input ref={fileRef} type="file" accept={TICKET_PHOTO_ACCEPT} multiple className="hidden"
        onChange={(e) => { onFiles(e.target.files, "upload"); e.target.value = ""; }} />
      <input ref={mobileCamRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { onFiles(e.target.files, "camera"); e.target.value = ""; }} />

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Device photos</p>
          <p className={cn("text-[11px] font-semibold tabular-nums", full ? "text-[#4361EE]" : "text-muted-foreground")}>
            {used} / {TICKET_PHOTO_MAX} · max 1 MB each
          </p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {keptExisting.map((p) => (
            <PhotoTile key={p.id} url={p.url} name={p.name} size={p.size} badge="Saved"
              onRemove={onRemoveExisting ? () => onRemoveExisting(p.id) : undefined} />
          ))}
          {pending.map((p) => (
            <PhotoTile key={p.id} url={p.previewUrl} name={p.name} size={p.size} badge="New"
              onRemove={() => removePending(p.id)} onAdjust={() => setAdjustId(p.id)} />
          ))}
          {Array.from({ length: room }).map((_, i) => (
            <button
              key={`slot-${i}`}
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-border bg-white/60 text-[12px] text-muted-foreground transition hover:border-[#4361EE]/50 hover:text-[#4361EE]"
            >
              {busy && i === 0 ? <Loader2 className="h-5 w-5 animate-spin text-[#4361EE]" /> : <span>Empty slot</span>}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Use <span className="font-medium text-foreground">Adjust</span> on a photo to drag and zoom what it shows. Large photos are resized to stay under 1 MB; they're saved with the ticket.
        </p>
      </div>

      <PhotoAdjustDialog photo={adjusting} onClose={() => setAdjustId(null)} onApply={applyAdjust} />
      <WebcamDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(blob) => { setCameraOpen(false); addBlobs([{ blob, name: `camera-${Date.now()}.jpg`, source: "camera" }]); }}
      />
    </div>
  );
}

function PhotoTile({ url, name, size, badge, onRemove, onAdjust }: { url: string; name: string; size: number; badge: string; onRemove?: () => void; onAdjust?: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-zinc-100 shadow-card">
      {url && !broken ? (
        <img src={url} alt={name} onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-muted-foreground"><ImageOff className="h-6 w-6" /></div>
      )}
      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-[#4361EE] shadow-sm">{badge}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-rose-600 shadow-sm transition hover:bg-rose-50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-5">
        <p className="min-w-0 truncate text-[10px] text-white/90" title={name}>{name} · {formatPhotoSize(size)}</p>
        {onAdjust && (
          <button type="button" onClick={onAdjust} aria-label={`Adjust ${name}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-[#4361EE] shadow-sm transition hover:bg-white">
            <Crop className="h-3 w-3" /> Adjust
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** Centred webcam capture dialog (laptops). */
function WebcamDialog({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (b: Blob) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = async () => {
    setError(""); setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setReady(true);
    } catch (e: any) {
      setError(e?.name === "NotAllowedError" ? "Camera permission was blocked. Allow camera access in the browser and try again." : "No camera found on this computer.");
    }
  };

  useEffect(() => {
    if (!open) { stop(); setShot(null); return; }
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) setShot({ blob: b, url: URL.createObjectURL(b) }); }, "image/jpeg", 0.9);
  };

  const retake = () => { if (shot) URL.revokeObjectURL(shot.url); setShot(null); };

  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 ${Z.overlay} grid place-items-center bg-foreground/50 p-4 backdrop-blur-[2px]`} onClick={onClose}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Take photo"
              className="w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <p className="text-sm font-bold">Take Photo</p>
                <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative aspect-video bg-black">
                {error ? (
                  <div className="grid h-full place-items-center p-6 text-center text-sm text-white/80">{error}</div>
                ) : (
                  <>
                    {/* The video stays mounted so "Retake" resumes the live stream. */}
                    <video ref={videoRef} playsInline muted className={cn("h-full w-full object-contain", shot && "invisible")} />
                    {shot && <img src={shot.url} alt="Captured" className="absolute inset-0 h-full w-full object-contain" />}
                    {!ready && !shot && <div className="absolute inset-0 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-white/80" /></div>}
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 px-5 py-3">
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                {shot ? (
                  <>
                    <Button variant="outline" size="sm" onClick={retake}><RefreshCw className="h-3.5 w-3.5" /> Retake</Button>
                    <Button size="sm" onClick={() => { onCapture(shot.blob); URL.revokeObjectURL(shot.url); setShot(null); }}>Use Photo</Button>
                  </>
                ) : (
                  <Button size="sm" onClick={capture} disabled={!ready || !!error}><Camera className="h-3.5 w-3.5" /> Capture</Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
