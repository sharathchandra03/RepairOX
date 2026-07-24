"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Invoice", href: "/settings/invoice/general" }, { label: "Invoice Templates" }]} title="Invoice Templates" description="Customize invoice layouts, colors and branding." />; }
