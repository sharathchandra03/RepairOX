"use client";

import { ClipboardList } from "lucide-react";
import { DocListPage } from "@/components/inventory/doc-ui";

export default function Page() {
  return <DocListPage type="purchase_order" icon={ClipboardList} subtitle="Order parts from vendors and track partial deliveries" createLabel="New Purchase Order" />;
}
