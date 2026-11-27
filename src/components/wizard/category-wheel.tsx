"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone, Laptop, Tablet, Watch, Monitor, MonitorSmartphone, Boxes,
  ChevronLeft, ChevronRight, ArrowRight, Plus, Upload, Loader2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { uploadCatalogImage } from "@/components/settings/catalog/upload-image";
import {
  loadDeviceCategories, getCachedCategories, saveDeviceCategories, invalidateCategoryCache,
  DEFAULT_CATEGORIES, type DeviceCategoryItem,
} from "@/lib/device-categories";

type Cat = {
  id: string;
  label: string;
  icon: typeof Smartphone;
  tint: string;
  glow: string;
  image?: string;
};

const ICON_MAP: Record<string, typeof Smartphone> = {
  iphone: Smartphone, macbook: Laptop, ipad: Tablet, iwatch: Watch,
  imac: Monitor, android: MonitorSmartphone, windows: Laptop, others: Boxes,
};

const TINT_MAP: Record<string, string> = {
  iphone: "from-indigo-700 via-indigo-900 to-black",
  macbook: "from-zinc-600 via-zinc-800 to-black",
  ipad: "from-zinc-500 via-zinc-700 to-zinc-900",
  iwatch: "from-zinc-600 via-zinc-800 to-zinc-900",
  imac: "from-zinc-400 via-zinc-600 to-zinc-800",
  android: "from-emerald-700 via-zinc-800 to-black",
  windows: "from-sky-700 via-zinc-800 to-black",
  others: "from-violet-700 via-zinc-800 to-zinc-900",
};

function toCats(items: DeviceCategoryItem[]): Cat[] {
  return items.map((c) => ({
    id: c.id,
    label: c.label,
    icon: ICON_MAP[c.id] || Boxes,
    tint: TINT_MAP[c.id] || "from-zinc-600 via-zinc-800 to-black",
    glow: "rgba(79,70,229,0.5)",
    image: c.image,
  }));
}

function getDefaultCats(): Cat[] {
  return toCats(DEFAULT_CATEGORIES);
}

