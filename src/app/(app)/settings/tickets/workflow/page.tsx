"use client";
import { SettingsPlaceholder } from "@/components/settings/settings-placeholder";
export default function Page() { return <SettingsPlaceholder breadcrumbs={[{ label: "Tickets", href: "/settings/tickets/general" }, { label: "Workflow" }]} title="Workflow" description="Status transitions, automation rules and notification triggers." />; }
