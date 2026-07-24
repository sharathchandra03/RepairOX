"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Inventory", href: "/settings/inventory/general" }, { label: "Price Lists" }]} title="Price Lists" description="Manage pricing tiers, wholesale and retail price lists." />; }
