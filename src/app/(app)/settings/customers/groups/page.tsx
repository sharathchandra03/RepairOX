"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Customers", href: "/settings/customers/groups" }, { label: "Customer Groups" }]} title="Customer Groups" description="Organize customers into groups for pricing and communication." />; }
