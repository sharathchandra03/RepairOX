"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Shop Management"
      title="Repair Status"
      subtitle="Live status of every repair in progress, from diagnosis to delivery."
      preview={[
        { label: "In diagnosis", value: "6" },
        { label: "Repairing", value: "9" },
        { label: "Ready for delivery", value: "5" },
      ]}
    />
  );
}
