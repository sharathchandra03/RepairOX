"use client";

import { useCallback, type ReactNode } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   DraggableKpiRow — A drag-and-drop container for the top KPI cards.

   Uses @hello-pangea/dnd (React-Beautiful-DnD fork) which is already
   installed in the project. Provides:
   • Smooth drag animations with lift + shadow
   • Drop placeholder between cards
   • Responsive grid (4-col → 2-col → 1-col)
   • No layout jumps or flickering
   • Accessible keyboard reorder (built-in from library)

   Future-proof: accepts any ReactNode children keyed by cardId.
   ────────────────────────────────────────────────────────────────────────── */

export interface KpiCardItem {
  id: string;
  node: ReactNode;
}

interface DraggableKpiRowProps {
  cards: KpiCardItem[];
  onReorder: (newOrder: string[]) => void;
}

export function DraggableKpiRow({ cards, onReorder }: DraggableKpiRowProps) {
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      if (result.source.index === result.destination.index) return;

      const reordered = Array.from(cards);
      const [moved] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, moved);

      onReorder(reordered.map((c) => c.id));
    },
    [cards, onReorder]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="kpi-row" direction="horizontal">
        {(droppableProvided) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {cards.map((card, index) => (
              <Draggable key={card.id} draggableId={card.id} index={index}>
                {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={cn(
                      "transition-shadow duration-200 rounded-2xl",
                      snapshot.isDragging &&
                        "z-50 scale-[1.02] shadow-[0_12px_40px_-8px_rgba(67,97,238,0.35),0_4px_16px_-4px_rgba(0,0,0,0.12)] ring-2 ring-[#4361EE]/30"
                    )}
                    style={{
                      ...provided.draggableProps.style,
                      // Ensure smooth snap-back animation
                      transition: snapshot.isDragging
                        ? provided.draggableProps.style?.transition
                        : "transform 0.25s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease, scale 0.2s ease",
                    }}
                  >
                    {card.node}
                  </div>
                )}
              </Draggable>
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
