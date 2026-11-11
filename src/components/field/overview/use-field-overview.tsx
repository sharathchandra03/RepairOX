"use client";
/* RepairOX — one data hook for every Field overview widget, so the overview page
   and the dashboards landing page always agree. All numbers come from
   lib/field-overview.ts over the RLS/store-scoped trips in useField(). */
import { useMemo } from "react";
import { useField } from "@/lib/field-context";
import { usePermissions } from "@/lib/permissions-context";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";
import { staffByRole } from "@/lib/field-linking";
import { describeFieldEvent } from "@/lib/field-data";
import {
  attentionItems, todaySchedule, engineerWorkload, dailySeries, monthCompare, leaderboard,
  buildInsights, activityFeed,
} from "@/lib/field-overview";

export function useFieldOverview() {
  const { jobs, events, hydrated } = useField();
  const { ctx, multiStore, canTeam } = useFieldDashboard();
  const { team } = usePermissions();

  return useMemo(() => {
    const now = new Date();
    const roster = staffByRole(team, ["ninja"]).map((m) => ({ id: m.id, name: m.name }));
    const attention = attentionItems(jobs, now);
    const today = todaySchedule(jobs, now);
    const workload = engineerWorkload(jobs, roster, now);
    const series = dailySeries(jobs, ctx, 14, now);
    const compare = monthCompare(jobs, ctx, now);
    const attentionJobCount = new Set(attention.flatMap((a) => a.jobIds)).size;
    const inTransit = jobs.filter((j) => j.status === "out_for_pickup" || j.status === "picked_up" || j.status === "out_for_drop").length;
    return {
      hydrated, multiStore, canTeam, jobs, now, ctx,
      attention, attentionJobCount, today, workload, series, compare, inTransit,
      stores: leaderboard(jobs, "store", ctx, now),
      engineers: leaderboard(jobs, "engineer", ctx, now),
      insights: buildInsights({ attention, compare, workload, today }),
      feed: activityFeed(events, describeFieldEvent, 8),
    };
  }, [jobs, events, hydrated, ctx, multiStore, canTeam, team]);
}
export type FieldOverview = ReturnType<typeof useFieldOverview>;
