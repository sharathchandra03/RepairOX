"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox, Search, SlidersHorizontal, X } from "lucide-react";
import { useNinja } from "@/lib/ninja/ninja-context";
import { inProgress, isClosed, isNew, type NinjaTrip, type TripKind, TYPE_LABEL, kindOf } from "@/lib/ninja/model";
import { AppliedChip, Btn, ChipGroup, Empty, FormLabel, Segmented, Sheet, Skeleton, Stagger, inputCls } from "@/components/ninja/ui";
import { TripCard } from "@/components/ninja/trip-card";

type Tab = "new" | "open" | "done" | "rejected";
type When = "any" | "today" | "tomorrow" | "week";
type Sort = "soonest" | "latest" | "recent";

const DAY = 86_400_000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const inWhen = (iso: string | null, w: When) => {
  if (w === "any") return true;
  if (!iso) return false;
  const t = new Date(iso).getTime(), today = startOfDay(new Date());
  if (w === "today") return t >= today && t < today + DAY;
  if (w === "tomorrow") return t >= today + DAY && t < today + 2 * DAY;
  return t >= today && t < today + 7 * DAY;
};
const WHEN_LABEL: Record<When, string> = { any: "Any day", today: "Today", tomorrow: "Tomorrow", week: "Next 7 days" };
const SORT_LABEL: Record<Sort, string> = { soonest: "Soonest first", latest: "Latest first", recent: "Recently assigned" };

const TESTS: Record<Tab, (t: NinjaTrip) => boolean> = {
  new: isNew,
  open: (t) => !isNew(t) && !isClosed(t) && t.status !== "completed" && t.status !== "awaiting_assignment",
  done: (t) => t.status === "completed",
  rejected: () => false, // declined assignments come from `past`, not live trips
};
// legacy deep links (?tab=accepted|active|today|history)
const LEGACY: Record<string, { tab: Tab; when?: When }> = { accepted: { tab: "open" }, active: { tab: "open" }, today: { tab: "open", when: "today" }, history: { tab: "rejected" } };

