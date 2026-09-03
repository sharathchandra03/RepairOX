"use client";

import { Suspense } from "react";
import { CatalogAdmin } from "@/components/settings/catalog/catalog-admin";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CatalogAdmin />
    </Suspense>
  );
}
