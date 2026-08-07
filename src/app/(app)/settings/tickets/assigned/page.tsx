"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { createAssignedByOption } from "@/lib/assigned-by-data";
import { createAssignedToOption } from "@/lib/assigned-to-data";

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
    addAssignedByOption(createAssignedByOption(newBy.trim()));
    setNewBy("");
  };

  const handleAddTo = () => {
    if (!newTo.trim()) return;
    addAssignedToOption(createAssignedToOption(newTo.trim()));
    setNewTo("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings › Tickets"
        title="Assigned By & Assigned To"
        subtitle="Manage the people who assign tickets and the technicians they get assigned to."
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
    </div>
  );
}