export function CategoryWheel({
  value,
  onChange,
  onNext,
  isEdit,
}: {
  value?: string;
  onChange: (id: string) => void;
  onNext: () => void;
  isEdit?: boolean;
}) {
  // Use cached categories synchronously if available (instant render).
  const [CATS, setCats] = useState<Cat[]>(() => {
    const cached = getCachedCategories();
    return cached ? toCats(cached) : getDefaultCats();
  });
  const [loaded, setLoaded] = useState(() => !!getCachedCategories());

  // Load categories from Supabase (or localStorage fallback) — resolves
  // instantly if cache is already warm from preloading.
  useEffect(() => {
    if (loaded) return; // Already have data from cache.
    loadDeviceCategories().then((items) => {
      setCats(toCats(items));
      setLoaded(true);
    });
  }, [loaded]);

  // Inline "+ Add category" tile (last slot of the wheel). Saves through the
  // SAME data layer as Settings → Device Categories, so both stay in sync.
  const { can } = usePermissions();
  const canAdd = allow(can, CAP.settings.deviceCategoryCreate);
  const [addOpen, setAddOpen] = useState(false);

  const initial = value ? CATS.findIndex((c) => c.id === value) : Math.min(3, CATS.length - 1);
  const [active, setActive] = useState(initial >= 0 ? initial : 0);
  const cur = CATS[active] || CATS[0];
  // Wheel slots = categories + (optional) the Add tile at the very end.
  const slotCount = CATS.length + (canAdd ? 1 : 0);
  const addIndex = canAdd ? CATS.length : -1;

  // Re-sync active index when CATS load from DB and value is set.
  useEffect(() => {
    if (loaded && value) {
      const idx = CATS.findIndex((c) => c.id === value);
      if (idx >= 0) setActive(idx);
    }
  }, [loaded, CATS, value]);

  // Sync external value if it changes (e.g. via dot navigation upstream)
  useEffect(() => {
    if (active >= CATS.length) return; // resting on the Add tile — keep the last real selection
    onChange(cur.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setActive((a) => Math.max(0, a - 1));
      if (addOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") setActive((a) => Math.max(0, a - 1));
      if (e.key === "ArrowRight") setActive((a) => Math.min(slotCount - 1, a + 1));
      if (e.key === "Enter") {
        if (active === addIndex) setAddOpen(true);
        else onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, slotCount, addOpen, active, addIndex]);

  const handleCreated = (item: DeviceCategoryItem, all: DeviceCategoryItem[]) => {
    const next = toCats(all);
    setCats(next);
    const idx = next.findIndex((c) => c.id === item.id);
    if (idx >= 0) setActive(idx);
    setAddOpen(false);
  };

  const pos = (i: number) => {
    const dist = i - active;
    const abs = Math.abs(dist);
    const sign = Math.sign(dist);
    // x offsets per ring distance - tighter on mobile via CSS transforms below
    const xs = [0, 150, 270, 370, 460];
    const ys = [0, 14, 28, 38, 46];
    const scales = [1.45, 0.95, 0.72, 0.56, 0.48];
    const opacities = [1, 0.9, 0.55, 0.22, 0];
    const blurs = [0, 0, 1.2, 2.5, 6];
    const idx = Math.min(abs, 4);
    return {
      x: sign * xs[idx],
      y: ys[idx],
      scale: scales[idx],
      opacity: opacities[idx],
      blur: blurs[idx],
    };
  };

  const goPrev = () => setActive((a) => Math.max(0, a - 1));
  const goFwd = () => setActive((a) => Math.min(slotCount - 1, a + 1));
  const onAddTile = active === addIndex;

  return (
    <div className="relative">
      {/* ---------- Wheel stage ---------- */}
      <div className="relative h-[280px] overflow-hidden rounded-[28px] border border-black sm:h-[320px]">
        {/* Solid clean background — RepairOX light blue-white */}
        <div className="absolute inset-0 bg-[#F8FAFE]" />
        {/* Wave grid */}
        <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />

        {/* Wheel viewport - items absolutely positioned, animated transforms */}
        <div className="absolute inset-0 grid place-items-center [perspective:1100px]">
          {/* Mobile-first: scale the whole wheel down on small screens */}
          <div className="relative h-full w-full origin-center scale-[0.65] sm:scale-[0.8] lg:scale-90">
            <div className="absolute inset-0 grid place-items-center">
              {CATS.map((c, i) => {
                const p = pos(i);
                const isActive = i === active;
                const Icon = c.icon;
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    onClick={() => (isActive ? onNext() : setActive(i))}
                    animate={{
                      x: p.x,
                      y: p.y,
                      scale: p.scale,
                      opacity: p.opacity,
                      filter: `blur(${p.blur}px)`,
                    }}
                    transition={{ type: "spring", stiffness: 220, damping: 26 }}
                    style={{ zIndex: 50 - Math.abs(i - active) }}
                    className="group absolute flex flex-col items-center gap-3 outline-none"
                    aria-label={c.label}
                    aria-pressed={isActive}
                  >
                    <motion.div
                      animate={{ y: [0, -7, 0] }}
                      transition={{
                        duration: 3 + (i % 3) * 0.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="relative"
                    >
                      <div
                        className={cn(
                          "relative grid h-24 w-24 place-items-center rounded-[20px] bg-gradient-to-b ring-1 ring-zinc-900/10 transition-shadow overflow-hidden",
                          c.tint
                        )}
                        style={{
                          boxShadow: isActive
                            ? `0 24px 60px -12px ${c.glow}, 0 8px 22px -8px rgba(0,0,0,0.4)`
                            : "0 14px 30px -16px rgba(0,0,0,0.35)",
                        }}
                      >
                        {c.image ? (
                          <img src={c.image} alt={c.label} className="absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] rounded-[17px] object-cover" />
                        ) : (
                          <Icon className="h-12 w-12 text-white/95" strokeWidth={1.4} />
                        )}
                        {/* Specular highlight */}
                        <div className="pointer-events-none absolute inset-x-3 top-2 h-7 rounded-full bg-white/15 blur-md" />
                        {/* Active accent ring */}
                        {isActive && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="pointer-events-none absolute -inset-1 rounded-[30px] ring-2 ring-indigo-400/70"
                          />
                        )}
                      </div>
                    </motion.div>
                    <span
                      className={cn(
                        "whitespace-nowrap text-sm font-semibold tracking-tight transition",
                        isActive ? "text-zinc-900" : "text-zinc-700"
                      )}
                    >
                      {c.label}
                    </span>
                  </motion.button>
                );
              })}
              {canAdd && (() => {
                const i = addIndex;
                const p = pos(i);
                const isActive = i === active;
                return (
                  <motion.button
                    key="__add_category"
                    type="button"
                    onClick={() => (isActive ? setAddOpen(true) : setActive(i))}
                    animate={{ x: p.x, y: p.y, scale: p.scale, opacity: p.opacity, filter: `blur(${p.blur}px)` }}
                    transition={{ type: "spring", stiffness: 220, damping: 26 }}
                    style={{ zIndex: 50 - Math.abs(i - active) }}
                    className="group absolute flex flex-col items-center gap-3 outline-none"
                    aria-label="Add category"
                  >
                    <div
                      className={cn(
                        "grid h-24 w-24 place-items-center rounded-[20px] border-2 border-dashed bg-white transition",
                        isActive ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-zinc-300 text-zinc-400 group-hover:border-[#4361EE]/60 group-hover:text-[#4361EE]"
                      )}
                      style={{ boxShadow: isActive ? "0 24px 60px -12px rgba(67,97,238,0.45)" : undefined }}
                    >
                      <Plus className="h-10 w-10" strokeWidth={1.8} />
                    </div>
                    <span className={cn("whitespace-nowrap text-sm font-semibold tracking-tight", isActive ? "text-[#4361EE]" : "text-zinc-700")}>
                      Add Category
                    </span>
                  </motion.button>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Side arrows */}
        <button
          onClick={goPrev}
          disabled={active === 0}
          aria-label="Previous"
          className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-[linear-gradient(180deg,#4361EE_0%,#3B54E8_100%)] text-white shadow-[0_8px_24px_-10px_rgba(67,97,238,0.55)] border border-black backdrop-blur transition hover:brightness-105 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={goFwd}
          disabled={active === slotCount - 1}
          aria-label="Next"
          className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-[linear-gradient(180deg,#4361EE_0%,#3B54E8_100%)] text-white shadow-[0_8px_24px_-10px_rgba(67,97,238,0.55)] border border-black backdrop-blur transition hover:brightness-105 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* ---------- Hero label ---------- */}
      <div className="mt-2 text-center h-9 flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.p
            key={onAddTile ? "__add" : cur.id}
            initial={{ opacity: 0, filter: "blur(4px)", y: 12 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0, filter: "blur(4px)", y: -12 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="font-display text-2xl font-extrabold tracking-tight brand-gradient-text"
          >
            {onAddTile ? "Add a new category" : cur.label}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* ---------- Dots ---------- */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {Array.from({ length: slotCount }).map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === active ? "w-6 brand-gradient" : "w-1.5 bg-zinc-300 hover:bg-zinc-400"
            )}
          />
        ))}
      </div>

      {/* ---------- Bottom CTAs ---------- */}
      {!isEdit && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="lg" onClick={goPrev} disabled={active === 0}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          {onAddTile ? (
            <Button size="lg" onClick={() => setAddOpen(true)} className="min-w-[140px]">
              <Plus className="h-4 w-4" /> Add Category
            </Button>
          ) : (
            <Button size="lg" onClick={onNext} className="min-w-[140px]">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {canAdd && (
        <AddCategoryDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

/* ─── Inline Add Category dialog (shared: wheel, ticket + invoice forms) ─── */
export function AddCategoryDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (item: DeviceCategoryItem, all: DeviceCategoryItem[]) => void;
}) {
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setName(""); setImage(undefined); setError(""); setSaving(false); }
  }, [open]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    const url = await uploadCatalogImage(file, "categories");
    setUploading(false);
    if (!url) { setError("Image upload failed. Try another image."); return; }
    setError("");
    setImage(url);
  };

  const save = async () => {
    const label = name.trim();
    if (!label || saving) return;
    setSaving(true);
    setError("");
    // Re-read the latest list so we never overwrite changes made elsewhere.
    invalidateCategoryCache();
    const current = await loadDeviceCategories();
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `cat-${Date.now()}`;
    if (current.some((c) => c.id === id || c.label.trim().toLowerCase() === label.toLowerCase())) {
      setError(`"${label}" already exists.`);
      setSaving(false);
      return;
    }
    const item: DeviceCategoryItem = { id, label, image };
    const all = [...current, item];
    const ok = await saveDeviceCategories(all);
    setSaving(false);
    if (!ok) { setError("Couldn't save the category. Please try again."); return; }
    // Warm the cache so other screens see it straight away.
    const fresh = await loadDeviceCategories();
    onCreated(item, fresh.some((c) => c.id === id) ? fresh : all);
  };

  return (
    <RoxCenteredForm
      open={open}
      onClose={onClose}
      title="Add Category"
      subtitle="Saved to your device categories, same as Settings."
      icon={Plus}
      width="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!name.trim() || saving || uploading} onClick={save}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save Category
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Category Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
            placeholder="e.g. Gaming Console"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>Image (optional)</Label>
          <div className="flex items-center gap-3">
            <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-[16px] border border-input bg-muted/30">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#4361EE]" />
              ) : image ? (
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <Boxes className="h-8 w-8 text-zinc-400" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-3.5 w-3.5" /> {image ? "Change Image" : "Upload Image"}
              </Button>
              {image && (
                <button type="button" onClick={() => setImage(undefined)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-rose-600">
                  <X className="h-3 w-3" /> Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
        {error && <p className="text-[12px] font-medium text-rose-600">{error}</p>}
      </div>
    </RoxCenteredForm>
  );
}
