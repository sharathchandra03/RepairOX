"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Lead Follow-Up Bell — a page-scoped bell for the Leads module.

   It surfaces the CURRENT USER's own follow-ups that are Due or Overdue (they
   are the follow-up agent, else the lead owner), derived live from the
   structured lead_followup_history records via the shared follow-up clock — the
   SAME source the global LeadFollowUpWatcher uses to fire durable topbar
   notifications. Read / Clear state is delegated to the shared notifications
   feed (markRead / clearNotification) so it stays in lockstep with the topbar
   bell — no parallel notification store.

   Clicking an entry opens the lead. This is presentation over records; it never
   schedules/completes a follow-up itself.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Bell, X, CheckCheck, ExternalLink, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { followUpLifecycle, type Lead, type LeadFollowUp } from "@/lib/leads-data";
import { useLeadFollowUpClock, dueLeadFollowUps } from "@/lib/lead-followup-engine";
import {
  useNotificationsFor, markRead, markAllRead, clearNotification, clearAllForRecipient,
  isFollowUpNotification,
} from "@/lib/notifications";

type FeedTab = "followups" | "others";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** The dedupeKey the watcher uses — kept in sync so read/clear here maps to the
 *  same durable notification. */
function dueKey(fu: LeadFollowUp, state: string): string {
  return `lead-fu:${fu.id}@${new Date(fu.dueAt).getTime()}:${state}`;
}

