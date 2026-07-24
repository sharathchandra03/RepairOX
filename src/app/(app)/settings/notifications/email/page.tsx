"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Notifications", href: "/settings/notifications/email" }, { label: "Email" }]} title="Email Notifications" description="Configure which events trigger email notifications." />; }
