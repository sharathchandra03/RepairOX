/**
 * Shared Device Catalog image upload.
 *
 * Processes an image File → resizes to a max dimension → uploads to Supabase
 * Storage (bucket `catalog-images`) when available, else returns a compact
 * base64 data URL. This is the SAME pipeline the ImageUpload control uses, so
 * both the Settings drawers and the inline Price List cell behave identically.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const BUCKET_NAME = "catalog-images";

async function uploadToStorage(blob: Blob, ext: string, folder: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Process + upload an image file. Resolves to a usable URL (Storage public URL
 * or base64 data URL), or null on failure/oversize.
 */
export function uploadCatalogImage(
  file: File,
  folder = "parts",
  maxDimension = 512
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    if (file.size > 30 * 1024 * 1024) {
      alert("Image is larger than 30MB. Please pick a smaller file.");
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const img = new window.Image();
      img.onload = async () => {
        try {
          let { width, height } = img;
          if (!width || !height) return resolve(raw);
          const scale = Math.min(1, maxDimension / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(raw);
          ctx.drawImage(img, 0, 0, width, height);

          if (isSupabaseConfigured && supabase) {
            const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/webp", 0.85));
            if (blob) {
              const url = await uploadToStorage(blob, "webp", folder);
              if (url) return resolve(url);
            }
          }
          let out = canvas.toDataURL("image/webp", 0.7);
          if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/png");
          resolve(out);
        } catch {
          resolve(raw);
        }
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
