"use client";
import { ModulePlaceholder } from "@/components/common/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      eyebrow="Leads"
      title="WhatsApp"
      subtitle="WhatsApp conversations and automated follow-up sequences."
      preview={[
        { label: "Active chats", value: "56" },
        { label: "Auto follow-ups sent", value: "98" },
        { label: "Response rate", value: "61%" },
      ]}
    />
  );
}
