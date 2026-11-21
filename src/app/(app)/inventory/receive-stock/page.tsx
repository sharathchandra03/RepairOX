"use client";

import { PackageCheck } from "lucide-react";
import { DocListPage } from "@/components/inventory/doc-ui";

export default function Page() {
  return <DocListPage type="grn" icon={PackageCheck} subtitle="Goods received notes: post received parts to stock at their landed cost" createLabel="New GRN" />;
}
