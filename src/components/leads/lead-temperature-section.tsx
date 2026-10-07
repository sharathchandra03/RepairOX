"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Temperature section (View Lead full page).

   Renders the Lead's BUYING INTENT (Hot / Warm / Cold) as:
     1. a polished STEPPED indicator  Cold ─── Warm ─── Hot  with the current
        state highlighted (color is NOT the only indicator — the current step
        is labelled and has an "aria-current" marker + a ✓/● glyph);
     2. a controlled "Change temperature" action (permission-gated) that writes
        the new leadNature AND appends a reversible history event (with an
        optional reason);
     3. the TEMPERATURE HISTORY — every real transition, oldest→newest, with the
        previous → new value, who changed it, when, and the reason.

   Temperature is SEPARATE from Lead Status: changing it never touches
   `lead.status`. History comes from real changes only (never fabricated); the
   current state is read from the canonical `lead.leadNature`.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { Thermometer, Flame, ArrowRight, Check, X, History, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { useLeadTemperature } from "@/hooks/use-lead-temperature";
import {
  TEMPERATURE_STEPS, temperatureLevel, temperatureLevelLabel, temperatureGlyph,
  temperatureTone, temperatureAccent, temperatureStepIndex, temperatureDirection,
  type LeadTemperatureEvent, type TemperatureLevel,
} from "@/lib/lead-temperature";
import type { Lead } from "@/lib/leads-data";

function fmt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/* The stepped Cold ─── Warm ─── Hot rail. The current level is highlighted; a
   level "other" (unrecognised nature) shows the rail greyed with no active
   step. Accessible: the active step carries aria-current + a visible label. */
function TemperatureRail({ level }: { level: TemperatureLevel }) {
  const activeIdx = temperatureStepIndex(level);
  return (
    <div className="flex items-center" role="group" aria-label="Lead temperature">
      {TEMPERATURE_STEPS.map((step, i) => {
        const isActive = i === activeIdx;
        const reached = activeIdx >= 0 && i <= activeIdx;
        const accent = temperatureAccent(step);
        return (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full ring-2 transition",
                  isActive ? "scale-110 shadow-sm" : reached ? "" : "opacity-45",
                )}
                style={{
                  backgroundColor: reached ? accent : "#fff",
                  borderColor: accent,
                  color: reached ? "#fff" : accent,
                  ["--tw-ring-color" as string]: isActive ? accent : "transparent",
                }}
              >
                <span className="text-[15px] leading-none">{temperatureGlyph(step)}</span>
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wide",
                  isActive ? "" : "text-muted-foreground",
                )}
                style={isActive ? { color: accent } : undefined}
              >
                {temperatureLevelLabel(step)}
                {isActive && <span className="sr-only"> (current)</span>}
              </span>
            </div>
            {i < TEMPERATURE_STEPS.length - 1 && (
              <span
                className="mx-1 mb-5 h-0.5 flex-1 rounded-full"
                style={{ backgroundColor: activeIdx > i ? temperatureAccent(TEMPERATURE_STEPS[i + 1]) : "#e4e4e7" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* A single history row: previous → new, actor, time, optional reason. */
function HistoryRow({ ev, last }: { ev: LeadTemperatureEvent; last: boolean }) {
  const dir = temperatureDirection(ev.fromLevel, ev.toLevel);
  const toneAccent = temperatureAccent(ev.toLevel);
  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset"
          style={{ backgroundColor: `${toneAccent}1a`, color: toneAccent, borderColor: toneAccent }}
        >
          <span className="text-[12px] leading-none">{temperatureGlyph(ev.toLevel)}</span>
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className="min-w-0 pb-2">
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-foreground">
          {ev.fromValue
            ? <><span className="text-muted-foreground">{ev.fromValue}</span><ArrowRight className="h-3 w-3 text-muted-foreground" /><span>{ev.toValue}</span></>
            : <span>{ev.toValue || temperatureLevelLabel(ev.toLevel)}</span>}
          <span
            className={cn(
              "ml-0.5 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wider",
              dir === "warmed" ? "bg-amber-50 text-amber-700" : dir === "cooled" ? "bg-sky-50 text-sky-700" : "bg-zinc-100 text-zinc-500",
            )}
          >
            {dir === "warmed" ? "Heated up" : dir === "cooled" ? "Cooled down" : "Set"}
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {ev.changedByName ? `by ${ev.changedByName} · ` : ""}{fmt(ev.changedAt)}
        </p>
        {ev.reason && <p className="mt-0.5 text-[11.5px] italic text-zinc-600">&ldquo;{ev.reason}&rdquo;</p>}
      </div>
    </li>
  );
}

export function LeadTemperatureSection({
  lead,
  readOnly = false,
  id,
}: {
  lead: Lead;
  readOnly?: boolean;
  id?: string;
}) {
  const { optionsFor, updateLead } = useLeads();
  const { id: userId, name: userName } = useSession();
  const { can } = usePermissions();
  const { hydrated, historyFor, recordChange } = useLeadTemperature();

  // Changing a lead's temperature reuses the priority/nature-change capability.
  const canChange = allow(can, CAP.lead.priorityChange) && !readOnly;

  const current = lead.leadNature || "";
  const level = temperatureLevel(current);
  const history = useMemo(() => historyFor(lead.id), [historyFor, lead.id]);

  /* Seed a baseline event ONCE when the lead already has a temperature but no
     history exists yet (so a pre-existing lead shows its starting point rather
     than an empty timeline). This represents the real "Lead created with
     temperature X" fact — not a fabricated progression. */
  const seeded = useRef(false);
  useEffect(() => {
    if (!hydrated || seeded.current) return;
    if (current && history.length === 0) {
      seeded.current = true;
      recordChange({
        leadId: lead.id,
        fromValue: "",
        toValue: current,
        changedBy: lead.createdBy || userId || "",
        changedByName: lead.assignedToName || lead.agent || "",
        reason: "Initial temperature at lead creation.",
      });
    }
  }, [hydrated, current, history.length, lead.id, lead.createdBy, lead.assignedToName, lead.agent, userId, recordChange]);

  /* ── Change form ── */
  const [changing, setChanging] = useState(false);
  const [nextValue, setNextValue] = useState(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const natureOptions = useMemo(() => {
    const opts = optionsFor("leadNature").map((o) => o.value).filter(Boolean);
    // Ensure the current value is always present.
    if (current && !opts.includes(current)) opts.unshift(current);
    // Guarantee the three canonical steps exist even without configured options.
    for (const fallback of ["Hot", "Warm", "Cold"]) {
      if (!opts.some((o) => temperatureLevel(o) === temperatureLevel(fallback))) opts.push(fallback);
    }
    return opts;
  }, [optionsFor, current]);

  const openChange = () => { setNextValue(current); setReason(""); setChanging(true); };
  const cancel = () => { setChanging(false); setReason(""); };

  const save = async () => {
    const to = (nextValue || "").trim();
    if (!to || to === current) { setChanging(false); return; }
    setBusy(true);
    try {
      // 1) Update the canonical lead temperature (never touches lead.status).
      const ok = await updateLead(lead.id, { leadNature: to });
      if (ok !== false) {
        // 2) Append the reversible history event (real change only).
        recordChange({
          leadId: lead.id,
          fromValue: current,
          toValue: to,
          changedBy: userId || "",
          changedByName: userName || "",
          reason,
        });
      }
      setChanging(false);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-2.5 border-b border-border/70 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Thermometer className="h-4 w-4" /></span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Lead Temperature</h2>
        </div>
        {canChange && !changing && (
          <button onClick={openChange} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
            <Flame className="h-3 w-3" /> Change temperature
          </button>
        )}
      </div>

      {/* Current temperature + stepped indicator */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ring-1 ring-inset", temperatureTone(level))}>
            <span>{temperatureGlyph(level)}</span>
            {current || "Not set"}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Buying intent</span>
        </div>
        <div className="min-w-0 sm:w-[260px]">
          <TemperatureRail level={level} />
        </div>
      </div>

      {/* Change form (controlled, optional reason) */}
      {changing && (
        <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
          <p className="mb-2 text-[12px] font-semibold text-foreground">Change temperature</p>
          <div className="flex flex-wrap items-center gap-2">
            {natureOptions.map((opt) => {
              const lv = temperatureLevel(opt);
              const selected = opt === nextValue;
              return (
                <button
                  key={opt}
                  onClick={() => setNextValue(opt)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 ring-inset transition",
                    selected ? temperatureTone(lv) : "bg-card text-zinc-600 ring-border hover:bg-muted",
                    selected && "ring-2",
                  )}
                  style={selected ? { ["--tw-ring-color" as string]: temperatureAccent(lv) } : undefined}
                >
                  <span>{temperatureGlyph(lv)}</span> {opt}
                  {selected && <Check className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer confirmed they want to proceed."
              className="mt-1 h-auto min-h-[56px] w-full rounded-lg border border-input bg-card px-2.5 py-2 text-[13px] outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
            />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="gap-1 text-[12px]" onClick={cancel}><X className="h-3.5 w-3.5" /> Cancel</Button>
            <Button size="sm" className="gap-1 text-[12px]" loading={busy} disabled={!nextValue.trim() || nextValue === current} onClick={save}>
              <Check className="h-3.5 w-3.5" /> Save temperature
            </Button>
          </div>
        </div>
      )}

      {/* Temperature history (real transitions only — reversible, never overwritten) */}
      <div className="mt-6 border-t border-border/70 pt-5">
        <div className="mb-3 flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Temperature History</h3>
        </div>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[12px] text-muted-foreground">
            No temperature changes recorded yet.
          </p>
        ) : (
          <ol className="space-y-0">
            {history.map((ev, i) => (
              <HistoryRow key={ev.id} ev={ev} last={i === history.length - 1} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
