"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Field"
      title="Parts Transfers"
      subtitle="Move stock between branches and warehouses with a full audit trail."
      preview={[
        { label: "In transit", value: "5" },
        { label: "Completed this week", value: "22" },
        { label: "Pending approval", value: "3" },
      ]}
    />
  );
}
