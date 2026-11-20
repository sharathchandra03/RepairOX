"use client";
import { useMemo } from "react";
import { NinjaOps } from "@/components/field/activity/ninja-ops";
import { useActivity } from "@/components/field/activity/activity-shell";
import { monthDays } from "@/lib/field-attendance";
const NONE: string[] = [];
export default function OperationsPage() {
  const a = useActivity();
  const bounds = useMemo(() => { const d = monthDays(a.ym); return { from: d[0], to: d[d.length - 1] }; }, [a.ym]);
  return <NinjaOps bounds={bounds} storeSel={a.multiStore ? a.storeSel : NONE} q={a.q} />;
}
