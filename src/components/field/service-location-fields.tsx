"use client";
/* RepairOX — reusable Service Location editor (Route Lead, New Field Assignment,
   trip edit). Address · PIN · landmark · Google Maps link (parsed live) ·
   instructions · optional map pin. Coordinates are optional; the original URL
   is always preserved. Help text uses the (i) InfoHint, errors stay inline. */
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, ExternalLink, Crosshair, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/ui/info-hint";
import { LocationPicker } from "@/components/leads/location-picker";
import { applyMapsUrl, applyResolvedUrl, type ServiceLocation, type LocationErrors } from "@/lib/field-location";
import { isShortMapsLink } from "@/lib/maps-resolve";
import { reverseGeocodeFull } from "@/lib/geo/reverse-geocode";
import { usePermissions } from "@/lib/permissions-context";
import { parseMapsUrl, mapsOpenUrl } from "@/lib/maps-url";

const inputCls = (invalid?: boolean) =>
  cn("h-[38px] w-full rounded-xl border bg-card px-3 text-[13px] outline-none transition-all placeholder:text-muted-foreground disabled:opacity-60",
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-200/40"
      : "border-input hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15");

function F({ label, hint, error, required, children, className }: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="flex h-5 items-center gap-1 text-[12px] font-medium text-zinc-700">
        {label}{required && <span className="text-rose-500">*</span>}{hint && <InfoHint>{hint}</InfoHint>}
      </label>
      {children}
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export function ServiceLocationFields({
  value, onChange, errors, touched, addressLabel = "Customer address", disabled, pinOptional,
}: {
  value: ServiceLocation;
  onChange: (next: ServiceLocation) => void;
  errors?: LocationErrors;
  touched?: boolean;
  addressLabel?: string;
  disabled?: boolean;
  pinOptional?: boolean;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const { apiFetch } = usePermissions();
  const parsed = useMemo(() => parseMapsUrl(value.mapsUrl), [value.mapsUrl]);

  /* Short links (maps.app.goo.gl) can't be read in the browser. Ask the server
     to expand it (Google hosts only) and take the coordinates from the result.
     The ORIGINAL link is always kept; a failure just leaves the manual flow. */
  const [resolving, setResolving] = useState(false);
  const [resolvedHint, setResolvedHint] = useState("");
  const [resolveFailed, setResolveFailed] = useState(false);
  const [finding, setFinding] = useState(false);
  const autoAddr = useRef(""); const autoPin = useRef(""); const geocodedFor = useRef("");
  const doneFor = useRef("");
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  /* Coordinates known (short link resolved, full link pasted, or map pin) →
     reverse-geocode and fill Address + PIN. Only EMPTY fields — or fields this
     effect filled earlier and the user hasn't touched — are ever written. */
  useEffect(() => {
    if (disabled || value.lat == null || value.lng == null) return;
    const key = `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
    if (geocodedFor.current === key) return;
    const addrFree = !value.address.trim() || value.address === autoAddr.current;
    const pinFree = !value.pincode.trim() || value.pincode === autoPin.current;
    if (!addrFree && !pinFree) { geocodedFor.current = key; return; }
    let cancelled = false;
    setFinding(true);
    (async () => {
      const r = await reverseGeocodeFull(value.lat as number, value.lng as number, resolvedHint || parsed.addressHint);
      if (cancelled) return;
      geocodedFor.current = key;
      const cur = latest.current.value;
      const patch: Partial<ServiceLocation> = {};
      if (r.address && (!cur.address.trim() || cur.address === autoAddr.current)) { patch.address = r.address; autoAddr.current = r.address; }
      if (r.pincode && (!cur.pincode.trim() || cur.pincode === autoPin.current)) { patch.pincode = r.pincode; autoPin.current = r.pincode; }
      if (Object.keys(patch).length) latest.current.onChange({ ...cur, ...patch });
      setFinding(false);
    })();
    return () => { cancelled = true; setFinding(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.lat, value.lng, resolvedHint, disabled]);

  useEffect(() => {
    const url = value.mapsUrl.trim();
    if (!isShortMapsLink(url) || doneFor.current === url || disabled) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setResolving(true); setResolveFailed(false);
      try {
        // apiFetch returns { ok, status, json } (already parsed) — not a Response.
        const res = await apiFetch("/api/maps/resolve", { method: "POST", body: JSON.stringify({ url }) });
        const j = res.json ?? {};
        if (cancelled) return;
        doneFor.current = url;
        if (res.ok && j?.finalUrl) {
          const cur = latest.current;
          if (cur.value.mapsUrl.trim() === url) {
            const { next, parsed: p } = applyResolvedUrl(cur.value, j.finalUrl);
            setResolvedHint(p.addressHint || "");
            cur.onChange(next);
          }
        } else setResolveFailed(true);
      } catch { if (!cancelled) { doneFor.current = url; setResolveFailed(true); } }
      finally { if (!cancelled) setResolving(false); }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); setResolving(false); };
  }, [value.mapsUrl, disabled, apiFetch]);
  const open = mapsOpenUrl({ mapsUrl: value.mapsUrl, lat: value.lat, lng: value.lng, address: value.address, pincode: value.pincode });
  const hasPin = value.lat != null && value.lng != null;
  const e = touched ? errors ?? {} : {};
  const set = (patch: Partial<ServiceLocation>) => onChange({ ...value, ...patch, source: patch.address !== undefined && value.source === "lead" ? "manual" : (patch.source ?? value.source) });

  return (
    <div className="space-y-3">
      <F label={addressLabel} required error={e.address}>
        <textarea rows={2} disabled={disabled} value={value.address} onChange={(ev) => set({ address: ev.target.value })}
          placeholder="House / building, street, area, city" className={cn(inputCls(!!e.address), "h-auto py-2")} />
      </F>
      <div className="grid grid-cols-2 gap-3">
        <F label="PIN code" required={!pinOptional} error={e.pincode}>
          <input disabled={disabled} inputMode="numeric" maxLength={6} value={value.pincode} onChange={(ev) => set({ pincode: ev.target.value.replace(/\D/g, "") })} placeholder="560034" className={inputCls(!!e.pincode)} />
        </F>
        <F label="Landmark">
          <input disabled={disabled} value={value.landmark} onChange={(ev) => set({ landmark: ev.target.value })} placeholder="Near …" className={inputCls()} />
        </F>
      </div>
      <F label="Google Maps link" hint="Optional. Paste a Google Maps link; coordinates are read only when the link contains them. Short links are saved as-is." error={e.mapsUrl}>
        <div className="flex items-center gap-2">
          <input disabled={disabled} value={value.mapsUrl} onChange={(ev) => onChange(applyMapsUrl(value, ev.target.value).next)}
            placeholder="https://maps.app.goo.gl/…" className={inputCls(!!e.mapsUrl)} />
          <button type="button" disabled={disabled} onClick={() => setMapOpen(true)} title="Pick on map"
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl border border-input text-zinc-500 transition hover:border-[#4361EE]/40 hover:text-[#4361EE] disabled:opacity-50">
            <Crosshair className="h-4 w-4" />
          </button>
        </div>
      </F>
      {(resolving || finding) && (
        <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-800 ring-1 ring-inset ring-sky-200"><Loader2 className="h-4 w-4 animate-spin" /> {resolving ? "Reading the location from your link…" : "Finding the address and PIN…"}</div>
      )}
      {!resolving && !finding && value.mapsUrl.trim() && parsed.valid && (
        <div className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] ring-1 ring-inset",
          hasPin ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200")}>
          {hasPin ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0 flex-1">
            {hasPin ? <span className="tnum">Location pinned · {value.lat!.toFixed(5)}, {value.lng!.toFixed(5)}</span> : <span>{resolveFailed ? "Couldn't read this short link automatically — it is saved as-is. Please type the address, or paste the full link / use the map pin." : (parsed.message || "Link saved without coordinates.")}</span>}
            {!value.address.trim() && (resolvedHint || parsed.addressHint) && (
              <button type="button" className="ml-2 font-semibold underline" onClick={() => set({ address: resolvedHint || parsed.addressHint })}>Use “{resolvedHint || parsed.addressHint}” as address</button>
            )}
          </div>
          {open && <a href={open} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold underline"><ExternalLink className="h-3 w-3" /> Open</a>}
        </div>
      )}
      <F label="Access / pickup instructions" hint="Gate codes, floor, who to call on arrival, parking — shown to the Field Engineer.">
        <textarea rows={2} disabled={disabled} value={value.instructions} onChange={(ev) => set({ instructions: ev.target.value })} placeholder="e.g. Call 10 min before arrival; ask security for Tower B" className={cn(inputCls(), "h-auto py-2")} />
      </F>
      {!value.mapsUrl.trim() && hasPin && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" /> Pin saved from the map picker.</p>
      )}

      <LocationPicker open={mapOpen} onClose={() => setMapOpen(false)}
        initial={hasPin ? { lat: value.lat, lng: value.lng, address: value.address } : null}
        onPick={(loc) => onChange({
          ...value, lat: loc.lat, lng: loc.lng, mapsUrl: loc.mapsUrl || value.mapsUrl,
          address: loc.address?.trim() ? loc.address : value.address, source: "map_pin",
        })} />
    </div>
  );
}
