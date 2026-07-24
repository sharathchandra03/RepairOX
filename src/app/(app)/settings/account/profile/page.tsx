"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Account", href: "/settings/account/profile" }, { label: "Profile" }]} title="Profile" description="Manage your personal account settings and preferences." />; }
