"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Activities"
      subtitle="A unified timeline of every touchpoint across calls, emails and meetings."
      preview={[
        { label: "Logged today", value: "64" },
        { label: "Active leads touched", value: "28" },
        { label: "Avg per lead", value: "3.4" },
      ]}
    />
  );
}
