"use client";

import { ClipboardCheck } from "lucide-react";
import { DocListPage } from "@/components/inventory/doc-ui";

export default function Page() {
  return <DocListPage type="stock_count" icon={ClipboardCheck} subtitle="Count stock, compare with the system and approve corrections" createLabel="New Stock Count" />;
}
