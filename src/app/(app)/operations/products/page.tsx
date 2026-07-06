"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Operations"
      title="Product Items"
      subtitle="Pricing and catalogue for every product and accessory sold across branches."
      preview={[
        { label: "Active SKUs", value: "284" },
        { label: "Price updates this month", value: "16" },
        { label: "Out of catalogue", value: "3" },
      ]}
    />
  );
}
