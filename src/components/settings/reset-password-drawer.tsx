"use client";

import { useEffect, useState } from "react";
import { KeyRound, Check, Lock, Eye, EyeOff } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { validatePassword, PASSWORD_MIN_LENGTH } from "@/lib/auth";

/** Owner action — set a new login password for a staff member. Enables login
 *  if it was disabled. Mirrors the styling of the other settings drawers. */
export function ResetPasswordDrawer({
  open,
  onClose,
  memberName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  memberName: string;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirm("");
      setShow(false);
      setError(null);
    }
  }, [open]);

  function submit() {
    const check = validatePassword(password, confirm);
    if (!check.ok) {
      setError(check.message!);
      return;
    }
    onConfirm(password);
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

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12px] font-medium text-rose-700">
            {error}
          </p>
        )}

        <p className="rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD]/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#3347D6]">
          {memberName} will need to use this new password the next time they sign in. Login is enabled automatically.
        </p>
      </div>
    </Drawer>
  );
}
