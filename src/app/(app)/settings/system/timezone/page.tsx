"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "System", href: "/settings/system/language" }, { label: "Time Zone" }]} title="Time Zone" description="Default time zone and date format preferences." />; }
