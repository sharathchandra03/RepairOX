"use client";

/* Settings → System → Preferences → "Sidebar & header colours".
   Three independent choices (Sidebar × Header × Active-item pill) with a live preview of the
   real app, ready-made combinations to start from, and "Surprise me". Save stores it once for
   the whole organisation (organization_settings.chrome_theme). */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, Save, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";
import {
  applyChrome, COMBOS, normalizeChoice, DEFAULT_CHROME, headerById, HEADERS, LINES, lineById, PILLS, pillById, randomChoice, sameChoice, sidebarById, SIDEBARS,
  type ChromeChoice,
} from "@/lib/chrome-themes";
import { cn } from "@/lib/utils";

const grad = (a: string, b: string, c: string, dir = "90deg") => `linear-gradient(${dir}, ${a}, ${b}, ${c})`;

/** Mini picture of the app: header strip, sidebar with a pill, and content. */
function MiniApp({ choice, className }: { choice: ChromeChoice; className?: string }) {
  const sb = sidebarById(choice.sidebar), hd = headerById(choice.header), pl = pillById(choice.pill);
  const pf = pl?.from ?? sb.pill.from, pt = pl?.to ?? sb.pill.to;
  return (
    <span className={cn("relative block overflow-hidden rounded-lg border border-black/10 bg-[#F3F5FB]", className)}>
      <span className="absolute inset-x-0 top-0 h-[22%]" style={{ background: grad(hd.from, hd.via, hd.to), borderBottom: `1.5px solid ${hd.border}` }} />
      <span className="absolute bottom-0 left-0 top-[22%] w-[30%]" style={{ background: grad(sb.from, sb.via, sb.to, "180deg"), borderRight: `1.5px solid ${sb.border}` }}>
        <span className="absolute left-[10%] right-[10%] top-[10%] h-[14%] rounded-full" style={{ background: `linear-gradient(90deg, ${pf}, ${pt})` }} />
        <span className="absolute left-[16%] right-[30%] top-[34%] h-[6%] rounded-full" style={{ background: sb.tone === "light" ? "#C9D3EE" : "#FFFFFF55" }} />
        <span className="absolute left-[16%] right-[40%] top-[48%] h-[6%] rounded-full" style={{ background: sb.tone === "light" ? "#C9D3EE" : "#FFFFFF55" }} />
        <span className="absolute left-[16%] right-[34%] top-[62%] h-[6%] rounded-full" style={{ background: sb.tone === "light" ? "#C9D3EE" : "#FFFFFF55" }} />
      </span>
      <span className="absolute bottom-[10%] left-[38%] right-[8%] top-[34%] rounded-md bg-white shadow-sm" />
      <span className="absolute left-[38%] top-[28%] h-[5%] w-[24%] rounded-full bg-[#4361EE]/70" />
    </span>
  );
}

