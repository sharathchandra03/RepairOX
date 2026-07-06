"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Shop Management"
      title="Notes"
      subtitle="Internal notes and communication attached to tickets and customers."
      preview={[
        { label: "Notes today", value: "27" },
        { label: "Flagged for follow-up", value: "3" },
        { label: "Shared with customer", value: "12" },
      ]}
    />
  );
}
