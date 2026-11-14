"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { useNinja } from "@/lib/ninja/ninja-context";
import { type NinjaTrip, PROBLEMS } from "@/lib/ninja/model";
import { Btn, Sheet } from "./ui";
import { PhotoCapture, SignaturePad } from "./capture";

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return <div className="mb-2 mt-5 first:mt-0"><p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{children}</p>{hint ? <p className="mt-0.5 text-[12px] text-slate-400">{hint}</p> : null}</div>;
}

function Chips({ options, value, onChange, multi }: { options: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" onClick={() => onChange(multi ? (on ? value.filter((x) => x !== o) : [...value, o]) : [o])}
            className={`min-h-[44px] rounded-xl px-4 text-[13.5px] font-bold ring-1 ring-inset transition ${on ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-white text-slate-700 ring-slate-300"}`}>
            {on ? <Check className="mr-1 inline h-4 w-4" /> : null}{o}
          </button>
        );
      })}
    </div>
  );
}

function Check1({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 text-left text-[14px] font-semibold ring-1 ring-inset ${checked ? "bg-emerald-50 text-emerald-900 ring-emerald-300" : "bg-white text-slate-700 ring-slate-300"}`}>
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${checked ? "bg-emerald-600 text-white" : "border-2 border-slate-300"}`}>{checked ? <Check className="h-4 w-4" /> : null}</span>
      {children}
    </button>
  );
}

const inputCls = "min-h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 text-[16px] font-medium text-slate-900 outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20";

