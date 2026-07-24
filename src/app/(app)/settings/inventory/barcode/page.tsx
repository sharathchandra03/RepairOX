"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Inventory", href: "/settings/inventory/general" }, { label: "Barcode" }]} title="Barcode" description="Barcode format, label size and scanner configuration." />; }
