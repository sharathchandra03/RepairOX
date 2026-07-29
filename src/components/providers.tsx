"use client";

import { type ReactNode } from "react";
import { PermissionsProvider } from "@/lib/permissions-context";
import { StoreProvider } from "@/lib/store";
import { StoreSettingsProvider } from "@/lib/store-settings";
import { CatalogProvider } from "@/lib/catalog-context";
import { AccountingProvider } from "@/lib/accounting-service";

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
    </PermissionsProvider>
  );
}
