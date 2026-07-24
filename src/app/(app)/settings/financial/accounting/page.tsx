"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Financial", href: "/settings/financial/currency" }, { label: "Accounting" }]} title="Accounting" description="Chart of accounts, accounting method and fiscal year." />; }
