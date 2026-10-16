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
import { Users, X, Coffee, Play, Clock, BarChart3, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { useSalesPresenceRoster, type PresenceMeta } from "@/lib/use-sales-presence";
import { useWorkSession, type WorkStatus } from "@/lib/work-session-context";
import { usePermissions } from "@/lib/permissions-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const WORK_STATUS_META: Record<WorkStatus, { label: string; dot: string; text: string }> = {
  working: { label: "Working", dot: "bg-emerald-500", text: "text-emerald-700" },
  on_break: { label: "On Break", dot: "bg-amber-500", text: "text-amber-700" },
  interrupted: { label: "Needs Review", dot: "bg-rose-500", text: "text-rose-700" },
  logged_out: { label: "Not Working", dot: "bg-zinc-400", text: "text-zinc-600" },
};

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
  const { salesAgents, currentUserIsSalesAgent, salesAgentsReady } = useLeads();
  // Work Session is Sales-Agent-only — the owner sees the agent roster but no
  // personal work-status chip / Start Work (Online ≠ Working; owner ≠ agent).
  const showWorkStatus = salesAgentsReady && currentUserIsSalesAgent();
  const { id: myId } = useSession();
  const { onlineIds, metaById } = useSalesPresenceRoster();
  const router = useRouter();
  const { status: workStatus, startWork, startBreak, endBreak, endWork } = useWorkSession();
  const { logout } = usePermissions();

  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Close the work session (and any open break) BEFORE auth logout — this is
  // what makes each day's productivity computable (the engine midnight-splits
  // the CLOSED session). Never block logout on it: a hanging/failing close is
  // recovered later as an interrupted session. Mirrors topbar handleLogout.
  async function handleLogout() {
    setConfirmLogout(false);
    setOpen(false);
    try {
      await Promise.race([
        endWork("logout"),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch {
      /* swallow — logout must always proceed */
    }
    logout();
    router.push("/login");
  }
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
          <div className="flex items-center justify-between border-b border-[#25D366]/20 bg-[#E8F8EF] px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-foreground">Sales Agents</p>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-bold text-[#128C3E]">{onlineCount} online</span>
                {" · "}{total} total
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#25D366]/10 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Current user's WORK STATUS + context actions. Distinct from the
              presence (online) picture below — Online ≠ Working. Sales Agents
              only — hidden for the owner / any non-Sales-Agent. */}
          {showWorkStatus && (
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                <span className={cn("h-1.5 w-1.5 rounded-full", WORK_STATUS_META[workStatus].dot)} />
                <span className={WORK_STATUS_META[workStatus].text}>
                  Your work status: {WORK_STATUS_META[workStatus].label}
                </span>
              </span>
              <button
                onClick={() => { router.push("/account/productivity"); setOpen(false); }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#4361EE] transition hover:bg-[#4361EE]/10"
              >
                <BarChart3 className="h-3.5 w-3.5" /> Productivity
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {workStatus === "working" && (
                <button
                  onClick={() => void startBreak()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  <Coffee className="h-3.5 w-3.5" /> Start Break
                </button>
              )}
              {workStatus === "on_break" && (
                <button
                  onClick={() => void endBreak()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  <Play className="h-3.5 w-3.5" /> Resume Work
                </button>
              )}
              {(workStatus === "logged_out" || workStatus === "interrupted") && (
                <button
                  onClick={() => void startWork()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#4361EE]/30 bg-[#4361EE]/10 px-2.5 py-1 text-[11px] font-semibold text-[#4361EE] transition hover:bg-[#4361EE]/20"
                >
                  <Clock className="h-3.5 w-3.5" /> Start Work
                </button>
              )}

              {/* Logout — red, asks for confirmation (closes the work session
                  first so each day's productivity is calculated). */}
              <button
                onClick={() => setConfirmLogout(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                <LogOut className="h-3.5 w-3.5" /> Logout
              </button>
            </div>
          </div>
          )}

          <div className="h-[360px] overflow-y-auto p-2">
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
          "inline-flex items-center gap-2.5 rounded-full border border-white/25 bg-[#22c35e] px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_12px_-4px_rgba(37,211,102,0.45)] transition hover:bg-[#1eb257]",
          open && "ring-2 ring-[#25D366]/30",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="relative flex items-center">
          <Users className="h-3.5 w-3.5 text-white" />
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#4ade80] ring-2 ring-[#22c35e]" />
        </span>
        <span className="hidden items-center sm:inline-flex">
          <span className="mr-2 h-3.5 w-px bg-white/35" aria-hidden="true" />
          <span>
            <span className="font-bold">{onlineCount}</span> Online
          </span>
        </span>
      </button>
      {panel}
      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => void handleLogout()}
        title="Log out of RepairOX?"
        description="Your work session will be closed and today's productivity recorded before you're signed out."
        confirmLabel="Log out"
        cancelLabel="Cancel"
        danger
      />
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
