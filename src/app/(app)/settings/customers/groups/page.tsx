"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Archive, ArchiveRestore, Trash2, X, ArrowUp, ArrowDown, Tag, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import {
  createCustomerGroup,
  CUSTOMER_GROUP_COLORS,
  groupToneClasses,
  type CustomerGroup,
} from "@/lib/customer-data";

const COLOR_OPTIONS = CUSTOMER_GROUP_COLORS.map((c) => ({ label: c.charAt(0).toUpperCase() + c.slice(1), value: c }));

type FormState = { name: string; description: string; color: string };
const EMPTY_FORM: FormState = { name: "", description: "", color: "slate" };

export default function CustomerGroupsPage() {
  const { customerGroups, customers, addCustomerGroup, updateCustomerGroup, deleteCustomerGroup } = useStore();
  const { can } = usePermissions();
  const canManage = can("manage_customer_groups") || can("manage_customers");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Count how many customers belong to each group (uses the Customer Master —
  // one source of truth, never a separate customer table).
  const memberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of customers) {
      for (const gid of c.groupIds ?? []) counts[gid] = (counts[gid] ?? 0) + 1;
    }
    return counts;
  }, [customers]);

  const sorted = useMemo(
    () => [...customerGroups].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [customerGroups]
  );
  const activeGroups = sorted.filter((g) => g.active);
  const archivedGroups = sorted.filter((g) => !g.active);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (g: CustomerGroup) => {
    setForm({ name: g.name, description: g.description, color: g.color });
    setEditingId(g.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateCustomerGroup(editingId, { name: form.name.trim(), description: form.description.trim(), color: form.color });
    } else {
      const nextOrder = customerGroups.reduce((m, g) => Math.max(m, g.displayOrder), 0) + 1;
      const group = createCustomerGroup({
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color,
        displayOrder: nextOrder,
        active: true,
      });
      addCustomerGroup(group);
    }
    resetForm();
  };

  // Reorder within the active list by swapping display_order with the neighbour.
  const move = (g: CustomerGroup, dir: -1 | 1) => {
    const idx = activeGroups.findIndex((x) => x.id === g.id);
    const swapWith = activeGroups[idx + dir];
    if (!swapWith) return;
    updateCustomerGroup(g.id, { displayOrder: swapWith.displayOrder });
    updateCustomerGroup(swapWith.id, { displayOrder: g.displayOrder });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings › Customers"
        title="Customer Groups"
        subtitle="Reusable segmentation labels (VIP, Wholesale, Corporate…). A customer can belong to many groups. Groups are separate from Customer Type and Source."
        actions={
          canManage ? (
            <Button size="md" onClick={openNew}>
              <Plus className="h-4 w-4" /> New Group
            </Button>
          ) : undefined
        }
      />

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{editingId ? "Edit Group" : "New Customer Group"}</h3>
                <button onClick={resetForm} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 lg:col-span-1">
                  <Label>Group Name *</Label>
                  <Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. VIP" />
                </div>
                <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} placeholder="Optional — what this group means" />
                </div>
                <div className="space-y-1">
                  <Label>Tag Colour</Label>
                  <RSelect value={form.color} onChange={(v) => setForm({ ...form, color: v })} options={COLOR_OPTIONS} />
                </div>
              </div>
              {/* Preview */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Preview:</span>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", groupToneClasses(form.color))}>
                  {form.name.trim() || "Group name"}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" size="md" onClick={resetForm}>Cancel</Button>
                <Button size="md" onClick={handleSave} disabled={!form.name.trim()}>
                  {editingId ? "Update Group" : "Create Group"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active groups */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Active Groups ({activeGroups.length})
          </p>
        </div>
        {activeGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-[#4361EE] ring-1 ring-inset ring-indigo-200">
              <Tag className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold">No customer groups yet</p>
            <p className="text-sm text-muted-foreground">Create groups like VIP, Wholesale or Corporate to segment your customers.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activeGroups.map((g, i) => (
              <GroupRow
                key={g.id}
                group={g}
                count={memberCounts[g.id] ?? 0}
                canManage={canManage}
                isFirst={i === 0}
                isLast={i === activeGroups.length - 1}
                onMoveUp={() => move(g, -1)}
                onMoveDown={() => move(g, 1)}
                onEdit={() => openEdit(g)}
                onArchive={() => updateCustomerGroup(g.id, { active: false })}
                confirmDelete={confirmDelete === g.id}
                onAskDelete={() => setConfirmDelete(g.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onConfirmDelete={() => { deleteCustomerGroup(g.id); setConfirmDelete(null); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Archived groups */}
      {archivedGroups.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Archived ({archivedGroups.length})
            </p>
          </div>
          <div className="divide-y divide-border">
            {archivedGroups.map((g) => (
              <GroupRow
                key={g.id}
                group={g}
                count={memberCounts[g.id] ?? 0}
                canManage={canManage}
                archived
                onRestore={() => updateCustomerGroup(g.id, { active: true })}
                confirmDelete={confirmDelete === g.id}
                onAskDelete={() => setConfirmDelete(g.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onConfirmDelete={() => { deleteCustomerGroup(g.id); setConfirmDelete(null); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupRow({
  group: g,
  count,
  canManage,
  archived = false,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onArchive,
  onRestore,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  group: CustomerGroup;
  count: number;
  canManage: boolean;
  archived?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-5 py-3 transition", archived ? "opacity-70" : "hover:bg-muted/30")}>
      {/* Reorder controls (active only) */}
      {canManage && !archived && (
        <div className="flex flex-col">
          <button onClick={onMoveUp} disabled={isFirst} className="grid h-4 w-5 place-items-center rounded text-zinc-400 hover:text-[#4361EE] disabled:opacity-30 disabled:hover:text-zinc-400 transition" title="Move up">
            <ArrowUp className="h-3 w-3" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="grid h-4 w-5 place-items-center rounded text-zinc-400 hover:text-[#4361EE] disabled:opacity-30 disabled:hover:text-zinc-400 transition" title="Move down">
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Tag + name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", groupToneClasses(g.color))}>
            {g.name}
          </span>
        </div>
        {g.description && <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{g.description}</p>}
      </div>

      {/* Member count */}
      <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
        <Users className="h-3.5 w-3.5" />
        {count} member{count !== 1 ? "s" : ""}
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          {!archived && (
            <>
              <button onClick={onEdit} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-[#4361EE] hover:bg-indigo-50 transition" title="Edit">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={onArchive} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition" title="Archive">
                <Archive className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {archived && (
            <button onClick={onRestore} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 transition" title="Restore">
              <ArchiveRestore className="h-3.5 w-3.5" />
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={onCancelDelete}>No</Button>
              <Button size="sm" onClick={onConfirmDelete} className="bg-rose-600 hover:bg-rose-700 text-white">Delete</Button>
            </div>
          ) : (
            <button onClick={onAskDelete} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
