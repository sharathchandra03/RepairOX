"use client";
/* RepairOX — icon + colour picker for one Lead dropdown option (Settings →
   Lead Settings → Form Edit). Used for Lead Stage and Lead Nature options.
   Choose a curated icon OR type/pick any emoji, and a colour. "Automatic"
   clears both, so the option goes back to the keyword-matched style.
   Saves immediately through useLeads().updateOptionStyle. */
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import type { LeadOption } from "@/lib/leads-data";
import { OPTION_ICONS, EMOJI_SUGGESTIONS, OPTION_COLORS, renderOptionIcon } from "@/components/leads/option-icon";
import { stageIcon, statusDotColor, leadNatureDot, leadNatureGlyph } from "@/components/leads/lead-pills";

export const STYLED_OPTION_FIELDS = new Set(["status", "leadNature"]);

function autoStyle(opt: LeadOption): { icon: React.ReactNode; color: string } {
  if (opt.field === "leadNature") return { icon: <span className="leading-none">{leadNatureGlyph(opt.value)}</span>, color: leadNatureDot(opt.value) };
  return { icon: stageIcon(opt.value), color: statusDotColor(opt.value) };
}

export function OptionStylePicker({ opt, disabled }: { opt: LeadOption; disabled?: boolean }) {
  const { updateOptionStyle } = useLeads();
  const [emoji, setEmoji] = useState("");
  const auto = autoStyle(opt);
  const color = opt.color ?? auto.color;
  const icon = renderOptionIcon(opt.icon) ?? auto.icon;
  const save = (p: { icon?: string; color?: string }) => void updateOptionStyle(opt.id, { icon: opt.icon, color: opt.color, ...p });
  const chip = (
    <span className="grid h-7 w-7 place-items-center rounded-lg text-white shadow-sm ring-1 ring-black/5 text-[13px]" style={{ backgroundColor: color }}>{icon}</span>
  );
  if (disabled) return <span title="Icon & colour">{chip}</span>;
  return (
    <Dropdown align="left" width="w-72" trigger={({ toggle }) => (
      <button type="button" onClick={toggle} title="Change icon & colour" aria-label={`Change icon and colour for ${opt.value}`}
        className="shrink-0 rounded-lg transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40">{chip}</button>
    )}>
      {(close) => (
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Icon</p>
            {(opt.icon || opt.color) && (
              <button type="button" onClick={() => { void updateOptionStyle(opt.id, {}); close(); }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4361EE] hover:underline"><RotateCcw className="h-3 w-3" /> Automatic</button>
            )}
          </div>
          <div className="grid grid-cols-8 gap-1">
            {Object.entries(OPTION_ICONS).map(([k, C]) => (
              <button key={k} type="button" title={k} onClick={() => save({ icon: `i:${k}` })}
                className={cn("grid h-7 w-7 place-items-center rounded-md transition hover:bg-[#EEF1FD]", opt.icon === `i:${k}` && "bg-[#4361EE] text-white hover:bg-[#4361EE]")}
                style={opt.icon === `i:${k}` ? undefined : { color }}>
                <C className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Emoji</p>
          <div className="flex flex-wrap gap-1">
            {EMOJI_SUGGESTIONS.map((e) => (
              <button key={e} type="button" onClick={() => save({ icon: e })}
                className={cn("grid h-7 w-7 place-items-center rounded-md text-[14px] transition hover:bg-[#EEF1FD]", opt.icon === e && "ring-2 ring-[#4361EE]")}>{e}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="Or type / paste any emoji"
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-card px-2.5 text-[12px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15" />
            <button type="button" disabled={!emoji.trim()} onClick={() => { save({ icon: [...emoji.trim()].slice(0, 2).join("") }); setEmoji(""); }}
              className="h-8 rounded-lg bg-[#4361EE] px-3 text-[12px] font-semibold text-white disabled:opacity-40">Use</button>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Colour</p>
          <div className="grid grid-cols-8 gap-1.5">
            {OPTION_COLORS.map((c) => (
              <button key={c} type="button" title={c} onClick={() => save({ color: c })}
                className={cn("h-6 w-6 rounded-md ring-1 ring-inset ring-black/10 transition hover:scale-110", opt.color === c && "ring-2 ring-offset-1 ring-[#4361EE]")}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
