"use client";
/* Public customer review page — no login. Talks only to /api/review/:token (whitelisted data). */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, Star } from "lucide-react";

interface Info { ok: true; done: boolean; rating: number | null; ninja: string; service: string; device: string | null; store: string | null }
const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    let off = false;
    fetch(`/api/review/${token}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (off) return;
      if (!j.ok) setErr(j.error ?? "This link is not available."); else setInfo(j as Info);
    }).catch(() => !off && setErr("Could not load. Please check your connection."));
    return () => { off = true; };
  }, [token]);

  async function submit() {
    if (rating < 1) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/review/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment: comment.trim() || undefined }) });
      const j = await r.json();
      if (j.ok) setThanks(true); else setErr(j.error ?? "Could not save your review.");
    } catch { setErr("Could not save your review. Please try again."); }
    setBusy(false);
  }

  return (
    <div className="min-h-[100dvh] bg-[#F4F6FB] text-slate-900">
      <div className="mx-auto max-w-md px-4 pb-10 pt-[max(16px,env(safe-area-inset-top))]">
        <header className="flex items-center gap-2.5 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#4361EE] text-[15px] font-extrabold text-white">R</span>
          <div className="leading-tight"><p className="text-[15px] font-extrabold">{info?.store ?? "RepairOX"}</p><p className="text-[11px] font-semibold text-slate-400">Service feedback</p></div>
        </header>
        {err && !thanks ? (
          <div className="mt-6 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-[16px] font-extrabold">Link not available</p>
            <p className="mt-1 text-[13px] text-slate-500">{err}</p>
          </div>
        ) : !info ? (
          <div className="mt-4 h-72 animate-pulse rounded-3xl bg-slate-200/70" />
        ) : thanks || info.done ? (
          <div className="mt-6 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <p className="mt-3 text-[18px] font-extrabold">Thank you!</p>
            <p className="mt-1 text-[13.5px] text-slate-500">{thanks ? "Your feedback has been sent to the team." : "Your feedback for this visit was already received."}</p>
            {(thanks ? rating : info.rating) ? <div className="mt-3 flex justify-center gap-1">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-6 w-6 ${n <= (thanks ? rating : info.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />)}</div> : null}
          </div>
        ) : (
          <div className="mt-2 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-[13px] font-semibold text-slate-500">Your {info.service}{info.device ? ` · ${info.device}` : ""}</p>
            <h1 className="mt-1 text-[22px] font-extrabold leading-tight">How was your experience with {info.ninja}?</h1>
            <div className="mt-5 flex items-center justify-between gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)}
                  className="grid h-16 flex-1 place-items-center rounded-2xl transition active:scale-90">
                  <Star className={`h-11 w-11 transition ${n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                </button>
              ))}
            </div>
            <p className="mt-1 h-5 text-center text-[14px] font-bold text-slate-600">{WORDS[rating]}</p>
            {rating > 0 ? (
              <>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} placeholder="Tell us more (optional)"
                  className="mt-3 w-full rounded-2xl border border-slate-300 p-3.5 text-[15px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
                <button onClick={() => void submit()} disabled={busy}
                  className="mt-3 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#4361EE] text-[15px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.7)] active:bg-[#3450D8] disabled:opacity-60">
                  {busy ? "Sending…" : "Send feedback"}
                </button>
              </>
            ) : null}
            <p className="mt-4 text-center text-[11.5px] text-slate-400">Your phone number is never shared with the engineer through this page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
