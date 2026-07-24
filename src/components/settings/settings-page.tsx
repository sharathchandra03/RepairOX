"use client";

import { SettingsBreadcrumb } from "./settings-breadcrumb";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

type Crumb = { label: string; href?: string };

export function SettingsPage({
  breadcrumbs,
  title,
  description,
  onSave,
  saving,
  children,
}: {
  breadcrumbs: Crumb[];
  title: string;
  description?: string;
  onSave?: () => void;
  saving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SettingsBreadcrumb items={breadcrumbs} />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {onSave && (
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      <div className="space-y-5">
        {children}
      </div>
    </div>
  );
}

/* ─── Collapsible Section Card ───────────────────────────────────────── */

export function SettingsSection({
  title,
  description,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors rounded-xl"
      >
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

/* Needed for SettingsSection's useState */
import { useState } from "react";
