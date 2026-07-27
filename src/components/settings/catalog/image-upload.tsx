"use client";

import { useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Image uploader for the Device Catalog.
 *
 * Accepts ANY image format the browser can decode (PNG, JPG, JPEG, WEBP, GIF,
 * SVG, AVIF, BMP, HEIC where supported, …). Every upload is rasterized and
 * downscaled on a canvas to a compact, high-quality data URL — so large files
 * are accepted without blowing the localStorage quota, and transparency is
 * preserved (exported as WEBP, falling back to PNG).
 */
export function ImageUpload({
  value,
  onChange,
  size = "md",
  label,
  maxDimension = 1400,
  rounded = "rounded-xl",
}: {
  value?: string;
  onChange: (dataUrl: string) => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  /** Longest-edge cap in px; images larger are scaled down (aspect kept). */
  maxDimension?: number;
  rounded?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const dims = size === "sm" ? "h-12 w-12" : size === "lg" ? "h-24 w-24" : "h-16 w-16";

  const processFile = (file?: File) => {
    if (!file) return;
    // Generous guard only to avoid decoding absurdly large files into memory.
    if (file.size > 30 * 1024 * 1024) {
      alert("Image is larger than 30MB. Please pick a smaller file.");
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (!width || !height) { onChange(raw); setBusy(false); return; }
          const scale = Math.min(1, maxDimension / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { onChange(raw); setBusy(false); return; }
          ctx.drawImage(img, 0, 0, width, height);

          // Prefer WEBP (small + keeps alpha); fall back to PNG if unsupported.
          let out = canvas.toDataURL("image/webp", 0.9);
          if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/png");
          onChange(out);
        } catch {
          onChange(raw); // last-resort: store the original data URL
        } finally {
          setBusy(false);
        }
      };
      img.onerror = () => { onChange(raw); setBusy(false); };
      img.src = raw;
    };
    reader.onerror = () => setBusy(false);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-3">
      <div className={cn("relative group", dims)}>
        <label
          className={cn(
            "flex h-full w-full cursor-pointer place-items-center overflow-hidden border-2 border-dashed border-border bg-muted/40 transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/40",
            rounded
          )}
        >
          {busy ? (
            <span className="grid h-full w-full place-items-center text-[#4361EE]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          ) : value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.avif,.bmp,.heic,.heif"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => processFile(e.target.files?.[0])}
          />
        </label>
        {value && !busy && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white shadow"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-muted"
        >
          <Upload className="h-3.5 w-3.5" /> {value ? "Replace" : "Upload"}
        </button>
        {label && <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>}
      </div>
    </div>
  );
}
