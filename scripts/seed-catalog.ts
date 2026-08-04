/**
 * Seed the price list catalog into Supabase.
 * Run: npx --yes tsx scripts/seed-catalog.ts
 */
import { createClient } from "@supabase/supabase-js";
import { deviceCategories, priceListBrands, priceListModels, deviceParts } from "../src/lib/price-list-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bvriihnqozrdypvzvqjk.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2cmlpaG5xb3pyZHlwdnp2cWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMxMDUyMywiZXhwIjoyMTAwODg2NTIzfQ.EzRqT7YfZUvXXWqR4yFoLuxW_vMCdppKKJ3v1G4wmuE";
const supabase = createClient(url, serviceKey);

// Your organization ID (from the staff table)
const ORG_ID = "7b0013f7-5448-4c06-90b1-55d24bace655";

async function seed() {
  console.log(`Seeding catalog for org ${ORG_ID}...`);
  console.log(`  ${deviceCategories.length} categories`);
  console.log(`  ${priceListBrands.length} brands`);
  console.log(`  ${priceListModels.length} models`);
  console.log(`  ${deviceParts.length} parts`);
  console.log("");

  // 1. Categories
  const catRows = deviceCategories.map((c) => ({
    id: c.id, organization_id: ORG_ID, name: c.name, icon: c.icon,
    item_count: c.count, enabled: true, image_url: null,
  }));
  const { error: e1 } = await supabase.from("price_list_categories").upsert(catRows, { onConflict: "id" });
  console.log("Categories:", e1 ? `ERROR: ${e1.message}` : "✓");

  // 2. Brands
  const brandRows = priceListBrands.map((b) => ({
    id: b.id, organization_id: ORG_ID, name: b.name, category_id: b.categoryId,
    item_count: b.count, logo_url: b.logoUrl || null, enabled: true,
  }));
  const { error: e2 } = await supabase.from("price_list_brands").upsert(brandRows, { onConflict: "id" });
  console.log("Brands:", e2 ? `ERROR: ${e2.message}` : "✓");

  // 3. Models
  const modelRows = priceListModels.map((m) => ({
    id: m.id, organization_id: ORG_ID, brand_id: m.brandId, category_id: m.categoryId,
    name: m.name, model_year: m.year, chip: m.chip || null, storage: m.storage || null,
    display_size: m.displaySize || null, variant: m.variant || null,
    image_url: m.imageUrl || null, status: m.status || "active",
  }));
  const { error: e3 } = await supabase.from("price_list_models").upsert(modelRows, { onConflict: "id" });
  console.log("Models:", e3 ? `ERROR: ${e3.message}` : "✓");

  // 4. Parts
  const partRows = deviceParts.map((p) => ({
    id: String(p.id), organization_id: ORG_ID, model_id: p.modelId,
    part_name: p.partName, part_number: p.partNumber || null, price: p.price,
    price_known: p.priceKnown !== false, warranty: p.warranty || null,
    availability: p.availability || "In Stock", repair_category: p.repairCategory || null,
    image_url: p.imageUrl || null,
  }));
  const { error: e4 } = await supabase.from("price_list_parts").upsert(partRows, { onConflict: "id" });
  console.log("Parts:", e4 ? `ERROR: ${e4.message}` : "✓");

  // Verify
  const { data: check } = await supabase.from("price_list_categories").select("id").eq("organization_id", ORG_ID);
  console.log(`\nDone! ${check?.length ?? 0} categories now in database.`);
}

seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
