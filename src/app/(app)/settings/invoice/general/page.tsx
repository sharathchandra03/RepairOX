"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Invoice", href: "/settings/invoice/general" }, { label: "Invoice Settings" }]} title="Invoice Settings" description="Invoice numbering, due dates and default terms." />; }
