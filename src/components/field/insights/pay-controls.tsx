"use client";
/* Editors for Field Engineer pay: the incentive plan (company-wide or one Ninja), salary, eligible devices.
   Every change is DATED: it starts on the chosen day and never rewrites earlier days (the database also
   refuses to edit or delete anything that already started). Gate: CAP.field.payManage; RLS is the real boundary. */
import { useMemo, useState } from "react";
import { History, Plus, Trash2, Wallet, Smartphone, SlidersHorizontal } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { SegmentedTabs } from "@/components/ui/tabs";
import { DateTimeDialog } from "@/components/ui/date-time-picker";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useStoreSettings } from "@/lib/store-settings";
import { localDateKey } from "@/lib/work-session";
import { fetchRoster, ymRange } from "@/lib/field-attendance-data";
import { buildNinjaMonth } from "@/lib/field-attendance";
import { fetchPayContext, fetchPayMonth } from "@/lib/field-pay-data";
import { DEFAULT_PLAN, computeNinjaPay, describePlan, planFor, planRowFor, type DeviceListRow, type PayPlan, type PlanRow, type SalaryRow } from "@/lib/field-incentives";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDay = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
const addDays = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const friendly = (m: string) =>
  m.includes("pay_backdate_not_allowed") ? "A change can start today or later, not on a past day."
  : m.includes("pay_past_immutable") ? "That change already started, so it can't be edited. Add a new change from today instead."
  : m.includes("row-level security") ? "You don't have permission to change pay."
  : "Could not save. Please check the values.";

/** When the change starts: today, tomorrow, the 1st of next month, or any later day. */
export function EffectiveFrom({ value, onChange, today, first }: { value: string; onChange: (d: string) => void; today: string; first?: boolean }) {
  const [pick, setPick] = useState(false);
  const [y, m] = today.split("-").map(Number);
  const nextMonth = ymd(new Date(y, m, 1));
  const preset = value === today ? "today" : value === addDays(today, 1) ? "tomorrow" : value === nextMonth ? "month" : "date";
  return (
    <div>
      <SegmentedTabs size="sm" value={preset} onChange={(v) => { if (v === "today") onChange(today); else if (v === "tomorrow") onChange(addDays(today, 1)); else if (v === "month") onChange(nextMonth); else setPick(true); }}
        options={[{ label: "Today", value: "today" }, { label: "Tomorrow", value: "tomorrow" }, { label: "1st of next month", value: "month" }, { label: preset === "date" ? fmtDay(value) : "Pick a date", value: "date" }]} />
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">{first ? "This is the first entry, so it can start from an earlier date if you need it to." : `Starts ${fmtDay(value)}. Earlier days keep their current rates.`}</p>
      {pick && <DateTimeDialog title="Start date" initialIso={new Date(`${value}T09:00:00`).toISOString()} onClose={() => setPick(false)}
        onSave={(iso) => { const d = new Date(iso); const s = ymd(d); onChange(first || s >= today ? s : today); setPick(false); }} />}
    </div>
  );
}

