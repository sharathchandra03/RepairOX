"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Shop Management"
      title="Technicians"
      subtitle="Technician roster, specialities and current workload across the shop."
      preview={[
        { label: "Active technicians", value: "11" },
        { label: "On a job now", value: "8" },
        { label: "Avg jobs / tech", value: "3.2" },
      ]}
    />
  );
}
