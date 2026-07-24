"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Store", href: "/settings/store" }, { label: "Printing" }]} title="Printing" description="Configure print templates, thermal printer settings and default formats." />; }
