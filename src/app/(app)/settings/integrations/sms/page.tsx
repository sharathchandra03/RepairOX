"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Integrations", href: "/settings/integrations/api" }, { label: "SMS" }]} title="SMS Integration" description="SMS gateway configuration and message templates." />; }
