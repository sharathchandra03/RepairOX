"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Store", href: "/settings/store" }, { label: "Store Configuration" }]} title="Store Configuration" description="Accounting method, deposits, refunds and operational preferences." />; }
