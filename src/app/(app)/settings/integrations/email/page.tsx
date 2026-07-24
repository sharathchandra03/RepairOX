"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Integrations", href: "/settings/integrations/api" }, { label: "Email" }]} title="Email Integration" description="SMTP configuration and email delivery settings." />; }
