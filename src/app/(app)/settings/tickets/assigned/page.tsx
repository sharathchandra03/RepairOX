"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, Users, Megaphone, Wrench, Lock, Route } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { createAssignedByOption } from "@/lib/assigned-by-data";
import { createAssignedToOption } from "@/lib/assigned-to-data";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import {
  useTicketFieldOptions, BUILT_IN_TICKET_OPTIONS, TICKET_OPTION_FIELD_LABEL, type TicketOptionField,
} from "@/lib/ticket-field-options";

export default function AssignedSettingsPage() {
  const {
    assignedByOptions,
    assignedToOptions,
    addAssignedByOption,
    addAssignedToOption,
    deleteAssignedByOption,
    deleteAssignedToOption,
  } = useStore();

  const [newBy, setNewBy] = useState("");
  const [newTo, setNewTo] = useState("");
  const [confirmDeleteBy, setConfirmDeleteBy] = useState<string | null>(null);
  const [confirmDeleteTo, setConfirmDeleteTo] = useState<string | null>(null);

  const handleAddBy = () => {
    if (!newBy.trim()) return;
    addAssignedByOption(createAssignedByOption(newBy.trim(), assignedByOptions));
    setNewBy("");
  };

  const handleAddTo = () => {
    if (!newTo.trim()) return;
    addAssignedToOption(createAssignedToOption(newTo.trim(), assignedToOptions));
    setNewTo("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings › Tickets"
        title="Assigned & Ticket Options"
        subtitle="Manage Assigned By / Assigned To and the Lead Type, Source and Job Type options used when creating a ticket."
      />

      {/* ─── Assigned By Section ─── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <UserPlus className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Assigned By</p>
            <p className="text-[11px] text-muted-foreground">People who assign/receive tickets (e.g. front desk staff)</p>
          </div>
        </div>

        {/* Add New */}
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1 space-y-1">
            <Label>Name</Label>
            <Input
              value={newBy}
              onChange={(e: any) => setNewBy(e.target.value)}
              placeholder="e.g. Rajesh (Front Desk)"
              onKeyDown={(e: any) => e.key === "Enter" && handleAddBy()}
            />
          </div>
          <Button size="md" onClick={handleAddBy} disabled={!newBy.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {/* List */}
        {assignedByOptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">No entries yet. Add your first &quot;Assigned By&quot; person above.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {assignedByOptions.map((opt) => (
              <div key={opt.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-[#4361EE] text-xs font-bold">
                    {opt.name[0]?.toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{opt.name}</p>
                    <p className="text-[10px] text-muted-foreground">{opt.id}</p>
                  </div>
                </div>
                {confirmDeleteBy === opt.id ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setConfirmDeleteBy(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => { deleteAssignedByOption(opt.id); setConfirmDeleteBy(null); }} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteBy(opt.id)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{assignedByOptions.length} total</p>
      </div>

      {/* ─── Assigned To Section ─── */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Assigned To</p>
            <p className="text-[11px] text-muted-foreground">Technicians who work on tickets</p>
          </div>
        </div>

        {/* Add New */}
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1 space-y-1">
            <Label>Name</Label>
            <Input
              value={newTo}
              onChange={(e: any) => setNewTo(e.target.value)}
              placeholder="e.g. Suresh (Technician)"
              onKeyDown={(e: any) => e.key === "Enter" && handleAddTo()}
            />
          </div>
          <Button size="md" onClick={handleAddTo} disabled={!newTo.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        {/* List */}
        {assignedToOptions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">No entries yet. Add your first technician above.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {assignedToOptions.map((opt) => (
              <div key={opt.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold">
                    {opt.name[0]?.toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{opt.name}</p>
                    <p className="text-[10px] text-muted-foreground">{opt.id}</p>
                  </div>
                </div>
                {confirmDeleteTo === opt.id ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setConfirmDeleteTo(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => { deleteAssignedToOption(opt.id); setConfirmDeleteTo(null); }} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteTo(opt.id)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{assignedToOptions.length} total</p>
      </div>
      {/* ─── Lead Type + Source + Job Type (ticket dropdown options) ─── */}
      <TicketOptionSection
        field="lead_type"
        icon={Route}
        tone="bg-sky-50 text-sky-600"
        hint="How the device comes in. Shown in Device Details → Lead Type."
        placeholder="e.g. Courier, Corporate"
      />
      <TicketOptionSection
        field="source"
        icon={Megaphone}
        tone="bg-amber-50 text-amber-600"
        hint="Where the customer came from. Shown in Device Details → Source."
        placeholder="e.g. Instagram, JustDial"
      />
      <TicketOptionSection
        field="job_type"
        icon={Wrench}
        tone="bg-violet-50 text-violet-600"
        hint="What kind of job it is. Shown in Job Details → Job Type."
        placeholder="e.g. Data Recovery, Software"
      />
    </div>
  );
}

function TicketOptionSection({
  field, icon: Icon, tone, hint, placeholder,
}: {
  field: TicketOptionField;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  hint: string;
  placeholder: string;
}) {
  const { options, addOption, deleteOption } = useTicketFieldOptions();
  const { can } = usePermissions();
  const canAdd = allow(can, CAP.ticket.addFieldOption);
  const canDelete = allow(can, CAP.settings.ticketSettings);
  const [value, setValue] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const label = TICKET_OPTION_FIELD_LABEL[field];
  const builtIns = BUILT_IN_TICKET_OPTIONS[field];
  const custom = options.filter((o) => o.field === field);

  const handleAdd = async () => {
    if (!value.trim()) return;
    const ok = await addOption(field, value);
    if (ok) setValue("");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </div>
      {canAdd && (
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1 space-y-1">
            <Label>{label} name</Label>
            <Input
              value={value}
              onChange={(e: any) => setValue(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e: any) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button size="md" onClick={handleAdd} disabled={!value.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      )}
      <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
        {builtIns.map((o) => (
          <div key={o.value} className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-medium">{o.label}</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground" title="Built-in option — can't be removed">
              <Lock className="h-3 w-3" /> Built-in
            </span>
          </div>
        ))}
        {custom.map((o) => (
          <div key={o.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition">
            <p className="text-sm font-medium">{o.label}</p>
            {!canDelete ? null : confirmId === o.id ? (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>Cancel</Button>
                <Button size="sm" onClick={() => { deleteOption(o.id); setConfirmId(null); }} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(o.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                title="Delete (existing tickets keep this value)"
                aria-label={`Delete ${o.label}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{builtIns.length} built-in · {custom.length} added</p>
    </div>
  );
}
