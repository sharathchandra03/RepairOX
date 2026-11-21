"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Canonical Excel (primary) + CSV export dropdown. */
export function ExportMenu({
  onExport, label = "Export", variant = "outline", disabled,
}: {
  onExport: (format: "xlsx" | "csv") => void | Promise<void>;
  label?: string;
  variant?: "outline" | "primary";
  disabled?: boolean;
}) {
  return (
    <Dropdown
      width="w-48"
      trigger={({ toggle, open }) => (
        <Button type="button" variant={variant as never} disabled={disabled} onClick={toggle} className="gap-2">
          <Download className="h-4 w-4" />
          {label}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={FileSpreadsheet} onClick={() => { void onExport("xlsx"); close(); }}>Excel (.xlsx)</MenuItem>
          <MenuItem icon={FileText} onClick={() => { void onExport("csv"); close(); }}>CSV (.csv)</MenuItem>
        </>
      )}
    </Dropdown>
  );
}
