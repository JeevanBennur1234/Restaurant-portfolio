import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("UPI payment modal guest safety and contrast", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src/components/guest/upi-qr-modal.tsx"), "utf-8");

  it("uses defined opaque surface tokens", () => {
    expect(source).toContain("bg-[var(--bg-surface)] text-[var(--text-primary)]");
    expect(source).toContain("bg-[var(--bg-subtle)]");
    expect(source).not.toContain("var(--surface)");
    expect(source).not.toContain("var(--surface-raised)");
  });

  it("does not expose Razorpay test-mode instructions to guests", () => {
    expect(source).not.toContain("Razorpay Test Mode Notice");
    expect(source).not.toContain("success@razorpay");
    expect(source).not.toContain("failure@razorpay");
  });

  it("provides fallback buttons to continue to Razorpay Checkout or pay at counter on error", () => {
    expect(source).toContain("Continue to Razorpay Checkout");
    expect(source).toContain("Pay at Counter Instead");
    expect(source).toContain("onSwitchToStandardCheckout");
    expect(source).toContain("onSwitchToCounter");
  });
});
