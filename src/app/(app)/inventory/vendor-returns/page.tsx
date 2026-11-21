"use client";

import { Undo2 } from "lucide-react";
import { DocListPage } from "@/components/inventory/doc-ui";

export default function Page() {
  return <DocListPage type="vendor_return" icon={Undo2} subtitle="Send defective or wrong parts back to the vendor and track the credit" createLabel="New Vendor Return" />;
}
