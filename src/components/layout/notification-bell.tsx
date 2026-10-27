"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Notification bell (topbar).

   Renders notifications addressed to the signed-in user (by id) or their role,
   with an unread count and a dropdown feed. Clicking a notification marks it
   read and navigates to its deep link (a Field Job, Lead, etc.). This is the
   durable, targeted counterpart to the transient toast channel.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Bell, Check, Truck, Store, Package, CheckCircle2, Clock, CalendarClock, Trash2, X } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import {
  useNotificationsFor,
  markRead,
  markAllRead,
  clearAllForRecipient,
  setNotificationUser,
  isFollowUpNotification,
  type NotificationKind,
} from "@/lib/notifications";

const KIND_ICON: Partial<Record<NotificationKind, React.ComponentType<{ className?: string }>>> = {
  lead_routed: Store,
  store_handoff: Store,
  field_new_job: Truck,
  field_assignment: Truck,
  drop_assignment: Truck,
  pickup_done: Package,
  device_received: Package,
  ready_for_drop: CheckCircle2,
  drop_done: CheckCircle2,
  pickup_reminder: Clock,
  drop_reminder: Clock,
  lead_followup_due: CalendarClock,
  lead_followup_overdue: CalendarClock,
  walkin_followup_due: CalendarClock,
  walkin_followup_overdue: CalendarClock,
};

type FeedTab = "followups" | "others";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const { role } = usePermissions();
  const { id: userId } = useSession();
  const [tab, setTab] = useState<FeedTab>("followups");

  // Bind the notification store to the signed-in account so the feed, read
  // state and dedupe set are PRIVATE per account (never shared across accounts
  // on one browser). Re-binds on login / logout / account switch.
  useEffect(() => { setNotificationUser(userId); }, [userId]);

  const items = useNotificationsFor(userId, role?.id);

  // Two categories: Follow-ups (lead follow-up due/overdue) and Others.
  const followUpItems = useMemo(() => items.filter(isFollowUpNotification), [items]);
  const otherItems = useMemo(() => items.filter((n) => !isFollowUpNotification(n)), [items]);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  const followUpUnread = useMemo(() => followUpItems.filter((n) => !n.read).length, [followUpItems]);
  const otherUnread = useMemo(() => otherItems.filter((n) => !n.read).length, [otherItems]);

  const active = tab === "followups" ? followUpItems : otherItems;
  const recent = active.slice(0, 20);

  // CONTINUOUS bell vibration while ANY follow-up is still pending (an unread
  // follow-up notification exists). Completing or rescheduling the follow-up
  // marks that notification read / clears it (a reschedule mints a new dueKey,
  // completion silences the old one), so the vibration stops on its own — no
  // extra wiring. Honours prefers-reduced-motion (no animation; info stays in
  // the badge). This is the whole-app topbar bell, so it covers lead AND
  // walk-in (and any future) follow-ups uniformly.
  const reduceMotion = useReducedMotion();
  const vibrate = !reduceMotion && followUpUnread > 0;

  return (
    <Dropdown
      align="right"
      width="w-80"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="relative grid h-9 w-9 place-items-center rounded-xl text-zinc-400 hover:bg-muted hover:text-zinc-700 transition"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        >
          <motion.span
            className="grid place-items-center"
            style={{ transformOrigin: "50% 15%" }}
            animate={vibrate ? { rotate: [0, -14, 12, -10, 8, -5, 0] } : { rotate: 0 }}
            transition={
              vibrate
                ? { duration: 0.9, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }
                : { duration: 0.2 }
            }
          >
            <Bell className="h-4 w-4" />
          </motion.span>
          {unread > 0 && (
            /* Compact circular red badge, lifted onto the upper-right of the bell
               with a card-coloured ring so it reads as a distinct pill (same
               visual quality as the Walk-In follow-up bell badge). */
            <span className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-card">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <p className="text-[13px] font-semibold text-zinc-800">Notifications</p>
            <div className="flex items-center gap-1.5">
              {active.some((n) => !n.read) && (
                /* Mark the ACTIVE category's items read (scoped to this account). */
                <button onClick={() => markAllRead(userId, role?.id, isFollowUpNotification, tab === "followups")} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
              {active.length > 0 && (
                /* Clear all — removes this account's notifications in the ACTIVE
                   category from the feed (not just marks them read). */
                <button
                  onClick={() => clearAllForRecipient(userId, role?.id, isFollowUpNotification, tab === "followups")}
                  title="Clear all notifications in this tab"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-rose-600"
                >
                  <Trash2 className="h-3 w-3" /> Clear all
                </button>
              )}
              <button
                onClick={close}
                title="Close"
                aria-label="Close notifications"
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Two categories — Follow-ups vs Others — each with its own unread
              dot so the user sees at a glance where attention is needed. */}
          <div className="flex items-center gap-1 px-2 pb-1.5">
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

          <div className="my-1 h-px bg-border" />
          <div className="max-h-[360px] overflow-y-auto">
            {recent.length === 0 && (
              <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                {tab === "followups" ? "No follow-up notifications." : "You're all caught up."}
              </p>
            )}
            {recent.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => { markRead(n.id); if (n.href) router.push(n.href); close(); }}
                  className={cn("flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted/60", !n.read && "bg-[#EEF1FD]/50")}
                >
                  <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", n.read ? "bg-muted text-zinc-400" : "bg-[#4361EE]/10 text-[#4361EE]")}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("truncate text-[12.5px]", n.read ? "font-medium text-zinc-700" : "font-semibold text-zinc-900")}>{n.title}</span>
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4361EE]" />}
                    </span>
                    {n.body && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 block text-[10px] text-zinc-400">{timeAgo(n.ts)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Dropdown>
  );
}
