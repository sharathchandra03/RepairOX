"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Billing"
      title="Invoice"
      subtitle="Issue, edit and reconcile invoices in seconds — GST-ready."
      preview={[
        { label: "This month", value: formatINR(1_85_000) },
        { label: "Outstanding", value: formatINR(42_500) },
        { label: "Avg ticket value", value: formatINR(7_240) },
      ]}
    />
  );
}
