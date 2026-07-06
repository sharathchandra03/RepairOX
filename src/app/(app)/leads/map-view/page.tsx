"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="Map View"
      subtitle="Leads plotted geographically to spot coverage gaps and hot zones."
      preview={[
        { label: "Leads mapped", value: "312" },
        { label: "Hot zones", value: "4" },
        { label: "Uncovered pincodes", value: "6" },
      ]}
    />
  );
}
