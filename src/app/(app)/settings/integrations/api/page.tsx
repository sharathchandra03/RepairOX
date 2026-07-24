"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Integrations", href: "/settings/integrations/api" }, { label: "API" }]} title="API" description="API keys, webhooks and developer access." />; }
