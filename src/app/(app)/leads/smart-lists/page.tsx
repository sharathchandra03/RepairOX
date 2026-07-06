"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Smart Lists"
      subtitle="Saved, auto-updating segments of leads based on score, source or stage."
      preview={[
        { label: "Saved lists", value: "8" },
        { label: "Leads in top segment", value: "46" },
        { label: "Updated", value: "Live" },
      ]}
    />
  );
}