/* ───────────── Pickup: inspect & collect ───────────── */
export function CollectSheet({ t, open, onClose }: { t: NinjaTrip; open: boolean; onClose: () => void }) {
  const { handover, transition } = useNinja();
  const [screen, setScreen] = useState<string[]>([]);
  const [body, setBody] = useState<string[]>([]);
  const [power, setPower] = useState<string[]>([]);
  const [imei, setImei] = useState(t.job?.imei ?? "");
  const [acc, setAcc] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [sig, setSig] = useState("");
  const [who, setWho] = useState(t.job?.customer ?? "");
  const [busy, setBusy] = useState(false);
  const ok = screen.length && body.length && power.length && photos.length >= 1 && sig && who.trim();

  async function submit() {
    setBusy(true);
    const h = await handover(t, {
      kind: "customer_to_ninja", status: "accepted", deviceIdentity: imei || undefined,
      accessories: acc.join(", ") || "None", conditionNotes: notes || undefined, ackMethod: "signature",
      evidence: { condition: { screen: screen[0], body: body[0], powers_on: power[0] }, customer_name: who.trim(), collected_at: new Date().toISOString() },
      photos, signature: sig,
    });
    if (ok && h) await transition(t, "device_collected");
    setBusy(false);
    if (h) onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Inspect & collect device"
      footer={<Btn className="w-full" tone="success" disabled={!ok} loading={busy} onClick={submit}>Confirm device collected</Btn>}>
      <p className="mb-3 rounded-xl bg-[#EEF1FD] px-3 py-2.5 text-[13px] text-[#3450D8]"><b>{t.job?.device || "Device"}</b>{t.job?.issue ? ` · ${t.job.issue}` : ""}</p>
      <Label>Screen</Label>
      <Chips options={["Perfect", "Minor scratches", "Cracked", "Display not working"]} value={screen} onChange={setScreen} />
      <Label>Body / frame</Label>
      <Chips options={["Clean", "Dents / scratches", "Bent", "Broken"]} value={body} onChange={setBody} />
      <Label>Powers on?</Label>
      <Chips options={["Yes", "No", "Not tested"]} value={power} onChange={setPower} />
      <Label hint="Dial *#06# on the device if needed">IMEI / Serial</Label>
      <input className={inputCls} value={imei} onChange={(e) => setImei(e.target.value)} placeholder="Enter IMEI or serial" inputMode="text" />
      <Label>Accessories received</Label>
      <Chips multi options={["Charger", "Cable", "Box", "SIM", "Memory card", "Case", "Earphones"]} value={acc} onChange={setAcc} />
      <Label hint="Never ask for or record device passcodes.">Other observations</Label>
      <textarea className={`${inputCls} py-3`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any visible damage, stickers, water marks…" />
      <Label hint="At least 1 photo of the device condition">Photos</Label>
      <PhotoCapture photos={photos} onChange={setPhotos} />
      <Label>Customer acknowledgement</Label>
      <input className={`${inputCls} mb-3`} value={who} onChange={(e) => setWho(e.target.value)} placeholder="Name of person handing over" />
      <SignaturePad value={sig} onChange={setSig} />
      <p className="mt-2 text-[12px] text-slate-400">Customer OTP verification is not configured for this store yet. A signature is recorded instead.</p>
    </Sheet>
  );
}

/* ───────────── Pickup: submit to store ───────────── */
export function SubmitStoreSheet({ t, open, onClose }: { t: NinjaTrip; open: boolean; onClose: () => void }) {
  const { handover, transition } = useNinja();
  const [a, setA] = useState(false), [b, setB] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const h = await handover(t, { kind: "ninja_to_store", status: "pending", conditionNotes: note || undefined, evidence: { submitted_at: new Date().toISOString() } });
    if (h) await transition(t, "handover_pending");
    setBusy(false);
    if (h) onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Submit device to store"
      footer={<Btn className="w-full" disabled={!(a && b)} loading={busy} onClick={go}>Submit to Reception</Btn>}>
      <p className="mb-4 text-[13.5px] text-slate-600">Hand the device to Reception. The trip stays <b>Waiting for store</b> until Reception confirms the physical handover.</p>
      <div className="space-y-2.5">
        <Check1 checked={a} onChange={setA}>I am at the store and the device is with me</Check1>
        <Check1 checked={b} onChange={setB}>Accessories match the pickup receipt</Check1>
      </div>
      <Label>Note for Reception (optional)</Label>
      <textarea className={`${inputCls} py-3`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </Sheet>
  );
}

/* ───────────── Drop: receive from store ───────────── */
export function ReceiveStoreSheet({ t, open, onClose }: { t: NinjaTrip; open: boolean; onClose: () => void }) {
  const { handover, transition } = useNinja();
  const [m, setM] = useState(false), [i, setI] = useState(false), [ac, setAc] = useState(false);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const h = await handover(t, { kind: "store_to_ninja", status: "accepted", ackMethod: "store_confirm", evidence: { received_at: new Date().toISOString() } });
    if (h) await transition(t, "device_received_by_ninja");
    setBusy(false);
    if (h) onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Confirm device received"
      footer={<Btn className="w-full" tone="success" disabled={!(m && i && ac)} loading={busy} onClick={go}>I have the device</Btn>}>
      <p className="mb-4 text-[13.5px] text-slate-600">Check the device before you leave the store.</p>
      <div className="space-y-2.5">
        <Check1 checked={m} onChange={setM}>Model matches: <b>{t.job?.device || "device"}</b></Check1>
        <Check1 checked={i} onChange={setI}>IMEI / serial matches the ticket</Check1>
        <Check1 checked={ac} onChange={setAc}>Accessories and invoice copy received</Check1>
      </div>
    </Sheet>
  );
}

