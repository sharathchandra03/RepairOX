"use client";
/* One pill for a date + time pair. Thin adapter over the shared DateTimeField
   (calendar + time in the centred dialog) for forms whose state keeps the date
   ("YYYY-MM-DD") and the time ("HH:mm") in separate fields. Opens on the exact
   current date/time when unset; commits only on OK. */
import { DateTimeField, combineToIso, isoToLocalTime } from "@/components/ui/date-time-picker";

const pad = (n: number) => String(n).padStart(2, "0");
export function DateTimePill({ date, time, onChange, title, placeholder = "Pick date & time", className, invalid, disabled }: {
  date: string; time: string; onChange: (date: string, time: string) => void;
  title?: string; placeholder?: string; className?: string; invalid?: boolean; disabled?: boolean;
}) {
  let iso = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    iso = combineToIso(new Date(y, m - 1, d), time || isoToLocalTime(new Date().toISOString())) ?? "";
  }
  return (
    <DateTimeField value={iso} title={title} placeholder={placeholder} className={className} invalid={invalid} disabled={disabled}
      onChange={(v) => { const d = new Date(v); onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`); }} />
  );
}
