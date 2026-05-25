"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Operations"
      title="Expenses"
      subtitle="Rent, salaries, courier and operational costs — categorized and reportable."
      preview={[
        { label: "This month", value: formatINR(72_000) },
        { label: "Largest category", value: "Rent" },
        { label: "Receipts pending", value: "5" },
      ]}
    />
  );
}
