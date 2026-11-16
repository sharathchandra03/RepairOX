"use client";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { StockBrowser } from "@/components/ninja/stock-browser";
import { Empty } from "@/components/ninja/ui";
import { Boxes } from "lucide-react";

export default function StockPage() {
  const { can } = usePermissions();
  if (!allow(can, CAP.inventory.view)) return <Empty icon={<Boxes className="h-7 w-7" />} title="No stock access" body="Ask your manager to enable inventory access for your role." />;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="font-display text-[28px] font-extrabold leading-none tracking-tight">Stock</h1><p className="mt-1.5 text-[13px] font-medium text-slate-500">Parts and services at your store</p></div>
        {allow(can, CAP.invoice.create) ? <Link href="/ninja/new/invoice" className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#EEF1FD] px-4 text-[13px] font-extrabold text-[#3450D8] active:scale-95"><FilePlus2 className="h-4 w-4" />Bill</Link> : null}
      </div>
      <StockBrowser />
    </div>
  );
}
