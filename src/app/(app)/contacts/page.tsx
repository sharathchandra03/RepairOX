"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="CRM"
      title="Contacts"
      subtitle="Customers, businesses and vendors in one searchable directory with full repair history."
      preview={[
        { label: "Total contacts", value: "1,284" },
        { label: "Active this month", value: "312" },
        { label: "VIP customers", value: "27" },
      ]}
    />
  );
}
