"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TRIP_SELECT, TYPE_LABEL, type NinjaTrip } from "@/lib/ninja/model";
import { Btn, Skeleton } from "@/components/ninja/ui";

interface Handover {
  id: string; kind: string; status: string; device_identity: string | null; accessories: string | null; condition_notes: string | null;
  ack_method: string | null; ack_at: string | null; created_at: string;
  evidence: { photos?: string[]; signature?: string | null; condition?: Record<string, string> | string; customer_name?: string; received_by?: string } | null;
}
const TITLE: Record<string, string> = {
  customer_to_ninja: "PICKUP RECEIPT", ninja_to_store: "STORE HANDOVER RECEIPT", store_to_ninja: "STORE RELEASE RECORD", ninja_to_customer: "DELIVERY CONFIRMATION",
};
const PREFIX: Record<string, string> = { customer_to_ninja: "PR", ninja_to_store: "SH", store_to_ninja: "SR", ninja_to_customer: "DC" };

function Receipt() {
  const { id } = useParams<{ id: string }>();
  const hid = useSearchParams().get("h");
  const router = useRouter();
  const [trip, setTrip] = useState<NinjaTrip | null>(null);
  const [h, setH] = useState<Handover | null>(null);
  const [urls, setUrls] = useState<{ photos: string[]; sig: string | null }>({ photos: [], sig: null });
  const [ninja, setNinja] = useState("");
  const [store, setStore] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    let off = false;
    (async () => {
      const { data: t } = await supabase!.from("field_trips").select(TRIP_SELECT).eq("id", id).maybeSingle();
      let q = supabase!.from("field_handovers").select("*").eq("trip_id", id);
      q = hid ? q.eq("id", hid) : q.order("created_at", { ascending: true });
      const { data: hs } = await q;
      const handover = ((hs ?? [])[0] ?? null) as Handover | null;
      const trip = t as unknown as NinjaTrip | null;
      if (off) return;
      setTrip(trip); setH(handover);
      if (trip?.ninja_id) { const { data: n } = await supabase!.from("staff").select("name").eq("id", trip.ninja_id).maybeSingle(); if (!off) setNinja(n?.name ?? ""); }
      if (trip?.branch_id) { const { data: b } = await supabase!.from("branches").select("name").eq("id", trip.branch_id).maybeSingle(); if (!off) setStore(b?.name ?? ""); }
      const ev = handover?.evidence;
      const photos: string[] = [];
      for (const p of ev?.photos ?? []) { const { data } = await supabase!.storage.from("field-proofs").createSignedUrl(p, 3600); if (data?.signedUrl) photos.push(data.signedUrl); }
      let sig: string | null = null;
      if (ev?.signature) { const { data } = await supabase!.storage.from("field-proofs").createSignedUrl(ev.signature, 3600); sig = data?.signedUrl ?? null; }
      if (!off) { setUrls({ photos, sig }); setLoading(false); }
    })();
    return () => { off = true; };
  }, [id, hid]);

  if (loading) return <Skeleton className="h-96" />;
  if (!trip || !h) return <p className="p-6 text-center text-[14px] text-slate-500">Document not found.</p>;

  const ref = `${PREFIX[h.kind] ?? "DOC"}-${trip.trip_no}`;
  const cond = h.evidence?.condition;
  const condRows: [string, string][] = typeof cond === "object" && cond ? Object.entries(cond).map(([k, v]) => [k.replace(/_/g, " "), String(v)]) : cond ? [["condition", String(cond)]] : [];
  const signer = h.evidence?.customer_name ?? h.evidence?.received_by ?? "";
  const when = new Date(h.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  async function share() {
    const text = `${TITLE[h!.kind] ?? "Receipt"} ${ref}\n${trip!.job?.device ?? "Device"}\nAccessories: ${h!.accessories ?? "—"}\n${when}\nCollected by ${ninja}`;
    try { if (navigator.share) await navigator.share({ title: ref, text }); else await navigator.clipboard.writeText(text); } catch { /* cancelled */ }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <button onClick={() => router.back()} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#4361EE] px-4 text-[13px] font-semibold text-white"><ArrowLeft className="h-4 w-4" />Back</button>
        <div className="flex gap-2">
          <Btn tone="ghost" className="!min-h-[40px] !px-3 text-[13px]" onClick={() => void share()}><Share2 className="h-4 w-4" />Share</Btn>
          <Btn className="!min-h-[40px] !px-3 text-[13px]" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</Btn>
        </div>
      </div>

      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="flex items-start justify-between bg-[#4361EE] px-5 py-4 text-white">
          <div><p className="text-[11px] font-bold uppercase tracking-widest text-white/70">RepairOX</p><p className="mt-0.5 text-[18px] font-extrabold">{TITLE[h.kind] ?? "RECEIPT"}</p>{store ? <p className="text-[12px] text-white/80">{store}</p> : null}</div>
          <div className="text-right"><p className="text-[10px] font-bold uppercase text-white/70">Reference</p><p className="rounded-full bg-white/20 px-3 py-1 text-[13px] font-extrabold tabular-nums">{ref}</p></div>
        </header>
        <div className="space-y-5 p-5 text-[13px]">
          <section className="grid grid-cols-2 gap-x-4 gap-y-3">
            {([["Trip", `${trip.trip_no} · ${TYPE_LABEL[trip.trip_type]}`], ["Job", trip.job?.job_no], ["Date & time", when], ["Handled by", ninja], ["Customer", trip.job?.customer], ["Mobile", trip.job?.phone]] as [string, string | null | undefined][]).map(([k, v]) => (
              <div key={k}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p><p className="font-semibold text-slate-900">{v || "—"}</p></div>
            ))}
          </section>
          <section className="rounded-xl bg-slate-50 p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Device</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div><p className="text-slate-400">Model</p><p className="font-semibold">{trip.job?.device || "—"}</p></div>
              <div><p className="text-slate-400">IMEI / Serial</p><p className="font-semibold">{h.device_identity || trip.job?.imei || "—"}</p></div>
              <div className="col-span-2"><p className="text-slate-400">Reported issue</p><p className="font-semibold">{trip.job?.issue || "—"}</p></div>
              <div className="col-span-2"><p className="text-slate-400">Accessories</p><p className="font-semibold">{h.accessories || "—"}</p></div>
              {condRows.map(([k, v]) => (<div key={k}><p className="capitalize text-slate-400">{k}</p><p className="font-semibold">{v}</p></div>))}
              {h.condition_notes ? <div className="col-span-2"><p className="text-slate-400">Observations</p><p className="font-semibold">{h.condition_notes}</p></div> : null}
            </div>
          </section>
          <section>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Location</p>
            <p className="font-semibold">{trip.dest_address || "—"}{trip.job?.pincode ? ` · ${trip.job.pincode}` : ""}</p>
          </section>
          {urls.photos.length > 0 ? (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Photos ({urls.photos.length})</p>
              <div className="grid grid-cols-3 gap-2">{urls.photos.map((u, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={u} alt={`Evidence ${i + 1}`} className="aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200" />)}</div>
            </section>
          ) : null}
          <section className="grid grid-cols-2 gap-4 border-t border-dashed border-slate-300 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Acknowledged by</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls.sig ? <img src={urls.sig} alt="Signature" className="mt-1 h-16 object-contain" /> : <p className="mt-1 text-slate-400">{h.ack_method === "store_confirm" ? "Store confirmation" : "—"}</p>}
              <p className="font-semibold">{signer}</p>
              <p className="text-[11px] text-slate-400">{h.ack_method ? `Method: ${h.ack_method}` : ""}{h.ack_at ? ` · ${new Date(h.ack_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}` : ""}</p>
            </div>
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ninja</p><p className="mt-5 font-semibold">{ninja || "—"}</p></div>
          </section>
          <p className="text-[10.5px] leading-relaxed text-slate-400">This is a {h.kind === "customer_to_ninja" ? "pickup receipt" : "custody record"}, not a ticket or invoice. Status: {h.status}. Generated by RepairOX on {new Date().toLocaleString("en-IN")}.</p>
        </div>
      </article>
    </div>
  );
}

export default function ReceiptPage() { return <Suspense fallback={<Skeleton className="h-96" />}><Receipt /></Suspense>; }
