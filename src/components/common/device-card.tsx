"use client";
/* RepairOX — the shared Device cell card used in list tables (Lead "Device &
   Issue", Ticket "Device / Service", Field "Device Info").
   A subtle highlight so the device reads as its own block next to the Contact
   strip and the amber Comment card: soft indigo tint + hairline ring + a white
   icon chip (phone / laptop / tablet / watch / desktop, picked from the name —
   decorative only). Name (semibold indigo-950) · issue (grey) · optional third
   line (IMEI / serial). Clickable → opens the record's device details. */
import { ChevronRight, Laptop, Monitor, Smartphone, Tablet, Watch } from "lucide-react";
import { cn } from "@/lib/utils";

export function DeviceGlyph({ label, className = "h-4 w-4" }: { label: string; className?: string }) {
  const s = (label || "").toLowerCase();
  if (/laptop|macbook|notebook|xps|thinkpad|ideapad|pavilion|vivobook|zenbook|inspiron|latitude|chromebook|surface laptop/.test(s)) return <Laptop className={className} />;
  if (/ipad|tablet|\btab\b|galaxy tab/.test(s)) return <Tablet className={className} />;
  if (/watch/.test(s)) return <Watch className={className} />;
  if (/desktop|imac|monitor|\bpc\b|all-in-one/.test(s)) return <Monitor className={className} />;
  return <Smartphone className={className} />;
}

export function DeviceCard({ label, issue, detail, extra = 0, hint, onOpen, title, ariaLabel = "View device details", badge, className, wrap = false }: {
  label: string;
  issue?: string;
  /** Optional third line, e.g. "IMEI: 3567…" (already formatted). */
  detail?: React.ReactNode;
  /** Number of additional devices → "+N more". */
  extra?: number;
  /** Text used to guess the icon (defaults to the label). */
  hint?: string;
  onOpen?: () => void;
  title?: string;
  ariaLabel?: string;
  /** Small marker on the icon chip's corner (e.g. a priority dot). */
  badge?: React.ReactNode;
  className?: string;
  /** Let the issue/second line wrap to two lines instead of truncating. */
  wrap?: boolean;
}) {
  const body = (
    <>
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-indigo-500 shadow-[0_1px_2px_rgba(67,97,238,0.12)] ring-1 ring-indigo-100">
        <DeviceGlyph label={hint ?? label} />
        {badge && <span className="absolute -right-1 -top-1">{badge}</span>}
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold text-indigo-950">
          <span className={wrap ? "line-clamp-2 break-words" : "truncate"} title={label || undefined}>{label || "—"}</span>
          {extra > 0 && <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">+{extra} more</span>}
        </span>
        {issue && <span className={cn("mt-0.5 block text-[12px] text-zinc-500", wrap ? "line-clamp-2 break-words" : "truncate")} title={issue}>{issue}</span>}
        {detail && <span className="mt-0.5 block truncate text-[11.5px] text-zinc-600">{detail}</span>}
      </span>
      {onOpen && <ChevronRight className="h-4 w-4 shrink-0 text-indigo-300 transition group-hover/device:translate-x-0.5 group-hover/device:text-[#4361EE]" />}
    </>
  );
  const cls = cn(
    "group/device flex w-full min-w-0 items-center gap-2.5 rounded-xl bg-indigo-50/50 px-2.5 py-1.5 text-left ring-1 ring-inset ring-indigo-100 transition",
    onOpen && "cursor-pointer hover:bg-indigo-50 hover:ring-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
    className,
  );
  return onOpen ? (
    <button type="button" aria-label={ariaLabel} title={title} className={cls} onClick={(e) => { e.stopPropagation(); onOpen(); }}>{body}</button>
  ) : (
    <div className={cls} title={title}>{body}</div>
  );
}
