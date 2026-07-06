"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Shop Management"
      title="Job Assignment"
      subtitle="Assign incoming repair tickets to the right technician based on skill and load."
      preview={[
        { label: "Unassigned tickets", value: "4" },
        { label: "Assigned today", value: "19" },
        { label: "Avg assignment time", value: "6m" },
      ]}
    />
  );
}
