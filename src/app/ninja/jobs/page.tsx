"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Inbox } from "lucide-react";
import { useNinja } from "@/lib/ninja/ninja-context";
import { inProgress, isClosed, isNew, type NinjaTrip } from "@/lib/ninja/model";
import { Empty, Skeleton, Stagger } from "@/components/ninja/ui";
import { TripCard } from "@/components/ninja/trip-card";

const sameDay = (iso: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

const TABS: { id: string; label: string; test: (t: NinjaTrip) => boolean }[] = [
  { id: "new", label: "New", test: isNew },
  { id: "accepted", label: "Accepted", test: (t) => t.status === "accepted" },
  { id: "active", label: "Active", test: inProgress },
  { id: "today", label: "Today", test: (t) => !isClosed(t) && t.status !== "completed" && sameDay(t.scheduled_at) },
  { id: "done", label: "Done", test: (t) => t.status === "completed" },
  { id: "history", label: "Closed", test: (t) => isClosed(t) && t.status !== "completed" },
];

function Jobs() {
  const { trips, loading, past } = useNinja();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") || "new";
  const [q, setQ] = useState("");

  const counts = useMemo(() => Object.fromEntries(TABS.map((x) => [x.id, trips.filter(x.test).length + (x.id === "history" ? past.length : 0)])), [trips, past]);
  const list = useMemo(() => {
    const t = TABS.find((x) => x.id === tab) ?? TABS[0];
    const needle = q.trim().toLowerCase();
    return trips.filter(t.test).filter((x) => !needle || [x.trip_no, x.job?.customer, x.job?.device, x.job?.phone, x.dest_address].some((v) => v?.toLowerCase().includes(needle)));
  }, [trips, tab, q]);

  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-[28px] font-extrabold tracking-tight">My Jobs</h1><p className="text-[13px] font-medium text-slate-500">{trips.length} job{trips.length === 1 ? "" : "s"} assigned to you</p></div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by trip, customer, device or area"
          className="min-h-[50px] w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-4 text-[16px] font-medium outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
      </div>
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div role="tablist" className="flex w-max gap-2">
          {TABS.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => router.replace(`/ninja/jobs?tab=${x.id}`)}
              className={`flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-4 text-[13px] font-bold ring-1 ring-inset transition ${tab === x.id ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-white text-slate-600 ring-slate-300"}`}>
              {x.label}
              <span className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] ${tab === x.id ? "bg-white/25" : "bg-slate-100"}`}>{counts[x.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      {loading ? <div className="space-y-3"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
        : list.length === 0 && !(tab === "history" && past.length) ? <Empty icon={<Inbox className="h-7 w-7" />} title="Nothing here" body={q ? "No jobs match your search." : "Jobs in this list will appear here."} />
        : <div className="space-y-3">{list.map((t, i) => <Stagger key={t.id} i={i}><TripCard t={t} /></Stagger>)}</div>}
      {tab === "history" && past.length > 0 ? (
        <div className="space-y-2">
          <p className="px-1 pt-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">Rejected or reassigned</p>
          {past.map((h) => (
            <div key={h.tripId + h.at} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
              <div className="flex items-center justify-between gap-2"><p className="text-[12px] font-bold text-slate-500">{h.tripNo}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${h.outcome === "rejected" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{h.outcome === "rejected" ? "You rejected" : "Reassigned"}</span></div>
              <p className="mt-0.5 text-[15px] font-extrabold text-slate-800">{h.customer ?? "Customer"}</p>
              <p className="text-[12.5px] text-slate-500">{h.device}{h.reason ? ` · “${h.reason}”` : ""}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function JobsPage() { return <Suspense fallback={null}><Jobs /></Suspense>; }
