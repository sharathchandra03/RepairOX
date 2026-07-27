"use client";

import { type ReactNode } from "react";
import { PermissionsProvider } from "@/lib/permissions-context";
import { StoreProvider } from "@/lib/store";
import { StoreSettingsProvider } from "@/lib/store-settings";
import { CatalogProvider } from "@/lib/catalog-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PermissionsProvider>
      <StoreProvider>
        <StoreSettingsProvider>
          <CatalogProvider>{children}</CatalogProvider>
        </StoreSettingsProvider>
      </StoreProvider>
    </PermissionsProvider>
  );
}
