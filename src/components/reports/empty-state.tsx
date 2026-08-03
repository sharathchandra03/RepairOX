"use client";

/* RepairOX — Reports V2 · Empty states. Never show a bare zero — explain what
   happened and suggest a next step (usually: widen the date range). */

import { Inbox, CalendarSearch, PackageSearch, Users2, Wrench, Target, MapPinned, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  inbox: Inbox,
  calendar: CalendarSearch,
  inventory: PackageSearch,
  customers: Users2,
  tickets: Wrench,
  target: Target,
  route: MapPinned,
  campaign: Megaphone,
} as const;

export type EmptyStateIcon = keyof typeof ICONS;

export function EmptyState({
  icon = "inbox",
  title,
  detail = "Try selecting another date range or clearing filters.",
  compact = false,
  className,
}: {
  icon?: EmptyStateIcon;
  title: string;
  detail?: string;
  compact?: boolean;
  className?: string;
}) {
  const Icon = ICONS[icon];
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-14", className)}>
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#EEF1FD] to-slate-50 ring-1 ring-inset ring-[#B3BFF6]/40">
        <Icon className="h-5 w-5 text-[#4361EE]" strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-[13px] font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}
