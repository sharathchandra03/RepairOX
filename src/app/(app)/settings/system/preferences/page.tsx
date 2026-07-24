"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "System", href: "/settings/system/language" }, { label: "Preferences" }]} title="Preferences" description="Screen timeout, display preferences and UI settings." />; }
