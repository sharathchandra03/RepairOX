"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Tasks"
      subtitle="Follow-ups and action items assigned across the lead pipeline."
      preview={[
        { label: "Due today", value: "12" },
        { label: "Overdue", value: "2" },
        { label: "Completed this week", value: "47" },
      ]}
    />
  );
}
