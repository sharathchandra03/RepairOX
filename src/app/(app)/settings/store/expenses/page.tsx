"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Store", href: "/settings/store" }, { label: "Expenses" }]} title="Expenses" description="Configure expense categories and approval workflows." />; }
