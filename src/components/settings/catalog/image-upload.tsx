"use client";

import { useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const BUCKET_NAME = "catalog-images";

/**
 * Image uploader for the Device Catalog.
 *
 * When Supabase is configured, images are uploaded to Supabase Storage
 * (catalog-images bucket) and a public URL is returned — making them globally
 * accessible across all users and sessions.
 *
 * When Supabase is NOT configured, falls back to the original base64 data URL
 * behaviour (stored in localStorage).
 */
export function ImageUpload({
  value,
  onChange,
  size = "md",
  label,
  maxDimension = 1400,
  rounded = "rounded-xl",
  folder = "categories",
}: {
  value?: string;
  onChange: (url: string) => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  /** Longest-edge cap in px; images larger are scaled down (aspect kept). */
  maxDimension?: number;
  rounded?: string;
  /** Sub-folder inside the bucket (e.g. "categories", "brands", "models"). */
  folder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const dims = size === "sm" ? "h-12 w-12" : size === "lg" ? "h-24 w-24" : "h-16 w-16";

  /** Convert a canvas blob to a Supabase Storage public URL. */
  const uploadToStorage = async (blob: Blob, ext: string): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabase) return null;
    const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, blob, {
        contentType: blob.type,
        cacheControl: "31536000", // 1 year cache
        upsert: false,
      });
    if (error) {
      console.error("Supabase Storage upload failed:", error.message);
      return null;
    }
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);
    return urlData?.publicUrl ?? null;
  };

  /** Remove a previously uploaded file from Storage (best-effort). */
  const removeFromStorage = (url: string) => {
    if (!isSupabaseConfigured || !supabase) return;
    // Extract the path after /object/public/catalog-images/
    const marker = `/object/public/${BUCKET_NAME}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const filePath = url.slice(idx + marker.length);
    supabase.storage.from(BUCKET_NAME).remove([filePath]).catch(() => {});
  };

  const processFile = (file?: File) => {
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      alert("Image is larger than 30MB. Please pick a smaller file.");
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const img = new window.Image();
      img.onload = async () => {
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

          // Try to upload to Supabase Storage for global access.
          if (isSupabaseConfigured && supabase) {
            // Convert canvas to blob (prefer webp, fallback png).
            const blob = await new Promise<Blob | null>((resolve) => {
              canvas.toBlob((b) => resolve(b), "image/webp", 0.9);
            });
            if (blob && blob.type === "image/webp") {
              const publicUrl = await uploadToStorage(blob, "webp");
              if (publicUrl) { onChange(publicUrl); setBusy(false); return; }
            }
            // Fallback: try PNG if webp blob failed.
            const pngBlob = await new Promise<Blob | null>((resolve) => {
              canvas.toBlob((b) => resolve(b), "image/png");
            });
            if (pngBlob) {
              const publicUrl = await uploadToStorage(pngBlob, "png");
              if (publicUrl) { onChange(publicUrl); setBusy(false); return; }
            }
          }

          // Fallback: base64 data URL (localStorage mode or if upload failed).
          let out = canvas.toDataURL("image/webp", 0.9);
          if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/png");
          onChange(out);
        } catch {
          onChange(raw);
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

  const handleRemove = () => {
    // If the current value is a Supabase Storage URL, delete the file.
    if (value && value.includes(`/storage/v1/object/public/${BUCKET_NAME}/`)) {
      removeFromStorage(value);
    }
    onChange("");
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
            onClick={handleRemove}
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
