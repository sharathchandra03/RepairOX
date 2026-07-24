"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Employees", href: "/settings/users" }, { label: "Security" }]} title="Security" description="Password policies, 2FA and access control settings." />; }
