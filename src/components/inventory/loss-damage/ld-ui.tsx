"use client";

/* Small shared pieces for the Loss & Damage module. */

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { ToneChip } from "@/components/inventory/doc-ui";
import { compressImage } from "@/components/ninja/capture";
import { DOC_META } from "@/lib/inventory-ops";
import { KIND_LABEL, type IncidentKind } from "@/lib/loss-damage";
import { cn, formatINR } from "@/lib/utils";

/** Loss = rose, Damage = amber (table pill standard: rounded-full, ring-inset, glyph + label). */
export function KindPill({ kind }: { kind: IncidentKind }) {
  const loss = kind === "loss";
  return (
    <span className={cn("inline-flex h-7 min-w-[78px] items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset",
      loss ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", loss ? "bg-rose-500" : "bg-amber-500")} />{KIND_LABEL[kind]}
    </span>
  );
}

export const statusLabel = (s: string) => DOC_META.write_off.statuses[s]?.label ?? s;

/** Workflow status chip. */
export function IncidentStatus({ status }: { status: string }) {
  const s = DOC_META.write_off.statuses[status];
  return <ToneChip tone={s?.tone ?? "neutral"} label={s?.label ?? status} />;
}

/** ₹ amount, or an en dash when cost isn't known / the viewer can't see cost. */
export const money = (v: number, show = true) => (!show ? "—" : v > 0 ? formatINR(v) : "—");

/** Up to `max` evidence photos, compressed client-side (small data-URL thumbnails). */
export function EvidencePicker({ photos, onChange, max = 3, disabled }: { photos: string[]; onChange: (p: string[]) => void; max?: number; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const out: string[] = [];
      for (const f of Array.from(files).slice(0, max - photos.length)) {
        if (!/^image\//.test(f.type) || f.size > 15 * 1024 * 1024) continue;
        out.push(await compressImage(f, 720, 0.62));
      }
      onChange([...photos, ...out]);
    } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {photos.map((p, i) => (
        <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-input">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
          {!disabled && (
            <button type="button" aria-label="Remove photo" onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {photos.length < max && !disabled && (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input text-[10.5px] font-medium text-muted-foreground transition hover:border-[#4361EE] hover:text-[#4361EE] disabled:opacity-60">
          <Camera className="h-4 w-4" />{busy ? "…" : "Add"}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => void pick(e.target.files)} />
      {photos.length === 0 && disabled && <span className="text-[12.5px] text-muted-foreground">No photos attached.</span>}
    </div>
  );
}
