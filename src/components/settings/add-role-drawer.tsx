"use client";

import { useState } from "react";
import { Plus, ShieldPlus } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { WORKSPACES, type WorkspaceId } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** "Add Role" form — creates a brand-new role (name, description, workspace
 *  access). It starts with zero permissions granted; the administrator then
 *  uses the existing permission matrix to grant capabilities and save, same
 *  as any built-in role. This keeps role *creation* and permission *editing*
 *  as two clean, familiar steps instead of one overloaded form. */
export function AddRoleDrawer({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { label: string; summary: string; workspaces: WorkspaceId[] }) => void;
}) {
  const [label, setLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceId[]>(WORKSPACES.map((w) => w.id));

  function reset() {
    setLabel("");
    setSummary("");
    setWorkspaces(WORKSPACES.map((w) => w.id));
  }

  function toggleWorkspace(id: WorkspaceId) {
    setWorkspaces((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  }

  function submit() {
    if (!label.trim()) return;
    onCreate({ label: label.trim(), summary: summary.trim(), workspaces });
    reset();
  }

  return (
    <Drawer
      open={open}
      onClose={() => { onClose(); reset(); }}
      icon={ShieldPlus}
      title="Add Role"
      subtitle="Define a new role — you'll grant its exact permissions next"
      footer={
        <Button className="w-full gap-1.5" disabled={!label.trim()} onClick={submit}>
          <Plus className="h-4 w-4" /> Create role &amp; open permissions
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="role-name">Role name</Label>
          <Input
            id="role-name"
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Store Auditor"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role-summary">Description (optional)</Label>
          <Textarea
            id="role-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What is this role responsible for?"
          />
        </div>

        <div className="space-y-2">
          <Label>Workspace access</Label>
          <div className="space-y-1.5">
            {WORKSPACES.map((w) => {
              const checked = workspaces.includes(w.id);
              return (
                <label
                  key={w.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition",
                    checked ? "border-[#B3BFF6] bg-[#F5F7FF]" : "border-border hover:bg-muted"
                  )}
                >
                  <Checkbox checked={checked} onChange={() => toggleWorkspace(w.id)} aria-label={w.label} />
                  <span className="font-medium">{w.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{w.tagline}</span>
                </label>
              );
            })}
          </div>
        </div>

        <p className="rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD]/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#3347D6]">
          New roles start with no capabilities granted. After creating this role, use the permission matrix to choose exactly what it can see and do.
        </p>
      </div>
    </Drawer>
  );
}
