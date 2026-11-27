"use client";
/**
 * Adjust a ticket photo before saving: drag to reposition, zoom with the slider
 * (or mouse wheel / trackpad), and see exactly what will be kept inside the 4:3
 * frame — the same frame the photo tiles use. "Use full photo" keeps the whole
 * image uncropped.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Crop, Move, RotateCcw, ZoomIn, ZoomOut, Maximize2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { PHOTO_FRAME_ASPECT, type PendingPhoto, type PhotoCrop } from "@/lib/ticket-photos";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DEFAULT_CROP: PhotoCrop = { zoom: 1, cx: 0.5, cy: 0.5 };

export function PhotoAdjustDialog({
  photo,
  onClose,
  onApply,
}: {
  photo: PendingPhoto | null;
  onClose: () => void;
  /** `undefined` = keep the full photo (no crop). */
  onApply: (crop: PhotoCrop | undefined) => Promise<void> | void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(0);
  const [src, setSrc] = useState<string>("");
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<PhotoCrop>(DEFAULT_CROP);
  const [applying, setApplying] = useState(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  // Load the ORIGINAL (not the already-cropped preview) whenever a photo opens.
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo.original);
    setSrc(url);
    setNat(null);
    setCrop(photo.crop ?? DEFAULT_CROP);
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, [photo, nat]);

  const frameH = frameW / PHOTO_FRAME_ASPECT;

  // Geometry: cover-fit × zoom, positioned so (cx, cy) sits in the frame centre.
  const geo = (() => {
    if (!nat || !frameW) return null;
    const s = Math.max(frameW / nat.w, frameH / nat.h) * crop.zoom;
    const dw = nat.w * s, dh = nat.h * s;
    const left = Math.min(0, Math.max(frameW - dw, frameW / 2 - crop.cx * dw));
    const top = Math.min(0, Math.max(frameH - dh, frameH / 2 - crop.cy * dh));
    return { s, dw, dh, left, top };
  })();

  // Keep the centre inside the reachable range after zoom changes.
  const clamp = (c: PhotoCrop): PhotoCrop => {
    if (!nat || !frameW) return c;
    const s = Math.max(frameW / nat.w, frameH / nat.h) * c.zoom;
    const hx = frameW / 2 / (nat.w * s), hy = frameH / 2 / (nat.h * s);
    return {
      zoom: c.zoom,
      cx: Math.min(1 - hx, Math.max(hx, c.cx)),
      cy: Math.min(1 - hy, Math.max(hy, c.cy)),
    };
  };

  const setZoom = (z: number) => setCrop((c) => clamp({ ...c, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) }));

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: crop.cx, cy: crop.cy };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !geo) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    setCrop((c) => clamp({ ...c, cx: drag.current!.cx - dx / geo.dw, cy: drag.current!.cy - dy / geo.dh }));
  };
  const onPointerUp = () => { drag.current = null; };

  // Wheel / trackpad zoom (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCrop((c) => clamp({ ...c, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat, frameW]);

  const apply = async (c: PhotoCrop | undefined) => {
    setApplying(true);
    try { await onApply(c); } finally { setApplying(false); }
  };

  return (
    <RoxCenteredForm
      open={!!photo}
      onClose={onClose}
      title="Adjust Photo"
      subtitle="Drag to reposition · scroll or use the slider to zoom"
      icon={Crop}
      width="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => apply(undefined)} disabled={applying}>
            <Maximize2 className="h-3.5 w-3.5" /> Use full photo
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={applying}>Cancel</Button>
            <Button size="sm" onClick={() => apply(crop)} disabled={applying || !nat}>
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crop className="h-3.5 w-3.5" />} Apply
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative w-full touch-none select-none overflow-hidden rounded-xl bg-zinc-900 cursor-grab active:cursor-grabbing"
          style={{ aspectRatio: `${PHOTO_FRAME_ASPECT}` }}
        >
          {geo && src ? (
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: geo.dw, height: geo.dh, left: geo.left, top: geo.top }}
            />
          ) : (
            <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-white/70" /></div>
          )}
          {/* Rule-of-thirds guide */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border border-white/15" />)}
          </div>
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
            <Move className="h-3 w-3" /> Drag to move
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setZoom(crop.zoom / 1.2)} aria-label="Zoom out"
            className="grid h-8 w-8 place-items-center rounded-lg border border-input text-muted-foreground hover:border-[#4361EE]/40 hover:text-[#4361EE]">
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 flex-1 cursor-pointer accent-[#4361EE]"
          />
          <button type="button" onClick={() => setZoom(crop.zoom * 1.2)} aria-label="Zoom in"
            className="grid h-8 w-8 place-items-center rounded-lg border border-input text-muted-foreground hover:border-[#4361EE]/40 hover:text-[#4361EE]">
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="w-12 text-right text-[12px] font-semibold tabular-nums text-muted-foreground">{crop.zoom.toFixed(1)}×</span>
          <button type="button" onClick={() => setCrop(DEFAULT_CROP)} aria-label="Reset"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-[12px] font-medium text-muted-foreground hover:border-[#4361EE]/40 hover:text-[#4361EE]">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>
    </RoxCenteredForm>
  );
}
