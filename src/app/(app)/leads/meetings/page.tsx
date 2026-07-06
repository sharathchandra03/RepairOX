"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Meetings"
      subtitle="Scheduled calls and site visits with leads and companies."
      preview={[
        { label: "Scheduled this week", value: "9" },
        { label: "Today", value: "3" },
        { label: "No-shows (30d)", value: "1" },
      ]}
    />
  );
}
