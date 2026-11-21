"use client";

import { Recycle } from "lucide-react";
import { DocListPage } from "@/components/inventory/doc-ui";

export default function Page() {
  return <DocListPage type="old_part" icon={Recycle} subtitle="Track every replaced part: vendor return, scrap or recycle" createLabel="Log Old Part" />;
}
