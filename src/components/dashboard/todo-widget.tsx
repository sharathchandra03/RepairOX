"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, ListChecks, MoreHorizontal, Pencil, Trash2, CheckCircle2,
  RotateCcw, Clock, Lock, Search, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import {
  useTasks, PRIORITY_LABEL, PRIORITY_TONE, PRIORITY_RANK,
  type Task, type TaskInput,
} from "@/lib/tasks";
import { TaskFormDrawer } from "./task-form-drawer";

/* ── Helpers ── */
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function formatDue(task: Task): string | null {
  if (!task.dueDate && !task.dueTime) return null;
  const parts: string[] = [];
  if (task.dueDate) {
    const d = new Date(`${task.dueDate}T00:00:00`);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      parts.push(task.dueDate === today ? "Today" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
    }
  }
  if (task.dueTime) {
    const [h, m] = task.dueTime.split(":");
    const hh = Number(h);
    if (!isNaN(hh)) {
      const ampm = hh >= 12 ? "PM" : "AM";
      const h12 = ((hh + 11) % 12) + 1;
      parts.push(`${h12}:${m ?? "00"} ${ampm}`);
    } else {
      parts.push(task.dueTime);
    }
  }
  return parts.join(" · ");
}

/* ── Single task row ── */
function TaskRow({
  task, index, assigneeName, onToggle, onEdit, onDelete,
}: {
  task: Task;
  index: number;
  assigneeName?: string;
  onToggle: (completed: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const due = formatDue(task);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2) }}
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-3 transition",
        task.completed
          ? "border-amber-200/40 bg-white/30"
          : "border-amber-200/60 bg-white/60 backdrop-blur-sm hover:bg-white/80"
      )}
    >
      <span className="mt-0.5">
        <Checkbox
          checked={task.completed}
          onChange={onToggle}
          aria-label={task.completed ? "Reopen task" : "Complete task"}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            "text-sm font-semibold",
            task.completed ? "text-amber-900/50 line-through" : "text-amber-900"
          )}>
            {task.title}
          </p>

          {/* Three-dot actions */}
          <Dropdown
            align="right"
            width="w-40"
            trigger={({ toggle }) => (
              <button
                onClick={toggle}
                aria-label="Task actions"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-amber-700/70 opacity-0 transition hover:bg-amber-100 hover:text-amber-900 focus:opacity-100 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={task.completed ? RotateCcw : CheckCircle2}
                  onClick={() => { onToggle(!task.completed); close(); }}
                >
                  {task.completed ? "Reopen" : "Complete"}
                </MenuItem>
                <MenuItem icon={Pencil} onClick={() => { onEdit(); close(); }}>Edit</MenuItem>
                <MenuItem icon={Trash2} danger onClick={() => { onDelete(); close(); }}>Delete</MenuItem>
              </>
            )}
          </Dropdown>
        </div>

        {task.description && (
          <p className={cn(
            "mt-0.5 line-clamp-2 text-xs",
            task.completed ? "text-amber-800/40" : "text-amber-800/70"
          )}>
            {task.description}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_TONE[task.priority]} className={cn("px-2 py-0.5 text-[10px]", task.completed && "opacity-60")}>
            {PRIORITY_LABEL[task.priority]}
          </Badge>

          {task.isPrivate && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
              <Lock className="h-2.5 w-2.5" /> Private
            </span>
          )}

          {due && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/70 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              <Clock className="h-2.5 w-2.5" /> {due}
            </span>
          )}

          {assigneeName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-amber-600 text-[8px] font-bold text-white">
                {initials(assigneeName)}
              </span>
              {assigneeName.split(/\s+/)[0]}
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/* ── Widget ── */
export function TodoWidget() {
  const { currentUser, team, getStaffById } = usePermissions();
  const resolveStaffName = React.useCallback((id: string) => getStaffById(id)?.name, [getStaffById]);
  const { tasks, loading, addTask, updateTask, setCompleted, deleteTask } =
    useTasks({ currentStaffId: currentUser?.id ?? null, resolveStaffName });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Task | null>(null);
  const [query, setQuery] = React.useState("");

  const assignees = React.useMemo(
    () => team.filter((m) => m.status !== "suspended").map((m) => ({ label: m.name, value: m.id })),
    [team]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) =>
      t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
    );
  }, [tasks, query]);

  const { active, done } = React.useMemo(() => {
    const byPriorityThenDate = (a: Task, b: Task) => {
      const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (p !== 0) return p;
      const ad = a.dueDate ?? "9999-99-99";
      const bd = b.dueDate ?? "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    };
    return {
      active: filtered.filter((t) => !t.completed).sort(byPriorityThenDate),
      done: filtered.filter((t) => t.completed)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    };
  }, [filtered]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (task: Task) => { setEditing(task); setFormOpen(true); };

  const handleSave = (input: TaskInput) => {
    if (editing) updateTask(editing.id, input);
    else addTask(input);
  };

  const showSearch = tasks.length > 4;
  const isEmpty = !loading && tasks.length === 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#F0E68C]/60 bg-[#FFF9C4] p-5 shadow-[0_4px_16px_-4px_rgba(200,180,0,0.15),0_8px_32px_-8px_rgba(200,180,0,0.1)] sm:p-6">
      {/* Decorative tape */}
      <div className="absolute -top-1 left-1/2 h-6 w-16 -translate-x-1/2 rounded-b-md bg-[#FFE082]/80 shadow-sm" />
      {/* Subtle lined-paper effect */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, #B8860B 27px, #B8860B 28px)", backgroundPosition: "0 48px" }} />

      {/* Header */}
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-800/70">Today&apos;s Focus</p>
          <h3 className="font-display mt-0.5 flex items-center gap-2 text-base font-bold text-amber-900">
            <ListChecks className="h-4 w-4 text-amber-700" /> To-Do List
            {active.length > 0 && (
              <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                {active.length}
              </span>
            )}
          </h3>
        </div>
        <button
          onClick={openAdd}
          aria-label="Add task"
          className="grid h-8 w-8 place-items-center rounded-lg border border-amber-300/60 bg-[#FFF176]/50 text-amber-700 transition hover:bg-[#FFF176] hover:text-amber-900"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="relative mt-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            iconLeft={<Search className="h-3.5 w-3.5" />}
            className="h-9 border-amber-200/70 bg-white/60"
          />
        </div>
      )}

      {/* Body */}
      <div className="relative mt-4">
        {loading ? (
          <div className="grid place-items-center py-10 text-amber-700/70">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-amber-300/60 bg-white/30 px-4 py-10 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-amber-100 text-amber-600 ring-1 ring-inset ring-amber-200">
              <ListChecks className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-amber-900">No tasks for today.</p>
            <p className="mt-0.5 text-xs text-amber-800/60">Stay on top of your day — add your first to-do.</p>
            <button
              onClick={openAdd}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-amber-700"
            >
              <Plus className="h-3.5 w-3.5" /> Create your first task
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-amber-800/60">No tasks match &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className="grid max-h-[420px] grid-cols-1 gap-2.5 overflow-y-auto pr-0.5">
            <AnimatePresence initial={false}>
              {active.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  index={i}
                  assigneeName={t.assignedTo ? resolveStaffName(t.assignedTo) : undefined}
                  onToggle={(c) => setCompleted(t.id, c)}
                  onEdit={() => openEdit(t)}
                  onDelete={() => setDeleteTarget(t)}
                />
              ))}
            </AnimatePresence>

            {done.length > 0 && (
              <li className="mt-1 flex items-center gap-2 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800/50">
                <span>Completed</span>
                <span className="h-px flex-1 bg-amber-300/40" />
                <span>{done.length}</span>
              </li>
            )}

            <AnimatePresence initial={false}>
              {done.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  index={i}
                  assigneeName={t.assignedTo ? resolveStaffName(t.assignedTo) : undefined}
                  onToggle={(c) => setCompleted(t.id, c)}
                  onEdit={() => openEdit(t)}
                  onDelete={() => setDeleteTarget(t)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Add / Edit drawer */}
      <TaskFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        initial={editing}
        assignees={assignees}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteTask(deleteTarget.id); }}
        title="Delete task?"
        description={deleteTarget ? `"${deleteTarget.title}" will be removed from your to-do list.` : undefined}
        confirmLabel="Delete task"
      />
    </div>
  );
}
