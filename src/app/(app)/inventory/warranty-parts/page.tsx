"use client";

import { BadgeCheck } from "lucide-react";
import { DocListPage } from "@/components/inventory/doc-ui";

export default function Page() {
  return <DocListPage type="warranty_claim" icon={BadgeCheck} subtitle="Claim replacement parts from vendors for warranty failures" createLabel="New Warranty Claim" />;
}
