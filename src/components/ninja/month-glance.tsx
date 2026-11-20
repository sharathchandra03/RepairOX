"use client";
/* Home card: this month's earnings, trips, km at a glance → /ninja/earnings. */
import Link from "next/link";
import { BadgeIndianRupee, ChevronRight } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { localDateKey } from "@/lib/work-session";
import { useMyPay } from "@/lib/ninja/my-pay";
import { Skeleton } from "./ui";

export function MonthGlance() {
  const { currentUser } = usePermissions();
  const tz = useStoreSettings().settings.timeZone;
  const ym = localDateKey(Date.now(), tz).slice(0, 7);
  const my = useMyPay(ym);
  if (!currentUser?.id) return null;
  if (my.failed) return null;
  const s = my.summary;
  if (!s) return <Skeleton className="h-[72px] w-full" />;
  const present = s.days.filter((d) => d.status === "present" || d.status === "half_day").length;
  return (
    <Link href="/ninja/earnings" className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-slate-200 transition active:scale-[0.99]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><BadgeIndianRupee className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">₹{Math.round(s.total).toLocaleString("en-IN")} earned this month</span>
        <span className="block text-[12px] font-medium text-slate-500">{s.trips} trips · {present} day{present === 1 ? "" : "s"} · {s.km.toLocaleString("en-IN")} km{!s.gatePassed ? ` · ${s.tripsToGate} to unlock incentives` : ""}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-slate-300" />
    </Link>
  );
}