const Num = ({ label, hint, value, onChange, suffix }: { label: string; hint?: string; value: number; onChange: (n: number) => void; suffix?: string }) => (
  <label className="block">
    <span className="mb-1 flex items-center gap-1 text-[12px] font-semibold">{label}{hint && <InfoHint content={hint} />}</span>
    <div className="relative"><Input inputMode="decimal" value={Number.isFinite(value) ? String(value) : ""} onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ""); onChange(t === "" ? 0 : Number(t)); }} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{suffix}</span>}</div>
  </label>
);
const Check = ({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (b: boolean) => void }) => (
  <label className="flex items-start gap-2.5 rounded-xl border border-border p-2.5">
    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={value} onChange={(e) => onChange(e.target.checked)} />
    <span className="text-[12.5px] font-semibold">{label}{hint && <span className="mt-0.5 block text-[11.5px] font-normal text-muted-foreground">{hint}</span>}</span>
  </label>
);
function Tiers<T extends Record<string, number>>({ rows, fields, onChange, make }: { rows: T[]; fields: { key: keyof T & string; label: string }[]; onChange: (r: T[]) => void; make: () => T }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-end gap-2">
          {fields.map((f) => (
            <label key={f.key} className="min-w-0 flex-1"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{f.label}</span>
              <Input inputMode="decimal" value={String(r[f.key])} onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ""); onChange(rows.map((x, j) => (j === i ? { ...x, [f.key]: t === "" ? 0 : Number(t) } : x))); }} /></label>
          ))}
          <button type="button" aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="mb-0.5 grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:border-rose-300 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, make()])} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE]"><Plus className="h-3.5 w-3.5" />Add a row</button>
    </div>
  );
}
const H = ({ children }: { children: React.ReactNode }) => <p className="mb-2 mt-5 border-b border-border pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground first:mt-0">{children}</p>;

/** "What would this change?": re-runs a month with the draft plan as if it had applied all month, next to what was actually earned. */
function ImpactPreview({ scope, draft }: { scope: { staffId: string | null }; draft: PayPlan }) {
  const tz = useStoreSettings().settings.timeZone;
  const today = localDateKey(Date.now(), tz);
  const opts = useMemo(() => Array.from({ length: 3 }, (_, i) => { const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1); const v = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; return { value: v, label: i === 0 ? `This month so far (${v})` : v }; }), [today]);
  const [ym, setYm] = useState(opts[1].value);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<null | { name: string; now: number; next: number }[]>(null);
  const [note, setNote] = useState("");
  async function run() {
    setBusy(true); setOut(null);
    try {
      const r = ymRange(ym);
      const [roster, ctx, pay] = await Promise.all([fetchRoster(r.from, r.to), fetchPayContext(), fetchPayMonth(ym, tz)]);
      const nowMs = Date.now();
      const sim: PlanRow[] = [...ctx.plans.filter((p) => p.staffId !== scope.staffId), { staffId: scope.staffId, effectiveFrom: r.from, config: draft }];
      const own = new Set(ctx.plans.filter((p) => p.staffId).map((p) => p.staffId));
      const ninjas = roster.ninjas.filter((n) => n.status !== "inactive" && (scope.staffId ? n.id === scope.staffId : true));
      const rows = ninjas.map((n) => {
        const month = buildNinjaMonth({ staffId: n.id, ym, tz, nowMs, sessions: roster.sessions, logs: roster.logs, marks: roster.marks, weeklyOff: roster.weeklyOff.get(n.id) ?? null, policy: roster.policy });
        const base = { staffId: n.id, ym, tz, nowMs, month, trips: pay.trips, reviews: pay.reviews, salaries: ctx.salaries, deviceLists: ctx.deviceLists, organicLeads: pay.leads.get(n.id) ?? 0, adjustments: pay.adjustments.get(n.id) ?? [] };
        return { name: n.name, now: computeNinjaPay({ ...base, plans: ctx.plans }).total, next: computeNinjaPay({ ...base, plans: sim }).total };
      });
      setOut(rows);
      const skipped = !scope.staffId ? ninjas.filter((n) => own.has(n.id)).length : 0;
      setNote(skipped ? `${skipped} Ninja${skipped === 1 ? " has" : "s have"} their own plan and ${skipped === 1 ? "is" : "are"} not affected by the company plan.` : "");
    } catch { toast.error("Could not run the preview."); }
    setBusy(false);
  }
  const total = out ? out.reduce((a, x) => a + (x.next - x.now), 0) : 0;
  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[12px] font-bold">What would this change?</p>
        <div className="w-[210px]"><Select className="h-[34px]" value={ym} onChange={(e) => { setYm(e.target.value); setOut(null); }} options={opts} /></div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>{busy ? "Calculating…" : "Preview"}</Button>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">Re-runs that month as if these rules had applied to the whole month. Nothing is saved.</p>
      {out && (
        <div className="mt-3">
          <p className={cn("text-[14px] font-extrabold", total > 0 ? "text-amber-700" : total < 0 ? "text-emerald-700" : "text-muted-foreground")}>{total === 0 ? "No change in pay" : `${total > 0 ? "+" : "−"}${inr(Math.abs(total))} in total (${total > 0 ? "costs more" : "costs less"})`}</p>
          <div className="mt-2 max-h-[220px] overflow-auto rounded-lg border border-border">
            <table className="w-full text-[12.5px]"><thead className="bg-[#EEF1FD] text-[10.5px] font-bold uppercase tracking-wider text-[#4361EE]"><tr><th className="px-2.5 py-1.5 text-left">Ninja</th><th className="px-2.5 py-1.5 text-right">Earned</th><th className="px-2.5 py-1.5 text-right">With new rules</th><th className="px-2.5 py-1.5 text-right">Difference</th></tr></thead>
              <tbody>{out.map((x) => <tr key={x.name} className="border-t border-border"><td className="px-2.5 py-1.5 font-semibold">{x.name}</td><td className="px-2.5 py-1.5 text-right tabular-nums">{inr(x.now)}</td><td className="px-2.5 py-1.5 text-right tabular-nums">{inr(x.next)}</td><td className={cn("px-2.5 py-1.5 text-right font-semibold tabular-nums", x.next - x.now > 0 ? "text-amber-700" : x.next - x.now < 0 ? "text-emerald-700" : "text-muted-foreground")}>{x.next === x.now ? "—" : `${x.next > x.now ? "+" : "−"}${inr(Math.abs(x.next - x.now))}`}</td></tr>)}</tbody></table>
          </div>
          {note && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{note}</p>}
        </div>
      )}
    </div>
  );
}

