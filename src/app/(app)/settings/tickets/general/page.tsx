"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Tickets", href: "/settings/tickets/general" }, { label: "Ticket Settings" }]} title="Ticket Settings" description="Ticket numbering, default priority and auto-assignment rules." />; }
