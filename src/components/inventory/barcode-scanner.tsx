"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Barcode / QR scanner (camera).

   A small, dependency-free scanner that reads BOTH 1D barcodes AND 2D QR codes
   from the device camera using the native BarcodeDetector API when available.
   It is a reusable control: wire it next to any "Scan or enter …" input so the
   user can scan instead of typing. The raw text value is returned via onDetect;
   manual typing in the companion input always remains available.

   Graceful fallback: if the browser has no BarcodeDetector (Safari/Firefox at
   the time of writing) or the camera is unavailable, the scan button explains
   that scanning isn't supported and the user can still type the code by hand.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScanLine, X, CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";

// The browser BarcodeDetector is not in the TS DOM lib yet — declare the slice
// we use so this stays type-safe without an external dependency.
type DetectedBarcode = { rawValue: string; format: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

// 1D barcode + 2D QR formats (QR is explicitly included per the request).
const SCAN_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "data_matrix",
  "aztec",
  "pdf417",
];

export function ScanButton({
  onDetect,
  disabled,
  className,
}: {
  onDetect: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const supported = getDetectorCtor() != null;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={supported ? "Scan barcode or QR code" : "Scan using the camera"}
        className={cn(
          "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-xl border border-input bg-card px-3 text-[12px] font-medium text-foreground transition",
          "hover:border-[#4361EE]/40 hover:text-[#4361EE]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <ScanLine className="h-4 w-4" />
        Scan
      </button>
      {open && (
        <ScannerDialog
          onClose={() => setOpen(false)}
          onDetect={(v) => {
            onDetect(v);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ScannerDialog({
  onClose,
  onDetect,
}: {
  onClose: () => void;
  onDetect: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const Ctor = getDetectorCtor();

    async function start() {
      if (!Ctor) {
        setError("This browser can't scan from the camera. Please type the code by hand.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access isn't available here. Please type the code by hand.");
        return;
      }
      try {
        detectorRef.current = new Ctor({ formats: SCAN_FORMATS });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
          setReady(true);
          scanLoop();
        }
      } catch {
        if (!cancelled) setError("Couldn't access the camera. Check permissions, or type the code by hand.");
      }
    }

    function scanLoop() {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector) return;
      detector
        .detect(video)
        .then((codes) => {
          if (cancelled) return;
          if (codes.length > 0 && codes[0].rawValue) {
            onDetect(codes[0].rawValue.trim());
            return;
          }
          rafRef.current = requestAnimationFrame(scanLoop);
        })
        .catch(() => {
          if (!cancelled) rafRef.current = requestAnimationFrame(scanLoop);
        });
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [onDetect, stop]);

  return createPortal(
    <div className="fixed inset-0 z-[10060] grid place-items-center bg-black/70 p-4">
      <div
        className="absolute inset-0"
        onClick={() => {
          stop();
          onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
              <ScanLine className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[14px] font-bold text-foreground">Scan barcode or QR</p>
              <p className="text-[11px] text-muted-foreground">Point the camera at the code</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stop();
              onClose();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-black">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <CameraOff className="h-8 w-8 text-white/70" />
              <p className="text-[13px] text-white/80">{error}</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              {/* Reticle */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="relative h-40 w-40">
                  <span className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-white/90" />
                  <span className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-white/90" />
                  <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-white/90" />
                  <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-white/90" />
                </div>
              </div>
              {!ready && (
                <div className="absolute inset-0 grid place-items-center">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-r-transparent" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
