import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SEEDED_DISHES } from "@/server/db/seed-dishes";
import { checkReferencedImages } from "../scripts/check-images";
import nextConfig from "../next.config";

describe("Food Photography, Media Assets & Image Config", () => {
  const root = process.cwd();

  it("Requirement 1: public/media/ and public/images/ and public/images/dishes/ directories exist", () => {
    expect(fs.existsSync(path.resolve(root, "public/media"))).toBe(true);
    expect(fs.existsSync(path.resolve(root, "public/images"))).toBe(true);
    expect(fs.existsSync(path.resolve(root, "public/images/dishes"))).toBe(true);
  });

  it("Requirement 1: tasteful warm SVG placeholders exist with fixed aspect ratios so layouts do not shift", () => {
    const heroSvgPath = path.resolve(root, "public/images/hero-placeholder.svg");
    const posterSvgPath = path.resolve(root, "public/media/hero-poster.svg");
    const storySvgPath = path.resolve(root, "public/images/story-placeholder.svg");
    const dishSvgPath = path.resolve(root, "public/images/dish-placeholder.svg");

    expect(fs.existsSync(heroSvgPath)).toBe(true);
    expect(fs.existsSync(posterSvgPath)).toBe(true);
    expect(fs.existsSync(storySvgPath)).toBe(true);
    expect(fs.existsSync(dishSvgPath)).toBe(true);

    const heroSvg = fs.readFileSync(heroSvgPath, "utf-8");
    const posterSvg = fs.readFileSync(posterSvgPath, "utf-8");
    const storySvg = fs.readFileSync(storySvgPath, "utf-8");
    const dishSvg = fs.readFileSync(dishSvgPath, "utf-8");

    // Hero: 2400x1350 (16:9 fixed aspect ratio)
    expect(heroSvg).toContain('viewBox="0 0 2400 1350"');
    expect(heroSvg).toContain('preserveAspectRatio="xMidYMid slice"');

    // Poster: 2400x1350 (16:9 fixed aspect ratio)
    expect(posterSvg).toContain('viewBox="0 0 2400 1350"');
    expect(posterSvg).toContain('preserveAspectRatio="xMidYMid slice"');

    // Story: 1200x900 (4:3 fixed aspect ratio)
    expect(storySvg).toContain('viewBox="0 0 1200 900"');
    expect(storySvg).toContain('preserveAspectRatio="xMidYMid slice"');

    // Dish: 1200x900 (4:3 fixed aspect ratio)
    expect(dishSvg).toContain('viewBox="0 0 1200 900"');
    expect(dishSvg).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("Requirement 2: every seeded menu item has an imageUrl pointing at /images/dishes/<slug>.jpg", () => {
    expect(SEEDED_DISHES.length).toBe(30);

    for (const dish of SEEDED_DISHES) {
      expect(dish.imageUrl).toBe(`/images/dishes/${dish.slug}.jpg`);
      expect(dish.slug).toMatch(/^[a-z0-9-]+$/);
    }

    // Verify key dishes specified by user
    const butterChicken = SEEDED_DISHES.find((d) => d.name.includes("Butter Chicken"));
    expect(butterChicken).toBeDefined();
    expect(butterChicken?.imageUrl).toBe("/images/dishes/butter-chicken.jpg");

    const paneerTikka = SEEDED_DISHES.find((d) => d.name.includes("Paneer Tikka"));
    expect(paneerTikka).toBeDefined();
    expect(paneerTikka?.imageUrl).toBe("/images/dishes/paneer-tikka.jpg");
  });

  it("Requirement 2: scripts/check-images.ts accurately audits referenced images", () => {
    const report = checkReferencedImages();
    expect(report.totalCount).toBeGreaterThanOrEqual(35); // 4 marketing + 5 placeholders + 30 dishes

    const dishResults = report.results.filter((r) => r.category === "dish");
    expect(dishResults.length).toBe(30);

    const butterChickenResult = dishResults.find((r) => r.expectedPath === "public/images/dishes/butter-chicken.jpg");
    expect(butterChickenResult).toBeDefined();

    const placeholderResults = report.results.filter((r) => r.category === "placeholder");
    expect(placeholderResults.length).toBe(5);
    expect(placeholderResults.every((p) => p.exists)).toBe(true);
  });

  it("Requirement 3: next.config.ts configures avif and webp image formats and keeps Supabase remotePatterns", () => {
    expect(nextConfig.images?.formats).toEqual(["image/avif", "image/webp"]);
    expect(nextConfig.images?.remotePatterns).toBeDefined();

    const supabasePattern = nextConfig.images?.remotePatterns?.find(
      (p) => p.hostname === "*.supabase.co"
    );
    expect(supabasePattern).toBeDefined();
  });

  it("Requirement 4: README documents file locations, recommended sizes (hero 2400px wide, dish 1200x900) and 250KB limit", () => {
    const readmeContent = fs.readFileSync(path.resolve(root, "README.md"), "utf-8");

    expect(readmeContent).toContain("public/images/");
    expect(readmeContent).toContain("public/media/");
    expect(readmeContent).toContain("public/images/dishes/<slug>.jpg");
    expect(readmeContent).toContain("2400px wide");
    expect(readmeContent).toContain("1200×900px");
    expect(readmeContent).toContain("250KB");
    expect(readmeContent).toContain("npm run check-images");
  });
});