function fmtDue(fu: LeadFollowUp): string {
  const d = new Date(fu.dueAt);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const datePart = sameDay ? "Today" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  const timePart = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

export function LeadFollowUpBell({ onOpenLead }: { onOpenLead: (lead: Lead) => void }) {
  const { followUps, leads } = useLeads();
  const { id: currentUserId, roleId } = useSession();
  const router = useRouter();
  const now = useLeadFollowUpClock();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FeedTab>("followups");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const leadById = useMemo(() => { const m = new Map<string, Lead>(); for (const l of leads) m.set(l.id, l); return m; }, [leads]);

  // The current user's own Due/Overdue open follow-ups (they're the follow-up
  // agent, else the lead owner), soonest first — matches the watcher's targeting.
  const due = useMemo(() => {
    const list = dueLeadFollowUps(followUps, now).filter((fu) => {
      const lead = leadById.get(fu.leadId);
      if (!lead) return false;
      const recipientId = fu.followUpUserId || lead.assignedTo || "";
      return !currentUserId || !recipientId || recipientId === currentUserId;
    });
    return list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followUps, leadById, now, currentUserId]);

  // Durable notifications for this user → drives read state (in lockstep with
  // the topbar bell). Match a follow-up to its notification by dedupeKey.
  const myNotifs = useNotificationsFor(currentUserId, roleId);
  const notifByKey = useMemo(() => {
    const m = new Map<string, { id: string; read: boolean }>();
    for (const n of myNotifs) if (n.dedupeKey) m.set(n.dedupeKey, { id: n.id, read: n.read });
    return m;
  }, [myNotifs]);

  const rows = useMemo(() => due.map((fu) => {
    const state = followUpLifecycle(fu, now);
    const notif = notifByKey.get(dueKey(fu, state));
    return { fu, state, lead: leadById.get(fu.leadId)!, notifId: notif?.id, read: notif?.read ?? true };
  }), [due, now, notifByKey, leadById]);

  // The follow-up badge counts every LIVE Due/Overdue follow-up (what the list
  // shows + what drives the shake), NOT just unread stored notifications — so a
  // pending follow-up is never silently un-counted just because its durable
  // notification hasn't been written yet or was already read. It clears only
  // when the follow-up is COMPLETED or RESCHEDULED (it leaves the `due` set).
  const followUpUnread = rows.length;

  // "Others" = this user's non-follow-up notifications from the shared feed
  // (assignments, routing, deals, field, etc.), newest first.
  const otherNotifs = useMemo(
    () => myNotifs.filter((n) => !isFollowUpNotification(n)).slice(0, 20),
    [myNotifs],
  );
  const otherUnread = useMemo(() => otherNotifs.filter((n) => !n.read).length, [otherNotifs]);

  // Bell badge reflects BOTH categories so nothing is missed from the Lead Table.
  const unreadCount = followUpUnread + otherUnread;

  // CONTINUOUS vibration while this user has a Due/Overdue follow-up still open.
  // `due` is the live set of the user's Due/Overdue scheduled follow-ups, so the
  // moment they COMPLETE it (leaves the scheduled set) or RESCHEDULE it to the
  // future (no longer Due), `due` empties and the bell stops — exactly the
  // requested behaviour. Honours prefers-reduced-motion.
  const reduceMotion = useReducedMotion();
  const vibrate = !reduceMotion && due.length > 0;

  const handleMarkAllRead = () =>
    markAllRead(currentUserId, roleId, isFollowUpNotification, tab === "followups");
  const handleClearAll = () =>
    clearAllForRecipient(currentUserId, roleId, isFollowUpNotification, tab === "followups");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Lead Follow-Ups"
        title="Lead Follow-Ups"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#4361EE] bg-[#4361EE] text-white shadow-sm ring-1 ring-inset ring-[#4361EE]/40 transition hover:bg-[#3550d8] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/60",
          open && "bg-[#3550d8] ring-[#4361EE]/60",
        )}
      >
        <motion.span
          animate={vibrate ? { rotate: [0, -14, 12, -10, 8, -5, 0] } : { rotate: 0 }}
          transition={vibrate ? { duration: 0.9, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" } : { duration: 0.2 }}
          style={{ transformOrigin: "50% 15%" }}
        >
          <Bell className="h-[18px] w-[18px]" />
        </motion.span>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-label="Lead follow-up notifications"
            className="absolute right-0 z-50 mt-2 w-[384px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
          >
            <div className="border-b border-border px-4 pt-3 pb-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200"><Bell className="h-3.5 w-3.5" /></span>
                  <p className="truncate text-[14px] font-semibold leading-none">Notifications</p>
                </div>
                <button onClick={() => setOpen(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>

              {/* Two categories — Follow-ups (lead due/overdue) vs Others
                  (assignments, routing, deals, …) — each with its own unread dot. */}
              <div className="mt-2.5 flex items-center gap-1">
                {([
                  { key: "followups" as const, label: "Follow-ups", count: followUpUnread },
                  { key: "others" as const, label: "Others", count: otherUnread },
                ]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition",
                      tab === t.key ? "bg-[#4361EE]/10 text-[#4361EE]" : "text-muted-foreground hover:bg-muted hover:text-zinc-700",
                    )}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span className={cn(
                        "grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9px] font-bold leading-none",
                        tab === t.key ? "bg-[#4361EE] text-white" : "bg-rose-500 text-white",
                      )}>
                        {t.count > 9 ? "9+" : t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {((tab === "followups" && followUpUnread > 0) || (tab === "others" && otherUnread > 0)) && (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={handleMarkAllRead} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF1FD] px-2.5 py-1.5 text-[12px] font-medium text-[#4361EE] transition hover:bg-indigo-100">
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                  </button>
                  {tab === "others" && (
                    <button onClick={handleClearAll} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:bg-muted hover:text-rose-600">
                      <X className="h-3.5 w-3.5" /> Clear all
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* OTHERS tab ------------------------------------------------------ */}
            {tab === "others" ? (
              <div className="max-h-[360px] overflow-y-auto">
                {otherNotifs.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"><Bell className="h-5 w-5" /></span>
                    <p className="text-[13px] font-medium">You&apos;re all caught up</p>
                    <p className="text-[11px] text-muted-foreground">No other notifications right now.</p>
                  </div>
                ) : (
                  otherNotifs.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => { markRead(n.id); if (n.href) router.push(n.href); setOpen(false); }}
                      className={cn("flex w-full items-start gap-2.5 border-b border-border px-4 py-3 text-left transition last:border-b-0 hover:bg-muted/50", !n.read && "bg-indigo-50/40")}
                    >
                      <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", n.read ? "bg-muted text-zinc-400" : "bg-[#4361EE]/10 text-[#4361EE]")}>
                        <Bell className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4361EE]" />}
                          <span className={cn("truncate text-[13px]", n.read ? "font-medium text-zinc-700" : "font-semibold text-zinc-900")}>{n.title}</span>
                        </span>
                        {n.body && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{n.body}</span>}
                        <span className="mt-0.5 block text-[10px] text-zinc-400">{timeAgo(n.ts)}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
            /* FOLLOW-UPS tab -------------------------------------------------- */
            <div className="max-h-[360px] overflow-y-auto">
              {rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"><Bell className="h-5 w-5" /></span>
                  <p className="text-[13px] font-medium">You&apos;re all caught up</p>
                  <p className="text-[11px] text-muted-foreground">No lead follow-ups are due right now.</p>
                </div>
              ) : (
                rows.map(({ fu, state, lead, notifId, read }) => (
                  <div key={fu.id} className={cn("flex gap-2.5 border-b border-border px-4 py-3 last:border-b-0", notifId && !read && "bg-indigo-50/40")}>
                    <Avatar name={lead.name || lead.leadNo} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {notifId && !read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4361EE]" />}
                        <p className="truncate text-[13px] font-semibold">{lead.name || "Lead"}</p>
                        {state === "Overdue" && <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#B42318]">Overdue</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{lead.leadNo}{lead.device ? ` · ${lead.device}` : ""} · Follow-up #{fu.seq}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#4361EE]"><Clock className="h-3 w-3" /> {fmtDue(fu)}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => { if (notifId) markRead(notifId); onOpenLead(lead); setOpen(false); }}
                          className="inline-flex items-center gap-1 rounded-md bg-[#EEF1FD] px-2 py-1 text-[11px] font-medium text-[#4361EE] transition hover:bg-indigo-100"
                        >
                          <ExternalLink className="h-3 w-3" /> Open Lead
                        </button>
                        {notifId && !read && (
                          <button onClick={() => markRead(notifId)} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
                            <CheckCheck className="h-3 w-3" /> Mark read
                          </button>
                        )}
                        {notifId && (
                          <button onClick={() => clearNotification(notifId)} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-rose-600">
                            <X className="h-3 w-3" /> Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
