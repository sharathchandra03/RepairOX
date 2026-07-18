"use client";

import { useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { motion } from "framer-motion";
import {
  Plus, MoreHorizontal, Phone, Mail, MessageSquare, Filter, Search,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn, formatINR } from "@/lib/utils";

/* ── Pipeline stages ── */
const STAGE_META = [
  { id: "new",        label: "New",           color: "bg-sky-500" },
  { id: "contacted",  label: "Contacted",     color: "bg-violet-500" },
  { id: "qualified",  label: "Qualified",     color: "bg-indigo-500" },
  { id: "proposal",   label: "Proposal Sent", color: "bg-amber-500" },
  { id: "follow_up",  label: "Follow Up",     color: "bg-orange-500" },
  { id: "won",        label: "Won",           color: "bg-emerald-500" },
  { id: "lost",       label: "Lost",          color: "bg-zinc-400" },
];

interface KanbanCard {
  id: string;
  name: string;
  company: string;
  value: number;
  score: number;
  source: string;
  age: string;
}

type BoardState = Record<string, KanbanCard[]>;

const INITIAL_BOARD: BoardState = {
  new: [
    { id: "1", name: "Aarav Mehta",   company: "TechNova",   value: 22500, score: 92, source: "Google",    age: "2h" },
    { id: "2", name: "Bina Soni",     company: "DesignHub",  value: 18000, score: 78, source: "Meta",      age: "5h" },
    { id: "3", name: "Chetan Bhatt",  company: "",           value: 45000, score: 85, source: "Walk-In",   age: "1d" },
    { id: "4", name: "Gaurav Pillai", company: "",           value: 9800,  score: 68, source: "Meta",      age: "30m" },
    { id: "5", name: "Heena Kapoor",  company: "PixelCraft", value: 28000, score: 88, source: "Reference", age: "1h" },
  ],
  contacted: [
    { id: "6",  name: "Diya Sen",     company: "GreenLeaf",  value: 12000, score: 72, source: "Reference", age: "3h" },
    { id: "7",  name: "Eshan Roy",    company: "CloudSync",  value: 8500,  score: 55, source: "YouTube",   age: "1d" },
    { id: "8",  name: "Jaya Iyer",    company: "SwiftServe", value: 19500, score: 74, source: "Google",    age: "6h" },
    { id: "9",  name: "Kunal Shah",   company: "DataVault",  value: 14000, score: 65, source: "Walk-In",   age: "2d" },
  ],
  qualified: [
    { id: "10", name: "Lakshmi Rao",  company: "NexaCore",   value: 35000, score: 90, source: "Google",    age: "4h" },
    { id: "11", name: "Manoj D.",     company: "",           value: 11000, score: 62, source: "Meta",      age: "2d" },
    { id: "12", name: "Nisha Tiwari", company: "BrightEdge", value: 25000, score: 81, source: "Reference", age: "1d" },
  ],
  proposal: [
    { id: "13", name: "Omkar Joshi",  company: "TechNova",   value: 42000, score: 87, source: "Google",    age: "3d" },
    { id: "14", name: "Priya Nair",   company: "DesignHub",  value: 15000, score: 73, source: "YouTube",   age: "5d" },
  ],
  follow_up: [
    { id: "15", name: "Rahul Kapoor", company: "",           value: 32000, score: 79, source: "Walk-In",   age: "2d" },
    { id: "16", name: "Sneha Das",    company: "CloudSync",  value: 8000,  score: 58, source: "Meta",      age: "4d" },
    { id: "17", name: "Tarun Singh",  company: "BuildRight", value: 48000, score: 44, source: "Reference", age: "7d" },
  ],
  won: [
    { id: "18", name: "Falguni Patel",company: "NexaCore",   value: 11000, score: 95, source: "Google",    age: "today" },
    { id: "19", name: "Vikram M.",    company: "SwiftServe", value: 55000, score: 91, source: "Reference", age: "today" },
  ],
  lost: [
    { id: "20", name: "Ishaan Verma", company: "BuildRight", value: 15000, score: 32, source: "Walk-In",   age: "5d" },
  ],
};

export default function KanbanPage() {
  const [board, setBoard] = useState<BoardState>(INITIAL_BOARD);

  const onDragEnd = useCallback((result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setBoard((prev) => {
      const next = { ...prev };
      const srcCol = [...(next[source.droppableId] || [])];
      const dstCol = source.droppableId === destination.droppableId
        ? srcCol
        : [...(next[destination.droppableId] || [])];

      const [moved] = srcCol.splice(source.index, 1);
      dstCol.splice(destination.index, 0, moved);

      next[source.droppableId] = srcCol;
      next[destination.droppableId] = dstCol;
      return next;
    });
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Pipeline"
        subtitle="Drag leads across stages to update their progress."
        actions={
          <div className="flex items-center gap-2">
            <Input iconLeft={<Search className="h-4 w-4" />} placeholder="Search..." className="h-9 w-56 rounded-xl" />
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full"><Filter className="h-3.5 w-3.5" /> Filter</Button>
            <Can permission="manage_sales">
              <Button size="sm" className="gap-1.5 rounded-full"><Plus className="h-3.5 w-3.5" /> Add Lead</Button>
            </Can>
          </div>
        }
      />

      {/* Pipeline summary strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {STAGE_META.map((s) => {
          const cards = board[s.id] || [];
          const total = cards.reduce((a, c) => a + c.value, 0);
          return (
            <div key={s.id} className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium shadow-sm">
              <span className={cn("h-2 w-2 rounded-full", s.color)} />
              <span className="text-zinc-700">{s.label}</span>
              <span className="text-zinc-400">·</span>
              <span className="tnum text-zinc-500">{cards.length}</span>
              <span className="text-zinc-400">·</span>
              <span className="tnum font-semibold text-zinc-700">{formatINR(total)}</span>
            </div>
          );
        })}
      </div>

      {/* Kanban board with DnD */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_META.map((stage) => {
            const cards = board[stage.id] || [];
            return (
              <Droppable key={stage.id} droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex w-[280px] shrink-0 flex-col rounded-2xl border p-3 transition-colors",
                      snapshot.isDraggingOver
                        ? "border-[#4361EE]/40 bg-[#EEF1FD]/40"
                        : "border-border bg-zinc-50/70"
                    )}
                  >
                    {/* Column header */}
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", stage.color)} />
                        <span className="text-[12px] font-semibold text-zinc-800">{stage.label}</span>
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-200/80 text-[10px] font-bold text-zinc-600">
                          {cards.length}
                        </span>
                      </div>
                      <button className="text-zinc-400 hover:text-zinc-600 transition">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[calc(100vh-340px)] min-h-[100px]">
                      {cards.map((card, ci) => (
                        <Draggable key={card.id} draggableId={card.id} index={ci}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={cn(
                                "group rounded-xl border bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition",
                                snap.isDragging
                                  ? "border-[#4361EE] shadow-lg rotate-1 scale-[1.02]"
                                  : "border-zinc-200 hover:-translate-y-0.5 hover:shadow-card"
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <Avatar name={card.name} size={30} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-semibold text-zinc-900">{card.name}</p>
                                  <p className="truncate text-[11px] text-zinc-500">{card.company || "Individual"}</p>
                                </div>
                                <span className={cn(
                                  "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset",
                                  card.score >= 80 ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                                  card.score >= 60 ? "bg-amber-50 text-amber-700 ring-amber-200" :
                                  "bg-zinc-50 text-zinc-500 ring-zinc-200"
                                )}>
                                  {card.score}
                                </span>
                              </div>
                              <div className="mt-2.5 flex items-center justify-between">
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{card.source}</span>
                                <span className="text-[12px] font-semibold tnum text-zinc-800">{formatINR(card.value)}</span>
                              </div>
                              <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2.5">
                                <span className="text-[10px] text-zinc-400">{card.age} ago</span>
                                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                                  <button className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-emerald-600"><Phone className="h-3 w-3" /></button>
                                  <button className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-sky-600"><Mail className="h-3 w-3" /></button>
                                  <button className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-green-600"><MessageSquare className="h-3 w-3" /></button>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>

                    {/* Add button */}
                    <button className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-white/50 py-2.5 text-[11px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:bg-white hover:text-zinc-700">
                      <Plus className="h-3.5 w-3.5" /> Add lead
                    </button>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
