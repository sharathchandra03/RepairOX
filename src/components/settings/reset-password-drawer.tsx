"use client";

import { useEffect, useState } from "react";
import { KeyRound, Check, Lock, Eye, EyeOff, RefreshCw, Copy, CheckCheck } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { validatePassword, PASSWORD_MIN_LENGTH } from "@/lib/auth";

/** Generate a readable, reasonably strong temporary password. */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const rand = new Uint32Array(10);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
    for (let i = 0; i < 10; i++) out += chars[rand[i] % chars.length];
  } else {
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Owner action — set a new login password for a staff member. Enables login
 *  if it was disabled. Mirrors the styling of the other settings drawers.
 *  Optionally issue it as a TEMPORARY password (force change at next login).
 *  Never displays or recovers the EXISTING password — that is impossible by
 *  design; this only SETS a new one. */
export function ResetPasswordDrawer({
  open,
  onClose,
  memberName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  memberName: string;
  onConfirm: (password: string, opts?: { temporary?: boolean }) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirm("");
      setShow(false);
      setTemporary(false);
      setCopied(false);
      setError(null);
    }
  }, [open]);

  function fillGenerated() {
    const pw = generateTempPassword();
    setPassword(pw);
    setConfirm(pw);
    setShow(true);
    setTemporary(true);
    setCopied(false);
    setError(null);
  }

  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the value is still visible to copy manually */ }
  }

  function submit() {
    const check = validatePassword(password, confirm);
    if (!check.ok) {
      setError(check.message!);
      return;
    }
    onConfirm(password, { temporary });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={KeyRound}
      title="Reset password"
      subtitle={memberName}
      footer={
        <Button className="w-full gap-1.5" onClick={submit}>
          <Check className="h-4 w-4" /> Update password
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="reset-pw">New password</Label>
          <Input
            id="reset-pw"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            iconLeft={<Lock className="h-4 w-4" />}
            iconRight={
              <button type="button" onClick={() => setShow(!show)} aria-label="Toggle password" className="text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">Confirm new password</Label>
          <Input
            id="reset-confirm"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            iconLeft={<Lock className="h-4 w-4" />}
          />
        </div>

        <button
          type="button"
          onClick={fillGenerated}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#4361EE] hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Generate a temporary password
        </button>

        {/* The owner can copy the password THEY are setting (this is the value
            they'll hand to the user). This is NOT the existing password — the
            existing one is never recoverable. */}
        {password && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#B3BFF6] bg-[#EEF1FD]/50 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#3347D6]">Password to share</p>
              <p className="mt-0.5 truncate font-mono text-[13px] font-semibold text-foreground">
                {show ? password : "•".repeat(Math.min(password.length, 12))}
              </p>
            </div>
            <button
              type="button"
              onClick={copyPassword}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#B3BFF6] bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-[#3347D6] transition hover:bg-white"
            >
              {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
          <input
            type="checkbox"
            checked={temporary}
            onChange={(e) => setTemporary(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#4361EE]"
          />
          <span>
            <span className="block text-[13px] font-semibold">Temporary — force change at next login</span>
            <span className="block text-[12px] text-muted-foreground">
              {memberName} must set their own password the first time they sign in.
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] font-medium text-rose-700">
            {error}
          </p>
        )}

        <p className="rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD]/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#3347D6]">
          {memberName} will need to use this new password the next time they sign in. Login is enabled automatically.
          The existing password is never shown — it can only be replaced.
        </p>
      </div>
    </Drawer>
  );
}
