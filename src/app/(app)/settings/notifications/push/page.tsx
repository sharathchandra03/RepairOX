"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Notifications", href: "/settings/notifications/email" }, { label: "Push" }]} title="Push Notifications" description="Browser and mobile push notification preferences." />; }
