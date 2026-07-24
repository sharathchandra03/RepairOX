"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Tickets", href: "/settings/tickets/general" }, { label: "QC Settings" }]} title="QC Settings" description="Quality check checklists, pass/fail criteria and mandatory QC." />; }
