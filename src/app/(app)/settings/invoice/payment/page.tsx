"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Invoice", href: "/settings/invoice/general" }, { label: "Payment" }]} title="Payment" description="Payment methods, gateways and deposit configuration." />; }
