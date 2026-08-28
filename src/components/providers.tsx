"use client";

import { type ReactNode } from "react";
import { PermissionsProvider } from "@/lib/permissions-context";
import { StoreProvider } from "@/lib/store";
import { StoreSettingsProvider } from "@/lib/store-settings";
import { CatalogProvider } from "@/lib/catalog-context";
import { AccountingProvider } from "@/lib/accounting-service";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PermissionsProvider>
      <StoreProvider>
        <StoreSettingsProvider>
          <CatalogProvider>
            <AccountingProvider>{children}</AccountingProvider>
          </CatalogProvider>
        </StoreSettingsProvider>
      </StoreProvider>
      {/* App-wide toast channel — surfaces background failures (e.g. failed
          Supabase saves) that would otherwise fail silently. */}
      <Toaster />
    </PermissionsProvider>
  );
}
