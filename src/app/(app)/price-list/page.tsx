"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Catalog"
      title="Price List"
      subtitle="Service pricing per device family with margin presets and quick edits."
      preview={[
        { label: "Services priced", value: "412" },
        { label: "Device families", value: "26" },
        { label: "Avg margin", value: "31%" },
      ]}
    />
  );
}
