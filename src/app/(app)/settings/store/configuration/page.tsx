"use client";

import { SettingsPage } from "@/components/settings/settings-page";
import { StoreManagement } from "@/components/settings/store-management";

/* Settings → Store → Store Configuration
   The central management center for the multi-store system: create, edit,
   activate/deactivate and open stores, and create a store login. Writes to the
   same `branches` (store) records used by the global store selector, Owner
   Dashboard, and every store-scoped module. */
export default function StoreConfigurationPage() {
  return (
    <SettingsPage
      breadcrumbs={[{ label: "Store", href: "/settings/store" }, { label: "Store Configuration" }]}
      title="Store Configuration"
      description="Create and manage your RepairOX stores, access and store configuration."
    >
      <StoreManagement />
    </SettingsPage>
  );
}
