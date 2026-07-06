"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Deals"
      subtitle="Every deal in flight, its stage and expected value."
      preview={[
        { label: "Open deals", value: "23" },
        { label: "Pipeline value", value: formatINR(420000) },
        { label: "Closing this week", value: "5" },
      ]}
    />
  );
}
