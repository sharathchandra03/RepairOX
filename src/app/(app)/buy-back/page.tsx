"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Trade-in"
      title="Buy-Back"
      subtitle="Quote, accept and re-list customer devices with margin tracking."
      preview={[
        { label: "Devices in stock", value: "38" },
        { label: "Avg margin", value: "22%" },
        { label: "Buy-back paid out", value: formatINR(4_18_500) },
      ]}
    />
  );
}
