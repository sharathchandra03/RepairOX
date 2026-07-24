"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Customers", href: "/settings/customers/groups" }, { label: "Loyalty" }]} title="Loyalty" description="Points system, rewards and retention programs." />; }
