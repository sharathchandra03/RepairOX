"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Label } from "@/components/ui/input";

/* Generic field descriptor used by QuickEditDrawer. Keeps section-wise
   editing on View Ticket / View Invoice lightweight and consistent without
   duplicating drawer markup for every section. */
export type QuickField =
  | { key: string; label: string; type: "text" | "number"; placeholder?: string }
  | { key: string; label: string; type: "textarea"; placeholder?: string; rows?: number }
  | { key: string; label: string; type: "select"; options: { label: string; value: string }[] };

/* Small, reusable section editor — a Drawer pre-wired with a form built from
   a `fields` config. Since the parent only renders this while `open` is
   true, the internal draft state naturally resets on every open. */
export function QuickEditDrawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  fields,
  initialValues,
  onSave,
  width = "max-w-sm",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  fields: QuickField[];
  initialValues: Record<string, string>;
  onSave: (values: Record<string, string>) => void;
  width?: string;
}) {
  if (!open) return null;
  return (
    <QuickEditDrawerInner
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      fields={fields}
      initialValues={initialValues}
      onSave={onSave}
      width={width}
    />
  );
}

function QuickEditDrawerInner({
  onClose, title, subtitle, icon, fields, initialValues, onSave, width,
}: Omit<Parameters<typeof QuickEditDrawer>[0], "open">) {
  const [values, setValues] = React.useState<Record<string, string>>(initialValues);
  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      width={width}
      footer={
        <div className="flex justify-start gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(values)}><Check className="h-3.5 w-3.5" /> Save</Button>
        </div>
      }
    >
      <div className={fields.length > 3 ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "space-y-4"}>
        {fields.map((f) => (
          <div key={f.key} className={`space-y-1.5 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
            <Label>{f.label}</Label>
            {f.type === "select" ? (
              <Select value={values[f.key] ?? ""} onChange={(e: any) => set(f.key, e.target.value)} options={f.options} />
            ) : f.type === "textarea" ? (
              <Textarea value={values[f.key] ?? ""} onChange={(e: any) => set(f.key, e.target.value)} placeholder={f.placeholder} rows={f.rows ?? 3} />
            ) : (
              <Input
                type={f.type === "number" ? "number" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e: any) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
}
