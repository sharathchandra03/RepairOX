"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Settings → Notifications → Walk-In Sound

   Controls the OPTIONAL sound that plays when a new Walk-In follow-up
   notification becomes due. Reuses the existing settings page shell and the
   per-user preference persistence (localStorage + Supabase via
   /api/dashboard-preferences) exposed by useWalkInSound.

     • On / Off master switch
     • Choose a built-in professional sound (Soft Chime / Gentle Bell /
       Light Pop / Soft Alert)
     • Preview any sound before selecting
     • Upload a custom sound → preview → select → replace / remove
   ────────────────────────────────────────────────────────────────────────── */

import { useRef, useState } from "react";
import { Play, Upload, Trash2, Check, Info, Volume2 } from "lucide-react";
import { SettingsPage } from "@/components/settings/settings-page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useWalkInSound, previewWalkInSound, BUILT_IN_WALKIN_SOUNDS, type WalkInSoundId,
} from "@/lib/walk-in-notification-sound";

/** Cap the custom upload so the data URL stays comfortably within storage limits. */
const MAX_UPLOAD_BYTES = 1_000_000; // ~1 MB

export default function WalkInSoundSettingsPage() {
  const {
    prefs, isSaving, setEnabled, setSound, setCustomSound, removeCustomSound, save, preview,
  } = useWalkInSound();

  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    await save();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleUpload = (file: File | undefined) => {
    setUploadError(null);
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setUploadError("Please choose an audio file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("File is too large. Choose an audio clip under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCustomSound(reader.result, file.name);
    };
    reader.onerror = () => setUploadError("Could not read that file. Try another.");
    reader.readAsDataURL(file);
  };

  const selectRow = (id: WalkInSoundId) => (
    <button
      key={id}
      type="button"
      onClick={() => setSound(id)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition",
        prefs.sound === id ? "border-[#4361EE] bg-[#EEF1FD]" : "border-border bg-background hover:border-[#4361EE]/40",
      )}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid h-4 w-4 place-items-center rounded-full ring-1 ring-inset transition",
            prefs.sound === id ? "bg-[#4361EE] ring-[#4361EE] text-white" : "bg-transparent ring-zinc-300",
          )}
        >
          {prefs.sound === id && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
        </span>
        <span className="text-[13px] font-medium">
          {BUILT_IN_WALKIN_SOUNDS.find((s) => s.id === id)?.label
            ?? (id === "custom" ? prefs.customName || "Custom sound" : id)}
        </span>
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); previewWalkInSound(id, prefs.customUrl); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); previewWalkInSound(id, prefs.customUrl); } }}
        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6] transition hover:bg-[#EEF1FD]"
      >
        <Play className="h-3 w-3" /> Preview
      </span>
    </button>
  );

  return (
    <SettingsPage
      breadcrumbs={[{ label: "Notifications", href: "/settings/notifications/email" }, { label: "Walk-In Sound" }]}
      title="Walk-In Notification Sound"
      description="Play an optional sound when a new Walk-In follow-up notification becomes due."
      onSave={handleSave}
      saving={isSaving}
    >
      {/* Master on/off */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
              <Volume2 className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Follow-up sound</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                When on, the selected sound plays once each time a new follow-up notification arrives.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.enabled}
            onClick={() => setEnabled(!prefs.enabled)}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", prefs.enabled ? "bg-[#4361EE]" : "bg-zinc-200")}
          >
            <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform", prefs.enabled && "translate-x-5")} />
          </button>
        </div>
      </div>

      {/* Sound selection */}
      <div className={cn("rounded-2xl border border-border bg-card p-6 shadow-card transition", !prefs.enabled && "opacity-60")}>
        <h3 className="text-sm font-semibold">Choose a sound</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">A small set of short, professional sounds. Preview each before selecting.</p>

        <div className="mt-4 space-y-2.5">
          {BUILT_IN_WALKIN_SOUNDS.map((s) => selectRow(s.id))}
          {prefs.customUrl && selectRow("custom")}
        </div>
      </div>

      {/* Custom upload */}
      <div className={cn("rounded-2xl border border-border bg-card p-6 shadow-card transition", !prefs.enabled && "opacity-60")}>
        <h3 className="text-sm font-semibold">Custom sound</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Upload your own short audio clip (under 1 MB).</p>

        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />

        {prefs.customUrl ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                <Volume2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{prefs.customName || "Custom sound"}</p>
                <p className="text-[11px] text-muted-foreground">Uploaded audio</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => previewWalkInSound("custom", prefs.customUrl)}>
                <Play className="h-3.5 w-3.5" /> Preview
              </Button>
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Replace
              </Button>
              <Button variant="outline" size="sm" className="rounded-lg text-rose-600 hover:text-rose-700" onClick={removeCustomSound}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="md" className="mt-4 rounded-xl" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload Custom Sound
          </Button>
        )}

        {uploadError && <p className="mt-2 text-[12px] font-medium text-rose-600">{uploadError}</p>}
      </div>

      {saved && (
        <p className="text-[12px] font-medium text-emerald-600">Sound preferences saved to your account.</p>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
        <p className="text-[12px] leading-relaxed text-[#3347D6]">
          The sound plays only when a NEW follow-up notification arrives — not on every refresh, and not repeatedly
          while an unread notification exists. Removing a custom sound falls back to the default while sound stays on.
        </p>
      </div>
    </SettingsPage>
  );
}
