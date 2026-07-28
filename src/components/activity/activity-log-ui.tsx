"use client";

import { useState } from "react";
import {
  Plus, Pencil, Trash2, Wallet, Printer, Share2, LogIn, LogOut,
  PackagePlus, PackageMinus, ArrowRightLeft, Settings2, CheckCircle2,
  AlertTriangle, Eye, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import {
  SEVERITY_STYLE, formatWhen, fullTimestamp, type ActivityEntry,
} from "@/lib/activity-log";

/* ─── Icon selection (by action keyword, falling back to severity) ─ */
function iconFor(entry: ActivityEntry): React.ComponentType<{ className?: string }> {
  const a = entry.action.toLowerCase();
  if (/delete|deleted|remov|cancel/.test(a)) return Trash2;
  if (/payment|refund|paid/.test(a)) return Wallet;
  if (/print/.test(a)) return Printer;
  if (/shared|share/.test(a)) return Share2;
  if (/logout/.test(a)) return LogOut;
  if (/login|signed in/.test(a)) return LogIn;
  if (/reduced|deducted/.test(a)) return PackageMinus;
  if (/increased|restock/.test(a)) return PackagePlus;
  if (/convert/.test(a)) return ArrowRightLeft;
  if (/config|setting/.test(a)) return Settings2;
  if (/created|added|generated|new/.test(a)) return Plus;
  if (/updated|changed|assigned|edited/.test(a)) return Pencil;
  switch (entry.severity) {
    case "success": return CheckCircle2;
    case "warning": return AlertTriangle;
    case "critical": return Trash2;
    case "neutral": return Eye;
    default: return Pencil;
  }
}

/* ─── Single activity row ────────────────────────────────────────── */
export function ActivityRow({ entry, onClick }: { entry: ActivityEntry; onClick?: () => void }) {
  const Icon = iconFor(entry);
  const s = SEVERITY_STYLE[entry.severity];
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[#EEF1FD]/50"
    >
      <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ring-inset", s.icon)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground">{entry.action}</span>
          {entry.reference && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              {entry.reference}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{entry.description}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <span className="font-medium text-muted-foreground">{entry.actor}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/40" />
          <span>{formatWhen(entry.ts)}</span>
        </span>
      </span>
      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition group-hover:text-muted-foreground/50" />
    </button>
  );
}

/* ─── Flat timeline ──────────────────────────────────────────────── */
export function ActivityTimeline({ entries, onSelect }: { entries: ActivityEntry[]; onSelect: (e: ActivityEntry) => void }) {
  if (entries.length === 0) {
    return (
      <div className="grid place-items-center py-10 text-center">
        <Eye className="h-6 w-6 text-muted-foreground/40" />
        <p className="mt-2 text-[13px] text-muted-foreground">No activity to show.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/60">
      {entries.map((e) => (
        <ActivityRow key={e.id} entry={e} onClick={() => onSelect(e)} />
      ))}
    </div>
  );
}

/* ─── Detail drawer ──────────────────────────────────────────────── */
export function ActivityDetailDrawer({ entry, onClose }: { entry: ActivityEntry | null; onClose: () => void }) {
  const Icon = entry ? iconFor(entry) : Eye;
  const s = entry ? SEVERITY_STYLE[entry.severity] : SEVERITY_STYLE.neutral;
  return (
    <Drawer open={!!entry} onClose={onClose} title={entry?.action ?? "Activity"} subtitle={entry ? `${entry.module} · audit entry` : ""} icon={Icon} width="max-w-md">
      {entry && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ring-inset", s.icon)}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{entry.description}</p>
              <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", s.badge)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} /> {s.label}
              </span>
            </div>
          </div>

          {/* Change diffs */}
          {entry.changes && entry.changes.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Changes</p>
              <div className="space-y-2">
                {entry.changes.map((c, i) => (
                  <div key={i} className="rounded-xl border border-border p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">{c.field}</p>
                    <div className="mt-1 flex items-center gap-2 text-[13px]">
                      <span className="rounded-md bg-rose-50 px-2 py-0.5 text-rose-700 line-through decoration-rose-300">{c.from || "—"}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{c.to || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Facts */}
          <div className="rounded-xl border border-border divide-y divide-border px-4">
            <DetailRow label="Module">{entry.module}</DetailRow>
            {entry.entity && <DetailRow label="Entity">{entry.entity}</DetailRow>}
            {entry.reference && <DetailRow label="Reference"><span className="font-mono text-[12px]">{entry.reference}</span></DetailRow>}
            <DetailRow label="Performed by">{entry.actor}</DetailRow>
            {entry.role && <DetailRow label="Role">{entry.role}</DetailRow>}
            {entry.branch && <DetailRow label="Branch">{entry.branch}</DetailRow>}
            <DetailRow label="Date & time">{fullTimestamp(entry.ts)}</DetailRow>
            {entry.reason && <DetailRow label="Reason"><span className="text-rose-600">{entry.reason}</span></DetailRow>}
            {entry.meta && Object.entries(entry.meta).map(([k, v]) => <DetailRow key={k} label={k}>{v}</DetailRow>)}
          </div>
        </div>
      )}
    </Drawer>
  );
}