export function PlanDialog({ scope, today, plans, onClose, onSaved }: {
  scope: { staffId: string | null; name?: string }; today: string; plans: PlanRow[]; onClose: () => void; onSaved: () => void;
}) {
  const rows = useMemo(() => plans.filter((p) => p.staffId === scope.staffId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)), [plans, scope.staffId]);
  const first = rows.length === 0 && scope.staffId == null;
  const current = scope.staffId ? planFor(plans, scope.staffId, today) : planFor(plans, "__none__", today);
  const [p, setP] = useState<PayPlan>({ ...DEFAULT_PLAN, ...current });
  const [from, setFrom] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PayPlan>(k: K, v: PayPlan[K]) => setP((x) => ({ ...x, [k]: v }));
  async function save(config: Partial<PayPlan> & { useCompany?: boolean }) {
    if (!supabase) return;
    setBusy(true);
    const existing = rows.find((r) => r.effectiveFrom === from);
    const body = { config, note: note.trim() || null };
    const { error } = existing?.id
      ? await supabase.from("field_incentive_plans").update({ ...body, effective_from: from }).eq("id", existing.id)
      : await supabase.from("field_incentive_plans").insert({ staff_id: scope.staffId, effective_from: from, ...body });
    setBusy(false);
    if (error) toast.error(friendly(error.message)); else { toast.success(`Saved. Applies from ${fmtDay(from)}.`); onSaved(); }
  }
  async function cancel(id?: string) {
    if (!supabase || !id) return;
    const { error } = await supabase.from("field_incentive_plans").delete().eq("id", id);
    if (error) toast.error(friendly(error.message)); else { toast.success("Change cancelled."); onSaved(); }
  }
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-3xl" icon={SlidersHorizontal}
      title={scope.staffId ? `Incentive plan · ${scope.name ?? "Ninja"}` : "Incentive plan · everyone"}
      subtitle={scope.staffId ? "Applies to this Ninja only, instead of the company plan" : "The company plan every Ninja follows unless they have their own"}
      footer={<>
        {scope.staffId && <Button variant="outline" disabled={busy} onClick={() => void save({ useCompany: true })}>Back to company plan</Button>}
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button disabled={busy} onClick={() => void save(p)}>Save from {fmtDay(from)}</Button>
      </>}>
      <div className="rounded-xl bg-[#EEF1FD] p-3.5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">When does this start?</p>
        <EffectiveFrom value={from} onChange={setFrom} today={today} first={first} />
        <Input className="mt-3" placeholder="Why this change? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <H>Daily trips (days are counted, not trips)</H>
      <Tiers rows={p.dailyTiers} fields={[{ key: "minTrips", label: "Trips in a day, at least" }, { key: "amount", label: "Pay for that day (₹)" }]} onChange={(r) => set("dailyTiers", r)} make={() => ({ minTrips: 0, amount: 0 })} />
      <H>Monthly target</H>
      <div className="grid grid-cols-2 gap-3">
        <Num label="Minimum trips in the month" hint="Below this, no incentive is paid except petrol." value={p.monthlyMinTrips} onChange={(n) => set("monthlyMinTrips", n)} />
        <Num label="Verified reviews needed for slab pay" hint="0 = not required. Your sheet says the slab is paid only if the review is completed successfully; set the number of verified 5★ reviews that means." value={p.slabMinReviews} onChange={(n) => set("slabMinReviews", n)} />
      </div>
      <p className="mb-1 mt-3 text-[12px] font-semibold">Slabs: each trip above the number earns the rate</p>
      <Tiers rows={p.slabs} fields={[{ key: "above", label: "Trips above" }, { key: "rate", label: "₹ per trip" }]} onChange={(r) => set("slabs", r)} make={() => ({ above: 0, rate: 0 })} />
      <H>Long distance trips count as several trips</H>
      <Check label="Count long trips as extra trips" value={p.distanceEnabled} onChange={(b) => set("distanceEnabled", b)} hint="Uses the straight-line distance between the store and the customer × the road factor, one way." />
      {p.distanceEnabled && <>
        <div className="mt-3"><Tiers rows={p.distanceTiers} fields={[{ key: "upToKm", label: "One-way km, up to" }, { key: "trips", label: "Counts as trips" }]} onChange={(r) => set("distanceTiers", r)} make={() => ({ upToKm: 0, trips: 1 })} /></div>
        <div className="mt-3 grid grid-cols-2 gap-3"><Num label="Tolerance (± km)" value={p.distanceToleranceKm} onChange={(n) => set("distanceToleranceKm", n)} /><Num label="Road factor" hint="Road distance is usually about 1.3× the straight line." value={p.roadFactor} onChange={(n) => set("roadFactor", n)} /></div>
      </>}
      <H>Reviews (verified 5★ in the month, flat amount)</H>
      <Tiers rows={p.reviewTiers} fields={[{ key: "min", label: "Reviews, at least" }, { key: "amount", label: "Bonus (₹)" }]} onChange={(r) => set("reviewTiers", r)} make={() => ({ min: 0, amount: 0 })} />
      <H>Latest devices (per device repair, on the Cluster Manager's list)</H>
      <div className="grid grid-cols-3 gap-3">
        <Num label="MacBook (₹)" value={p.macbookPerRepair} onChange={(n) => set("macbookPerRepair", n)} />
        <Num label="iPhone (₹)" value={p.iphonePerRepair} onChange={(n) => set("iphonePerRepair", n)} />
        <Num label="iPhone above model" hint="Used only until a device list is entered." value={p.iphoneAboveModel} onChange={(n) => set("iphoneAboveModel", n)} />
      </div>
      <H>Organic billed leads (per lead)</H>
      <Tiers rows={p.leadTiers} fields={[{ key: "min", label: "Leads, at least" }, { key: "perLead", label: "₹ per lead" }]} onChange={(r) => set("leadTiers", r)} make={() => ({ min: 0, perLead: 0 })} />
      <div className="mt-3 max-w-[200px]"><Num label="Gift at this many leads" value={p.leadGiftAt} onChange={(n) => set("leadGiftAt", n)} /></div>
      <H>Petrol, Sunday and leave</H>
      <div className="grid grid-cols-3 gap-3">
        <Num label="Petrol (₹ per km)" value={p.petrolPerKm} onChange={(n) => set("petrolPerKm", n)} />
        <Num label="Sunday bonus (₹)" value={p.sundayBonus} onChange={(n) => set("sundayBonus", n)} />
        <Num label="Half day pays" hint="1 = full day, 0.5 = half." value={p.halfDayFactor} onChange={(n) => set("halfDayFactor", n)} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Check label="Sunday needs no absence in the month" value={p.sundayNeedsNoAbsent} onChange={(b) => set("sundayNeedsNoAbsent", b)} />
        <Check label="Sunday replaces the 6+/9+ daily bonus" value={p.sundayReplacesDaily} onChange={(b) => set("sundayReplacesDaily", b)} />
      </div>
      <div className="mt-3 max-w-[200px]"><Num label="Casual leave notice (days)" hint="Requests sent later than this are flagged to the manager." value={p.casualNoticeDays} onChange={(n) => set("casualNoticeDays", n)} /></div>

      <H>Impact</H>
      <ImpactPreview scope={scope} draft={p} />
      <H>History</H>
      {rows.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No saved plan yet. The built-in defaults from your sheet are used until you save one.</p> : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold">From {fmtDay(r.effectiveFrom)}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold", r.effectiveFrom > today ? "bg-amber-100 text-amber-800" : r.effectiveFrom === today ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600")}>{r.effectiveFrom > today ? "Scheduled" : r.effectiveFrom === today ? "Today" : "Active / past"}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{(r.config as { useCompany?: boolean }).useCompany ? "Back to company plan" : r.note ?? ""}</span>
              {r.effectiveFrom >= today && <button onClick={() => void cancel(r.id)} className="text-[11.5px] font-semibold text-rose-600 hover:underline">Cancel</button>}
            </div>
          ))}
        </div>
      )}
      <details className="mt-4 rounded-xl border border-border p-3"><summary className="cursor-pointer text-[12px] font-semibold">How this plan reads to a Ninja</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-muted-foreground">{describePlan(p).map((l, i) => <li key={i}>{l}</li>)}</ul></details>
    </RoxCenteredForm>
  );
}

