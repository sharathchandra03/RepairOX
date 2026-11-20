"use client";
/* Customer review of the Ninja, shown on a COMPLETED trip.
   The CUSTOMER rates on a public link (/review/:token), so a Ninja can never rate themselves — the
   database rejects a Ninja writing a review for their own trip. The Ninja only sends the link
   (WhatsApp / share / copy) and watches the result arrive here. One review per trip (migrations 0111, 0114). */
import { useCallback, useEffect, useState } from "react";
import { Link2, MessageCircle, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { useNinja } from "@/lib/ninja/ninja-context";
import type { NinjaTrip } from "@/lib/ninja/model";
import { Btn, Card } from "./ui";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
interface Review { rating: number; comment: string | null }

export function ReviewCard({ t }: { t: NinjaTrip }) {
  const { track } = useNinja();
  const { apiFetch } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Review | null>(null);
  const [busy, setBusy] = useState<null | "wa" | "share">(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("field_trip_reviews").select("rating,comment").eq("trip_id", t.id).maybeSingle();
    setSaved((data as Review | null) ?? null); setLoading(false);
  }, [t.id]);
  useEffect(() => { void load(); }, [load]);
  // While waiting for the customer, pick the answer up as soon as it lands.
  useEffect(() => {
    if (saved || !sent) return;
    const i = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => window.clearInterval(i);
  }, [saved, sent, load]);

  async function link(): Promise<string | null> {
    const r = await apiFetch("/api/field/review-link", { method: "POST", body: JSON.stringify({ tripId: t.id }) });
    if (!r.ok || !r.json?.ok) { toast.error(r.json?.error ?? "Could not create the review link."); return null; }
    if (r.json.alreadyReviewed) { await load(); return null; }
    return r.json.url as string;
  }
  async function send(kind: "wa" | "share") {
    setBusy(kind);
    const url = await link();
    setBusy(null);
    if (!url) return;
    const first = (t.job?.customer ?? "").replace(/^\[TEST\]\s*/, "").split(" ")[0];
    const msg = `Hi ${first || "there"}, thank you for choosing RepairOX. Could you take 10 seconds to rate your experience? ${url}`;
    setSent(true);
    track({ kind: "review_link_sent", tripId: t.id, jobId: t.job_id, screen: "trip", payload: { channel: kind } });
    if (kind === "wa") {
      const d = (t.job?.phone ?? "").replace(/\D/g, "");
      window.open(d ? `https://wa.me/${d.length === 10 ? "91" + d : d}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    } else if (navigator.share) { try { await navigator.share({ text: msg }); } catch { /* cancelled */ } }
    else { await navigator.clipboard.writeText(msg); toast.success("Message copied. Paste it to the customer."); }
  }

  if (loading) return null;
  if (saved) {
    return (
      <Card className="p-4">
        <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Customer review</p>
        <div className="mt-2 flex items-center gap-1" aria-label={`${saved.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-6 w-6 ${n <= saved.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />)}
          <span className="ml-2 text-[14px] font-extrabold text-slate-800">{WORDS[saved.rating]}</span>
        </div>
        {saved.comment ? <p className="mt-2 text-[13.5px] font-medium text-slate-600">“{saved.comment}”</p> : null}
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <p className="text-[15px] font-extrabold text-slate-900">Ask the customer for a review</p>
      <p className="mt-0.5 text-[13px] font-medium text-slate-500">{sent ? "Link sent. Waiting for the customer — it appears here as soon as they rate you." : "The customer rates you on their own phone, so it counts toward your Reviews."}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn tone="success" loading={busy === "wa"} onClick={() => void send("wa")}><MessageCircle className="h-4 w-4" />WhatsApp</Btn>
        <Btn tone="ghost" loading={busy === "share"} onClick={() => void send("share")}><Link2 className="h-4 w-4" />Share link</Btn>
      </div>
    </Card>
  );
}
