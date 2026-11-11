"use client";
import { RequireCapability } from "@/components/common/require-capability";
import { CAP } from "@/lib/capabilities";
import { MasterDashboard } from "@/components/field/dashboard/master-dashboard";

export default function Page() {
  return (
    <RequireCapability anyOf={CAP.field.dashboard}>
      <MasterDashboard scope="store" />
    </RequireCapability>
  );
}
