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
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCheck, ExternalLink, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { followUpLifecycle, type Lead, type LeadFollowUp } from "@/lib/leads-data";
import { useLeadFollowUpClock, dueLeadFollowUps } from "@/lib/lead-followup-engine";
import { useNotificationsFor, markRead, markAllRead, clearNotification } from "@/lib/notifications";

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
  const now = useLeadFollowUpClock();
  const [open, setOpen] = useState(false);
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

  const unreadCount = rows.filter((r) => r.notifId && !r.read).length;

  const handleMarkAllRead = () => markAllRead(currentUserId, roleId);

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
          animate={unreadCount > 0 ? { rotate: [0, -12, 12, -8, 8, 0] } : { rotate: 0 }}
          transition={unreadCount > 0 ? { duration: 1.1, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" } : { duration: 0.2 }}
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
                  <p className="truncate text-[14px] font-semibold leading-none">Follow-Ups</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{rows.length} due</span>
                </div>
                <button onClick={() => setOpen(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
              {unreadCount > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={handleMarkAllRead} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EEF1FD] px-2.5 py-1.5 text-[12px] font-medium text-[#4361EE] transition hover:bg-indigo-100">
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                  </button>
                </div>
              )}
            </div>

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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
