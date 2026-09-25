"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
import { toast } from "@/components/ui/toaster";

/* Safe store removal dialog.
   ARCHIVE (deactivate) is the default and always available — it preserves all
   historical data. PERMANENT DELETE is offered only when the caller has the
   delete capability; even then the SERVER refuses it if the store holds any
   transactional data (returns has_data), so the UI falls back to archiving.
   Both paths require typing the exact store name to confirm. */
export function ArchiveStoreDialog({
  open,
  onClose,
  storeName,
  storeId,
  canHardDelete,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  storeName: string;
  storeId: string;
  canHardDelete: boolean;
  onDone: (mode: "archived" | "deleted") => void;
}) {
  const { apiFetch } = usePermissions();
  const [mode, setMode] = useState<"archive" | "delete">("archive");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setMode("archive"); setConfirm(""); setBusy(false); }
  }, [open]);

  const nameOk = confirm.trim() === storeName;

  async function run() {
    if (!nameOk) { toast.error("Type the store name exactly to confirm"); return; }
    setBusy(true);
    const res = await apiFetch(
      `/api/owner/stores/${storeId}?mode=${mode}&confirm=${encodeURIComponent(confirm.trim())}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok || !res.json?.ok) {
      if (res.json?.reason === "has_data") {
        toast.error("This store has historical records — archive it instead of deleting.");
        setMode("archive");
        return;
      }
      if (res.json?.reason === "name_mismatch") { toast.error("Store name didn't match."); return; }
      toast.error(res.json?.error ?? "Could not complete the action");
      return;
    }
    const done = res.json.mode === "deleted" ? "deleted" : "archived";
    toast.success(done === "deleted" ? `"${storeName}" permanently deleted` : `"${storeName}" archived`);
    onDone(done);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] grid place-items-center bg-foreground/40 p-4 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border"
          >
            <div className="flex items-start gap-3 p-5 pb-3">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-bold tracking-tight">Remove store</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose how to remove <span className="font-semibold text-foreground">{storeName}</span>.
                </p>
              </div>
              <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 pb-2">
              {/* Mode choice */}
              <button
                onClick={() => setMode("archive")}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${mode === "archive" ? "border-[#4361EE] bg-[#EEF1FD]/50" : "border-border hover:bg-muted/40"}`}
              >
                <Archive className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
                <span>
                  <span className="block text-[13px] font-semibold">Archive (recommended)</span>
                  <span className="block text-[12px] text-muted-foreground">Deactivates the store and hides it from operational selectors. All historical data stays intact and it can be reactivated later.</span>
                </span>
              </button>

              {canHardDelete && (
                <button
                  onClick={() => setMode("delete")}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${mode === "delete" ? "border-rose-300 bg-rose-50" : "border-border hover:bg-muted/40"}`}
                >
                  <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    <span className="block text-[13px] font-semibold text-rose-600">Permanently delete</span>
                    <span className="block text-[12px] text-muted-foreground">Only allowed when the store has NO tickets, invoices, or other records. If it has any data, this is blocked and you must archive instead.</span>
                  </span>
                </button>
              )}

              {/* Name confirmation */}
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="store-confirm">Type <span className="font-bold">{storeName}</span> to confirm</Label>
                <Input id="store-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={storeName} autoFocus />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                variant={mode === "delete" ? "destructive" : "primary"}
                size="sm"
                disabled={!nameOk}
                loading={busy}
                onClick={run}
              >
                {mode === "delete" ? "Permanently delete" : "Archive store"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
