"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Trash2, Check, AlertCircle, User, IdCard, ShieldCheck } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";

/* Downscale + compress an image file to a small JPEG data URL so profile
   pictures stay tiny (they live inline on the staff row). */
async function fileToResizedDataUrl(file: File, max = 256): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img = document.createElement("img");
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("decode failed"));
    img.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

type Note = { kind: "ok" | "err"; text: string } | null;

export default function ProfileSettingsPage() {
  const { currentUser, getRoleById, updateProfile } = usePermissions();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);

  // Seed the form from the signed-in user (and re-seed if it changes).
  useEffect(() => {
    if (!currentUser) return;
    setName(currentUser.name ?? "");
    setPhone(currentUser.phone ?? "");
    setAvatarUrl(currentUser.avatarUrl ?? null);
  }, [currentUser?.id, currentUser?.name, currentUser?.phone, currentUser?.avatarUrl]);

  const roleLabel = currentUser ? getRoleById(currentUser.roleId)?.label ?? currentUser.roleId : "";

  const dirty = useMemo(() => {
    if (!currentUser) return false;
    return (
      name.trim() !== (currentUser.name ?? "") ||
      (phone.trim() || "") !== (currentUser.phone ?? "") ||
      (avatarUrl ?? null) !== (currentUser.avatarUrl ?? null)
    );
  }, [currentUser, name, phone, avatarUrl]);

  function flash(kind: "ok" | "err", text: string) {
    setNote({ kind, text });
    window.setTimeout(() => setNote(null), 3200);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return flash("err", "Please choose an image file.");
    if (file.size > 8 * 1024 * 1024) return flash("err", "Image is too large (max 8 MB).");
    try {
      const resized = await fileToResizedDataUrl(file);
      setAvatarUrl(resized);
    } catch {
      flash("err", "Could not read that image. Try another file.");
    }
  }

  async function handleSave() {
    if (!currentUser) return;
    if (!name.trim()) return flash("err", "Name can't be empty.");
    setSaving(true);
    const res = await updateProfile({
      name: name.trim(),
      phone: phone.trim(),
      avatarUrl: avatarUrl,
    });
    setSaving(false);
    if (res.ok) flash("ok", "Profile updated.");
    else if (res.reason === "image_too_large") flash("err", "Profile picture is too large. Try a smaller image.");
    else flash("err", "Couldn't save your profile. Please try again.");
  }

  if (!currentUser) {
    return (
      <SettingsPage
        breadcrumbs={[{ label: "Account", href: "/settings/account/profile" }, { label: "Profile" }]}
        title="Profile"
        description="Manage your personal account details."
      >
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading your profile…
        </div>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      breadcrumbs={[{ label: "Account", href: "/settings/account/profile" }, { label: "Profile" }]}
      title="Profile"
      description="Update your name, contact number and profile picture."
      onSave={dirty ? handleSave : undefined}
      saving={saving}
    >
      {/* Profile photo */}
      <SettingsSection title="Profile Photo" description="Shown across the app on your avatar." icon={Camera}>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Avatar name={name || currentUser.name} src={avatarUrl} size={80} />
          <div className="flex-1">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Camera className="h-3.5 w-3.5" /> Upload photo
              </Button>
              {avatarUrl && (
                <Button size="sm" variant="ghost" onClick={() => setAvatarUrl(null)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              JPG or PNG, up to 8 MB. We resize it automatically. Changes apply when you click Save.
            </p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        </div>
      </SettingsSection>

      {/* Personal information */}
      <SettingsSection title="Personal Information" description="Your name and contact details." icon={User}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Full name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-phone">Phone</Label>
            <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contact number" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" value={currentUser.email} disabled readOnly />
            <p className="text-[11px] text-muted-foreground">
              Your sign-in email is managed by an administrator.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Role & assignment (read-only) */}
      <SettingsSection
        title="Role & Assignment"
        description="Set by your administrator — read only."
        icon={ShieldCheck}
        defaultOpen={false}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnly label="Role" value={roleLabel} icon={<IdCard className="h-3.5 w-3.5" />} />
          <ReadOnly label="Branch" value={currentUser.branch || "—"} />
          <ReadOnly label="Department" value={currentUser.department || "—"} />
          <ReadOnly label="Designation" value={currentUser.designation || "—"} />
        </div>
      </SettingsSection>

      {/* Inline toast */}
      {note && (
        <div
          className={
            "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-medium shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)] " +
            (note.kind === "ok"
              ? "border-emerald-200 bg-white text-emerald-700"
              : "border-rose-200 bg-white text-rose-700")
          }
        >
          {note.kind === "ok" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {note.text}
        </div>
      )}
    </SettingsPage>
  );
}

function ReadOnly({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 text-sm text-foreground">
        {icon}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
