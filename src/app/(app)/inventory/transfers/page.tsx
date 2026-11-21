"use client";

import { ArrowLeftRight } from "lucide-react";
import { DocListPage } from "@/components/inventory/doc-ui";

export default function Page() {
  return <DocListPage type="transfer" icon={ArrowLeftRight} subtitle="Move parts between stores with in-transit tracking" createLabel="New Transfer" />;
}
