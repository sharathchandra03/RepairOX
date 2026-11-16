"use client";
/* Settings → Field → Assignment Rules.
   Org-level time a Ninja has to accept/reject a new assignment. It drives the
   "Time left to accept" countdown in the Ninja app and on View Assignment.
   Display/flag only: an overdue assignment is never auto-rejected. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { parseMapsUrl, isValidLatLng } from "@/lib/maps-url";
import { Timer, MapPin, LocateFixed } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { toast } from "@/components/ui/toaster";
import { useStoreSettings } from "@/lib/store-settings";
import { useCanEdit } from "@/lib/use-can-edit";
import { CAP } from "@/lib/capabilities";
import { ACCEPT_WINDOW_MIN } from "@/lib/ninja/model";

const PRESETS = [5, 10, 15, 30, 60];

/** Store coordinates: the Ninja app checks "arrived at store / submitted to store" against these. */
function StoreLocations({ canEdit }: { canEdit: boolean }) {
  const { stores } = useStoreContext();
  const { apiFetch } = usePermissions();
  const [coords, setCoords] = useState<Record<string, { lat: number | null; lng: number | null }>>({});
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("branches").select("id,latitude,longitude");
    setCoords(Object.fromEntries(((data ?? []) as { id: string; latitude: number | null; longitude: number | null }[]).map((b) => [b.id, { lat: b.latitude, lng: b.longitude }])));
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(id: string, lat: number, lng: number) {
    if (!supabase) return;
    if (!isValidLatLng(lat, lng)) { toast.error("That is not a valid location."); return; }
    setBusy(id);
    const { error } = await supabase.from("branches").update({ latitude: lat, longitude: lng }).eq("id", id);
    setBusy(null);
    if (error) { toast.error("Could not save the store location."); return; }
    toast.success("Store location saved");
    setText((t) => ({ ...t, [id]: "" }));
    void load();
  }
  async function fromText(id: string) {
    const raw = (text[id] ?? "").trim();
    const pair = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (pair) return save(id, Number(pair[1]), Number(pair[2]));
    let parsed = parseMapsUrl(raw);
    if (parsed.lat == null && /^https?:/i.test(raw)) {
      setBusy(id);
      const r = await apiFetch("/api/maps/resolve", { method: "POST", body: JSON.stringify({ url: raw }) });
      setBusy(null);
      if (r.ok && r.json?.finalUrl) parsed = parseMapsUrl(r.json.finalUrl);
    }
    if (parsed.lat == null || parsed.lng == null) { toast.error("Could not read coordinates. Paste a Google Maps link or 'latitude, longitude'."); return; }
    await save(id, parsed.lat, parsed.lng);
  }
  function here(id: string) {
    if (!navigator.geolocation) { toast.error("Location is not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition((p) => void save(id, p.coords.latitude, p.coords.longitude), () => toast.error("Allow location access to use this."), { enableHighAccuracy: true, timeout: 10000 });
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><MapPin className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">Store locations
            <InfoHint content="Used by the Ninja app to confirm a Ninja has reached the store before they can mark 'Arrived at store' or submit a device. A store without a location is simply not checked." />
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Set each store's exact location. Stand at the store and press the locate button, or paste a Google Maps link.</p>
          <ul className="mt-4 space-y-2.5">
            {stores.map((st) => {
              const c = coords[st.id]; const set = c?.lat != null && c?.lng != null;
              return (
                <li key={st.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold">{st.name}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${set ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
                      {set ? `Set · ${c!.lat!.toFixed(5)}, ${c!.lng!.toFixed(5)}` : "Not set"}
                    </span>
                  </div>
                  {canEdit ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <div className="min-w-[220px] flex-1"><Input value={text[st.id] ?? ""} placeholder="Paste Google Maps link or 12.9716, 77.5946" aria-label={`${st.name} location`}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText((t) => ({ ...t, [st.id]: e.target.value }))} /></div>
                      <Button size="sm" className="rounded-full" loading={busy === st.id} disabled={!(text[st.id] ?? "").trim()} onClick={() => void fromText(st.id)}>Save</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 rounded-full" disabled={busy === st.id} onClick={() => here(st.id)}><LocateFixed className="h-3.5 w-3.5" />Use my location</Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function FieldSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();
  const canEdit = useCanEdit(CAP.settings.field);
  const saved = settings.fieldAcceptWindowMinutes ?? ACCEPT_WINDOW_MIN;
  const [value, setValue] = useState(String(saved));
  useEffect(() => { setValue(String(saved)); }, [saved]);
  const n = Number(value);
  const invalid = value.trim() === "" || !Number.isInteger(n) || n < 1 || n > 1440;
  const dirty = !invalid && n !== saved;
  const save = () => {
    if (!canEdit || invalid || !dirty) return;
    updateSettings({ fieldAcceptWindowMinutes: n === ACCEPT_WINDOW_MIN ? null : n });
    toast.success("Accept time saved", { description: `Ninjas now have ${n} minute${n === 1 ? "" : "s"} to accept a new assignment.` });
  };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Field" subtitle="Rules for how Pickup, Drop and On-Site assignments reach your Ninjas." />
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Timer className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">Time to accept an assignment
              <InfoHint content="Shown to the Ninja as 'Time left to accept' and to managers on View Assignment. Counts from the moment the assignment is made. An overdue assignment is highlighted but never auto-rejected or reassigned." />
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Default is {ACCEPT_WINDOW_MIN} minutes. Applies to every store and to new and still-waiting assignments.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {PRESETS.map((m) => (
                <button key={m} type="button" disabled={!canEdit} onClick={() => setValue(String(m))}
                  className={`h-8 rounded-full border px-3.5 text-[12.5px] font-semibold transition disabled:opacity-50 ${n === m ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-input bg-card text-foreground hover:border-[#4361EE]/50"}`}>
                  {m} min
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="w-36">
                <Input type="number" min={1} max={1440} inputMode="numeric" value={value} disabled={!canEdit} invalid={invalid}
                  aria-label="Minutes to accept" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} />
              </div>
              <span className="text-[12px] text-muted-foreground">minutes (1 – 1440)</span>
              <Button size="sm" className="rounded-full" disabled={!canEdit || !dirty} onClick={save}>Save</Button>
            </div>
            {invalid ? <p className="mt-1.5 text-[12px] text-rose-600">Enter a whole number of minutes between 1 and 1440.</p> : null}
            {!canEdit ? <p className="mt-2 text-[12px] text-muted-foreground">You can view this setting but not change it.</p> : null}
          </div>
        </div>
      </div>
      <StoreLocations canEdit={canEdit} />
    </div>
  );
}
