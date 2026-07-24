"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Financial", href: "/settings/financial/currency" }, { label: "Tax" }]} title="Tax" description="Configure GST, tax classes and tax calculation rules." />; }
