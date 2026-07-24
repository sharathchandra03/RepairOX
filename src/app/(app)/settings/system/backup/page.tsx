"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "System", href: "/settings/system/language" }, { label: "Backup" }]} title="Backup" description="Data backup schedules and restore options." />; }
