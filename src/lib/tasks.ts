"use client";

/**
 * RepairOX — Tasks (dashboard "Today's Focus → To-Do List").
 *
 * A single, lightweight data layer for the personal / shared to-do widget.
 * When Supabase is configured, tasks are persisted in the `public.tasks`
 * table (RLS-scoped, audited by the DB trigger) and kept in sync across
 * sessions via a realtime channel. When it isn't (local prototype mode), the
 * exact same API is backed by localStorage so nothing breaks offline.
 *
 * Every mutation also writes a client Activity Log entry (module "Task") so
 * the dashboard audit feed reflects task activity immediately.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { logActivity, buildChanges } from "./activity-log";

/* ─── Types ──────────────────────────────────────────────────────── */

export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "open" | "completed";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed: boolean;
  dueDate: string | null; // yyyy-mm-dd
  dueTime: string | null; // HH:MM
  assignedTo: string | null; // staff id
  isPrivate: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
  completedAt: string | null;
}

/** What the add / edit form provides. */
export interface TaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  dueTime?: string | null;
  assignedTo?: string | null;
  isPrivate?: boolean;
}

/* ─── Priority presentation (shared by widget + form) ────────────── */

export const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

export const PRIORITY_TONE: Record<TaskPriority, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral", medium: "info", high: "warning", critical: "danger",
};

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

/* ─── DB row <-> Task mapping ─────────────────────────────────────── */

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  status: string | null;
  completed: boolean | null;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  is_private: boolean | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    priority: (r.priority as TaskPriority) ?? "medium",
    status: (r.status as TaskStatus) ?? (r.completed ? "completed" : "open"),
    completed: Boolean(r.completed),
    dueDate: r.due_date,
    dueTime: r.due_time,
    assignedTo: r.assigned_to,
    isPrivate: Boolean(r.is_private),
    createdBy: r.created_by,
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

/* ─── localStorage fallback (prototype / offline mode) ───────────── */

const LOCAL_KEY = "repairox-tasks-v1";

