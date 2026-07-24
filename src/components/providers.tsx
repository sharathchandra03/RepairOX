"use client";

import { type ReactNode } from "react";
import { PermissionsProvider } from "@/lib/permissions-context";
import { StoreProvider } from "@/lib/store";
import { StoreSettingsProvider } from "@/lib/store-settings";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PermissionsProvider>
      <StoreProvider>
        <StoreSettingsProvider>{children}</StoreSettingsProvider>
      </StoreProvider>
    </PermissionsProvider>
  );
}
