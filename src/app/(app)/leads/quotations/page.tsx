"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Quotations"
      subtitle="Pre-built and custom quotation drafts sent to leads across every channel."
      preview={[
        { label: "Sent this month", value: "58" },
        { label: "Accepted", value: "34" },
        { label: "Awaiting response", value: "11" },
      ]}
    />
  );
}
