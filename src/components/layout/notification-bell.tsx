"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Notification bell (topbar).

   Renders notifications addressed to the signed-in user (by id) or their role,
   with an unread count and a dropdown feed. Clicking a notification marks it
   read and navigates to its deep link (a Field Job, Lead, etc.). This is the
   durable, targeted counterpart to the transient toast channel.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Truck, Store, Package, CheckCircle2, Clock } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useNotificationsFor, markRead, markAllRead, type NotificationKind } from "@/lib/notifications";

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
};

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
  const items = useNotificationsFor(userId, role?.id);
  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  const recent = items.slice(0, 20);

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
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[#4361EE] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-card">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-[13px] font-semibold text-zinc-800">Notifications</p>
            {unread > 0 && (
              <button onClick={() => markAllRead(userId, role?.id)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-[360px] overflow-y-auto">
            {recent.length === 0 && (
              <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">You're all caught up.</p>
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
