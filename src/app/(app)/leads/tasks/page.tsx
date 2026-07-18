"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, CheckCircle2, Circle, Clock, AlertCircle, User, Calendar,
  MoreVertical, Edit3, Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";

type TaskPriority = "high" | "medium" | "low";
type TaskStatus = "pending" | "in_progress" | "completed" | "overdue";

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  lead: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  reminder: string;
  type: string;
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  high: "text-rose-600 bg-rose-50 ring-rose-200",
  medium: "text-amber-600 bg-amber-50 ring-amber-200",
  low: "text-sky-600 bg-sky-50 ring-sky-200",
};

const STATUS_ICON: Record<TaskStatus, typeof CheckCircle2> = {
  pending: Circle, in_progress: Clock, completed: CheckCircle2, overdue: AlertCircle,
};
const STATUS_STYLE: Record<TaskStatus, string> = {
  pending: "text-zinc-400", in_progress: "text-[#4361EE]", completed: "text-emerald-500", overdue: "text-rose-500",
};

const TASKS: Task[] = [
  { id: "T-1", title: "Follow up with Aarav on repair estimate", description: "Send revised quotation for iPhone 14 Pro display replacement. Customer expecting response today.", assignee: "Kalai S.", lead: "Aarav Mehta", priority: "high", status: "overdue", dueDate: "Jul 18, 9:00 AM", reminder: "1 hour before", type: "Follow-up" },
  { id: "T-2", title: "Schedule demo for NexaCore bulk contract", description: "Set up a video call to walk through the fleet repair package. Contact Falguni's assistant for scheduling.", assignee: "Manoj S.", lead: "Falguni Patel", priority: "high", status: "pending", dueDate: "Jul 19, 11:00 AM", reminder: "30 min before", type: "Meeting" },
  { id: "T-3", title: "Send quotation to GreenLeaf", description: "iPad classroom setup proposal with 3 pricing tiers. Include volume discount for 20+ units.", assignee: "Ritesh Kumar", lead: "Diya Sen", priority: "medium", status: "in_progress", dueDate: "Jul 20, 2:00 PM", reminder: "1 hour before", type: "Quote" },
  { id: "T-4", title: "Call Eshan for feedback on iWatch repair", description: "Check if he's satisfied with the S8 screen fix. Ask for Google review.", assignee: "Kalai S.", lead: "Eshan Roy", priority: "low", status: "completed", dueDate: "Jul 16, 4:00 PM", reminder: "None", type: "Call" },
  { id: "T-5", title: "Update Bina's MacBook estimate", description: "Revised estimate after logic board inspection. Board needs replacement, not repair.", assignee: "Manoj S.", lead: "Bina Soni", priority: "medium", status: "pending", dueDate: "Jul 21, 10:00 AM", reminder: "1 hour before", type: "Quote" },
  { id: "T-6", title: "Prepare contract for PixelCraft Studio", description: "Annual maintenance agreement draft for Heena's approval. Cover 5 MacBooks + 2 iMacs.", assignee: "Ritesh Kumar", lead: "Heena Kapoor", priority: "high", status: "in_progress", dueDate: "Jul 22, 5:00 PM", reminder: "2 hours before", type: "Document" },
];

const FILTER_CHIPS = [
  { label: "My Tasks", value: "mine" },
  { label: "Open Today", value: "today" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "High Priority", value: "high" },
];

export default function TasksPage() {
  const [activeTask, setActiveTask] = useState<Task>(TASKS[0]);
  const [activeFilter, setActiveFilter] = useState("mine");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Tasks"
        subtitle="Follow-ups and action items across your pipeline."
        actions={
          <Can permission="create">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Task
            </Button>
          </Can>
        }
      />

      {/* Filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setActiveFilter(chip.value)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition",
              activeFilter === chip.value
                ? "bg-[#4361EE] text-white shadow-sm"
                : "bg-card border border-border text-zinc-600 hover:bg-muted"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Quick Add Task */}
      <div className="rounded-2xl border border-[#B3BFF6] bg-[#FAFBFF] p-4">
        <div className="flex items-center gap-3">
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-zinc-400"
            placeholder="Enter a new task: e.g. Follow up with Aarav about quotation"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <button className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-200 transition">Tomorrow</button>
            <button className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-200 transition">@Assign</button>
            <button className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-200 transition">Priority</button>
          </div>
          <Button size="sm" className="shrink-0 rounded-lg">Add</Button>
        </div>
      </div>

      {/* Split view: Task list + Detail */}
      <div className="flex h-[calc(100vh-340px)] gap-4 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">

        {/* Left: Task list */}
        <div className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border">
          {TASKS.map((task) => {
            const SIcon = STATUS_ICON[task.status];
            const isActive = activeTask.id === task.id;
            return (
              <button
                key={task.id}
                onClick={() => setActiveTask(task)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border/50 px-4 py-3.5 text-left transition",
                  isActive ? "bg-[#EEF1FD]" : "hover:bg-muted/50"
                )}
              >
                <SIcon className={cn("mt-0.5 h-5 w-5 shrink-0", STATUS_STYLE[task.status])} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[13px] font-semibold truncate", task.status === "completed" && "line-through text-muted-foreground")}>{task.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{task.assignee}</span>
                    <span>·</span>
                    <span className={task.status === "overdue" ? "text-rose-600 font-semibold" : ""}>{task.dueDate.split(",")[0]}</span>
                  </div>
                  <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ring-inset capitalize", PRIORITY_STYLE[task.priority])}>{task.priority}</span>
                </div>
                <button className="shrink-0 text-zinc-300 hover:text-zinc-600 mt-1"><MoreVertical className="h-3.5 w-3.5" /></button>
              </button>
            );
          })}
        </div>

        {/* Right: Task detail */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-lg font-bold">{activeTask.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{activeTask.id} · {activeTask.type}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full"><Edit3 className="h-3 w-3" /> Edit</Button>
              <Button size="sm" className="gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700"><Check className="h-3.5 w-3.5" /> Mark Complete</Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-5 border-b border-border">
            <div className="flex gap-4">
              {["General Information", "Other Details"].map((tab, i) => (
                <button key={tab} className={cn("pb-2.5 text-[12px] font-semibold transition border-b-2", i === 0 ? "border-[#4361EE] text-[#4361EE]" : "border-transparent text-muted-foreground hover:text-foreground")}>{tab}</button>
              ))}
            </div>
          </div>

          {/* Detail fields */}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p><p className="mt-1 text-sm font-medium capitalize">{activeTask.status.replace("_", " ")}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</p><p className="mt-1 text-sm font-medium capitalize">{activeTask.priority}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Due Date</p><p className="mt-1 text-sm font-medium">{activeTask.dueDate}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned To</p><p className="mt-1 text-sm font-medium">{activeTask.assignee}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reminder</p><p className="mt-1 text-sm font-medium">{activeTask.reminder}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lead</p><p className="mt-1 text-sm font-medium text-[#4361EE]">{activeTask.lead}</p></div>
          </div>

          {/* Description */}
          <div className="mt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-700">{activeTask.description}</p>
          </div>

          {/* Notes */}
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm font-semibold">Notes</p>
            <textarea className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/10 transition resize-none h-24" placeholder="Do you have any notes to add?" />
          </div>
        </div>
      </div>
    </div>
  );
}
