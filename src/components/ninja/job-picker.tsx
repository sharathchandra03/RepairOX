"use client";
/* Documents are raised FROM a job so the customer, device and store are never re-typed (and no
   duplicate customer can be created). This picker lists the jobs a ticket / invoice can belong to. */
import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import { useNinja } from "@/lib/ninja/ninja-context";
import { STATUS_META, TYPE_LABEL, isClosed, type NinjaTrip } from "@/lib/ninja/model";
import { Empty, Skeleton } from "./ui";
import { TYPE_STYLE } from "./trip-card";

const WEEK = 7 * 864e5;
export function usableJobs(trips: NinjaTrip[]): NinjaTrip[] {
  return trips
    .filter((t) => !["assigned", "awaiting_assignment"].includes(t.status) && (!isClosed(t) || (t.status === "completed" && Date.now() - new Date(t.completed_at ?? t.updated_at).getTime() < WEEK)))
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
}

export function JobPicker({ base, title, extra = "" }: { base: string; title: string; extra?: string }) {
  const { trips, loading } = useNinja();
  const jobs = useMemo(() => usableJobs(trips), [trips]);
  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-[26px] font-extrabold leading-none tracking-tight">{title}</h1><p className="mt-1.5 text-[13px] font-medium text-slate-500">Which job is this for?</p></div>
      {loading ? <Skeleton className="h-24" /> : jobs.length === 0 ? (
        <Empty icon={<Inbox className="h-7 w-7" />} title="No job to attach to" body="Accept a job first. Tickets and invoices are raised from a job so the customer details come along." />
      ) : (
        <div className="space-y-2.5">
          {jobs.map((t) => {
            const st = TYPE_STYLE[t.trip_type]; const Icon = st.icon;
            return (
              <Link key={t.id} href={`${base}?trip=${t.id}${extra}`} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-slate-200/80 transition active:scale-[0.985]">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${st.tile}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-extrabold text-slate-900">{t.job?.customer || "Customer"}</span>
                  <span className="block truncate text-[12.5px] font-medium text-slate-500">{TYPE_LABEL[t.trip_type]} · {t.job?.device || "Device"} · {STATUS_META[t.status].label}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
