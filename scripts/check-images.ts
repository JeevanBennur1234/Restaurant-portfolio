import * as fs from "node:fs";
import * as path from "node:path";
import { SEEDED_DISHES } from "../src/server/db/seed-dishes";

export interface ImageCheckResult {
  category: "marketing" | "dish" | "placeholder";
  name: string;
  expectedPath: string;
  exists: boolean;
  type: string;
}

export function checkReferencedImages(): {
  results: ImageCheckResult[];
  missingCount: number;
  foundCount: number;
  totalCount: number;
} {
  const rootDir = process.cwd();
  const results: ImageCheckResult[] = [];

  // 1. Marketing / Hero Assets
  const marketingAssets = [
    { name: "Hero Photo", relPath: "public/images/hero.jpg", type: "hero" },
    { name: "Hero Video (optional)", relPath: "public/media/hero.mp4", type: "video" },
    { name: "Hero Video Poster (optional)", relPath: "public/media/hero-poster.jpg", type: "poster" },
    { name: "Story Recipe Photo", relPath: "public/images/story.jpg", type: "story" },
  ];

  for (const asset of marketingAssets) {
    const fullPath = path.resolve(rootDir, asset.relPath);
    const exists = fs.existsSync(fullPath);
    results.push({
      category: "marketing",
      name: asset.name,
      expectedPath: asset.relPath,
      exists,
      type: asset.type,
    });
  }

  // 2. Placeholder Assets (Graceful Fallbacks)
  const placeholderAssets = [
    { name: "Hero Placeholder SVG", relPath: "public/images/hero-placeholder.svg" },
    { name: "Hero Video Poster SVG", relPath: "public/media/hero-poster.svg" },
    { name: "Story Placeholder SVG", relPath: "public/images/story-placeholder.svg" },
    { name: "Dish Placeholder SVG", relPath: "public/images/dish-placeholder.svg" },
    { name: "Dishes Directory Placeholder SVG", relPath: "public/images/dishes/placeholder.svg" },
  ];

  for (const asset of placeholderAssets) {
    const fullPath = path.resolve(rootDir, asset.relPath);
    const exists = fs.existsSync(fullPath);
    results.push({
      category: "placeholder",
      name: asset.name,
      expectedPath: asset.relPath,
      exists,
      type: "placeholder",
    });
  }

  // 3. Dish Photos Referenced by Seed Data
  for (const dish of SEEDED_DISHES) {
    // imageUrl is e.g. "/images/dishes/butter-chicken.jpg" -> "public/images/dishes/butter-chicken.jpg"
    const cleanUrl = dish.imageUrl.startsWith("/") ? dish.imageUrl.slice(1) : dish.imageUrl;
    const relPath = path.join("public", cleanUrl).replace(/\\/g, "/");
    const fullPath = path.resolve(rootDir, relPath);
    const exists = fs.existsSync(fullPath);

    results.push({
      category: "dish",
      name: `${dish.name} (${dish.slug})`,
      expectedPath: relPath,
      exists,
      type: dish.isVeg ? "veg-dish" : "non-veg-dish",
    });
  }

  const missingCount = results.filter((r) => !r.exists && r.category !== "placeholder" && !r.expectedPath.includes("optional")).length;
  const foundCount = results.filter((r) => r.exists).length;
  const totalCount = results.length;

  return { results, missingCount, foundCount, totalCount };
}

function main() {
  console.log("🔍 Checking DinePulse image assets and referenced dish photos...\n");

  const { results, missingCount } = checkReferencedImages();

  // Print Placeholders Status
  console.log("--- Built-in Fallback Placeholders ---");
  const placeholders = results.filter((r) => r.category === "placeholder");
  for (const p of placeholders) {
    const status = p.exists ? "✅ ACTIVE" : "❌ MISSING";
    console.log(`  ${status}  ${p.expectedPath}`);
  }
  console.log("");

  // Print Marketing Photos Status
  console.log("--- Marketing & Hero Photography ---");
  const marketing = results.filter((r) => r.category === "marketing");
  for (const m of marketing) {
    const status = m.exists ? "✅ FOUND " : "⚠️  PENDING";
    console.log(`  ${status}  ${m.expectedPath} (${m.name})`);
  }
  console.log("");

  // Print Seeded Dish Photos Status
  console.log("--- Seeded Menu Dish Photos (/images/dishes/<slug>.jpg) ---");
  const dishes = results.filter((r) => r.category === "dish");
  const missingDishes = dishes.filter((d) => !d.exists);
  const foundDishes = dishes.filter((d) => d.exists);

  if (foundDishes.length > 0) {
    console.log(`Found ${foundDishes.length} custom dish photos:`);
    for (const d of foundDishes) {
      console.log(`  ✅ FOUND    ${d.expectedPath} — ${d.name}`);
    }
  }

  if (missingDishes.length > 0) {
    console.log(`Missing ${missingDishes.length} custom dish photos (using graceful fallback):`);
    for (const d of missingDishes) {
      console.log(`  ⚠️  MISSING  ${d.expectedPath}  <- ${d.name}`);
    }
  }

  console.log("\n=======================================================");
  console.log(`📊 Summary: ${missingDishes.length}/${dishes.length} custom dish photos pending.`);
  if (missingCount > 0) {
    console.log(`💡 Graceful warm SVG placeholders are active so layouts do not shift.`);
    console.log(`👉 Drop your photos in public/images/dishes/ (1200x900px, <250KB each).`);
  } else {
    console.log(`🎉 All referenced food photography is present!`);
  }
  console.log("=======================================================\n");
}

if (require.main === module || process.argv[1]?.includes("check-images")) {
  main();
}
