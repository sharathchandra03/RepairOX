"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Account", href: "/settings/account/profile" }, { label: "Active Sessions" }]} title="Active Sessions" description="View and manage your logged-in devices and sessions." />; }
