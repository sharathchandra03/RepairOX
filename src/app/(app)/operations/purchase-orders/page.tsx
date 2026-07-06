"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Operations"
      title="Purchase Orders"
      subtitle="Raise, track and receive purchase orders across every vendor."
      preview={[
        { label: "Open POs", value: "7" },
        { label: "Value in transit", value: formatINR(250700) },
        { label: "Received this month", value: "24" },
      ]}
    />
  );
}
