import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("UPI payment modal contrast and opacity regression", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/guest/upi-qr-modal.tsx"),
    "utf-8"
  );

  it("uses defined opaque surface tokens for the modal, header, nested instructions, and footer", () => {
    expect(source).toContain("bg-[var(--bg-surface)] text-[var(--text-primary)]");
    expect(source).toContain("bg-[var(--bg-subtle)]");
    expect(source).toContain("p-3 bg-white rounded-lg border border-amber-200");
    expect(source).not.toContain("var(--surface)");
    expect(source).not.toContain("var(--surface-raised)");
  });

  it("keeps test-mode payment instructions on a high-contrast solid notice", () => {
    expect(source).toContain("bg-amber-50 border border-amber-300");
    expect(source).toContain("text-xs font-bold text-amber-950");
    expect(source).toContain("text-xs text-stone-700 leading-relaxed");
    expect(source).toContain("font-semibold text-amber-950 text-xs");
    expect(source).toContain("Open Test Checkout");
    expect(source).toContain("success@razorpay");
    expect(source).toContain("failure@razorpay");
  });
});