function Jobs() {
  const { trips, loading, past, track } = useNinja();
  const params = useSearchParams();
  const router = useRouter();
  // No ?tab= → land on "To respond" only if something is waiting, otherwise on "Open".
  // Decided ONCE when the trips first load, so a new assignment never yanks the Ninja off the tab they are on.
  const [autoTab, setAutoTab] = useState<Tab | null>(null);
  useEffect(() => { if (!loading && autoTab === null) setAutoTab(trips.some(isNew) ? "new" : "open"); }, [loading, autoTab, trips]);
  const raw = params.get("tab") || autoTab || "open";
  const legacy = LEGACY[raw];
  const tab: Tab = (legacy?.tab ?? (raw === "closed" ? "rejected" : ["new", "open", "done", "rejected", "closed"].includes(raw) ? raw : "new")) as Tab;

  const [when, setWhen] = useState<When>(legacy?.when ?? "any");
  const [type, setType] = useState<TripKind | "all">("all");
  const [sort, setSort] = useState<Sort>("soonest");
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState({ when, type, sort });
  const searchRef = useRef<HTMLInputElement>(null);
  const firstSeen = useRef(false);

  useEffect(() => { if (showSearch) searchRef.current?.focus(); }, [showSearch]);
  useEffect(() => {
    if (!q.trim()) return;
    const h = setTimeout(() => track({ kind: "jobs_search", screen: "jobs", payload: { length: q.trim().length, tab } }), 900);
    return () => clearTimeout(h);
  }, [q, tab, track]);
  useEffect(() => { if (!firstSeen.current) { firstSeen.current = true; return; } track({ kind: "jobs_tab_changed", screen: "jobs", payload: { tab } }); }, [tab, track]);

  const rejected = useMemo(() => past.filter((h) => h.outcome === "rejected"), [past]);
  const counts = useMemo(() => ({
    new: trips.filter(TESTS.new).length, open: trips.filter(TESTS.open).length,
    done: trips.filter(TESTS.done).length, rejected: rejected.length,
  }), [trips, rejected]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = trips.filter(TESTS[tab])
      .filter((x) => inWhen(x.scheduled_at, when))
      .filter((x) => type === "all" || kindOf(x) === type)
      .filter((x) => !needle || [x.trip_no, x.job?.customer, x.job?.device, x.job?.phone, x.dest_address, x.job?.pincode].some((v) => v?.toLowerCase().includes(needle)));
    const at = (x: NinjaTrip) => (x.scheduled_at ? new Date(x.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER);
    const rank = (x: NinjaTrip) => (inProgress(x) ? 0 : 1);      // in-progress work always floats up in Open
    return [...rows].sort((a, b) => {
      if (tab === "open" && rank(a) !== rank(b)) return rank(a) - rank(b);
      if (sort === "recent") return (b.assigned_at ?? b.created_at).localeCompare(a.assigned_at ?? a.created_at);
      return sort === "latest" ? at(b) - at(a) : at(a) - at(b);
    });
  }, [trips, tab, when, type, sort, q]);

  const applied = (when !== "any" ? 1 : 0) + (type !== "all" ? 1 : 0) + (sort !== "soonest" ? 1 : 0);
  const setTab = (t: Tab) => router.replace(`/ninja/jobs?tab=${t}`);
  const apply = () => {
    setWhen(draft.when); setType(draft.type); setSort(draft.sort); setSheet(false);
    track({ kind: "jobs_filter_changed", screen: "jobs", payload: { when: draft.when, type: draft.type, sort: draft.sort, tab } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-extrabold leading-none tracking-tight">My Jobs</h1>
          <p className="mt-1.5 text-[13px] font-medium text-slate-500">{trips.length} assigned to you</p>
        </div>
        <div className="flex items-center gap-2">
          <button aria-label="Search jobs" aria-pressed={showSearch} onClick={() => { setShowSearch((s) => !s); if (showSearch) setQ(""); }}
            className={`grid h-11 w-11 place-items-center rounded-full ring-1 ring-inset transition active:scale-90 ${showSearch ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-white text-slate-600 ring-slate-300"}`}><Search className="h-5 w-5" /></button>
          <button aria-label="Filters" onClick={() => { setDraft({ when, type, sort }); setSheet(true); }}
            className={`relative grid h-11 w-11 place-items-center rounded-full ring-1 ring-inset transition active:scale-90 ${applied ? "bg-[#EEF1FD] text-[#3450D8] ring-[#4361EE]/40" : "bg-white text-slate-600 ring-slate-300"}`}>
            <SlidersHorizontal className="h-5 w-5" />
            {applied ? <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-extrabold text-white ring-2 ring-[#F4F6FB]">{applied}</span> : null}
          </button>
        </div>
      </div>

      {showSearch ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, device, trip or area" className={`${inputCls} pl-12 pr-12`} />
          {q ? <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-slate-400 active:bg-slate-100"><X className="h-5 w-5" /></button> : null}
        </div>
      ) : null}

      <Segmented<Tab> label="Job status" value={tab} onChange={setTab} options={[
        { id: "new", label: "To respond", count: counts.new, alert: counts.new > 0 },
        { id: "open", label: "Open", count: counts.open },
        { id: "done", label: "Done", count: counts.done },
        { id: "rejected", label: "Rejected", count: counts.rejected },
      ]} />

      {applied ? (
        <div className="flex flex-wrap items-center gap-2">
          {when !== "any" ? <AppliedChip onRemove={() => setWhen("any")}>{WHEN_LABEL[when]}</AppliedChip> : null}
          {type !== "all" ? <AppliedChip onRemove={() => setType("all")}>{TYPE_LABEL[type]}</AppliedChip> : null}
          {sort !== "soonest" ? <AppliedChip onRemove={() => setSort("soonest")}>{SORT_LABEL[sort]}</AppliedChip> : null}
          <button onClick={() => { setWhen("any"); setType("all"); setSort("soonest"); }} className="px-1 text-[12.5px] font-bold text-slate-500 underline-offset-2 active:underline">Clear all</button>
        </div>
      ) : null}

      {loading ? <div className="space-y-3"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
        : list.length === 0 && !(tab === "rejected" && rejected.length) ? (
          <Empty icon={<Inbox className="h-7 w-7" />} title={q || applied ? "No jobs match" : tab === "new" ? "Nothing waiting for you" : "Nothing here yet"}
            body={q || applied ? "Try removing a filter or changing the search." : tab === "new" ? "New assignments show up here the moment your manager sends them." : "Jobs in this list will appear here."}
            action={applied ? <Btn tone="ghost" onClick={() => { setWhen("any"); setType("all"); setSort("soonest"); setQ(""); }}>Clear filters</Btn> : undefined} />
        ) : <div className="space-y-3.5">{list.map((t, i) => <Stagger key={t.id} i={i}><TripCard t={t} /></Stagger>)}</div>}

      {tab === "rejected" && rejected.length > 0 ? (
        <div className="space-y-2">
          <p className="px-1 pt-2 text-[12px] font-bold uppercase tracking-wider text-slate-500">Declined by you</p>
          {rejected.map((h) => (
            <div key={h.tripId + h.at} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
              <div className="flex items-center justify-between gap-2"><p className="text-[12px] font-bold text-slate-500">{h.tripNo}</p>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-700">You declined</span></div>
              <p className="mt-0.5 text-[15px] font-extrabold text-slate-800">{h.customer ?? "Customer"}</p>
              <p className="text-[12.5px] text-slate-500">{h.device}{h.reason ? ` · “${h.reason}”` : ""}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Filter jobs"
        footer={<div className="grid grid-cols-[1fr_2fr] gap-3"><Btn tone="ghost" onClick={() => setDraft({ when: "any", type: "all", sort: "soonest" })}>Reset</Btn><Btn onClick={apply}>Show jobs</Btn></div>}>
        <FormLabel>When</FormLabel>
        <ChipGroup<When> value={draft.when} onChange={(v) => setDraft((d) => ({ ...d, when: v }))} options={(Object.keys(WHEN_LABEL) as When[]).map((id) => ({ id, label: WHEN_LABEL[id] }))} />
        <div className="mt-5"><FormLabel>Job type</FormLabel></div>
        <ChipGroup<TripKind | "all"> value={draft.type} onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
          options={[{ id: "all", label: "All types" }, ...(["pickup", "buyback", "drop", "onsite", "warranty_pickup"] as TripKind[]).map((id) => ({ id, label: TYPE_LABEL[id] }))]} />
        <div className="mt-5"><FormLabel>Sort by</FormLabel></div>
        <ChipGroup<Sort> value={draft.sort} onChange={(v) => setDraft((d) => ({ ...d, sort: v }))} options={(Object.keys(SORT_LABEL) as Sort[]).map((id) => ({ id, label: SORT_LABEL[id] }))} />
        <div className="h-2" />
      </Sheet>
    </div>
  );
}

export default function JobsPage() { return <Suspense fallback={null}><Jobs /></Suspense>; }
