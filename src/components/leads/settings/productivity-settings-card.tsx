"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Work Session / Productivity settings section.

   SELF-CONTAINED: reads from useStoreSettings(), writes immediately on Save
   (no external draft/Save dependency), so it works wherever it's placed.

   The one tunable today is the BREAK REMINDER THRESHOLD: how long a Sales Agent
   may stay ON BREAK before the app reminds them to resume work. Break time is
   excluded from net productive time, so a forgotten break distorts the day's
   productivity — the reminder keeps it accurate. 0 = never remind.

   This is PRESENTATION-only configuration (it tunes WHEN the client nudges an
   agent). It never changes any persisted work-session duration or the pure
   time-calculation engine (work-session.ts).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { Coffee, Check, Info, BellRing, BellOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useStoreSettings } from "@/lib/store-settings";
import { cn } from "@/lib/utils";

/** Guardrails so an admin can't enter a nonsensical value. 0 = disabled. */
const MIN_MINUTES = 0;
const MAX_MINUTES = 240;

export function ProductivitySettingsSection({ canEdit = true }: { canEdit?: boolean }) {
  const { settings, updateSettings, hydrated } = useStoreSettings();
  const saved = settings.productivityConfig?.breakReminderMinutes ?? 5;

  const [value, setValue] = useState<string>(String(saved));

  // Keep the field in sync with the stored value once settings hydrate / change
  // (but not while the user is actively editing — handled by the dirty check).
  useEffect(() => {
    if (hydrated) setValue(String(saved));
  }, [hydrated, saved]);

  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= MIN_MINUTES && parsed <= MAX_MINUTES;
  const dirty = valid && parsed !== saved;
  const disabled = saved === 0;

  const handleSave = () => {
    if (!canEdit || !dirty || !valid) return;
    updateSettings({ productivityConfig: { ...settings.productivityConfig, breakReminderMinutes: parsed } });
    toast.success(
      parsed === 0 ? "Break reminder turned off" : "Break reminder updated",
      {
        description:
          parsed === 0
            ? "Agents will no longer be reminded to resume work after a break."
            : `Agents will be reminded to resume work after ${parsed} ${parsed === 1 ? "minute" : "minutes"} on break.`,
      },
    );
  };

  const reset = () => setValue(String(saved));

  return (
    <div className="space-y-4">
      {/* Explainer */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[#B3BFF6]/60 bg-[#EEF1FD]/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
        <p className="text-[12px] leading-relaxed text-[#3A4DBB]">
          When a Sales Agent starts a break and forgets to resume, break time keeps counting and eats
          into their productive hours. Set how long an agent may stay on break before RepairOX reminds
          them to <span className="font-semibold">Resume Work</span> so each day&apos;s productivity stays accurate.
        </p>
      </div>

      {/* Threshold control */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Coffee className="h-3.5 w-3.5 text-[#4361EE]" /> Remind to resume work after
          <InfoHint label="About the break reminder">
            This only controls when the on-screen reminder appears. It never changes recorded work
            times — productivity is always calculated from the actual session and break records.
          </InfoHint>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              step={1}
              value={value}
              disabled={!canEdit}
              onChange={(e) => setValue(e.target.value)}
              className="h-[38px] w-24 text-center"
              aria-label="Break reminder minutes"
            />
            <span className="text-[13px] font-medium text-zinc-600">minutes on break</span>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" onClick={handleSave} disabled={!dirty}>
                <Check className="h-3.5 w-3.5" /> Save
              </Button>
              {dirty && (
                <Button size="sm" variant="secondary" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Live status line */}
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {disabled ? (
            <>
              <BellOff className="h-3.5 w-3.5 text-zinc-400" />
              The break reminder is <span className="font-semibold text-foreground">off</span> — set a value above 0 to enable it.
            </>
          ) : (
            <>
              <BellRing className="h-3.5 w-3.5 text-[#4361EE]" />
              Agents are reminded after <span className="font-semibold text-foreground">{saved} {saved === 1 ? "minute" : "minutes"}</span> on break.
            </>
          )}
        </p>

        {!valid && (
          <p className={cn("mt-2 text-[12px] font-medium text-rose-600")}>
            Enter a whole number of minutes between {MIN_MINUTES} and {MAX_MINUTES} (0 turns the reminder off).
          </p>
        )}
      </div>

    </div>
  );
}

export { ProductivitySettingsSection as ProductivitySettingsCard };