/* ───────────── Drop: hand over to customer ───────────── */
export function DeliverSheet({ t, open, onClose }: { t: NinjaTrip; open: boolean; onClose: () => void }) {
  const { handover, transition } = useNinja();
  const [cond, setCond] = useState<string[]>([]);
  const [match, setMatch] = useState(false), [inv, setInv] = useState(false);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [sig, setSig] = useState("");
  const [who, setWho] = useState(t.job?.customer ?? "");
  const [busy, setBusy] = useState(false);
  const ok = cond.length && match && inv && photos.length >= 1 && sig && who.trim();
  async function go() {
    setBusy(true);
    const h = await handover(t, {
      kind: "ninja_to_customer", status: "accepted", ackMethod: "signature", conditionNotes: notes || undefined,
      evidence: { condition: cond[0], invoice_shared: true, received_by: who.trim(), delivered_at: new Date().toISOString() }, photos, signature: sig,
    });
    if (h) await transition(t, "delivered");
    setBusy(false);
    if (h) onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Deliver to customer"
      footer={<Btn className="w-full" tone="success" disabled={!ok} loading={busy} onClick={go}>Confirm delivered</Btn>}>
      <div className="space-y-2.5">
        <Check1 checked={match} onChange={setMatch}>Customer confirmed it is their device</Check1>
        <Check1 checked={inv} onChange={setInv}>Final invoice copy shared with customer</Check1>
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">Payment is recorded by the store through the Invoice workflow. Delivering the device does not mark an invoice as paid.</p>
      <Label>Device condition at handover</Label>
      <Chips options={["Working as expected", "Customer reported an issue"]} value={cond} onChange={setCond} />
      <Label>Notes (optional)</Label>
      <textarea className={`${inputCls} py-3`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Label hint="At least 1 delivery photo">Photos</Label>
      <PhotoCapture photos={photos} onChange={setPhotos} />
      <Label>Customer acknowledgement</Label>
      <input className={`${inputCls} mb-3`} value={who} onChange={(e) => setWho(e.target.value)} placeholder="Name of person receiving" />
      <SignaturePad value={sig} onChange={setSig} />
    </Sheet>
  );
}

/* ───────────── On-site: outcome ───────────── */
export function ServiceSheet({ t, open, onClose }: { t: NinjaTrip; open: boolean; onClose: () => void }) {
  const { transition, addNote } = useNinja();
  const [res, setRes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const done = res[0] === "Service completed";
  async function go() {
    setBusy(true);
    await addNote(t, `On-site outcome: ${res[0]}${notes ? ` — ${notes}` : ""}`);
    const ok = await transition(t, done ? "service_completed" : "service_not_completed", { reason: done ? undefined : notes || res[0] });
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Finish service"
      footer={<Btn className="w-full" disabled={!res.length || (!done && !notes.trim())} loading={busy} onClick={go}>Save outcome</Btn>}>
      <Chips options={["Service completed", "Not completed"]} value={res} onChange={setRes} />
      <Label hint={done ? "Optional" : "Required when the service is not completed"}>Notes</Label>
      <textarea className={`${inputCls} py-3`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Sheet>
  );
}

/* ───────────── Report a problem ───────────── */
export function ProblemSheet({ t, open, onClose }: { t: NinjaTrip; open: boolean; onClose: () => void }) {
  const { reportProblem } = useNinja();
  const [pid, setPid] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const p = useMemo(() => PROBLEMS.find((x) => x.id === pid), [pid]);
  async function go() {
    if (!p) return;
    setBusy(true);
    const ok = await reportProblem(t, p.id, p.label, note, p.status);
    setBusy(false);
    if (ok) { setPid(""); setNote(""); onClose(); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Report a problem"
      footer={<Btn className="w-full" tone="danger" disabled={!p || (p.id === "other" && !note.trim())} loading={busy} onClick={go}>Send to Field Manager</Btn>}>
      <div className="space-y-2">
        {PROBLEMS.map((x) => (
          <button key={x.id} type="button" onClick={() => setPid(x.id)}
            className={`flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 text-left text-[14px] font-semibold ring-1 ring-inset ${pid === x.id ? "bg-rose-50 text-rose-900 ring-rose-300" : "bg-white text-slate-700 ring-slate-200"}`}>
            {x.label}{pid === x.id ? <Check className="h-4 w-4" /> : null}
          </button>
        ))}
      </div>
      <Label>Note</Label>
      <textarea className={`${inputCls} py-3`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
      {p?.status ? <p className="mt-2 flex items-start gap-2 text-[12px] text-slate-500"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />This may close the current attempt. Your manager will re-plan the trip.</p> : null}
    </Sheet>
  );
}

/* ───────────── Reject assignment ───────────── */
export function RejectSheet({ t, open, onClose }: { t: NinjaTrip; open: boolean; onClose: () => void }) {
  const { reject } = useNinja();
  const router = useRouter();
  const [r, setR] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const reason = r[0] === "Other" ? note.trim() : [r[0], note.trim()].filter(Boolean).join(" — ");
  async function go() {
    setBusy(true);
    const ok = await reject(t, reason);
    setBusy(false);
    if (ok) { onClose(); router.replace("/ninja/jobs"); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Reject this job"
      footer={<Btn className="w-full" tone="danger" disabled={!reason} loading={busy} onClick={go}>Reject job</Btn>}>
      <p className="mb-3 text-[13.5px] text-slate-600">A reason is required. The job returns to the manager's queue.</p>
      <Chips options={["Too far", "Not available at that time", "Vehicle / equipment issue", "Already on another job", "Other"]} value={r} onChange={setR} />
      <Label>Details</Label>
      <textarea className={`${inputCls} py-3`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </Sheet>
  );
}
