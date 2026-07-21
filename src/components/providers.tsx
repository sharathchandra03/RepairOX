"use client";

import { type ReactNode } from "react";
import { PermissionsProvider } from "@/lib/permissions-context";
import { StoreProvider } from "@/lib/store";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PermissionsProvider>
      <StoreProvider>{children}</StoreProvider>
    </PermissionsProvider>
  );
}
