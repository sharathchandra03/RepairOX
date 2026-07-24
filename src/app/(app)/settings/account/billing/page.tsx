"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Account", href: "/settings/account/profile" }, { label: "Billing" }]} title="Billing" description="Manage your subscription, plan and payment methods." />; }
