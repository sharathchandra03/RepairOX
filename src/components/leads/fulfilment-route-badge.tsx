"use client";

/* Small pill showing a lead's fulfilment route (Store-to-Store / Pickup & Drop).
   Renders nothing when the lead hasn't been routed yet, so unrouted leads stay
   visually clean. */

import { Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { normaliseRoute } from "@/lib/field-data";
import type { Lead } from "@/lib/leads-data";

export function FulfilmentRouteBadge({ lead, className }: { lead: Lead; className?: string }) {
  const route = normaliseRoute(lead.fulfilmentRoute);
  if (!route) return null;
  const isStore = route === "STORE_VISIT";
  const Icon = isStore ? Store : Truck;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        isStore ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-violet-50 text-violet-700 ring-violet-200",
        "block",
        className,
      )}
      title={isStore ? "Store-to-Store" : "Pickup & Drop"}
    >
      <Icon className="h-2.5 w-2.5" />
      {isStore ? "Store" : "Pickup"}
    </span>
  );
}
