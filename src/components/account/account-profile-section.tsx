"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Account Profile (self-service)

   The ONE implementation of the personal profile editor: photo, name, phone,
   language, Access PIN, password change, and read-only role/assignment. It is
   rendered by the global My Account page (/account) AND by the legacy Settings
   → Account → Profile route, so there is exactly one copy of this logic — no
   fork, no second profile database.

   The component renders only the section CARDS. The surrounding page shell
   (title, breadcrumbs, Save button) is owned by the caller via the imperative
   `controllerRef`, which exposes { dirty, saving, save() } so either a
   SettingsPage or the My Account hero can drive Save/Cancel consistently.
   ────────────────────────────────────────────────────────────────────────── */

import {
  useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef,
} from "react";
import {
  Camera, Trash2, Check, AlertCircle, IdCard, User,
  KeyRound, Eye, EyeOff, Lock,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DetailSection, DetailField } from "@/components/common/detail-page";
import { usePermissions } from "@/lib/permissions-context";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { getSessionToken } from "@/lib/use-session-tracker";

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

/* Languages the app genuinely supports today. The UI is English-only, so we
   expose only English rather than faking a translation system. */
const LANGUAGES = [{ label: "English", value: "English" }];

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB (matches the reference copy)
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Note = { kind: "ok" | "err"; text: string } | null;

/** Imperative handle the host page uses to render its own Save control. */
export interface AccountProfileController {
  dirty: boolean;
  saving: boolean;
  save: () => void;
  cancel: () => void;
}

export interface AccountProfileSectionProps {
  /** Called whenever the dirty/saving state changes, so the host page can
   *  re-render its own Save button. */
  onStateChange?: (state: { dirty: boolean; saving: boolean }) => void;
}

