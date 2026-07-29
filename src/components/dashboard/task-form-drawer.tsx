"use client";

import * as React from "react";
import { Check, ListChecks, Lock } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { cn } from "@/lib/utils";
import { TASK_PRIORITIES, type Task, type TaskInput, type TaskPriority } from "@/lib/tasks";

/* Small on/off switch — reuses RepairOX blue tokens (no new visual language). */
function Toggle({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition hover:border-[#4361EE]/40"
    >
      <span className="flex items-center gap-2.5">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset transition-colors",
          checked ? "bg-[#EEF1FD] text-[#4361EE] ring-[#B3BFF6]/60" : "bg-muted text-muted-foreground ring-border")}>
          <Lock className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        </span>
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-[#4361EE]" : "bg-zinc-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export interface TaskFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: TaskInput) => void;
  /** Provide a task to edit; omit for a new task. */
  initial?: Task | null;
  /** Staff options for "Assign To" ({ label, value: staffId }). */
  assignees: { label: string; value: string }[];
}

export function TaskFormDrawer(props: TaskFormDrawerProps) {
  if (!props.open) return null;
  return <TaskFormInner {...props} />;
}

function TaskFormInner({ onClose, onSave, initial, assignees }: TaskFormDrawerProps) {
  const isEdit = Boolean(initial);
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [priority, setPriority] = React.useState<TaskPriority>(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = React.useState(initial?.dueDate ?? "");
  const [dueTime, setDueTime] = React.useState(initial?.dueTime ?? "");
  const [assignedTo, setAssignedTo] = React.useState(initial?.assignedTo ?? "");
  const [isPrivate, setIsPrivate] = React.useState(Boolean(initial?.isPrivate));
  const [touched, setTouched] = React.useState(false);

  const titleValid = title.trim().length > 0;

  const assigneeOptions = React.useMemo(
    () => [{ label: "Unassigned", value: "" }, ...assignees],
    [assignees]
  );

  const submit = () => {
    if (!titleValid) { setTouched(true); return; }
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      assignedTo: assignedTo || null,
      isPrivate,
    });
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={isEdit ? "Edit Task" : "New Task"}
      subtitle={isEdit ? "Update this to-do item" : "Add a to-do to today's focus"}
      icon={ListChecks}
      width="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!titleValid}>
            <Check className="h-3.5 w-3.5" /> {isEdit ? "Save Changes" : "Save Task"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-1.5">
          <Label>Task Title <span className="text-rose-500">*</span></Label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Call customer about screen replacement"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          {touched && !titleValid && (
            <p className="text-[11px] font-medium text-rose-500">A task title is required.</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description <span className="text-muted-foreground/60">(optional)</span></Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any details…"
            rows={3}
          />
        </div>

        {/* Due date + time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Due Date <span className="text-muted-foreground/60">(optional)</span></Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due Time <span className="text-muted-foreground/60">(optional)</span></Label>
            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </div>
        </div>

        {/* Priority + Assignee */}
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <RSelect
            value={priority}
            onChange={(v) => setPriority(v as TaskPriority)}
            options={TASK_PRIORITIES}
            menuWidth="w-56"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Assign To <span className="text-muted-foreground/60">(optional)</span></Label>
          <RSelect
            value={assignedTo}
            onChange={setAssignedTo}
            options={assigneeOptions}
            searchable
            placeholder="Unassigned"
            menuWidth="w-64"
          />
        </div>

        {/* Private toggle */}
        <Toggle
          checked={isPrivate}
          onChange={setIsPrivate}
          label="Private task"
          hint={isPrivate ? "Only you can see this task" : "Visible to your team"}
        />
      </div>
    </Drawer>
  );
}
