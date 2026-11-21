"use client";
/* Field Activity → Reviews. Who customers rate best (ranking), what they said (comments) and how the
   team rating moves (by month). Verified 5★ = from the customer link, on a trip with a ticket. */
import { useEffect, useMemo, useState } from "react";
import { MessageSquareQuote, ShieldCheck, Star, TrendingUp } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { KpiStrip, LoadError, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { Dash, FieldGrid, NameText, Sub, useFieldGrid } from "@/components/field/grid";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { fetchRoster, ymRange, type RosterNinja } from "@/lib/field-attendance-data";
import { localDateKey } from "@/lib/work-session";
import { isVerifiedFive, rankNinjas, trendByMonth, type ReviewRow } from "@/lib/field-reviews";

type View = "ranking" | "comments" | "months";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lastMonths = (ym: string, n: number) => Array.from({ length: n }, (_, i) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 - (n - 1 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
const Stars = ({ n }: { n: number }) => <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("h-4 w-4", i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-zinc-300")} />)}</span>;
const CH: Record<string, string> = { customer_link: "Customer link", manager: "Manager", ninja_app: "Ninja app (old)" };

export function ReviewsPage() {
  const a = useActivity();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [ninjas, setNinjas] = useState<RosterNinja[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("ranking");
  const months = useMemo(() => lastMonths(a.ym, 6), [a.ym]);
  useEffect(() => {
    if (!supabase) return;
    let off = false; setRows(null);
    (async () => {
      try {
        const lo = new Date(new Date(`${ymRange(months[0]).from}T00:00:00`).getTime() - 864e5).toISOString();
        const hi = new Date(new Date(`${ymRange(a.ym).to}T00:00:00`).getTime() + 2 * 864e5).toISOString();
        const [rv, ro] = await Promise.all([
          supabase!.from("field_trip_reviews").select("ninja_id,rating,channel,comment,created_at,trip:field_trips(ticket_id)").gte("created_at", lo).lt("created_at", hi).order("created_at", { ascending: false }).limit(20000),
          fetchRoster(ymRange(a.ym).from, ymRange(a.ym).to),
        ]);
        if (off) return;
        if (rv.error) throw new Error(rv.error.message);
        setNinjas(ro.ninjas);
        setRows(((rv.data ?? []) as any[]).map((r) => ({ ninjaId: r.ninja_id, rating: r.rating, channel: r.channel, comment: r.comment ?? null, at: r.created_at,
          ym: localDateKey(new Date(r.created_at).getTime(), a.tz).slice(0, 7), hasTicket: !!(Array.isArray(r.trip) ? r.trip[0] : r.trip)?.ticket_id })));
        setErr(null);
      } catch (e) { if (!off) setErr(e instanceof Error ? e.message : "Could not load reviews."); }
    })();
    return () => { off = true; };
  }, [months, a.ym, a.tz]);
  const visible = useMemo(() => new Set(ninjas.filter((n) => (!a.multiStore || matchesStoreSelection(n.branchId ?? undefined, a.storeSel)) && (!a.q || n.name.toLowerCase().includes(a.q.toLowerCase()))).map((n) => n.id)), [ninjas, a.multiStore, a.storeSel, a.q]);
  const scoped = useMemo(() => (rows ?? []).filter((r) => visible.has(r.ninjaId)), [rows, visible]);
  const rank = useMemo(() => rankNinjas(scoped, a.ym), [scoped, a.ym]);
  const trend = useMemo(() => trendByMonth(scoped, months), [scoped, months]);
  const comments = useMemo(() => scoped.filter((r) => r.ym === a.ym), [scoped, a.ym]);
  const nameOf = (id: string) => ninjas.find((n) => n.id === id)?.name ?? "Ninja";
  const key = `${view}|${a.ym}|${a.q}|${a.storeSel.join(",")}`;
  const pR = usePaged(rank, key), pC = usePaged(comments, key);
  const total = comments.length;
  const teamAvg = total ? Math.round((comments.reduce((t, r) => t + r.rating, 0) / total) * 10) / 10 : null;
  const prev = trend[trend.length - 2];
  const loading = rows == null;
  useRegisterSheets(useMemo(() => rows ? [
    { name: "Review ranking", headers: ["Rank", "Ninja", "Reviews", "Average", "5 star", "Verified 5 star", "1★", "2★", "3★", "4★", "5★"], rows: rank.map((r, i) => [i + 1, nameOf(r.ninjaId), r.count, r.avg, r.five, r.verifiedFive, ...r.dist]) },
    { name: "Comments", headers: ["Date", "Ninja", "Stars", "From", "Comment"], rows: comments.map((r) => [r.at.slice(0, 10), nameOf(r.ninjaId), r.rating, CH[r.channel] ?? r.channel, r.comment ?? ""]) },
    { name: "By month", headers: ["Month", "Reviews", "Average"], rows: trend.map((t) => [t.ym, t.count, t.avg ?? ""]) },
  ] : null, [rows, rank, comments, trend])); // eslint-disable-line react-hooks/exhaustive-deps

  const maxCount = Math.max(1, ...trend.map((t) => t.count));
  type RK = (typeof rank)[number]; type TR = (typeof trend)[number];
  const rankGrid = useFieldGrid<RK>("activity_reviews_ranking", [
    { key: "ninja", label: "Ninja", width: 240, anchor: true, render: (r) => <NameText label={nameOf(r.ninjaId)} href={`/field/activity/${r.ninjaId}?tab=trips`} /> },
    { key: "rank", label: "Rank", width: 90, cellClass: () => "font-extrabold text-muted-foreground", render: (r) => rank.indexOf(r) + 1 },
    { key: "count", label: "Reviews", width: 120, render: (r) => r.count },
    { key: "avg", label: "Average", width: 190, render: (r) => <span className="inline-flex items-center gap-1.5 font-extrabold">{r.avg.toFixed(1)}<Stars n={r.avg} /></span> },
    { key: "five", label: "5★", width: 100, render: (r) => r.five || <Dash /> },
    { key: "vfive", label: "Verified 5★", width: 140, cellClass: () => "font-semibold text-emerald-700", render: (r) => r.verifiedFive || <Dash /> },
    { key: "spread", label: "Spread 1★ → 5★", width: 220, render: (r) => <div className="mx-auto flex h-7 w-fit items-end gap-1.5">{r.dist.map((c, k) => <span key={k} title={`${k + 1}★: ${c}`} className="w-5 rounded-sm bg-amber-400/80" style={{ height: `${Math.max(10, (c / Math.max(1, r.count)) * 100)}%`, opacity: c ? 1 : 0.25 }} />)}</div> },
  ]);
  const comGrid = useFieldGrid<ReviewRow>("activity_reviews_comments", [
    { key: "ninja", label: "Ninja", width: 220, anchor: true, render: (r) => <NameText label={nameOf(r.ninjaId)} href={`/field/activity/${r.ninjaId}?tab=trips`} /> },
    { key: "date", label: "Date", width: 130, render: (r) => new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) },
    { key: "stars", label: "Stars", width: 140, render: (r) => <Stars n={r.rating} /> },
    { key: "from", label: "From", width: 160, render: (r) => <>{CH[r.channel] ?? r.channel}{isVerifiedFive(r) && <Sub className="font-bold text-emerald-700">Verified</Sub>}</> },
    { key: "comment", label: "Comment", width: 420, align: "left", cellClass: () => "truncate", render: (r) => (r.comment ? <span title={r.comment}>“{r.comment}”</span> : <span className="text-zinc-300">No comment</span>) },
  ]);
  const monGrid = useFieldGrid<TR>("activity_reviews_months", [
    { key: "month", label: "Month", width: 200, anchor: true, render: (t) => <NameText label={`${MONTHS[Number(t.ym.slice(5)) - 1]} ${t.ym.slice(0, 4)}`} /> },
    { key: "count", label: "Reviews", width: 130, render: (t) => t.count },
    { key: "avg", label: "Average", width: 190, render: (t) => (t.avg != null ? <span className="inline-flex items-center gap-1.5 font-bold">{t.avg}<Stars n={t.avg} /></span> : <Dash />) },
    { key: "bar", label: "Volume", width: 340, render: (t) => <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#4361EE]" style={{ width: `${(t.count / maxCount) * 100}%` }} /></div> },
  ]);
  const cur = view === "ranking" ? rankGrid : view === "comments" ? comGrid : monGrid;
  if (!supabase) return <Unavailable text="Reviews are available when RepairOX is connected to the database." />;
  if (err) return <LoadError what="reviews" err={err} />;
  return (
    <div className="rox-lock-fill space-y-4">
      <KpiStrip loading={loading} items={[
        { label: "Team average", value: teamAvg != null ? <span className="inline-flex items-center gap-1.5">{teamAvg}<Star className="h-5 w-5 fill-amber-400 text-amber-400" /></span> : "—", sub: prev?.avg != null && teamAvg != null ? `${teamAvg >= prev.avg ? "▲" : "▼"} ${prev.avg} last month` : "this month", icon: Star },
        { label: "Reviews this month", value: total, sub: `${rank.length} Ninja${rank.length === 1 ? "" : "s"} rated`, icon: MessageSquareQuote },
        { label: "Verified 5★", value: comments.filter(isVerifiedFive).length, sub: "count toward the review bonus", icon: ShieldCheck, tone: "good" },
        { label: "Last 6 months", value: <span className="flex h-7 items-end gap-1">{trend.map((t) => <span key={t.ym} title={`${t.ym}: ${t.count} reviews${t.avg != null ? `, ${t.avg}★` : ""}`} className={cn("w-3 rounded-sm", t.ym === a.ym ? "bg-[#4361EE]" : "bg-[#B3BFF6]")} style={{ height: `${Math.max(12, (t.count / maxCount) * 100)}%` }} />)}</span>, sub: "reviews per month", icon: TrendingUp },
      ]} />
      <ViewBar value={view} onChange={setView} options={[{ label: "Ranking", value: "ranking" }, { label: `Comments${total ? ` (${total})` : ""}`, value: "comments" }, { label: "By month", value: "months" }]}
        info="Ranking = best average first, ties by number of reviews. Verified 5★ = a 5-star review from the customer link (or a manager) on a trip that has a ticket; only these count for the review bonus.">
        {cur.menus}
      </ViewBar>

      {view === "ranking" && <><FieldGrid grid={rankGrid} rows={pR.slice} rowKey={(r) => r.ninjaId} empty={loading ? "Loading…" : rank.length ? null : "No customer reviews this month yet."} />{pR.footer("Ninja")}</>}
      {view === "comments" && <><FieldGrid grid={comGrid} rows={pC.slice} rowKey={(r, i) => `${r.at}-${i}`} empty={loading ? "Loading…" : comments.length ? null : "No reviews this month."} />{pC.footer("review")}</>}
      {view === "months" && <FieldGrid grid={monGrid} rows={[...trend].reverse()} rowKey={(t) => t.ym} rowClass={(t) => t.ym === a.ym && "[&>td]:!bg-[#EEF1FD]"} empty={loading ? "Loading…" : null} />}
    </div>
  );
}
