"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Email"
      subtitle="Email threads and templated sequences sent to leads and companies."
      preview={[
        { label: "Sent this week", value: "212" },
        { label: "Open rate", value: "42%" },
        { label: "Replies", value: "38" },
      ]}
    />
  );
}
