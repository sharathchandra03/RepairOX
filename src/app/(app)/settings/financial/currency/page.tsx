"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Financial", href: "/settings/financial/currency" }, { label: "Currency" }]} title="Currency" description="Set default currency, exchange rates and display formats." />; }
