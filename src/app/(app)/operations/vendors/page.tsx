"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";
import { formatINR } from "@/lib/utils";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Field"
      title="Vendors"
      subtitle="Every vendor and supplier, their order history and outstanding balances."
      preview={[
        { label: "Active vendors", value: "18" },
        { label: "Total spend (YTD)", value: formatINR(1192000) },
        { label: "Overdue payables", value: formatINR(64500) },
      ]}
    />
  );
}
