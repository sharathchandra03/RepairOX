"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Analytics"
      title="Reports"
      subtitle="Trend charts, technician productivity, device family P&L and tax summaries."
      preview={[
        { label: "Reports", value: "24" },
        { label: "Auto-emailed", value: "8" },
        { label: "Last sync", value: "2 min ago" },
      ]}
    />
  );
}
