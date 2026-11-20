"use client";
/* Odometer prompt for starting / ending the day. One big number field, live "today you rode N km"
   line on the end reading, soft warnings that need a second tap, hard errors that block. */
import { useEffect, useRef, useState } from "react";
import { Camera, Gauge } from "lucide-react";
import { compressImage } from "./capture";
import { checkEndReading, checkStartReading } from "@/lib/field-attendance";
import { Btn, FormLabel, Sheet, inputCls } from "./ui";

export function OdometerSheet({ mode, open, onClose, startReading, lastEnd, fuelRate, photoRequired, onSave, onSkip }: {
  mode: "start" | "end"; open: boolean; onClose: () => void;
  startReading?: number; lastEnd: number | null; fuelRate: number; photoRequired: boolean;
  onSave: (reading: number, photo: Blob | null) => Promise<string | null>;
  /** Lets the Ninja carry on without a reading (e.g. no network); a manager sees it as missing. */
  onSkip?: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [shooting, setShooting] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setText(""); setServerErr(null); setConfirmed(false); setPhoto(null); } }, [open]);
  async function take(f: File | undefined) {
    if (!f || !/^image\//.test(f.type)) return;
    setShooting(true);
    try { const url = await compressImage(f, 1280, 0.7); setPhoto({ url, blob: await (await fetch(url)).blob() }); setServerErr(null); }
    finally { setShooting(false); if (cam.current) cam.current.value = ""; }
  }
  const n = text.trim() === "" ? NaN : Number(text);
  const check = Number.isNaN(n) ? {} : mode === "start" ? checkStartReading(n, lastEnd) : checkEndReading(n, startReading ?? 0);
  const km = mode === "end" && !Number.isNaN(n) && !check.error ? n - (startReading ?? 0) : null;
  const needsConfirm = !!check.warn && !confirmed;
  async function save() {
    if (Number.isNaN(n) || check.error) return;
    if (needsConfirm) { setConfirmed(true); return; }
    setBusy(true); const e = await onSave(n, photo?.blob ?? null); setBusy(false);
    if (e) setServerErr(e); else onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title={mode === "start" ? "Start of day reading" : "End of day reading"}
      footer={<div className="space-y-2">
        <Btn className="w-full" disabled={Number.isNaN(n) || !!check.error || (photoRequired && !photo)} loading={busy} onClick={save}>
          {needsConfirm ? "Confirm anyway" : mode === "start" ? "Save & start shift" : "Save & end shift"}
        </Btn>
        {onSkip ? <button onClick={onSkip} className="w-full py-2 text-[13px] font-bold text-slate-500 underline-offset-2 active:underline">Skip for now</button> : null}
      </div>}>
      <div className="flex items-center gap-3 rounded-2xl bg-[#EEF1FD] p-3.5">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#4361EE]"><Gauge className="h-6 w-6" /></span>
        <p className="text-[13px] font-medium text-slate-600">
          {mode === "start" ? "Type the number shown on your bike's odometer now." : "Type the number shown on your odometer at the end of the day."}
          {mode === "start" && lastEnd != null ? <> Last end reading: <b>{lastEnd}</b>.</> : null}
          {mode === "end" && startReading != null ? <> You started at <b>{startReading}</b>.</> : null}
        </p>
      </div>
      <div className="mt-4"><FormLabel>Odometer reading (km)</FormLabel></div>
      <input className={`${inputCls} text-center text-[26px] font-extrabold tabular-nums`} inputMode="numeric" pattern="[0-9]*" autoFocus
        placeholder="e.g. 27622" value={text} onChange={(e) => { setText(e.target.value.replace(/[^\d]/g, "")); setConfirmed(false); setServerErr(null); }} />
      <div className="mt-4"><FormLabel>Photo of the odometer{photoRequired ? "" : " (optional)"}</FormLabel></div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void take(e.target.files?.[0])} />
      {photo ? (
        <div className="relative mt-2 overflow-hidden rounded-2xl ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Odometer" className="h-40 w-full object-cover" />
          <button type="button" onClick={() => cam.current?.click()} className="absolute bottom-2 right-2 rounded-full bg-slate-900/75 px-3 py-1.5 text-[12px] font-bold text-white">Retake</button>
        </div>
      ) : (
        <button type="button" onClick={() => cam.current?.click()} disabled={shooting}
          className="mt-2 flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#4361EE]/40 bg-[#EEF1FD]/60 text-[13px] font-bold text-[#3450D8]">
          {shooting ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Camera className="h-7 w-7" />}
          Take a photo of the meter
        </button>
      )}
      {km != null ? (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[14px] font-bold text-emerald-800">
          Today: {km} km · fuel ₹{(Math.round(km * fuelRate * 100) / 100).toLocaleString("en-IN")}
        </p>
      ) : null}
      {check.error ? <p className="mt-3 text-[13px] font-semibold text-rose-600">{check.error}</p> : null}
      {check.warn ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">{check.warn}</p> : null}
      {serverErr ? <p className="mt-3 text-[13px] font-semibold text-rose-600">{serverErr}</p> : null}
    </Sheet>
  );
}
