"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Eraser, ImagePlus, X } from "lucide-react";

/** Resize a photo client-side (max 1280px, JPEG q=.72) so proofs stay small + offline-queueable. */
export async function compressImage(file: File, max = 1280, q = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

export function PhotoCapture({ photos, onChange, max = 6, label = "Add photo" }: { photos: string[]; onChange: (p: string[]) => void; max?: number; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const out: string[] = [];
      for (const f of Array.from(files).slice(0, max - photos.length)) {
        if (!/^image\//.test(f.type) || f.size > 15 * 1024 * 1024) continue;
        out.push(await compressImage(f));
      }
      onChange([...photos, ...out]);
    } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Proof ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-slate-900/70 text-white"><X className="h-4 w-4" /></button>
          </div>
        ))}
        {photos.length < max ? (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#4361EE]/40 bg-[#EEF1FD]/60 text-[11px] font-bold text-[#3450D8]">
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Camera className="h-6 w-6" />}
            {label}
          </button>
        ) : null}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => void pick(e.target.files)} />
      <button type="button" onClick={() => { if (ref.current) { ref.current.removeAttribute("capture"); ref.current.click(); ref.current.setAttribute("capture", "environment"); } }}
        className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500"><ImagePlus className="h-4 w-4" />Choose from gallery</button>
    </div>
  );
}

export function SignaturePad({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f172a";
  }, []);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); (e.target as Element).setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e), ctx = ref.current!.getContext("2d")!;
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    // Flatten on white so the stored PNG is readable in the receipt.
    const c = ref.current!, out = document.createElement("canvas");
    out.width = c.width; out.height = c.height;
    const o = out.getContext("2d")!; o.fillStyle = "#fff"; o.fillRect(0, 0, out.width, out.height); o.drawImage(c, 0, 0);
    onChange(out.toDataURL("image/png"));
  };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(""); };

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
        <canvas ref={ref} className="h-40 w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Customer signature area" />
        {!value ? <span className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] font-semibold text-slate-400">Customer signs here</span> : null}
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500"><Eraser className="h-4 w-4" />Clear signature</button>
    </div>
  );
}
