"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead first-response SLA (Settings → Store → Lead Management).

   Org-level, OPTIONAL. Minutes a freshly assigned lead may wait for its first
   meaningful agent action. Used ONLY to flag an "Overdue" chip on rows in the
   Assigned Leads inbox — a lead is never silently removed or reassigned by it.
   Empty = no SLA configured (nothing is flagged). Saves instantly, like the
   Lead Store Mode section above it.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { useStoreSettings } from "@/lib/store-settings";

export function LeadFirstResponseSlaSection({ canEdit = true }: { canEdit?: boolean }) {
  const { settings, updateSettings } = useStoreSettings();
  const saved = settings.leadFirstResponseSlaMinutes;
  const [value, setValue] = useState(saved ? String(saved) : "");

  useEffect(() => { setValue(saved ? String(saved) : ""); }, [saved]);

  const parsed = value.trim() === "" ? null : Number(value);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed <= 0 || parsed > 60 * 24 * 14);
  const dirty = (parsed ?? null) !== (saved ?? null);

  const save = () => {
    if (!canEdit || invalid || !dirty) return;
    updateSettings({ leadFirstResponseSlaMinutes: parsed });
    toast.success(parsed ? "First-response SLA saved" : "First-response SLA cleared", {
      description: parsed
        ? `Assigned leads untouched for ${parsed} minutes are flagged Overdue.`
        : "No lead will be flagged Overdue in the Assigned Leads inbox.",
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <Timer className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">First-response SLA</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Minutes a newly assigned lead may wait for its first meaningful action before it is flagged
            <span className="font-semibold"> Overdue</span> in Assigned Leads. Leave empty for no SLA. Leads are only
            flagged, never removed from the inbox.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={value}
                disabled={!canEdit}
                invalid={invalid}
                placeholder="e.g. 30"
                aria-label="First-response SLA in minutes"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
              />
            </div>
            <span className="text-[12px] text-muted-foreground">minutes</span>
            <Button size="sm" className="rounded-full" disabled={!canEdit || invalid || !dirty} onClick={save}>
              Save
            </Button>
          </div>
          {invalid && <p className="mt-1.5 text-[12px] text-rose-600">Enter a whole number of minutes (1 or more).</p>}
        </div>
      </div>
    </div>
  );
}