function Chip({ on, disabled, onClick, children, title }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
      className={cn("flex items-center gap-2 rounded-xl border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-70", on ? "border-[#4361EE] bg-[#EEF1FD] ring-2 ring-[#4361EE]/15" : "border-border hover:bg-muted/40")}>
      {children}
      {on && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-[#4361EE]" />}
    </button>
  );
}

const H = ({ children, hint }: { children: React.ReactNode; hint?: string }) => (
  <div className="mb-2 flex items-baseline gap-2"><p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{children}</p>{hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}</div>
);

export function ChromeThemeSettings() {
  const { settings, updateSettings, hydrated } = useStoreSettings();
  const { can, isDemoMode } = usePermissions();
  const canEdit = can("manage_settings");
  const saved: ChromeChoice = useMemo(() => settings.chromeTheme ?? DEFAULT_CHROME, [settings.chromeTheme]);
  // Key on the CONTENT, not the object: a realtime echo of any other company setting hands us a
  // new object with the same colours and must not wipe an unsaved preview.
  const savedKey = JSON.stringify({ s: saved.sidebar, h: saved.header, p: saved.pill ?? null, l: saved.line ?? "brand" });
  const savedRef = useRef(saved); savedRef.current = saved;
  const [draft, setDraft] = useState<ChromeChoice>(saved);
  useEffect(() => { if (hydrated) setDraft(savedRef.current); }, [hydrated, savedKey]);

  // Live preview while editing; restore the saved colours when leaving without saving.
  useEffect(() => { applyChrome(draft); }, [draft]);
  useEffect(() => () => applyChrome(savedRef.current), []);
  const [saving, setSaving] = useState(false);

  const dirty = !sameChoice(draft, saved);
  const sb = sidebarById(draft.sidebar);
  const setSide = (id: string) => setDraft((d) => ({ ...d, sidebar: id }));
  const setHead = (id: string) => setDraft((d) => ({ ...d, header: id }));
  const setPill = (id: string | null) => setDraft((d) => ({ ...d, pill: id }));
  const setLine = (id: string) => setDraft((d) => ({ ...d, line: id }));
  const pillStart = (pillById(draft.pill)?.from ?? sb.pill.from).slice(0, 7);
  const lineColor = (l: (typeof LINES)[number]) => l.color ?? pillStart;

  async function save() {
    if (saving) return;
    setSaving(true);
    updateSettings({ chromeTheme: draft });
    try {
      // Read it back so a rejected write (e.g. no permission) can never look like a success.
      if (isSupabaseConfigured && supabase && !isDemoMode) {
        await new Promise((r) => setTimeout(r, 700));
        const { data, error } = await supabase.from("organization_settings").select("chrome_theme").maybeSingle();
        const got = normalizeChoice(data?.chrome_theme);
        if (error || !got || !sameChoice(got, draft)) {
          toast.error("Couldn't save the colours. Only an administrator can change them, and the change must be allowed by the database.");
          return;
        }
      }
      toast.success("Sidebar and header colours saved for everyone");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      {!canEdit && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">You can look around, but only an administrator can change the company colours.</p>}

      {/* Current selection + quick actions */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center">
        <MiniApp choice={draft} className="h-[104px] w-[176px] shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[13px] font-semibold">Your combination</p>
          <p className="text-[12.5px] text-muted-foreground">
            Sidebar <b className="text-foreground">{sb.name}</b> · Header <b className="text-foreground">{headerById(draft.header).name}</b> · Pill <b className="text-foreground">{pillById(draft.pill)?.name ?? "Match sidebar"}</b> · Line <b className="text-foreground">{lineById(draft.line).name}</b>
          </p>
          <p className="text-[12px] text-muted-foreground">{dirty ? "Previewing on this page. Not saved yet." : "Saved. This is what everyone sees."}</p>
        </div>
        <Button variant="outline" className="gap-2" disabled={!canEdit} onClick={() => setDraft(randomChoice())}><Shuffle className="h-4 w-4" />Surprise me</Button>
      </div>

      <div>
        <H hint="Ready-made starting points. Click one, then fine-tune below.">Suggested combinations</H>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {COMBOS.map((cb) => (
            <Chip key={cb.id} on={sameChoice(draft, cb.choice)} disabled={!canEdit} onClick={() => setDraft(cb.choice)}>
              <MiniApp choice={cb.choice} className="h-[44px] w-[72px] shrink-0" />
              <span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{cb.name}</span><span className="block truncate text-[11px] text-muted-foreground">{cb.note}</span></span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <H hint={`${SIDEBARS.length} options`}>Sidebar</H>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {SIDEBARS.map((s) => (
            <Chip key={s.id} on={draft.sidebar === s.id} disabled={!canEdit} onClick={() => setSide(s.id)}>
              <span className="h-9 w-5 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: grad(s.from, s.via, s.to, "180deg") }} />
              <span className="truncate text-[12px] font-semibold">{s.name}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <H hint={`${HEADERS.length} options`}>Header</H>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {HEADERS.map((h) => (
            <Chip key={h.id} on={draft.header === h.id} disabled={!canEdit} onClick={() => setHead(h.id)}>
              <span className="h-5 w-9 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: grad(h.from, h.via, h.to) }} />
              <span className="truncate text-[12px] font-semibold">{h.name}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <H hint={`${PILLS.length + 1} options · colour of the selected menu item`}>Active-item pill</H>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          <Chip on={draft.pill === null} disabled={!canEdit} onClick={() => setPill(null)}>
            <span className="grid h-7 w-11 shrink-0 place-items-center rounded-full text-[10px] font-bold ring-1 ring-black/10" style={{ background: `linear-gradient(90deg, ${sb.pill.from}, ${sb.pill.to})`, color: sb.pill.text }}>Aa</span>
            <span className="truncate text-[12px] font-semibold">Match sidebar</span>
          </Chip>
          {PILLS.map((pl) => (
            <Chip key={pl.id} on={draft.pill === pl.id} disabled={!canEdit} onClick={() => setPill(pl.id)}>
              <span className="grid h-7 w-11 shrink-0 place-items-center rounded-full text-[10px] font-bold ring-1 ring-black/10" style={{ background: `linear-gradient(90deg, ${pl.from}, ${pl.to})`, color: pl.text }}>Aa</span>
              <span className="truncate text-[12px] font-semibold">{pl.name}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <H hint={`${LINES.length} options · the thin line that slides in under a menu item when you hover it`}>Hover line</H>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {LINES.map((l) => (
            <Chip key={l.id} on={(draft.line ?? "brand") === l.id} disabled={!canEdit} onClick={() => setLine(l.id)}>
              <span className="relative h-8 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10" style={{ background: grad(sb.from, sb.via, sb.to) }}>
                <span className="absolute inset-x-1.5 top-1.5 h-4 rounded-md bg-white/20 ring-1 ring-inset ring-white/25" />
                <span className="absolute inset-x-2.5 bottom-1 h-[3px] rounded-full" style={{ background: l.id === "none" ? "transparent" : lineColor(l) }} />
              </span>
              <span className="truncate text-[12px] font-semibold">{l.name}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" className="gap-2" disabled={!canEdit || sameChoice(draft, DEFAULT_CHROME)} onClick={() => setDraft(DEFAULT_CHROME)}><RotateCcw className="h-4 w-4" />Default colours</Button>
        {dirty && <Button variant="outline" onClick={() => setDraft(saved)}>Discard</Button>}
        <Button className="gap-2" disabled={!canEdit || !dirty || saving} onClick={save}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save colours"}</Button>
      </div>
    </div>
  );
}
