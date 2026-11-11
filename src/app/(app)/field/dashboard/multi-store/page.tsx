"use client";
import { RequireCapability } from "@/components/common/require-capability";
import { CAP } from "@/lib/capabilities";
import { SummaryDashboard } from "@/components/field/dashboard/summary-dashboard";

export default function Page() {
  return (
    <RequireCapability anyOf={CAP.field.dashboard}>
      <SummaryDashboard scope="multi" />
    </RequireCapability>
  );
}
