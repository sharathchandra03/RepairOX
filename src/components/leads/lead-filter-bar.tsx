"use client";
/* ──────────────────────────────────────────────────────────────────────────
   LEAD FILTER BAR — inline, live, plain-language filters for the Lead Table.

   Replaces the old slide-over drawer. It sits ABOVE the table (never covering
   it), and every tap updates the table immediately — no draft, no Apply.
     1. QUICK FILTERS  — one-tap questions a salesperson actually asks
        ("My leads", "Follow-up overdue", "Not assigned yet", …) with live counts.
     2. NARROW DOWN    — friendly dropdowns (Sales agent, Call status, Source …).
        Pick several values at once; counts reflect all OTHER active filters.
     3. SAVED VIEWS    — name a combination once, reuse it with one click
        (per user, stored on this device).
   Purely presentational over LeadFilters; the model + matching live in
   lib/leads-data.ts (applyLeadFilters), so the table, counts and exports agree.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import {
  Search, X, Check, ChevronDown, ChevronLeft, ChevronRight, Bookmark, Trash2, Plus, UserRound, UserX, Clock, CalendarClock, BellOff, Percent,
  Hourglass, Mail, IndianRupee, Phone, MapPin, Globe, BadgeCheck, Flame, Smartphone, Wrench, Truck, Users, MessageCircle, Flag, Sparkles, ListFilter,
} from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import {
  applyLeadFilters, fieldValuesOf, joinFieldValues, hasActiveLeadFilters,
  type Lead, type LeadFilters, type LeadFilterField, type LeadFollowUp,
} from "@/lib/leads-data";

export type FacetDef = { key: LeadFilterField; label: string; options: { label: string; value: string }[] };
type SetFilters = (u: LeadFilters | ((p: LeadFilters) => LeadFilters)) => void;
type Chip = { label: string; value: string; onClear: () => void };

type Icon = React.ComponentType<{ className?: string }>;
const FRIENDLY: Partial<Record<LeadFilterField, string>> = {
  assignedTo: "Sales agent", followUpAgentId: "Follow-up agent", contactStatus: "Call status", source: "Lead source",
  region: "Region", qualification: "Qualified or not", modeOfContact: "How they contacted", subCategory: "Sub category",
  result: "Latest result", finalResult: "Final outcome", device: "Device", category: "Repair category", fulfilmentRoute: "Visit type",
  priority: "Priority",
};
const labelOf = (d: FacetDef) => FRIENDLY[d.key] ?? d.label;

/* "Add a filter" menu — grouped by what the user is thinking about, not by field name. */
const GROUPS: { title: string; items: { key: LeadFilterField | "value" | "email"; icon: Icon; hint: string }[] }[] = [
  { title: "People", items: [
    { key: "assignedTo", icon: UserRound, hint: "Who owns the lead" },
    { key: "followUpAgentId", icon: Users, hint: "Who will follow up" },
  ] },
  { title: "Where it came from", items: [
    { key: "source", icon: Globe, hint: "Google, Meta, walk-in…" },
    { key: "region", icon: MapPin, hint: "City or area" },
    { key: "modeOfContact", icon: MessageCircle, hint: "Call, chat, email…" },
  ] },
  { title: "How it is going", items: [
    { key: "contactStatus", icon: Phone, hint: "Reached, no answer…" },
    { key: "qualification", icon: BadgeCheck, hint: "Qualified or not" },
    { key: "leadNature", icon: Flame, hint: "How interested they are" },
    { key: "priority", icon: Flag, hint: "Lead priority" },
    { key: "result", icon: Sparkles, hint: "Latest outcome" },
    { key: "finalResult", icon: BadgeCheck, hint: "Final outcome" },
  ] },
  { title: "Device & repair", items: [
    { key: "device", icon: Smartphone, hint: "Phone or laptop model" },
    { key: "category", icon: Wrench, hint: "Type of repair" },
    { key: "subCategory", icon: Wrench, hint: "More specific repair" },
    { key: "fulfilmentRoute", icon: Truck, hint: "Walk-in, pickup, on-site" },
  ] },
  { title: "Money & contact", items: [
    { key: "value", icon: IndianRupee, hint: "Estimated lead value" },
    { key: "email", icon: Mail, hint: "Has an email or not" },
  ] },
];