export function SalaryDialog({ ninja, today, salaries, onClose, onSaved }: {
  ninja: { id: string; name: string }; today: string; salaries: SalaryRow[]; onClose: () => void; onSaved: () => void;
}) {
  const rows = useMemo(() => salaries.filter((s) => s.staffId === ninja.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)), [salaries, ninja.id]);
  const nowRow = rows.find((r) => r.effectiveFrom <= today);
  const [amount, setAmount] = useState(nowRow ? String(nowRow.monthlySalary) : "");
  const [from, setFrom] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!supabase) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0 || amount === "") { toast.error("Enter the monthly salary."); return; }
    setBusy(true);
    const existing = rows.find((r) => r.effectiveFrom === from);
    const { error } = existing?.id
      ? await supabase.from("field_pay_salary").update({ monthly_salary: n, note: note.trim() || null }).eq("id", existing.id)
      : await supabase.from("field_pay_salary").insert({ staff_id: ninja.id, effective_from: from, monthly_salary: n, note: note.trim() || null });
    setBusy(false);
    if (error) toast.error(friendly(error.message)); else { toast.success(`Salary saved. Applies from ${fmtDay(from)}.`); onSaved(); }
  }
  async function cancel(id?: string) {
    if (!supabase || !id) return;
    const { error } = await supabase.from("field_pay_salary").delete().eq("id", id);
    if (error) toast.error(friendly(error.message)); else { toast.success("Change cancelled."); onSaved(); }
  }
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-lg" icon={Wallet} title={`Salary · ${ninja.name}`} subtitle="Monthly basic salary. A change starts on its date; earlier days keep the old salary."
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={busy} onClick={() => void save()}>Save from {fmtDay(from)}</Button></>}>
      <div className="rounded-xl bg-[#EEF1FD] p-3.5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">When does this start?</p>
        <EffectiveFrom value={from} onChange={setFrom} today={today} first={rows.length === 0} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Num label="Monthly salary (₹)" value={Number(amount) || 0} onChange={(n) => setAmount(String(n))} />
        <label className="block"><span className="mb-1 block text-[12px] font-semibold">Note</span><Input placeholder="e.g. Appraisal" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">History</p>
      {rows.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No salary set yet.</p> : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
              <span className="w-[110px] font-semibold">From {fmtDay(r.effectiveFrom)}</span>
              <span className="font-bold tabular-nums">{inr(r.monthlySalary)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.note ?? ""}</span>
              {r.effectiveFrom > today && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Scheduled</span>}
              {r.effectiveFrom >= today && <button onClick={() => void cancel(r.id)} className="text-[11.5px] font-semibold text-rose-600 hover:underline">Cancel</button>}
            </div>
          ))}
        </div>
      )}
    </RoxCenteredForm>
  );
}

