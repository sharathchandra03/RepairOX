"use client";
/* Assignment card. One clear hierarchy: WHAT (type + when) → WHO (customer, device) → WHERE →
   HOW FAR ALONG (progress) → WHAT NEXT. A brand-new assignment answers itself on the card:
   Decline / Accept with the accept countdown, so responding never needs an extra screen. */
import Link from "next/link";
import { memo, useState } from "react";
import { CheckCircle2, ChevronRight, Clock, MapPin, PackageCheck, PackageOpen, Smartphone, Wrench, XCircle } from "lucide-react";
import { type NinjaTrip, type TripType, TYPE_LABEL, STATUS_META, whenLabel, nextStep, stepperFor, statusRank } from "@/lib/ninja/model";
import { useNinja } from "@/lib/ninja/ninja-context";
import { AcceptTicket } from "./accept-ticket";
import { RejectSheet } from "./flows";
import { TONE } from "./ui";

export const TYPE_STYLE: Record<TripType, { stripe: string; tile: string; chip: string; icon: typeof PackageCheck }> = {
  pickup: { stripe: "from-[#4361EE] to-[#7C93FF]", tile: "bg-[#EEF1FD] text-[#4361EE]", chip: "bg-[#EEF1FD] text-[#3450D8]", icon: PackageOpen },
  drop: { stripe: "from-emerald-500 to-teal-400", tile: "bg-emerald-50 text-emerald-600", chip: "bg-emerald-50 text-emerald-700", icon: PackageCheck },
  onsite: { stripe: "from-violet-500 to-fuchsia-400", tile: "bg-violet-50 text-violet-600", chip: "bg-violet-50 text-violet-700", icon: Wrench },
  warranty_pickup: { stripe: "from-amber-500 to-orange-400", tile: "bg-amber-50 text-amber-600", chip: "bg-amber-50 text-amber-700", icon: PackageOpen },
};

const DOT: Record<string, string> = { blue: "bg-[#4361EE]", amber: "bg-amber-500", green: "bg-emerald-500", rose: "bg-rose-500", slate: "bg-slate-400", violet: "bg-violet-500", sky: "bg-sky-500" };

function Progress({ t }: { t: NinjaTrip }) {
  const steps = stepperFor(t);
  const cur = statusRank(t.status);
  const reached = steps.filter((s) => statusRank(s.key) <= cur).length;
  return (
    <div className="mt-3" aria-label={`Step ${reached} of ${steps.length}`}>
      <div className="flex gap-1">
        {steps.map((s, i) => <span key={s.key} className={`h-1.5 flex-1 rounded-full ${i < reached ? "bg-[#4361EE]" : "bg-slate-200"}`} />)}
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">Step {Math.max(1, reached)} of {steps.length}</p>
    </div>
  );
}

function TripCardBase({ t, highlight }: { t: NinjaTrip; highlight?: boolean }) {
  const { accept, track } = useNinja();
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(false);
  const st = TYPE_STYLE[t.trip_type];
  const Icon = st.icon;
  const meta = STATUS_META[t.status];
  const step = nextStep(t);
  const isNewAssign = t.status === "assigned";
  const running = !["assigned", "awaiting_assignment", "accepted", "completed"].includes(t.status) && step !== null;
  const where = [t.job?.pincode, t.dest_address].filter(Boolean).join(" · ") || "No address yet";
  const cta = step && step.kind !== "wait" ? step.label : step?.kind === "wait" ? "Waiting for store" : null;

  return (
    <article className={`min-w-0 overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(20,30,80,0.05),0_16px_32px_-22px_rgba(20,30,80,0.4)] ring-1 transition ${highlight || isNewAssign ? "ring-[#4361EE]/35" : "ring-slate-200/80"}`}>
      <Link href={`/ninja/trip/${t.id}`} prefetch onClick={() => track({ kind: "trip_opened", tripId: t.id, jobId: t.job_id, screen: "jobs", payload: { status: t.status } })}
        className="block p-4 pb-3 transition active:bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${st.chip}`}><Icon className="h-3.5 w-3.5" />{TYPE_LABEL[t.trip_type]}</span>
          <span className="flex min-w-0 items-center gap-1 text-[12.5px] font-bold text-slate-700"><Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{whenLabel(t.scheduled_at, t.scheduled_window)}</span></span>
        </div>
        <p className="mt-3 truncate text-[19px] font-extrabold leading-tight tracking-tight text-slate-900">{t.job?.customer || "Customer"}</p>
        <div className="mt-1.5 space-y-1 text-[13px] font-medium text-slate-500">
          <p className="flex items-center gap-2 truncate"><Smartphone className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{t.job?.device || "Device"}</span></p>
          <p className="flex items-center gap-2 truncate"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{where}</span></p>
        </div>
        {running ? <Progress t={t} /> : null}
        {!isNewAssign ? (
          <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-bold text-slate-700"><span className={`h-2 w-2 shrink-0 rounded-full ${DOT[meta.tone]}`} /><span className="truncate">{meta.label}</span></span>
            {cta ? <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-extrabold text-[#4361EE]">{cta}<ChevronRight className="h-4 w-4" /></span> : null}
          </div>
        ) : null}
        <span className="hidden">{TONE.blue}</span>
      </Link>
      {isNewAssign ? (
        <div className="space-y-3 border-t border-dashed border-slate-200 bg-[#F8F9FF] p-3">
          <AcceptTicket t={t} compact />
          <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
            <button onClick={() => setReject(true)} className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl bg-white text-[14px] font-bold text-slate-700 ring-1 ring-inset ring-slate-300 transition active:bg-slate-50"><XCircle className="h-5 w-5" />Decline</button>
            <button disabled={busy} onClick={async () => { setBusy(true); await accept(t); setBusy(false); }}
              className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 text-[14.5px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(5,150,105,0.7)] transition active:bg-emerald-700 disabled:opacity-60">
              {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <CheckCircle2 className="h-5 w-5" />}Accept
            </button>
          </div>
          <RejectSheet t={t} open={reject} onClose={() => setReject(false)} />
        </div>
      ) : null}
    </article>
  );
}
export const TripCard = memo(TripCardBase, (a, b) => a.t === b.t && a.highlight === b.highlight);
