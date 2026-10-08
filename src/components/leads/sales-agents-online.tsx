"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Sales Agents Online indicator.

   A compact header pill showing how many Sales Agents are online right now.
   Clicking it opens a panel listing who is ACTIVE and who is OFFLINE.

   The roster of agents comes from the canonical Sales Agent directory
   (useLeads().salesAgents — store-scoped by RLS); the live online/offline
   status comes from the SHARED presence channel (useSalesPresence), so an
   owner and every individual agent all see the SAME real-time picture.

   Visible to both owner and individual users (gated only by the page's lead
   view permission). It is presentation only — it never changes lead data,
   permissions, or any metric.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { useSalesPresenceRoster, type PresenceMeta } from "@/lib/use-sales-presence";

function activeSince(meta?: PresenceMeta): string {
  if (!meta?.onlineAt) return "";
  const then = new Date(meta.onlineAt).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr${hrs > 1 ? "s" : ""}`;
}

export function SalesAgentsOnline() {
  const { salesAgents } = useLeads();
  const { id: myId } = useSession();
  const { onlineIds, metaById } = useSalesPresenceRoster();

  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Position the portalled panel under the trigger.
  useEffect(() => {
    if (!open) return;
    const place = () => setRect(btnRef.current?.getBoundingClientRect() ?? null);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { online, offline, onlineCount } = useMemo(() => {
    const sorted = [...salesAgents].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    const online = sorted.filter((a) => onlineIds.has(a.id));
    const offline = sorted.filter((a) => !onlineIds.has(a.id));
    return { online, offline, onlineCount: online.length };
  }, [salesAgents, onlineIds]);

  const total = salesAgents.length;

  const panel = open && rect && mounted
    ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Sales agents online"
          className="fixed z-[60] w-[300px] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          style={{
            top: rect.bottom + 8,
            left: Math.max(12, Math.min(rect.right - 300, window.innerWidth - 312)),
          }}
        >
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-foreground">Sales Agents</p>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-emerald-600">{onlineCount} online</span>
                {" · "}{total} total
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto p-2">
            {total === 0 && (
              <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                No sales agents configured.
              </p>
            )}

            {online.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  Active now ({online.length})
                </p>
                {online.map((a) => (
                  <AgentRow key={a.id} name={a.name} roleLabel={a.roleLabel} avatarUrl={a.avatarUrl}
                    isMe={a.id === myId} online since={activeSince(metaById[a.id])} />
                ))}
              </>
            )}

            {offline.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Offline ({offline.length})
                </p>
                {offline.map((a) => (
                  <AgentRow key={a.id} name={a.name} roleLabel={a.roleLabel} avatarUrl={a.avatarUrl}
                    isMe={a.id === myId} online={false} />
                ))}
              </>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[#4361EE] bg-card px-3 py-1.5 text-[12px] font-semibold text-[#4361EE] transition hover:bg-[#EEF1FD]",
          open && "bg-[#EEF1FD] ring-2 ring-[#4361EE]/15",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="relative flex items-center">
          <Users className="h-3.5 w-3.5" />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
        </span>
        <span className="hidden sm:inline">
          <span className="font-bold text-emerald-600">{onlineCount}</span> Online
        </span>
      </button>
      {panel}
    </>
  );
}

function AgentRow({
  name,
  roleLabel,
  avatarUrl,
  isMe,
  online,
  since,
}: {
  name: string;
  roleLabel: string;
  avatarUrl?: string;
  isMe: boolean;
  online: boolean;
  since?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/50">
      <div className="relative shrink-0">
        <Avatar name={name} src={avatarUrl} size={34} className={cn(!online && "opacity-60 grayscale")} />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card",
            online ? "bg-emerald-500" : "bg-zinc-300",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-foreground">
          {name}
          {isMe && <span className="ml-1 text-[10px] font-medium text-muted-foreground">(You)</span>}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{roleLabel || "Sales Agent"}</p>
      </div>
      <span className={cn("shrink-0 text-[10.5px] font-medium", online ? "text-emerald-600" : "text-zinc-400")}>
        {online ? (since ? `${since}` : "Online") : "Offline"}
      </span>
    </div>
  );
}
