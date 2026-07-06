"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Companies"
      subtitle="Businesses and organisations in your pipeline, with linked contacts and deals."
      preview={[
        { label: "Total companies", value: "142" },
        { label: "Active deals", value: "31" },
        { label: "Added this month", value: "9" },
      ]}
    />
  );
}