/* ── Quick filters: colour-coded one-tap questions ── */
type Tone = "blue" | "amber" | "rose" | "orange" | "slate" | "violet" | "emerald" | "sky";
const TONES: Record<Tone, { soft: string; on: string; dot: string }> = {
  blue: { soft: "bg-[#EEF1FD] text-[#4361EE] border-[#4361EE]/20 hover:border-[#4361EE]/50", on: "bg-[#4361EE] text-white border-[#4361EE]", dot: "bg-[#4361EE]" },
  amber: { soft: "bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-400", on: "bg-amber-500 text-white border-amber-500", dot: "bg-amber-500" },
  rose: { soft: "bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-400", on: "bg-rose-600 text-white border-rose-600", dot: "bg-rose-500" },
  orange: { soft: "bg-orange-50 text-orange-800 border-orange-200 hover:border-orange-400", on: "bg-orange-500 text-white border-orange-500", dot: "bg-orange-500" },
  slate: { soft: "bg-zinc-100 text-zinc-700 border-zinc-200 hover:border-zinc-400", on: "bg-zinc-700 text-white border-zinc-700", dot: "bg-zinc-500" },
  violet: { soft: "bg-violet-50 text-violet-700 border-violet-200 hover:border-violet-400", on: "bg-violet-600 text-white border-violet-600", dot: "bg-violet-500" },
  emerald: { soft: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400", on: "bg-emerald-600 text-white border-emerald-600", dot: "bg-emerald-500" },
  sky: { soft: "bg-sky-50 text-sky-800 border-sky-200 hover:border-sky-400", on: "bg-sky-600 text-white border-sky-600", dot: "bg-sky-500" },
};
type Quick = { id: string; label: string; icon: Icon; tone: Tone; isOn: (f: LeadFilters) => boolean; set: (f: LeadFilters, on: boolean) => LeadFilters };
function quickFilters(meId: string): Quick[] {
  const list: Quick[] = [];
  if (meId) list.push({ id: "mine", label: "My leads", icon: UserRound, tone: "blue",
    isOn: (f) => f.fields.assignedTo === meId, set: (f, on) => ({ ...f, fields: { ...f.fields, assignedTo: on ? meId : "" } }) });
  list.push(
    { id: "overdue", label: "Follow-up overdue", icon: Clock, tone: "rose", isOn: (f) => f.followUp === "overdue", set: (f, on) => ({ ...f, followUp: on ? "overdue" : "any" }) },
    { id: "today", label: "Follow-up today", icon: CalendarClock, tone: "orange", isOn: (f) => f.followUp === "today", set: (f, on) => ({ ...f, followUp: on ? "today" : "any" }) },
    { id: "unassigned", label: "Not assigned yet", icon: UserX, tone: "amber", isOn: (f) => !!f.unassigned, set: (f, on) => ({ ...f, unassigned: on }) },
    { id: "nofu", label: "No follow-up set", icon: BellOff, tone: "slate", isOn: (f) => f.followUp === "none", set: (f, on) => ({ ...f, followUp: on ? "none" : "any" }) },
    { id: "idle", label: "Not touched in 3 days", icon: Hourglass, tone: "violet", isOn: (f) => f.idleDays === 3, set: (f, on) => ({ ...f, idleDays: on ? 3 : 0 }) },
    { id: "discount", label: "Asked for discount", icon: Percent, tone: "emerald", isOn: (f) => !!f.discounted, set: (f, on) => ({ ...f, discounted: on }) },
    { id: "email", label: "Has email", icon: Mail, tone: "sky", isOn: (f) => f.hasEmail === "yes", set: (f, on) => ({ ...f, hasEmail: on ? "yes" : "any" }) },
  );
  return list;
}

/* ── Saved views (per user, this device) ── */
type Saved = { id: string; name: string; snap: Partial<LeadFilters> };
const SNAP_KEYS = ["query", "status", "dateRange", "customFrom", "customTo", "followUp", "customerLink", "fields", "unassigned", "discounted", "hasEmail", "valueMin", "valueMax", "idleDays"] as const;
const snapshotOf = (f: LeadFilters): Partial<LeadFilters> => {
  const o: Record<string, unknown> = {};
  for (const k of SNAP_KEYS) o[k] = (f as unknown as Record<string, unknown>)[k];
  return o as Partial<LeadFilters>;
};
const applySnapshot = (f: LeadFilters, s: Partial<LeadFilters>): LeadFilters => ({
  ...f, query: "", status: "", dateRange: "all", customFrom: "", customTo: "", followUp: "any", customerLink: "any", fields: {},
  unassigned: false, discounted: false, hasEmail: "any", valueMin: "", valueMax: "", idleDays: 0, ...s,
});
function useSavedViews(userId?: string) {
  const key = `repairox-lead-saved-filters::${userId ?? "anon"}`;
  const [items, setItems] = useState<Saved[]>([]);
  useEffect(() => { try { setItems(JSON.parse(localStorage.getItem(key) || "[]")); } catch { setItems([]); } }, [key]);
  const persist = (next: Saved[]) => { setItems(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  return {
    items,
    add: (name: string, f: LeadFilters) => persist([...items, { id: `${Date.now()}`, name: name.trim(), snap: snapshotOf(f) }]),
    remove: (id: string) => persist(items.filter((i) => i.id !== id)),
  };
}

const pillBase = "inline-flex h-8 items-center gap-1.5 rounded-full border text-[12px] font-semibold transition";

function FacetMenu({ def, selected, onChange, filters, leads, fu }: {
  def: FacetDef; selected: string[]; onChange: (v: string[]) => void; filters: LeadFilters; leads: Lead[]; fu?: Map<string, LeadFollowUp>;
}) {
  const [q, setQ] = useState("");
  // Counts respect every OTHER active filter, so "(12)" is what you'd really get.
  const counts = useMemo(() => {
    const rest = applyLeadFilters(leads, { ...filters, fields: { ...filters.fields, [def.key]: "" } }, fu);
    const m = new Map<string, number>();
    for (const l of rest) { const v = String((l as unknown as Record<string, unknown>)[def.key] ?? ""); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, filters, def.key, fu]);
  const opts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return def.options
      .map((o) => ({ ...o, n: counts.get(o.value) ?? 0 }))
      .filter((o) => !s || o.label.toLowerCase().includes(s))
      .sort((a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)) || b.n - a.n || a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [def.options, counts, q, selected]);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{labelOf(def)} · pick one or more</span>
        {selected.length > 0 && <button type="button" onClick={() => onChange([])} className="text-[11px] font-semibold text-[#4361EE] hover:underline">Clear</button>}
      </div>
      {def.options.length > 7 && (
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${labelOf(def).toLowerCase()}…`} autoFocus
            className="h-8 w-full rounded-lg border border-input bg-card pl-8 pr-2 text-[12px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
        </div>
      )}
      <div className="max-h-60 space-y-0.5 overflow-y-auto rox-grid-scroll">
        {opts.length === 0 && <p className="px-2 py-3 text-[12px] text-muted-foreground">Nothing found</p>}
        {opts.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => toggle(o.value)}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition", on ? "bg-[#EEF1FD] font-semibold text-[#4361EE]" : "text-zinc-700 hover:bg-muted", o.n === 0 && !on && "opacity-50")}>
              <span aria-hidden className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-input bg-card")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
              <span className="flex-1 truncate">{o.label}</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums", on ? "bg-[#4361EE]/15" : "bg-muted text-muted-foreground")}>{o.n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
function ValueBody({ filters, setFilters }: { filters: LeadFilters; setFilters: SetFilters }) {
  const min = filters.valueMin || "", max = filters.valueMax || "";
  const set = (a: string, b: string) => setFilters((f) => ({ ...f, valueMin: a, valueMax: b }));
  const PRESETS: [string, string, string][] = [["Under ₹5,000", "", "5000"], ["₹5,000 – ₹20,000", "5000", "20000"], ["₹20,000 – ₹50,000", "20000", "50000"], ["Above ₹50,000", "50000", ""]];
  const input = "h-8 w-full rounded-lg border border-input bg-card px-2 text-[12px] tabular-nums outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";
  return (
    <div className="space-y-2 p-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([l, a, b]) => (
          <button key={l} type="button" onClick={() => set(a, b)} className={cn("rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition", min === a && max === b ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-input bg-card text-zinc-600 hover:border-[#4361EE]/40")}>{l}</button>
        ))}
      </div>
      <p className="px-0.5 text-[11px] font-semibold text-muted-foreground">Or type your own range</p>
      <div className="flex items-center gap-2">
        <input className={input} inputMode="numeric" placeholder="From ₹" value={min} onChange={(e) => set(e.target.value.replace(/\D/g, ""), max)} />
        <span className="text-muted-foreground">–</span>
        <input className={input} inputMode="numeric" placeholder="To ₹" value={max} onChange={(e) => set(min, e.target.value.replace(/\D/g, ""))} />
      </div>
      <p className="text-[11px] text-muted-foreground">Leads without an estimate are hidden while a range is set.</p>
    </div>
  );
}
function EmailBody({ filters, setFilters }: { filters: LeadFilters; setFilters: SetFilters }) {
  const cur = filters.hasEmail ?? "any";
  return (
    <div className="space-y-0.5 p-2">
      {([["any", "Doesn't matter"], ["yes", "Has an email address"], ["no", "No email address"]] as const).map(([v, l]) => (
        <button key={v} type="button" onClick={() => setFilters((f) => ({ ...f, hasEmail: v }))}
          className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12.5px] transition", cur === v ? "bg-[#EEF1FD] font-semibold text-[#4361EE]" : "text-zinc-700 hover:bg-muted")}>
          <span className={cn("grid h-4 w-4 place-items-center rounded-full border", cur === v ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-input")}>{cur === v && <Check className="h-3 w-3" strokeWidth={3} />}</span>{l}
        </button>
      ))}
    </div>
  );
}

/* A filter that is ON: a chip you can click to edit and remove with its own ×. */
function ActiveChip({ icon: Icon, label, text, onClear, children }: { icon: Icon; label: string; text: string; onClear: () => void; children: (close: () => void) => React.ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full border border-[#4361EE]/30 bg-[#EEF1FD] text-[12px] text-[#4361EE] shadow-sm">
      <Dropdown align="left" width="w-72" trigger={({ toggle }) => (
        <button type="button" onClick={toggle} title={`Change ${label}`} className="inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-l-full pl-3 pr-1.5 hover:bg-[#4361EE]/10">
          <Icon className="h-3.5 w-3.5 shrink-0" /><span className="font-medium opacity-80">{label}</span><strong className="truncate">{text}</strong>
        </button>
      )}>{children}</Dropdown>
      <button type="button" onClick={onClear} aria-label={`Remove ${label} filter`} className="mr-1 grid h-6 w-6 place-items-center rounded-full hover:bg-[#4361EE]/15"><X className="h-3.5 w-3.5" /></button>
    </span>
  );
}

function AddFilter({ facets, filters, setFilters, leads, fu }: { facets: Map<LeadFilterField, FacetDef>; filters: LeadFilters; setFilters: SetFilters; leads: Lead[]; fu?: Map<string, LeadFollowUp> }) {
  return (
    <Dropdown align="left" width="w-72" trigger={({ open, toggle }) => (
      <button type="button" onClick={toggle} className={cn(pillBase, "border-dashed border-[#4361EE]/50 bg-card px-3 text-[#4361EE] hover:bg-[#EEF1FD]", open && "bg-[#EEF1FD]")}>
        <Plus className="h-3.5 w-3.5" /> Add a filter
      </button>
    )}>{() => <AddMenu facets={facets} filters={filters} setFilters={setFilters} leads={leads} fu={fu} />}</Dropdown>
  );
}
function AddMenu({ facets, filters, setFilters, leads, fu }: { facets: Map<LeadFilterField, FacetDef>; filters: LeadFilters; setFilters: SetFilters; leads: Lead[]; fu?: Map<string, LeadFollowUp> }) {
  const [step, setStep] = useState<string | null>(null);
  const titleOf = (k: string) => k === "value" ? "Lead value" : k === "email" ? "Email" : (facets.get(k as LeadFilterField) ? labelOf(facets.get(k as LeadFilterField)!) : k);
  if (step) {
    const def = facets.get(step as LeadFilterField);
    return (
      <div>
        <button type="button" onClick={() => setStep(null)} className="flex w-full items-center gap-1 border-b border-border px-3 py-2 text-[12px] font-semibold text-zinc-600 hover:bg-muted"><ChevronLeft className="h-3.5 w-3.5" />{titleOf(step)}</button>
        {step === "value" ? <ValueBody filters={filters} setFilters={setFilters} />
          : step === "email" ? <EmailBody filters={filters} setFilters={setFilters} />
          : def ? <FacetMenu def={def} selected={fieldValuesOf(filters.fields[def.key])} filters={filters} leads={leads} fu={fu}
              onChange={(v) => setFilters((f) => ({ ...f, fields: { ...f.fields, [def.key]: joinFieldValues(v) } }))} /> : null}
      </div>
    );
  }
  return (
    <div className="max-h-[420px] overflow-y-auto py-1 rox-grid-scroll">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => i.key === "value" || i.key === "email" || (facets.get(i.key as LeadFilterField)?.options.length ?? 0) > 0);
        if (!items.length) return null;
        return (
          <div key={g.title} className="px-1 pb-1">
            <p className="px-2 pb-0.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</p>
            {items.map((i) => (
              <button key={i.key} type="button" onClick={() => setStep(i.key)} className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[#EEF1FD]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-zinc-600 transition group-hover:bg-white group-hover:text-[#4361EE]"><i.icon className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-foreground">{titleOf(i.key)}</span><span className="block truncate text-[11px] text-muted-foreground">{i.hint}</span></span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-[#4361EE]" />
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SavedViews({ filters, setFilters, userId }: { filters: LeadFilters; setFilters: SetFilters; userId?: string }) {
  const { items, add, remove } = useSavedViews(userId);
  const [name, setName] = useState("");
  const can = hasActiveLeadFilters(filters) && name.trim().length > 0;
  return (
    <Dropdown align="right" width="w-72" trigger={({ open, toggle }) => (
      <button type="button" onClick={toggle} className={cn(pillBase, "border-input bg-card px-3 text-zinc-700 hover:border-[#4361EE]/40", open && "border-[#4361EE]")}>
        <Bookmark className="h-3.5 w-3.5" /> Saved views{items.length > 0 && <span className="rounded-full bg-muted px-1.5 text-[10.5px] tabular-nums">{items.length}</span>}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
    )}>
      {(close) => (
        <div className="p-2">
          {items.length === 0 ? <p className="px-2 py-2 text-[12px] text-muted-foreground">No saved views yet. Set up filters, name them below and save.</p> : (
            <ul className="max-h-52 space-y-0.5 overflow-y-auto">
              {items.map((v) => (
                <li key={v.id} className="group flex items-center gap-1 rounded-lg hover:bg-muted">
                  <button type="button" onClick={() => { setFilters((f) => applySnapshot(f, v.snap)); close(); }} className="flex-1 truncate px-2 py-1.5 text-left text-[12.5px] font-medium">{v.name}</button>
                  <button type="button" onClick={() => remove(v.id)} aria-label={`Delete saved view ${v.name}`} className="mr-1 grid h-6 w-6 place-items-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          <form className="mt-2 flex items-center gap-1.5 border-t border-border pt-2" onSubmit={(e) => { e.preventDefault(); if (can) { add(name, filters); setName(""); } }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view, e.g. Hot iPhone leads" maxLength={40}
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-[12px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
            <button type="submit" disabled={!can} title={hasActiveLeadFilters(filters) ? "Save current filters" : "Pick some filters first"}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#4361EE] px-2.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Save</button>
          </form>
        </div>
      )}
    </Dropdown>
  );
}

/* ── The bar ── */
const FACET_ICON: Partial<Record<LeadFilterField, Icon>> = Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.icon]))) as Partial<Record<LeadFilterField, Icon>>;

export function LeadFilterBar({ filters, setFilters, leads, openFollowUpsByLead, facets, meId, userId, shown, onClearAll, onClose }: {
  filters: LeadFilters; setFilters: SetFilters; leads: Lead[]; openFollowUpsByLead?: Map<string, LeadFollowUp>;
  facets: FacetDef[]; meId: string; userId?: string; shown: number; chips?: unknown; onClearAll: () => void; onClose: () => void;
}) {
  const byKey = useMemo(() => new Map(facets.map((f) => [f.key, f])), [facets]);
  const quick = useMemo(() => quickFilters(meId), [meId]);
  const counts = useMemo(
    () => new Map(quick.map((qf) => [qf.id, applyLeadFilters(leads, qf.set(filters, true), openFollowUpsByLead).length])),
    [quick, leads, filters, openFollowUpsByLead],
  );
  const active = hasActiveLeadFilters(filters);
  const quickOwned = quick.some((q) => q.id === "mine" && q.isOn(filters));

  // Filters that are ON but not already shown as a lit quick button become chips.
  const setField = (key: LeadFilterField, vals: string[]) => setFilters((f) => ({ ...f, fields: { ...f.fields, [key]: joinFieldValues(vals) } }));
  const facetChips = facets.filter((d) => fieldValuesOf(filters.fields[d.key]).length > 0 && !(d.key === "assignedTo" && quickOwned));
  const followUpLabel: Record<string, string> = { upcoming: "Upcoming", has: "Has a follow-up" };
  const hasValue = !!(filters.valueMin || filters.valueMax);
  const valueText = filters.valueMin && filters.valueMax ? `${inr(Number(filters.valueMin))} – ${inr(Number(filters.valueMax))}` : filters.valueMin ? `${inr(Number(filters.valueMin))}+` : `Up to ${inr(Number(filters.valueMax))}`;
  const chipCount = facetChips.length + (hasValue ? 1 : 0) + (filters.hasEmail === "no" ? 1 : 0) + (followUpLabel[filters.followUp] ? 1 : 0);

  return (
    <section aria-label="Filter leads" className="rounded-2xl border-[1.5px] border-[#4361EE]/20 bg-gradient-to-br from-white via-white to-[#F3F6FF] p-4 shadow-sm">
      {/* Row 1 — "Show me": the questions people ask most, one tap each */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-foreground"><ListFilter className="h-3.5 w-3.5 text-[#4361EE]" /> Show me</p>
          <div className="flex flex-wrap gap-2">
            {quick.map((qf) => {
              const on = qf.isOn(filters); const n = counts.get(qf.id) ?? 0;
              if (!on && n === 0) return null; // nothing to show → less noise
              const t = TONES[qf.tone];
              return (
                <button key={qf.id} type="button" aria-pressed={on} onClick={() => setFilters((f) => qf.set(f, !qf.isOn(f)))}
                  className={cn(pillBase, "px-3 hover:-translate-y-px hover:shadow-sm", on ? cn(t.on, "shadow-sm") : t.soft)}>
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <qf.icon className="h-3.5 w-3.5" />}{qf.label}
                  <span className={cn("min-w-[20px] rounded-full px-1.5 text-center text-[11px] tabular-nums", on ? "bg-white/25" : "bg-white/70")}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SavedViews filters={filters} setFilters={setFilters} userId={userId} />
          <button type="button" onClick={onClose} aria-label="Hide filters" title="Hide filters" className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Row 2 — only what is switched on, plus one button to add more */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        <span className="text-[12px] font-bold text-foreground">Also filter by</span>
        {facetChips.map((d) => {
          const sel = fieldValuesOf(filters.fields[d.key]);
          const text = sel.length === 1 ? (d.options.find((o) => o.value === sel[0])?.label ?? sel[0]) : `${sel.length} selected`;
          return (
            <ActiveChip key={d.key} icon={FACET_ICON[d.key] ?? ListFilter} label={labelOf(d)} text={text} onClear={() => setField(d.key, [])}>
              {() => <FacetMenu def={d} selected={sel} onChange={(v) => setField(d.key, v)} filters={filters} leads={leads} fu={openFollowUpsByLead} />}
            </ActiveChip>
          );
        })}
        {hasValue && (
          <ActiveChip icon={IndianRupee} label="Value" text={valueText} onClear={() => setFilters((f) => ({ ...f, valueMin: "", valueMax: "" }))}>
            {() => <ValueBody filters={filters} setFilters={setFilters} />}
          </ActiveChip>
        )}
        {filters.hasEmail === "no" && (
          <ActiveChip icon={Mail} label="Email" text="Missing" onClear={() => setFilters((f) => ({ ...f, hasEmail: "any" }))}>
            {() => <EmailBody filters={filters} setFilters={setFilters} />}
          </ActiveChip>
        )}
        {followUpLabel[filters.followUp] && (
          <ActiveChip icon={CalendarClock} label="Follow-up" text={followUpLabel[filters.followUp]} onClear={() => setFilters((f) => ({ ...f, followUp: "any" }))}>
            {() => <p className="p-3 text-[12px] text-muted-foreground">Use the buttons above to switch follow-up filters.</p>}
          </ActiveChip>
        )}
        <AddFilter facets={byKey} filters={filters} setFilters={setFilters} leads={leads} fu={openFollowUpsByLead} />
        {chipCount === 0 && !active && <span className="text-[12px] text-muted-foreground">Nothing selected — tap a button above, or add a filter.</span>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-muted-foreground" aria-live="polite"><strong className="text-[14px] tabular-nums text-foreground">{shown}</strong> of {leads.length} leads</span>
          <button type="button" onClick={onClearAll} disabled={!active} className={cn("text-[12px] font-semibold transition", active ? "text-[#4361EE] hover:underline" : "cursor-not-allowed text-muted-foreground/40")}>Clear all</button>
        </div>
      </div>
    </section>
  );
}
