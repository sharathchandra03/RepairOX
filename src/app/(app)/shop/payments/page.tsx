"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Shop Management"
      title="Payments"
      subtitle="Collections, dues and payment methods across every ticket and walk-in sale."
      preview={[
        { label: "Collected today", value: formatINR(48200) },
        { label: "Dues outstanding", value: formatINR(10000) },
        { label: "Refunds pending", value: "2" },
      ]}
    />
  );
}