export function DevicesDialog({ today, lists, onClose, onSaved }: { today: string; lists: DeviceListRow[]; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<"macbook" | "iphone">("macbook");
  const [pattern, setPattern] = useState("");
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!supabase || !pattern.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("field_incentive_device_lists").insert({ kind, pattern: pattern.trim(), valid_from: today, valid_until: addDays(today, Math.max(1, Number(days) || 90)) });
    setBusy(false);
    if (error) toast.error(friendly(error.message)); else { toast.success("Added."); setPattern(""); onSaved(); }
  }
  async function del(id?: string) { if (!supabase || !id) return; const { error } = await supabase.from("field_incentive_device_lists").delete().eq("id", id); if (error) toast.error(friendly(error.message)); else onSaved(); }
  const sorted = [...lists].sort((a, b) => b.validUntil.localeCompare(a.validUntil));
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-xl" icon={Smartphone} title="Eligible devices" subtitle="The Cluster Manager's list. Each entry is valid for 90 days from the day it is added."
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="grid grid-cols-[130px_1fr_90px_auto] items-end gap-2">
        <label className="block"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Type</span><Select className="h-[38px]" value={kind} onChange={(e) => setKind(e.target.value as "macbook" | "iphone")} options={[{ label: "MacBook", value: "macbook" }, { label: "iPhone", value: "iphone" }]} /></label>
        <label className="block"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Model text (e.g. A2337, MacBook Air M1, iPhone 15)</span><Input value={pattern} onChange={(e) => setPattern(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Valid days</span><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></label>
        <Button disabled={busy || !pattern.trim()} onClick={() => void add()}>Add</Button>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">A device counts when its name contains this text. Until a list is entered for a type, the plain rule is used (any MacBook / iPhone above the model in the plan).</p>
      <div className="mt-4 divide-y divide-border rounded-xl border border-border">
        {sorted.length === 0 && <p className="p-4 text-center text-[12.5px] text-muted-foreground">No devices listed yet.</p>}
        {sorted.map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
            <span className="w-[70px] font-semibold capitalize">{l.kind}</span><span className="min-w-0 flex-1 truncate font-medium">{l.pattern}</span>
            <span className={cn("text-[11.5px]", l.validUntil < today ? "font-semibold text-rose-600" : "text-muted-foreground")}>{l.validUntil < today ? "Expired " : "Until "}{fmtDay(l.validUntil)}</span>
            <button onClick={() => void del(l.id)} aria-label="Remove" className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </RoxCenteredForm>
  );
}

export { planRowFor };
