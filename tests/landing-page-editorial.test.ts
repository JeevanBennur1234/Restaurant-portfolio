import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Editorial Landing Page (src/app/page.tsx)", () => {
  const root = process.cwd();
  const pagePath = path.resolve(root, "src/app/page.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf-8");

  it("Requirement: Removes any 'Design System' or 'palette' card", () => {
    expect(pageContent).not.toMatch(/palette/i);
    expect(pageContent).not.toMatch(/design system/i);
  });

  it("Requirement 00 Hero: full-viewport with eyebrow, huge wordmark, tagline, two buttons, and scroll cue", () => {
    // Numbered eyebrow
    expect(pageContent).toContain("00 / Regional Indian · Bengaluru");
    // Wordmark
    expect(pageContent).toContain("Masala Lane");
    // Tagline
    expect(pageContent).toContain("Fired by charcoal, steeped in regional heritage");
    // Button 1: View signature dishes to #signature-dishes anchor
    expect(pageContent).toContain('href="#signature-dishes"');
    expect(pageContent).toContain("View signature dishes");
    // Button 2: Dine-In QR Ordering to #table-ordering anchor
    expect(pageContent).toContain('href="#table-ordering"');
    expect(pageContent).toContain("Dine-In QR Ordering");
    // Scroll cue
    expect(pageContent).toContain("Scroll");
  });

  it("Requirement 01 Marquee ticker: words separated by diamond glyphs", () => {
    expect(pageContent).toContain("marquee");
    expect(pageContent).toContain("Tandoor");
    expect(pageContent).toContain("Saffron");
    expect(pageContent).toContain("Ghee");
    expect(pageContent).toContain("Curry leaf");
    expect(pageContent).toContain("Jaggery");
    expect(pageContent).toContain("Coastal");
    expect(pageContent).toContain("Charcoal");
    expect(pageContent).toContain("◆");
  });

  it("Requirement 02 Story: two columns, large italic Playfair pull-quote, tall photo", () => {
    expect(pageContent).toContain("02 / Culinary Heritage");
    expect(pageContent).toContain("blockquote");
    expect(pageContent).toContain("slow alchemy of charcoal");
    expect(pageContent).toContain("aspect-[3/4]");
  });

  it("Requirement 03 Signature dishes: 6 image cards with name, one line, price, and keyboard controls", () => {
    expect(pageContent).toContain("03 / Chef's Signatures");
    expect(pageContent).toContain('id="signature-dishes"');
    expect(pageContent).toContain("Old Delhi Butter Chicken");
    expect(pageContent).toContain("Dal Makhani 24h");
    expect(pageContent).toContain("Paneer Tikka Shashlik");
    expect(pageContent).toContain("Awadhi Gosht Dum Biryani");
    expect(pageContent).toContain("Truffle & Aged Cheddar Naan");
    expect(pageContent).toContain("Alphonso & Cardamom Lassi");

    const carouselPath = path.resolve(root, "src/components/landing/signature-carousel.tsx");
    const carouselContent = fs.readFileSync(carouselPath, "utf-8");
    expect(carouselContent).toContain("Previous dishes");
    expect(carouselContent).toContain("Next dishes");
    expect(carouselContent).toContain("onKeyDown");
    expect(carouselContent).toContain('loading="lazy"');
    expect(carouselContent).toContain("snap-x snap-mandatory");
  });

  it("Requirement 04 How it works: ember dark band with three numbered steps", () => {
    expect(pageContent).toContain("04 / Effortless Hospitality");
    expect(pageContent).toContain("ember-section");
    expect(pageContent).toContain("Scan at your table");
    expect(pageContent).toContain("Order and pay");
    expect(pageContent).toContain("Track it live");
  });

  it("Requirement 05 Visit: address, hours, map placeholder, and Intallo footer", () => {
    expect(pageContent).toContain("05 / Visit & Hours");
    expect(pageContent).toContain("Indiranagar, Bengaluru");
    expect(pageContent).toContain("Service Hours");
    expect(pageContent).toContain("12:00 PM – 3:30 PM");
    expect(pageContent).toContain("7:00 PM – 11:30 PM");
    expect(pageContent).toContain("Concept preview");
    expect(pageContent).toContain("https://intallo.in");
  });

  it("Requirement: Autoplay video is paused under reduced motion in HeroMedia", () => {
    const heroMediaPath = path.resolve(root, "src/components/landing/hero-media.tsx");
    const heroMediaContent = fs.readFileSync(heroMediaPath, "utf-8");

    expect(heroMediaContent).toContain("(prefers-reduced-motion: reduce)");
    expect(heroMediaContent).toContain("videoRef.current.pause()");
    expect(heroMediaContent).toContain("priority");
  });
});
