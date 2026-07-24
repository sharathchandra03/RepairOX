"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "System", href: "/settings/system/language" }, { label: "Language" }]} title="Language" description="Interface language and localization settings." />; }
