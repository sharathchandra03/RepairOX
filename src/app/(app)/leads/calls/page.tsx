"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Calls"
      subtitle="Click-to-call history with recordings and outcomes for every lead."
      preview={[
        { label: "Calls today", value: "31" },
        { label: "Avg duration", value: "4m 20s" },
        { label: "Missed", value: "4" },
      ]}
    />
  );
}
