"use client";

import { Lock } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsCockpit } from "@/components/reports/reports-cockpit";

export default function Page() {
  const { can } = usePermissions();

  // Reports respect roles: any of the reporting/financial permissions grants access.
  const allowed =
    can("view_reports") ||
    can("manage_reports") ||
    can("view_financial_reports") ||
    can("view_sales_reports") ||
    can("view_inventory_reports") ||
    can("view_ticket_reports") ||
    can("full_access");

  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Business Intelligence" title="Reports" />
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Reports are restricted</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Your role doesn&apos;t have permission to view reports. Ask an administrator to grant
            &ldquo;View Reports&rdquo; or a related reporting permission.
          </p>
        </div>
      </div>
    );
  }

  return <ReportsCockpit />;
}
