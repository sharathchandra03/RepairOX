"use client";
/**
 * Ticket photos — capture / upload in the ticket wizard, shown on View Ticket.
 *
 * Rules (mirrored by migration 0130 in the DB + storage bucket):
 *   • at most TICKET_PHOTO_MAX (3) photos per ticket
 *   • each stored file ≤ TICKET_PHOTO_MAX_BYTES (1,000,000 bytes)
 *   • images only (JPEG / PNG / WebP in; stored as JPEG)
 *
 * Storage:
 *   Supabase → private bucket `ticket-photos` at <org>/<ticketId>/<uuid>.jpg,
 *              metadata in `ticket_photos`, read via signed URLs.
 *   Local / demo → data URLs in localStorage (`repairox-ticket-photos`).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";

export const TICKET_PHOTO_MAX = 3;
export const TICKET_PHOTO_MAX_BYTES = 1_000_000;
export const TICKET_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const BUCKET = "ticket-photos";
const LS_KEY = "repairox-ticket-photos";
const MAX_EDGE = 1920;

export type PhotoSource = "camera" | "upload";

/** A photo picked in the wizard but not uploaded yet (the ticket may not exist). */
export type PendingPhoto = {
  id: string;
  blob: Blob;
  previewUrl: string;
  name: string;
  size: number;
  width: number;
  height: number;
  source: PhotoSource;
  /** Untouched original + current framing, so "Adjust" can be reopened. */
  original: Blob;
  originalName: string;
  crop?: PhotoCrop;
};

/** A stored photo, ready to display. */
export type TicketPhoto = {
  id: string;
  ticketId: string;
  url: string;
  path: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
  source: PhotoSource;
  uploadedByName?: string;
  createdAt: string;
};

// Demo mode keeps everything in the browser (demo tickets never reach the DB).
let forceLocal = false;
/** Called by the photo UIs with `usePermissions().isDemoMode`. */
export function setTicketPhotoLocalMode(local: boolean) { forceLocal = local; }
const useDb = () => isSupabaseConfigured && !!supabase && !forceLocal;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function formatPhotoSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}

/* ─── Compression ──────────────────────────────────────────────────────── */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable_image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/** The part of the original image to keep (set in the Adjust dialog).
 *  zoom ≥ 1 over a "cover" fit; cx/cy = centre of the view as 0..1 of the image. */
export type PhotoCrop = { zoom: number; cx: number; cy: number };

/** Output frame used by the Adjust dialog (matches the 4:3 photo tiles). */
export const PHOTO_FRAME_ASPECT = 4 / 3;

/** Source rectangle (image px) for a crop on an image of iw × ih. */
export function cropRect(iw: number, ih: number, crop: PhotoCrop, aspect = PHOTO_FRAME_ASPECT) {
  // Frame of width `aspect`, height 1 → cover scale, then zoom.
  const s = Math.max(aspect / iw, 1 / ih) * Math.max(1, crop.zoom);
  const sw = aspect / s, sh = 1 / s;
  const sx = Math.min(Math.max(crop.cx * iw - sw / 2, 0), iw - sw);
  const sy = Math.min(Math.max(crop.cy * ih - sh / 2, 0), ih - sh);
  return { sx, sy, sw, sh };
}

/**
 * Turn any picked/captured image into a JPEG under 1 MB.
 * Large photos are resized (longest edge 1920px) and re-encoded at decreasing
 * quality until they fit. With `crop`, only the framed area is kept (4:3).
 * The original is kept on the pending photo so it can be re-adjusted before
 * saving. Throws a readable Error if the file isn't an image or can't fit.
 */
export async function preparePhoto(
  input: Blob,
  name: string,
  source: PhotoSource,
  crop?: PhotoCrop,
): Promise<PendingPhoto> {
  if (!/^image\/(jpeg|png|webp)$/i.test(input.type)) {
    throw new Error(`"${name}" isn't a JPG, PNG or WebP image.`);
  }
  const srcUrl = URL.createObjectURL(input);
  try {
    const img = await loadImage(srcUrl);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const r = crop ? cropRect(iw, ih, crop) : { sx: 0, sy: 0, sw: iw, sh: ih };
    let scale = Math.min(1, MAX_EDGE / Math.max(r.sw, r.sh));
    for (let attempt = 0; attempt < 4; attempt++) {
      const cw = Math.max(1, Math.round(r.sw * scale)), ch = Math.max(1, Math.round(r.sh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser can't process images.");
      ctx.fillStyle = "#fff"; // flatten PNG transparency
      ctx.fillRect(0, 0, cw, ch);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, cw, ch);
      for (const q of [0.85, 0.75, 0.65, 0.55]) {
        const blob = await canvasToBlob(canvas, q);
        if (blob && blob.size <= TICKET_PHOTO_MAX_BYTES) {
          return {
            id: uid(), blob, previewUrl: URL.createObjectURL(blob),
            name: name.replace(/\.[^.]+$/, "") + ".jpg", size: blob.size,
            width: cw, height: ch, source,
            original: input, originalName: name, crop,
          };
        }
      }
      scale *= 0.75;
    }
    throw new Error(`"${name}" is too large to fit under 1 MB.`);
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

export function releasePending(p: PendingPhoto) {
  try { URL.revokeObjectURL(p.previewUrl); } catch { /* noop */ }
}

/* ─── Local (demo / no-DB) storage ─────────────────────────────────────── */

type LocalRow = Omit<TicketPhoto, "url"> & { dataUrl: string };

function readLocal(): LocalRow[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") as LocalRow[]; } catch { return []; }
}
function writeLocal(rows: LocalRow[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); }
  catch { throw new Error("Browser storage is full — remove some photos and try again."); }
}
function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/* ─── Public API ────────────────────────────────────────────────────────── */

async function getOrgId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: s } = await supabase.auth.getSession();
  const uidv = s.session?.user?.id;
  if (!uidv) return null;
  const { data } = await supabase.from("staff").select("organization_id").eq("auth_user_id", uidv).maybeSingle();
  return (data?.organization_id as string) ?? null;
}

