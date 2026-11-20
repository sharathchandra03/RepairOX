"use client";
/* The signed-in Ninja's own pay for a month: shift + leave + odometer + trips + reviews + the rules in force,
   run through the same engine the CRM uses (lib/field-incentives.ts). RLS limits every read to their rows. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { localDateKey } from "@/lib/work-session";
import { fetchOwnRange, ymRange } from "@/lib/field-attendance-data";
import { buildNinjaMonth } from "@/lib/field-attendance";
import { fetchClosedMonth, fetchPayContext, fetchPayMonth, postCloseAdjustments } from "@/lib/field-pay-data";
import { computeNinjaPay, planFor, salaryFor, type PayPlan, type PaySummary } from "@/lib/field-incentives";

export function useMyPay(ym: string) {
  const { currentUser } = usePermissions();
  const tz = useStoreSettings().settings.timeZone;
  const staffId = currentUser?.id ?? "";
  const [state, setState] = useState<{ summary: PaySummary; plan: PayPlan; salary: number; today: string; final: { closedAt: string } | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!staffId) return;
    try {
      const r = ymRange(ym);
      const [own, ctx, pay, closed] = await Promise.all([fetchOwnRange(staffId, r.from, r.to), fetchPayContext(), fetchPayMonth(ym, tz), fetchClosedMonth(ym)]);
      const nowMs = Date.now();
      const month = buildNinjaMonth({ staffId, ym, tz, nowMs, sessions: own.sessions, logs: own.logs, marks: own.marks, weeklyOff: own.weeklyOff.get(staffId) ?? null, policy: own.policy });
      const live = computeNinjaPay({ staffId, ym, tz, nowMs, month, trips: pay.trips, reviews: pay.reviews, plans: ctx.plans, salaries: ctx.salaries, deviceLists: ctx.deviceLists,
        organicLeads: pay.leads.get(staffId) ?? 0, adjustments: pay.adjustments.get(staffId) ?? [] });
      // a closed month shows the frozen payslip (plus anything added after closing)
      const line = closed?.lines.get(staffId) ?? null;
      const post = line && closed ? postCloseAdjustments(pay.adjustments.get(staffId) ?? [], closed.closedAt) : 0;
      const summary: PaySummary = line ? { ...live, ...(line.summary as Partial<PaySummary>), days: live.days, total: Math.round((line.total + post) * 100) / 100 } : live;
      const today = localDateKey(nowMs, tz);
      setState({ final: line && closed ? { closedAt: closed.closedAt } : null, summary, plan: planFor(ctx.plans, staffId, today), salary: salaryFor(ctx.salaries, staffId, today), today }); setFailed(false);
    } catch { setFailed(true); }
  }, [staffId, ym, tz]);
  useEffect(() => { setState(null); void load(); }, [load]);
  return useMemo(() => ({ ...state, loading: !state && !failed, failed, reload: load }), [state, failed, load]);
}
