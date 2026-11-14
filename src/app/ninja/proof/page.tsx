"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CloudUpload, FileText, RotateCcw, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNinja } from "@/lib/ninja/ninja-context";
import { removeItem, updateItem } from "@/lib/ninja/outbox";
import { Card, Empty, Pill, SectionTitle } from "@/components/ninja/ui";

interface H { id: string; trip_id: string; kind: string; status: string; created_at: string }
const LABEL: Record<string, string> = { customer_to_ninja: "Pickup receipt", ninja_to_store: "Store handover", store_to_ninja: "Store release", ninja_to_customer: "Delivery confirmation" };

export default function ProofPage() {
  const { trips, outbox, syncNow, refresh } = useNinja();
  const [hands, setHands] = useState<H[]>([]);
  useEffect(() => {
    if (!supabase || trips.length === 0) { setHands([]); return; }
    supabase.from("field_handovers").select("id,trip_id,kind,status,created_at").in("trip_id", trips.map((t) => t.id)).order("created_at", { ascending: false })
      .then(({ data }) => setHands((data ?? []) as H[]));
  }, [trips]);
  const byTrip = (id: string) => trips.find((t) => t.id === id);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[24px] font-extrabold tracking-tight">Proof & Documents</h1>

      {outbox.length > 0 ? (
        <>
          <SectionTitle>Waiting to sync</SectionTitle>
          <div className="space-y-2">
            {outbox.map((o) => (
              <Card key={o.id} className="p-3.5">
                <div className="flex items-center justify-between">
                  <p className="flex min-w-0 items-center gap-2 truncate text-[14px] font-extrabold"><CloudUpload className="h-4 w-4 shrink-0 text-[#4361EE]" />{o.kind === "transition" ? `Status → ${String(o.payload.to).replace(/_/g, " ")}` : o.kind === "handover" ? "Proof / handover" : "Note / report"}</p>
                  <Pill tone={o.state === "pending" ? "amber" : "rose"}>{o.state === "pending" ? "Pending sync" : o.state === "conflict" ? "Conflict" : "Failed"}</Pill>
                </div>
                <p className="mt-1 text-[12px] text-slate-500">{byTrip(o.tripId)?.trip_no ?? "Trip"} · saved {new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</p>
                {o.error ? <p className="mt-1 text-[12px] font-semibold text-rose-600">{o.error}</p> : null}
                {o.state !== "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => { updateItem(o.id, { state: "pending", error: undefined }); void syncNow(); }} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#EEF1FD] px-3 text-[12px] font-bold text-[#3450D8]"><RotateCcw className="h-4 w-4" />Retry</button>
                    <button onClick={() => { removeItem(o.id); void refresh(); }} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-[12px] font-bold text-slate-600"><Trash2 className="h-4 w-4" />Discard</button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle>Receipts & proofs</SectionTitle>
      {hands.length === 0 ? <Empty icon={<FileText className="h-7 w-7" />} title="No documents yet" body="Pickup receipts, store handovers and delivery proofs you create are saved here." /> : (
        <div className="space-y-2">
          {hands.map((h) => (
            <Link key={h.id} href={`/ninja/receipt/${h.trip_id}?h=${h.id}`} className="block">
              <Card className="flex items-center gap-3 p-3.5 active:scale-[0.99]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><FileText className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-extrabold">{LABEL[h.kind] ?? h.kind}</p><p className="truncate text-[12px] text-slate-500">{byTrip(h.trip_id)?.trip_no} · {byTrip(h.trip_id)?.job?.customer}</p></div>
                <Pill tone={h.status === "accepted" ? "green" : h.status === "rejected" ? "rose" : "amber"}>{h.status}</Pill>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