export const AccountProfileSection = forwardRef<AccountProfileController, AccountProfileSectionProps>(
  function AccountProfileSection({ onStateChange }, controllerRef) {
    const { currentUser, getRoleById, updateProfile, apiFetch } = usePermissions();
    const fileRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [language, setLanguage] = useState("English");
    const [initialLanguage, setInitialLanguage] = useState("English");
    const [saving, setSaving] = useState(false);
    const [note, setNote] = useState<Note>(null);

    // Access PIN — masked by default; a change is only sent when the user edits it.
    const [hasPin, setHasPin] = useState(false);
    const [pin, setPin] = useState("");            // "" while untouched
    const [pinTouched, setPinTouched] = useState(false);
    const [showPin, setShowPin] = useState(false);

    // Seed the form from the signed-in user (and re-seed if it changes).
    useEffect(() => {
      if (!currentUser) return;
      setName(currentUser.name ?? "");
      setPhone(currentUser.phone ?? "");
      setAvatarUrl(currentUser.avatarUrl ?? null);
    }, [currentUser?.id, currentUser?.name, currentUser?.phone, currentUser?.avatarUrl]);

    // Load the safe account fields (language + whether a PIN exists) from the server.
    useEffect(() => {
      let active = true;
      (async () => {
        const res = await apiFetch("/api/profile", { method: "GET" });
        if (!active) return;
        if (res.ok && res.json?.ok && res.json.account) {
          const lang = res.json.account.language ?? "English";
          setLanguage(lang);
          setInitialLanguage(lang);
          setHasPin(Boolean(res.json.account.hasAccessPin));
        }
      })();
      return () => { active = false; };
    }, [currentUser?.id, apiFetch]);

    const roleLabel = currentUser ? getRoleById(currentUser.roleId)?.label ?? currentUser.roleId : "";

    const dirty = useMemo(() => {
      if (!currentUser) return false;
      return (
        name.trim() !== (currentUser.name ?? "") ||
        (phone.trim() || "") !== (currentUser.phone ?? "") ||
        (avatarUrl ?? null) !== (currentUser.avatarUrl ?? null) ||
        language !== initialLanguage ||
        pinTouched
      );
    }, [currentUser, name, phone, avatarUrl, language, initialLanguage, pinTouched]);

    function flash(kind: "ok" | "err", text: string) {
      setNote({ kind, text });
      window.setTimeout(() => setNote(null), 3400);
    }

    async function acceptImage(file: File) {
      if (!ACCEPTED_TYPES.includes(file.type)) return flash("err", "Please choose a JPG, PNG or WebP image.");
      if (file.size > MAX_IMAGE_BYTES) return flash("err", "Image is too large (max 15 MB).");
      try {
        const resized = await fileToResizedDataUrl(file);
        setAvatarUrl(resized);
      } catch {
        flash("err", "Could not read that image. Try another file.");
      }
    }

    async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file
      if (file) await acceptImage(file);
    }

    // Revert all edits back to the saved account state (Cancel).
    function resetToUser() {
      if (!currentUser) return;
      setName(currentUser.name ?? "");
      setPhone(currentUser.phone ?? "");
      setAvatarUrl(currentUser.avatarUrl ?? null);
      setLanguage(initialLanguage);
      setPin("");
      setPinTouched(false);
      setShowPin(false);
    }

    async function handleSave() {
      if (!currentUser) return;
      if (!name.trim()) return flash("err", "Name can't be empty.");
      if (pinTouched && pin !== "" && !/^\d{4,8}$/.test(pin)) {
        return flash("err", "Access PIN must be 4 to 8 digits.");
      }
      setSaving(true);
      const updates: Parameters<typeof updateProfile>[0] = {
        name: name.trim(),
        phone: phone.trim(),
        avatarUrl,
        language,
      };
      if (pinTouched) updates.accessPin = pin === "" ? null : pin;

      const res = await updateProfile(updates);
      setSaving(false);
      if (res.ok) {
        if (pinTouched) { setHasPin(pin !== ""); setPin(""); setPinTouched(false); setShowPin(false); }
        setInitialLanguage(language);
        flash("ok", "Profile updated.");
      } else if (res.reason === "invalid_pin") {
        flash("err", "Access PIN must be 4 to 8 digits.");
      } else if (res.reason === "image_too_large") {
        flash("err", "Profile picture is too large. Try a smaller image.");
      } else {
        flash("err", "Couldn't save your profile. Please try again.");
      }
    }

    // Expose the save controller so the host page renders its own Save button.
    useImperativeHandle(controllerRef, () => ({ dirty, saving, save: handleSave, cancel: resetToUser }), [dirty, saving]);

    // Push dirty/saving changes to the host so it can drive its Save button.
    useEffect(() => { onStateChange?.({ dirty, saving }); }, [dirty, saving, onStateChange]);

    if (!currentUser) {
      return (
        <div className="rounded-2xl border-[1.5px] border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading your profile…
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {/* ── Personal information (shared DetailSection, blue accent) ── */}
        <DetailSection icon={User} title="Personal Information" accent="blue">
          {/* Compact photo row at the top of the section */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-3.5">
            <Avatar name={name || currentUser.name} src={avatarUrl} size={52} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">Profile Photo</p>
              <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP, up to 15 MB — resized automatically.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Camera className="h-3.5 w-3.5" /> {avatarUrl ? "Change" : "Upload"}
              </Button>
              {avatarUrl && (
                <Button size="sm" variant="ghost" onClick={() => setAvatarUrl(null)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onPickFile}
            />
          </div>

          {/* Field grid — 3 columns on desktop so the form stays short */}
          <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name" required htmlFor="p-name">
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </Field>
            <Field
              label="Email"
              required
              htmlFor="p-email"
              hint="Managed by an administrator."
            >
              <Input id="p-email" value={currentUser.email} disabled readOnly />
            </Field>
            <Field label="Phone" htmlFor="p-phone">
              <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contact number" />
            </Field>
            <Field label="Language" htmlFor="p-language" hint="English only, for now.">
              <Select
                id="p-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={LANGUAGES}
                className="h-[34px] rounded-xl text-[13px]"
              />
            </Field>
            {/* Access PIN — masked by default, with a show/hide control */}
            <Field
              label="Access PIN"
              htmlFor="p-pin"
              hint={hasPin ? "Type a new one to change it." : "4 to 8 digits, for quick actions."}
              action={hasPin ? (
                <button
                  type="button"
                  onClick={() => { setPinTouched(true); setPin(""); }}
                  className="text-[11px] font-medium text-rose-600 hover:underline"
                >
                  Remove
                </button>
              ) : undefined}
            >
              <Input
                id="p-pin"
                inputMode="numeric"
                autoComplete="off"
                type={showPin ? "text" : "password"}
                value={pinTouched ? pin : (hasPin ? "••••" : "")}
                placeholder={hasPin ? "" : "Set a 4–8 digit PIN"}
                onFocus={() => { if (!pinTouched) { setPin(""); setPinTouched(true); } }}
                onChange={(e) => { setPinTouched(true); setPin(e.target.value.replace(/\D/g, "").slice(0, 8)); }}
                iconRight={
                  <button
                    type="button"
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                    onClick={(e) => { e.stopPropagation(); setShowPin((v) => !v); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
            </Field>
          </div>

          {/* Save / Cancel — right aligned, only when there are edits */}
          {dirty && (
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/70 pt-4">
              <Button size="sm" variant="outline" onClick={resetToUser} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          )}
        </DetailSection>

        {/* ── Password (shared DetailSection, amber/security accent) ── */}
        <DetailSection icon={KeyRound} title="Password" accent="amber" delay={0.04}>
          <ChangePassword apiFetch={apiFetch} onNote={flash} />
        </DetailSection>

        {/* ── Role & assignment (read-only, neutral accent) ── */}
        <DetailSection icon={IdCard} title="Role & Assignment" accent="neutral" delay={0.08}>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField label="Role" value={roleLabel} flat />
            <DetailField label="Branch" value={currentUser.branch || "—"} flat />
            <DetailField label="Department" value={currentUser.department || "—"} flat />
            <DetailField label="Designation" value={currentUser.designation || "—"} flat />
          </div>
        </DetailSection>

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
      </div>
    );
  }
);

/* ── Change Password ─────────────────────────────────────────────────────
   Secure self-service flow: current → new → confirm. Passwords never persist
   in any shared state; they're posted once to /api/account/password and the
   fields clear on success. Optionally revokes the user's OTHER sessions. */
function ChangePassword({
  apiFetch,
  onNote,
}: {
  apiFetch: (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: any }>;
  onNote: (kind: "ok" | "err", text: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const canSubmit = current && next && confirm && !busy;

  async function submit() {
    if (!current) return onNote("err", "Enter your current password.");
    if (next.length < PASSWORD_MIN_LENGTH) return onNote("err", `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    if (next !== confirm) return onNote("err", "New passwords do not match.");
    if (next === current) return onNote("err", "New password must be different from the current one.");

    setBusy(true);
    const res = await apiFetch("/api/account/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: current,
        newPassword: next,
        revokeOthers,
        sessionToken: getSessionToken(),
      }),
    });
    setBusy(false);

    if (res.ok && res.json?.ok) {
      setCurrent(""); setNext(""); setConfirm(""); setShow(false);
      onNote("ok", revokeOthers ? "Password changed. Other sessions were signed out." : "Password changed.");
      return;
    }
    const reason = res.json?.reason;
    if (reason === "wrong_current") onNote("err", "Your current password is incorrect.");
    else if (reason === "weak_password") onNote("err", `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    else if (reason === "same_password") onNote("err", "New password must be different.");
    else onNote("err", res.json?.error ?? "Couldn't change your password.");
  }

  const eye = (
    <button type="button" aria-label={show ? "Hide" : "Show"} onClick={() => setShow((v) => !v)} className="text-muted-foreground hover:text-foreground">
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="cp-current">Current password</Label>
        <Input id="cp-current" type={show ? "text" : "password"} autoComplete="current-password"
          value={current} onChange={(e) => setCurrent(e.target.value)} iconLeft={<Lock className="h-3.5 w-3.5" />} iconRight={eye} />
      </div>
      <div className="hidden sm:block" />
      <div className="space-y-1.5">
        <Label htmlFor="cp-new">New password</Label>
        <Input id="cp-new" type={show ? "text" : "password"} autoComplete="new-password"
          value={next} onChange={(e) => setNext(e.target.value)} iconLeft={<Lock className="h-3.5 w-3.5" />} />
        <p className="text-[11px] text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm">Confirm new password</Label>
        <Input id="cp-confirm" type={show ? "text" : "password"} autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} iconLeft={<Lock className="h-3.5 w-3.5" />} />
      </div>

      <label className="flex items-center gap-2 sm:col-span-2 text-[12.5px] text-muted-foreground cursor-pointer select-none">
        <Checkbox checked={revokeOthers} onChange={setRevokeOthers} aria-label="Sign out my other sessions after changing the password" />
        Sign out my other sessions after changing the password
      </label>

      <div className="sm:col-span-2">
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          <KeyRound className="h-3.5 w-3.5" /> {busy ? "Updating…" : "Update Password"}
        </Button>
      </div>
    </div>
  );
}

/** A label-over-input field cell with an optional hint and a right-aligned
 *  action (e.g. "Remove PIN"). Keeps every field vertically aligned. */
function Field({
  label,
  htmlFor,
  required,
  hint,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      {children}
      {(hint || action) && (
        <div className="flex items-start justify-between gap-2">
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : <span />}
          {action}
        </div>
      )}
    </div>
  );
}
