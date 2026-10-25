import { describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

describe("Razorpay test mode configuration & webhook secret handling", () => {
  it("rejects webhook signature when webhook secret is a URL", async () => {
    vi.resetModules();
    vi.doMock("@/server/env", () => ({
      env: {
        DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
        RAZORPAY_KEY_ID: "rzp_test_mock_12345",
        RAZORPAY_KEY_SECRET: "mock_key_secret_12345",
        RAZORPAY_WEBHOOK_SECRET: "https://dinepulse-customer.vercel.app/api/webhooks/razorpay",
        PAYMENTS_MODE: "online",
      },
    }));

    const { verifyRazorpayWebhookSignature } = await import("@/server/razorpay");
    const payload = JSON.stringify({ event: "payment.captured" });
    const signature = crypto.createHmac("sha256", "some_secret").update(payload).digest("hex");

    const result = verifyRazorpayWebhookSignature(payload, signature);
    expect(result).toBe(false);
  });

  it("rejects webhook signature when webhook secret is placeholder", async () => {
    vi.resetModules();
    vi.doMock("@/server/env", () => ({
      env: {
        DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
        RAZORPAY_KEY_ID: "rzp_test_mock_12345",
        RAZORPAY_KEY_SECRET: "mock_key_secret_12345",
        RAZORPAY_WEBHOOK_SECRET: "placeholder_webhook_secret",
        PAYMENTS_MODE: "online",
      },
    }));

    const { verifyRazorpayWebhookSignature } = await import("@/server/razorpay");
    const payload = JSON.stringify({ event: "payment.captured" });
    const signature = crypto.createHmac("sha256", "placeholder_webhook_secret").update(payload).digest("hex");

    const result = verifyRazorpayWebhookSignature(payload, signature);
    expect(result).toBe(false);
  });

  it("verifies webhook signature correctly when configured with genuine secret", async () => {
    const validSecret = "whsec_valid_signing_secret_32_characters";
    vi.resetModules();
    vi.doMock("@/server/env", () => ({
      env: {
        DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
        RAZORPAY_KEY_ID: "rzp_test_mock_12345",
        RAZORPAY_KEY_SECRET: "mock_key_secret_12345",
        RAZORPAY_WEBHOOK_SECRET: validSecret,
        PAYMENTS_MODE: "online",
      },
    }));

    const { verifyRazorpayWebhookSignature } = await import("@/server/razorpay");
    const payload = JSON.stringify({ event: "order.paid", order_id: "order_123" });
    const signature = crypto.createHmac("sha256", validSecret).update(payload).digest("hex");

    const result = verifyRazorpayWebhookSignature(payload, signature);
    expect(result).toBe(true);

    // Mismatched signature fails
    const invalidSignature = crypto.createHmac("sha256", "wrong_secret").update(payload).digest("hex");
    expect(verifyRazorpayWebhookSignature(payload, invalidSignature)).toBe(false);
  });

  it("identifies test mode correctly for rzp_test_ keys", async () => {
    vi.resetModules();
    vi.doMock("@/server/env", () => ({
      env: {
        DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
        RAZORPAY_KEY_ID: "rzp_test_TpoVq2mFI7YKtg",
        RAZORPAY_KEY_SECRET: "mock_secret",
        PAYMENTS_MODE: "online",
      },
    }));

    const { isRazorpayConfigured, isOnlinePaymentsEnabled, isRazorpayTestMode } = await import("@/server/razorpay");
    expect(isRazorpayConfigured()).toBe(true);
    expect(isOnlinePaymentsEnabled()).toBe(true);
    expect(isRazorpayTestMode()).toBe(true);
  });

  it("webhook endpoint returns 500 when webhook secret is misconfigured as a URL", async () => {
    vi.resetModules();
    vi.doMock("@/server/env", () => ({
      env: {
        DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
        RAZORPAY_KEY_ID: "rzp_test_mock_12345",
        RAZORPAY_KEY_SECRET: "mock_key_secret_12345",
        RAZORPAY_WEBHOOK_SECRET: "https://dinepulse-customer.vercel.app/api/webhooks/razorpay",
        PAYMENTS_MODE: "online",
      },
    }));

    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const req = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "some_signature",
      },
      body: JSON.stringify({ event: "order.paid" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Webhook secret is not configured properly");
  });
});
