"use client";

import { Settings2 } from "lucide-react";
import { SettingsPage } from "./settings-page";

type Crumb = { label: string; href?: string };

export function SettingsPlaceholder({
  breadcrumbs,
  title,
  description,
}: {
  breadcrumbs: Crumb[];
  title: string;
  description?: string;
}) {
  return (
    <SettingsPage breadcrumbs={breadcrumbs} title={title} description={description}>
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground mb-3">
          <Settings2 className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">Coming Soon</p>
        <p className="text-[11px] text-muted-foreground mt-1">This settings page is under development.</p>
      </div>
    </SettingsPage>
  );
}
