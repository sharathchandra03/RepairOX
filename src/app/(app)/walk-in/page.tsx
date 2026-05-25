"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Counter"
      title="Walk-In"
      subtitle="Fast counter checkout for accessories, screen protectors and small fixes."
      preview={[
        { label: "Today’s walk-ins", value: "14" },
        { label: "Avg basket", value: formatINR(890) },
        { label: "Conversion", value: "61%" },
      ]}
    />
  );
}
