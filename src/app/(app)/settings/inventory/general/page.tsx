"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Inventory", href: "/settings/inventory/general" }, { label: "Inventory Settings" }]} title="Inventory Settings" description="Stock tracking, low stock alerts and warehouse configuration." />; }