function loadLocal(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Task[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(tasks: Task[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks));
  } catch {
    /* storage full / unavailable */
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ─── Activity-log helpers ───────────────────────────────────────── */

function logCreate(task: Task, assigneeName?: string) {
  logActivity({
    module: "Task", action: "Task Created", severity: "success",
    entity: "Task", reference: task.title,
    description: `Added to-do "${task.title}"${assigneeName ? ` · assigned to ${assigneeName}` : ""}.`,
    meta: {
      Priority: PRIORITY_LABEL[task.priority],
      ...(task.dueDate ? { "Due": `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ""}` } : {}),
      Visibility: task.isPrivate ? "Private" : "Shared",
    },
  });
}

/* ─── Hook ───────────────────────────────────────────────────────── */

export interface UseTasksOptions {
  /** Current signed-in staff id (used to stamp deleted_by in DB mode + created_by locally). */
  currentStaffId?: string | null;
  /** Resolve a staff id to a display name (for richer activity descriptions). */
  resolveStaffName?: (id: string) => string | undefined;
}

export interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  /** "db" once Supabase reads succeed; "local" when falling back to localStorage. */
  mode: "db" | "local";
  addTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, patch: TaskInput) => Promise<void>;
  setCompleted: (id: string, completed: boolean) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

export function useTasks(opts: UseTasksOptions = {}): UseTasksResult {
  const { currentStaffId, resolveStaffName } = opts;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"db" | "local">(isSupabaseConfigured ? "db" : "local");

  // Always-current mode + tasks snapshot for callbacks without stale closures.
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const nameRef = useRef(resolveStaffName);
  useEffect(() => { nameRef.current = resolveStaffName; }, [resolveStaffName]);

  const resolveName = useCallback((id: string | null | undefined) => {
    if (!id) return undefined;
    return nameRef.current?.(id);
  }, []);

  /** Upsert a row into local state by id (keeps realtime + optimistic in sync). */
  const upsert = useCallback((task: Task) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx === -1) return [task, ...prev];
      const next = [...prev];
      next[idx] = task;
      return next;
    });
  }, []);

  const removeLocalState = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ── Initial load + realtime subscription ── */
  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured || !supabase) {
      setTasks(loadLocal());
      setMode("local");
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!active) return;

      if (error) {
        // Table not migrated yet / offline — degrade gracefully to localStorage
        // so the widget keeps working. Persistence resumes once the DB is ready.
        console.warn("[tasks] Supabase read failed, using local fallback:", error.message);
        setTasks(loadLocal());
        setMode("local");
        setLoading(false);
        return;
      }

      setTasks((data ?? []).map((r) => rowToTask(r as TaskRow)));
      setMode("db");
      setLoading(false);
    })();

    const client = supabase;
    const channel = client
      .channel("tasks-widget")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          if (modeRef.current !== "db") return;
          const row = (payload.new ?? payload.old) as TaskRow | undefined;
          if (!row) return;
          // Soft delete (deleted_at set) or hard delete → drop it.
          if (payload.eventType === "DELETE" || (payload.new as TaskRow | undefined)?.deleted_at) {
            removeLocalState(row.id);
            return;
          }
          upsert(rowToTask(payload.new as TaskRow));
        }
      )
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [upsert, removeLocalState]);

  /* ── Persist local-mode changes ── */
  useEffect(() => {
    if (mode === "local" && !loading) saveLocal(tasks);
  }, [tasks, mode, loading]);

  /* ── Create ── */
  const addTask = useCallback(async (input: TaskInput) => {
    const title = input.title.trim();
    if (!title) return;
    const priority = input.priority ?? "medium";

    if (modeRef.current === "db" && supabase) {
      const { data, error } = await supabase
        .from("tasks")
        // org / branch / created_by are filled by column defaults (RLS-safe).
        .insert({
          title,
          description: input.description?.trim() || null,
          priority,
          due_date: input.dueDate || null,
          due_time: input.dueTime || null,
          assigned_to: input.assignedTo || null,
          is_private: Boolean(input.isPrivate),
        })
        .select("*")
        .single();

      if (error || !data) {
        console.warn("[tasks] create failed:", error?.message);
        return;
      }
      const task = rowToTask(data as TaskRow);
      upsert(task);
      logCreate(task, resolveName(task.assignedTo));
      return;
    }

    // Local fallback
    const now = new Date().toISOString();
    const task: Task = {
      id: newId(),
      title,
      description: input.description?.trim() || null,
      priority,
      status: "open",
      completed: false,
      dueDate: input.dueDate || null,
      dueTime: input.dueTime || null,
      assignedTo: input.assignedTo || null,
      isPrivate: Boolean(input.isPrivate),
      createdBy: currentStaffId ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    upsert(task);
    logCreate(task, resolveName(task.assignedTo));
  }, [upsert, resolveName, currentStaffId]);

  /* ── Edit ── */
  const updateTask = useCallback(async (id: string, patch: TaskInput) => {
    const prev = tasksRef.current.find((t) => t.id === id);
    const title = patch.title?.trim();
    if (title !== undefined && title === "") return; // never blank the required title

    const merged: Task | undefined = prev && {
      ...prev,
      title: title ?? prev.title,
      description: patch.description !== undefined ? (patch.description?.trim() || null) : prev.description,
      priority: patch.priority ?? prev.priority,
      dueDate: patch.dueDate !== undefined ? (patch.dueDate || null) : prev.dueDate,
      dueTime: patch.dueTime !== undefined ? (patch.dueTime || null) : prev.dueTime,
      assignedTo: patch.assignedTo !== undefined ? (patch.assignedTo || null) : prev.assignedTo,
      isPrivate: patch.isPrivate !== undefined ? Boolean(patch.isPrivate) : prev.isPrivate,
      updatedAt: new Date().toISOString(),
    };

    const changes = buildChanges(
      prev as unknown as Record<string, unknown> | undefined,
      merged as unknown as Record<string, unknown>,
      [
        { key: "title", label: "Title" },
        { key: "description", label: "Description" },
        { key: "priority", label: "Priority", format: (v) => PRIORITY_LABEL[(v as TaskPriority)] ?? String(v ?? "—") },
        { key: "dueDate", label: "Due Date" },
        { key: "dueTime", label: "Due Time" },
        { key: "assignedTo", label: "Assigned To", format: (v) => (v ? (resolveName(v as string) ?? String(v)) : "Unassigned") },
        { key: "isPrivate", label: "Visibility", format: (v) => (v ? "Private" : "Shared") },
      ]
    );

    if (modeRef.current === "db" && supabase) {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          ...(title !== undefined ? { title } : {}),
          ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.dueDate !== undefined ? { due_date: patch.dueDate || null } : {}),
          ...(patch.dueTime !== undefined ? { due_time: patch.dueTime || null } : {}),
          ...(patch.assignedTo !== undefined ? { assigned_to: patch.assignedTo || null } : {}),
          ...(patch.isPrivate !== undefined ? { is_private: Boolean(patch.isPrivate) } : {}),
          ...(currentStaffId ? { updated_by: currentStaffId } : {}),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error || !data) {
        console.warn("[tasks] update failed:", error?.message);
        return;
      }
      upsert(rowToTask(data as TaskRow));
    } else if (merged) {
      upsert(merged);
    }

    logActivity({
      module: "Task", action: "Task Updated", severity: "info",
      entity: "Task", reference: merged?.title ?? prev?.title,
      description: `Updated to-do "${merged?.title ?? prev?.title ?? id}".`,
      changes,
    });
  }, [upsert, resolveName, currentStaffId]);

  /* ── Complete / Reopen ── */
  const setCompleted = useCallback(async (id: string, completed: boolean) => {
    const prev = tasksRef.current.find((t) => t.id === id);
    const completedAt = completed ? new Date().toISOString() : null;

    if (modeRef.current === "db" && supabase) {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          completed,
          status: completed ? "completed" : "open",
          completed_at: completedAt,
          ...(currentStaffId ? { updated_by: currentStaffId } : {}),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error || !data) {
        console.warn("[tasks] complete toggle failed:", error?.message);
        return;
      }
      upsert(rowToTask(data as TaskRow));
    } else if (prev) {
      upsert({ ...prev, completed, status: completed ? "completed" : "open", completedAt, updatedAt: new Date().toISOString() });
    }

    logActivity({
      module: "Task",
      action: completed ? "Task Completed" : "Task Reopened",
      severity: completed ? "success" : "info",
      entity: "Task", reference: prev?.title,
      description: `${completed ? "Completed" : "Reopened"} to-do "${prev?.title ?? id}".`,
    });
  }, [upsert, currentStaffId]);

  /* ── Delete (soft delete when DB-backed) ── */
  const deleteTask = useCallback(async (id: string) => {
    const prev = tasksRef.current.find((t) => t.id === id);

    if (modeRef.current === "db" && supabase) {
      const { error } = await supabase
        .from("tasks")
        .update({
          deleted_at: new Date().toISOString(),
          ...(currentStaffId ? { deleted_by: currentStaffId } : {}),
        })
        .eq("id", id);

      if (error) {
        console.warn("[tasks] delete failed:", error.message);
        return;
      }
    }
    removeLocalState(id);

    logActivity({
      module: "Task", action: "Task Deleted", severity: "critical",
      entity: "Task", reference: prev?.title,
      description: `Deleted to-do "${prev?.title ?? id}".`,
      meta: prev ? { Priority: PRIORITY_LABEL[prev.priority], Status: prev.completed ? "Completed" : "Open" } : undefined,
    });
  }, [removeLocalState, currentStaffId]);

  return { tasks, loading, mode, addTask, updateTask, setCompleted, deleteTask };
}
