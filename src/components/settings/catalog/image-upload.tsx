"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Loader2, Images, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useCatalog } from "@/lib/catalog-context";
import { collectMedia } from "./media-library";

const BUCKET_NAME = "catalog-images";

/**
 * Image uploader for the Device Catalog.
 *
 * When Supabase Storage is available (bucket exists), images are uploaded
 * there and a public URL is returned. Otherwise, images are rasterized to a
 * compact base64 data URL which is stored directly in the DB text column
 * (same as model images) — still globally accessible to all users.
 */
export function ImageUpload({
  value,
  onChange,
  size = "md",
  label,
  maxDimension = 512,
  rounded = "rounded-xl",
  folder = "categories",
  showLibrary = true,
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
  /** Show the "Choose from library" button to reuse an existing catalog image. */
  showLibrary?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const dims = size === "sm" ? "h-12 w-12" : size === "lg" ? "h-24 w-24" : "h-16 w-16";

  /** Try uploading to Supabase Storage. Returns public URL or null on failure. */
  const uploadToStorage = async (blob: Blob, ext: string): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, blob, {
          contentType: blob.type,
          cacheControl: "31536000",
          upsert: false,
        });
      if (error) {
        console.warn("[ImageUpload] Storage upload failed:", error.message);
        return null;
      }
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);
      return urlData?.publicUrl ?? null;
    } catch (e) {
      console.warn("[ImageUpload] Storage upload error:", e);
      return null;
    }
  };

  /** Remove a previously uploaded file from Storage (best-effort). */
  const removeFromStorage = (url: string) => {
    if (!isSupabaseConfigured || !supabase) return;
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

          // Try Supabase Storage first (if bucket exists).
          if (isSupabaseConfigured && supabase) {
            const blob = await new Promise<Blob | null>((resolve) => {
              canvas.toBlob((b) => resolve(b), "image/webp", 0.85);
            });
            if (blob) {
              const publicUrl = await uploadToStorage(blob, "webp");
              if (publicUrl) {
                onChange(publicUrl);
                setBusy(false);
                return;
              }
            }
          }

          // Fallback: base64 data URL — stored directly in the DB text column.
          // This still works globally because catalog-context writes it to
          // price_list_categories.image_url in Supabase DB.
          let out = canvas.toDataURL("image/webp", 0.7);
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
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" /> {value ? "Replace" : "Upload"}
          </button>
          {showLibrary && (
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-muted"
              title="Reuse an image already saved in the catalog"
            >
              <Images className="h-3.5 w-3.5" /> Library
            </button>
          )}
        </div>
        {label && <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>}
      </div>

      {showLibrary && libraryOpen && (
        <ImageLibraryPicker
          onClose={() => setLibraryOpen(false)}
          onPick={(url) => { onChange(url); setLibraryOpen(false); }}
        />
      )}
    </div>
  );
}

/* ─── Library picker modal — reuse an existing catalog image ───────── */
function ImageLibraryPicker({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const { categories, brands, models, parts } = useCatalog();
  const [search, setSearch] = useState("");

  const groups = useMemo(
    () => collectMedia({ categories, brands, models, parts }),
    [categories, brands, models, parts]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.map((g) => ({ ...g, images: g.images.filter((im) => im.ownerName.toLowerCase().includes(q)) }));
  }, [groups, search]);

  const total = filtered.reduce((n, g) => n + g.images.length, 0);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Images className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-bold">Choose from library</h3>
              <p className="text-[11px] text-muted-foreground">Reuse an image already saved in the catalog</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
            />
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {total === 0 ? (
            <div className="grid place-items-center py-12 text-center text-sm text-muted-foreground">
              {search.trim() ? "No images match your search." : "No images saved in the catalog yet."}
            </div>
          ) : (
            <div className="space-y-5">
              {filtered.map((g) => g.images.length > 0 && (
                <div key={g.type}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.label} · {g.images.length}</p>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                    {g.images.map((im) => (
                      <button
                        key={`${g.type}-${im.ownerId}-${im.url}`}
                        type="button"
                        onClick={() => onPick(im.url)}
                        title={`Use ${im.ownerName}`}
                        className="group overflow-hidden rounded-xl border border-zinc-300 bg-muted/30 text-left transition hover:border-[#4361EE] hover:shadow-card-hover"
                      >
                        <div className="aspect-square w-full overflow-hidden bg-white">
                          <img src={im.url} alt={im.ownerName} className="h-full w-full object-contain p-1.5" />
                        </div>
                        <p className="truncate border-t border-border/70 px-2 py-1 text-[10px] font-medium">{im.ownerName}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
