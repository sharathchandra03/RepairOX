"use client";
import Link from "next/link";
import { memo } from "react";
import { ArrowUpRight, Clock, MapPin, PackageCheck, PackageOpen, Smartphone, Wrench, Zap } from "lucide-react";
import { type NinjaTrip, type TripType, TYPE_LABEL, whenLabel, nextStep } from "@/lib/ninja/model";
import { StatusPill } from "./ui";

export const TYPE_STYLE: Record<TripType, { stripe: string; tile: string; icon: typeof PackageCheck }> = {
  pickup: { stripe: "from-[#4361EE] to-[#7C93FF]", tile: "bg-[#EEF1FD] text-[#4361EE]", icon: PackageOpen },
  drop: { stripe: "from-emerald-500 to-teal-400", tile: "bg-emerald-50 text-emerald-600", icon: PackageCheck },
  onsite: { stripe: "from-violet-500 to-fuchsia-400", tile: "bg-violet-50 text-violet-600", icon: Wrench },
  warranty_pickup: { stripe: "from-amber-500 to-orange-400", tile: "bg-amber-50 text-amber-600", icon: PackageOpen },
};

function TripCardBase({ t, highlight }: { t: NinjaTrip; highlight?: boolean }) {
  const step = nextStep(t);
  const st = TYPE_STYLE[t.trip_type];
  const Icon = st.icon;
  const cta = t.status === "assigned" ? "Review & respond" : step && step.kind !== "wait" ? step.label : null;
  return (
    <Link href={`/ninja/trip/${t.id}`} prefetch className="group block">
      <article className={`relative min-w-0 overflow-hidden rounded-3xl border bg-white p-4 pl-5 shadow-[0_1px_2px_rgba(20,30,80,0.04),0_14px_30px_-20px_rgba(20,30,80,0.35)] transition duration-200 active:scale-[0.985] ${highlight ? "border-[#4361EE]/40 ring-2 ring-[#4361EE]/15" : "border-slate-200/80"}`}>
        <span className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${st.stripe}`} />
        <div className="flex items-start gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${st.tile}`}><Icon className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{TYPE_LABEL[t.trip_type]} · {t.trip_no}</p>
              {t.status === "assigned" ? <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800"><Zap className="h-3 w-3" />NEW</span> : null}
            </div>
            <p className="mt-0.5 truncate text-[18px] font-extrabold leading-tight tracking-tight text-slate-900">{t.job?.customer || "Customer"}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-medium text-slate-500"><Smartphone className="h-3.5 w-3.5 shrink-0" />{t.job?.device || "Device"}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] font-semibold text-slate-600">
          <span className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2"><Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{whenLabel(t.scheduled_at, t.scheduled_window)}</span></span>
          <span className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{t.job?.pincode || t.dest_address || "No address"}</span></span>
        </div>
        <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
          <StatusPill status={t.status} />
          {cta ? <span className="flex min-w-0 items-center justify-end gap-1 text-[13px] font-extrabold text-[#4361EE]"><span className="truncate">{cta}</span><ArrowUpRight className="h-4 w-4 shrink-0" /></span> : null}
        </div>
      </article>
    </Link>
  );
}
export const TripCard = memo(TripCardBase, (a, b) => a.t === b.t && a.highlight === b.highlight);