export async function listTicketPhotos(ticketId: string): Promise<TicketPhoto[]> {
  if (!ticketId) return [];
  if (!useDb()) {
    return readLocal()
      .filter((r) => r.ticketId === ticketId)
      .map(({ dataUrl, ...r }) => ({ ...r, url: dataUrl }));
  }
  const { data, error } = await supabase!
    .from("ticket_photos")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const paths = data.map((r: any) => r.storage_path as string);
  const signed = paths.length
    ? (await supabase!.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? []
    : [];
  const urlByPath = new Map(signed.map((s: any) => [s.path, s.signedUrl]));
  return data.map((r: any) => ({
    id: r.id, ticketId: r.ticket_id, path: r.storage_path, url: urlByPath.get(r.storage_path) ?? "",
    name: r.file_name ?? "photo.jpg", size: r.size_bytes, width: r.width ?? undefined, height: r.height ?? undefined,
    source: (r.source as PhotoSource) ?? "upload", uploadedByName: r.uploaded_by_name ?? undefined, createdAt: r.created_at,
  }));
}

/**
 * Upload pending photos for a saved ticket. Respects the 3-photo limit against
 * what's already stored. Returns how many were saved and any error message.
 */
export async function uploadTicketPhotos(
  ticketId: string,
  pending: PendingPhoto[],
  uploaderName?: string,
): Promise<{ saved: number; error?: string }> {
  if (!ticketId || pending.length === 0) return { saved: 0 };
  const existing = await listTicketPhotos(ticketId);
  const room = Math.max(0, TICKET_PHOTO_MAX - existing.length);
  const batch = pending.slice(0, room);
  const skipped = pending.length - batch.length;
  let saved = 0;

  if (!useDb()) {
    const rows = readLocal();
    for (const [i, p] of batch.entries()) {
      rows.push({
        id: uid(), ticketId, path: `local/${ticketId}/${p.id}.jpg`, name: p.name, size: p.size,
        width: p.width, height: p.height, source: p.source, uploadedByName: uploaderName,
        createdAt: new Date().toISOString(), dataUrl: await blobToDataUrl(p.blob),
      });
      void i;
      saved++;
    }
    try { writeLocal(rows); } catch (e: any) { return { saved: 0, error: e.message }; }
    return { saved, error: skipped ? `Only ${TICKET_PHOTO_MAX} photos are allowed per ticket.` : undefined };
  }

  const orgId = await getOrgId();
  if (!orgId) return { saved: 0, error: "You're signed out — photos weren't saved." };
  let firstError: string | undefined;
  for (const [i, p] of batch.entries()) {
    const path = `${orgId}/${ticketId}/${p.id}.jpg`;
    const up = await supabase!.storage.from(BUCKET).upload(path, p.blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) { firstError ??= up.error.message; continue; }
    const { error } = await supabase!.from("ticket_photos").insert({
      ticket_id: ticketId, storage_path: path, file_name: p.name, mime_type: "image/jpeg",
      size_bytes: p.size, width: p.width, height: p.height, source: p.source,
      sort_order: existing.length + i,
    });
    if (error) {
      // Don't leave an orphan file behind.
      await supabase!.storage.from(BUCKET).remove([path]);
      firstError ??= /ticket_photo_limit/.test(error.message)
        ? `Only ${TICKET_PHOTO_MAX} photos are allowed per ticket.`
        : error.code === "42P01" ? "Photo storage isn't set up yet (apply migration 0130)." : error.message;
      continue;
    }
    saved++;
  }
  if (!firstError && skipped) firstError = `Only ${TICKET_PHOTO_MAX} photos are allowed per ticket.`;
  return { saved, error: firstError };
}

export async function deleteTicketPhoto(photo: TicketPhoto): Promise<string | undefined> {
  if (!useDb()) {
    writeLocal(readLocal().filter((r) => r.id !== photo.id));
    return undefined;
  }
  const { error } = await supabase!.from("ticket_photos").delete().eq("id", photo.id);
  if (error) return error.message;
  await supabase!.storage.from(BUCKET).remove([photo.path]);
  return undefined;
}

/** Load (and reload) a ticket's photos. */
export function useTicketPhotos(ticketId: string | undefined | null) {
  const [photos, setPhotos] = useState<TicketPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!ticketId) { setPhotos([]); return; }
    setLoading(true);
    try { setPhotos(await listTicketPhotos(ticketId)); } finally { setLoading(false); }
  }, [ticketId]);
  useEffect(() => { reload(); }, [reload]);
  return { photos, loading, reload };
}
