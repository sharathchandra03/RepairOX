"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Notifications", href: "/settings/notifications/email" }, { label: "SMS" }]} title="SMS Notifications" description="Configure SMS alerts for customers and staff." />; }
