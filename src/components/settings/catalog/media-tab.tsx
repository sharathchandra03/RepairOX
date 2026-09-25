"use client";

import { useMemo, useState } from "react";
import { Search, Copy, Check, ExternalLink, ImageIcon, LayoutGrid, Building2, Laptop, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/lib/catalog-context";
import { collectMedia, mediaCount, type MediaSourceType, type MediaImage } from "./media-library";

const TYPE_ICON: Record<MediaSourceType, React.ComponentType<{ className?: string }>> = {
  category: LayoutGrid,
  brand: Building2,
  model: Laptop,
  part: Wrench,
};

/**
 * Media Library tab — shows every image saved across the Device Catalog
 * (category images, brand logos, model images, part images), grouped and
 * clearly separated by type. Any image can be copied (URL) for reuse elsewhere
 * in the Price List, or opened full-size. This is a view over the live catalog
 * data — not a second storage system.
 */
export function MediaTab() {
  const { categories, brands, models, parts } = useCatalog();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const groups = useMemo(
    () => collectMedia({ categories, brands, models, parts }),
    [categories, brands, models, parts]
  );
  const total = useMemo(
    () => mediaCount({ categories, brands, models, parts }),
    [categories, brands, models, parts]
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.map((g) => ({
      ...g,
      images: g.images.filter((im) => im.ownerName.toLowerCase().includes(q)),
    }));
  }, [groups, search]);

  const visibleTotal = filteredGroups.reduce((n, g) => n + g.images.length, 0);

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold">Uploaded Images</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Every image saved across the catalog, grouped by type. Copy any image to reuse it elsewhere in the Price List.
          </p>
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
          />
        </div>
      </div>

      {total === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-muted">
            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
          </span>
          <p className="text-sm font-medium">No images yet</p>
          <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">
            Upload images to categories, brands, models or parts and they&apos;ll appear here for reuse.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => {
            const Icon = TYPE_ICON[group.type];
            if (group.images.length === 0) return null;
            return (
              <section key={group.type} className="rounded-2xl border border-zinc-300 bg-card p-4 shadow-card">
                {/* Group header */}
                <div className="mb-4 flex items-center gap-2.5 border-b border-border/70 pb-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground">{group.label}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {group.images.length}
                  </span>
                </div>

                {/* Image grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {group.images.map((im) => (
                    <MediaCard
                      key={`${group.type}-${im.ownerId}-${im.url}`}
                      image={im}
                      copied={copied === im.url}
                      onCopy={() => copyUrl(im.url)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {search.trim() && visibleTotal === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              No images match &ldquo;{search}&rdquo;.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MediaCard({ image, copied, onCopy }: { image: MediaImage; copied: boolean; onCopy: () => void }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-300 bg-muted/30 transition hover:border-[#4361EE]/50 hover:shadow-card-hover">
      <div className="aspect-square w-full overflow-hidden bg-white">
        <img src={image.url} alt={image.ownerName} className="h-full w-full object-contain p-2" />
      </div>
      <div className="border-t border-border/70 px-2 py-1.5">
        <p className="truncate text-[11px] font-medium text-foreground" title={image.ownerName}>{image.ownerName}</p>
      </div>

      {/* Hover actions */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onCopy}
          title="Copy image URL"
          className="pointer-events-auto grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-muted-foreground shadow-sm ring-1 ring-border transition hover:text-[#4361EE]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <a
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open full size"
          className="pointer-events-auto grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-muted-foreground shadow-sm ring-1 ring-border transition hover:text-[#4361EE]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
