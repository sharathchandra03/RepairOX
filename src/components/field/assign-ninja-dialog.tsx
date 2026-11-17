"use client";
/* The ONE "Assign Ninja" dialog — used from the Pickup & Drop table (Ninjas cell)
   and from View Assignment. Picks the leg from the job's state (pickup / on-site,
   or drop once the device is ready to return), shows each Ninja's live status,
   and assigns through the existing field-context ops (assignNinja /
   assignDropNinja), which notify the Ninja and sync the trip. */
import { useEffect, useState } from "react";
import { Check, UserCheck } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Button } from "@/components/ui/button";
import { DateTimePill } from "@/components/ui/date-time-pill";
import { StaffPicker } from "@/components/field/ninja-picker";
import { useField } from "@/lib/field-context";
import { isDropLeg, normaliseLeadType, type FieldJob } from "@/lib/field-data";

export type AssignLeg = "pickup" | "drop";
/** Which leg a manager is assigning right now for this job. */
export function assignLegFor(j: FieldJob): AssignLeg {
  return j.status === "ready_for_drop" || isDropLeg(j.status) ? "drop" : "pickup";
}

export function AssignNinjaDialog({ job, leg, onClose }: { job: FieldJob | null; leg?: AssignLeg; onClose: () => void }) {
  const { assignNinja, assignDropNinja } = useField();
  const [pickId, setPickId] = useState("");
  const [pickName, setPickName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const l: AssignLeg = job ? leg ?? assignLegFor(job) : "pickup";
  useEffect(() => {
    if (!job) return;
    const drop = l === "drop";
    setPickId(drop ? job.dropNinjaId || "" : job.ninjaId || "");
    setPickName(drop ? job.dropNinjaName || "" : job.ninjaName || "");
    setDate((drop ? job.dropDate : job.pickupDate) || "");
    setTime((drop ? job.dropTime : job.pickupTime) || "");
  }, [job?.id, l]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return null;
  const lt = normaliseLeadType(job.leadType);
  const onSite = lt === "onsite" || lt === "warranty_onsite";
  const current = l === "drop" ? job.dropNinjaId : job.ninjaId;
  const title = l === "drop" ? (current ? "Reassign drop Ninja" : "Assign drop Ninja")
    : current ? "Reassign / reschedule pickup" : onSite ? "Assign Ninja for on-site visit" : "Assign Ninja for pickup";
  async function save() {
    if (!job || !pickId || busy) return;
    setBusy(true);
    try {
      if (l === "drop") await assignDropNinja(job.id, pickId, pickName, date || undefined, time || undefined);
      else await assignNinja(job.id, pickId, pickName, date || undefined, time || undefined);
      onClose();
    } finally { setBusy(false); }
  }
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-md" icon={UserCheck} title={title}
      subtitle={`${job.jobNo} · ${job.customer || "Customer"}`}
      footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="gap-1.5" disabled={!pickId || busy} loading={busy} onClick={() => void save()}><Check className="h-4 w-4" /> Assign &amp; notify</Button></div>}>
      <div className="space-y-4">
        <StaffPicker roleIds={["ninja"]} valueId={pickId} showLoad onPick={(sid, name) => { setPickId(sid); setPickName(name); }} placeholder="Search ninjas…" />
        <div className="space-y-1.5">
          <label className="flex h-5 items-center text-[12px] font-medium text-zinc-700">Date &amp; time</label>
          <DateTimePill date={date} time={time} title="Trip date & time" onChange={(d, t) => { setDate(d); setTime(t); }} />
        </div>
      </div>
    </RoxCenteredForm>
  );
}
