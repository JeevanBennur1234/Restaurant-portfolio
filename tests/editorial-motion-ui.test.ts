import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Editorial Motion & Design Tokens", () => {
  const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");
  const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");

  it("Task 1: globals.css contains required fluid typography tokens", () => {
    expect(globalsCss).toContain("--text-display: clamp(3rem, 9vw, 9rem);");
    expect(globalsCss).toContain("--text-h1: clamp(2.25rem, 5vw, 4rem);");
    expect(globalsCss).toContain("--text-h2: clamp(1.75rem, 3.5vw, 2.75rem);");
    expect(globalsCss).toContain("--text-eyebrow: 0.75rem;");
  });

  it("Task 1: globals.css contains utility classes: .eyebrow, .ember-section, .hairline, and .marquee", () => {
    // .eyebrow utility
    expect(globalsCss).toContain(".eyebrow");
    expect(globalsCss).toContain("letter-spacing: 0.18em;");

    // .ember-section utility
    expect(globalsCss).toContain(".ember-section");

    // .hairline utility with --border-strong
    expect(globalsCss).toContain(".hairline");
    expect(globalsCss).toContain("border-top: 1px solid var(--border-strong);");

    // CSS-only marquee with reduced motion guard
    expect(globalsCss).toContain("@keyframes marquee");
    expect(globalsCss).toContain(".marquee");
    expect(globalsCss).toContain("animation: marquee");
    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalsCss).toContain("animation-play-state: paused");
  });
});
