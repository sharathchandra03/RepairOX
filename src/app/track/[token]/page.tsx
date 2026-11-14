"use client";
/* Public customer tracking page — no login. Data comes ONLY from the
   restricted /api/track/:token response. Polls every 15s. */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Clock, MapPin, Phone, Radio, ShieldCheck, Smartphone } from "lucide-react";

interface Step { key: string; label: string; at: string | null; done: boolean; current?: boolean }
interface Data {
  ok: true; ref: string | null; device: string | null; customer: string | null; kind: "onsite" | "pickup_drop";
  store: { name: string | null; phone: string | null }; steps: Step[]; cancelled: boolean;
  scheduled: { at: string | null; window: string | null } | null;
  live: { lat: number; lng: number; at: string; partner: string | null } | null; updatedAt: string;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
function ago(iso: string) { const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; }

export default function TrackPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/track/${token}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) { setErr(j.error ?? "Tracking unavailable."); return; }
      setErr(null); setData(j as Data);
    } catch { /* keep last good data; retry on next tick */ }
  }, [token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const current = data?.steps.find((s) => s.current) ?? null;
  const last = data ? [...data.steps].reverse().find((s) => s.done) : null;
  const bbox = data?.live ? `${data.live.lng - 0.008},${data.live.lat - 0.005},${data.live.lng + 0.008},${data.live.lat + 0.005}` : "";

  return (
    <div className="min-h-[100dvh] bg-[#F4F6FB] text-slate-900">
      <div className="mx-auto max-w-lg px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))]">
        <header className="flex items-center gap-2.5 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#4361EE] text-[15px] font-extrabold text-white">R</span>
          <div className="leading-tight"><p className="text-[15px] font-extrabold">{data?.store.name ?? "RepairOX"}</p><p className="text-[11px] font-semibold text-slate-400">Service tracking</p></div>
        </header>

        {err ? (
          <div className="mt-6 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-[16px] font-extrabold">Link not available</p>
            <p className="mt-1 text-[13px] text-slate-500">{err}</p>
          </div>
        ) : !data ? (
          <div className="mt-4 space-y-3"><div className="h-40 animate-pulse rounded-3xl bg-slate-200/70" /><div className="h-72 animate-pulse rounded-3xl bg-slate-200/70" /></div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1E2A78] via-[#2F46C4] to-[#4361EE] p-5 text-white shadow-[0_24px_50px_-24px_rgba(47,70,196,0.9)]">
              <div className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
              <p className="relative text-[12px] font-bold uppercase tracking-wider text-white/70">{data.customer ? `Hi ${data.customer}, ` : ""}your service status</p>
              <p className="relative mt-2 font-display text-[24px] font-extrabold leading-tight">{data.cancelled ? "Request cancelled" : current ? current.label : last?.label ?? "In progress"}</p>
              <div className="relative mt-4 flex flex-wrap gap-2 text-[12px] font-bold">
                {data.device ? <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/20"><Smartphone className="h-3.5 w-3.5" />{data.device}</span> : null}
                {data.ref ? <span className="rounded-full bg-white/15 px-3 py-1.5 ring-1 ring-white/20">Ref {data.ref}</span> : null}
                {data.scheduled?.at ? <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[#2F46C4]"><Clock className="h-3.5 w-3.5" />{fmt(data.scheduled.at)}</span> : null}
              </div>
            </section>

            {data.live ? (
              <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="flex items-center gap-2 text-[14px] font-extrabold"><Radio className="h-4 w-4 text-emerald-600" />{data.live.partner ? `${data.live.partner} is on the way` : "Partner on the way"}</p>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Updated {ago(data.live.at)}</span>
                </div>
                <iframe title="Live location" className="pointer-events-none h-56 w-full"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${data.live.lat},${data.live.lng}`} />
              </section>
            ) : null}

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="mb-4 text-[12px] font-bold uppercase tracking-wider text-slate-400">Progress</p>
              <ol>
                {data.steps.map((s, i) => (
                  <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < data.steps.length - 1 ? <span className={`absolute left-[13px] top-7 h-[calc(100%-20px)] w-0.5 ${s.done ? "bg-[#4361EE]" : "bg-slate-200"}`} /> : null}
                    <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ${s.done ? "bg-[#4361EE] text-white" : s.current ? "bg-white text-[#4361EE] ring-2 ring-[#4361EE]" : "bg-slate-100 text-slate-300"}`}>
                      {s.done ? <Check className="h-4 w-4" strokeWidth={3} /> : <span className={`h-2 w-2 rounded-full ${s.current ? "animate-pulse bg-[#4361EE]" : "bg-current"}`} />}
                    </span>
                    <div className="pt-0.5">
                      <p className={`text-[14.5px] font-bold ${s.done || s.current ? "text-slate-900" : "text-slate-400"}`}>{s.label}</p>
                      {s.done && s.at ? <p className="text-[12px] text-slate-500">{fmt(s.at)}</p> : s.current ? <p className="text-[12px] font-semibold text-[#4361EE]">Up next</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {data.store.phone ? (
              <a href={`tel:${data.store.phone}`} className="flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-[#4361EE] text-[15px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(67,97,238,0.8)]"><Phone className="h-5 w-5" />Call {data.store.name ?? "the store"}</a>
            ) : null}
            <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] text-slate-400"><MapPin className="h-3.5 w-3.5" />Live location is shown only while your partner is travelling to you.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
