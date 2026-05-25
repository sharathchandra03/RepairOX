"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Inventory"
      title="Stock"
      subtitle="Live spare parts and accessories with low-stock alerts and SKU history."
      preview={[
        { label: "Inventory value", value: formatINR(2_00_000) },
        { label: "Spare parts SKUs", value: "284" },
        { label: "Low-stock alerts", value: "12" },
      ]}
    />
  );
}
