"use client";

import { type ReactNode } from "react";
import { PermissionsProvider } from "@/lib/permissions-context";
import { ThemeProvider } from "@/lib/theme-context";
import { StoreProvider } from "@/lib/store";
import { StoreProvider as ActiveStoreProvider } from "@/lib/store-context";
import { StoreSettingsProvider } from "@/lib/store-settings";
import { LeadsProvider } from "@/lib/leads-context";
import { FieldProvider } from "@/lib/field-context";
import { CatalogProvider } from "@/lib/catalog-context";
import { AccountingProvider } from "@/lib/accounting-service";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PermissionsProvider>
      {/* Theme sits just inside Permissions so it can resolve the signed-in
          user's persisted preference, and wraps everything else so the whole
          app re-themes together. */}
      <ThemeProvider>
        {/* Active-store (multi-store) context. Sits above the business data
            store so reads can be filtered and writes stamped to the currently
            selected store, and above everything that renders the header
            selector / owner dashboard. */}
        <ActiveStoreProvider>
        <StoreProvider>
          <StoreSettingsProvider>
            <CatalogProvider>
              <AccountingProvider>
                <LeadsProvider>
                  <FieldProvider>{children}</FieldProvider>
                </LeadsProvider>
              </AccountingProvider>
            </CatalogProvider>
          </StoreSettingsProvider>
        </StoreProvider>
        </ActiveStoreProvider>
        {/* App-wide toast channel — surfaces background failures (e.g. failed
            Supabase saves) that would otherwise fail silently. */}
        <Toaster />
      </ThemeProvider>
    </PermissionsProvider>
  );
}
