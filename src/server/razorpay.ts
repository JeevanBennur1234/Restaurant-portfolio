import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "@/server/env";

const keyId = env.RAZORPAY_KEY_ID || "";
const keySecret = env.RAZORPAY_KEY_SECRET || "";
const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || "";

const isConfigured =
  Boolean(keyId) &&
  Boolean(keySecret) &&
  !keyId.includes("placeholder") &&
  !keySecret.includes("placeholder");

let razorpayClient: Razorpay | null = null;
if (isConfigured) {
  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  keyId: string;
}

export function isRazorpayConfigured(): boolean {
  return isConfigured;
}

/**
 * Creates an order on Razorpay servers from the DB total
 */
export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
  notes?: Record<string, string>
): Promise<RazorpayOrderResult> {
  if (!razorpayClient) {
    throw new Error("Razorpay client is not configured");
  }

  const order = await razorpayClient.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt,
    notes: notes ?? {},
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    receipt: order.receipt ?? receipt,
    keyId,
  };
}

/**
 * Verifies Razorpay checkout signature server-side using HMAC SHA256.
 * "Never trust a client-reported payment success."
 */
export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string
): boolean {
  if (!signature || !razorpayOrderId || !razorpayPaymentId) return false;
  if (!keySecret) return false;

  try {
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Verifies webhook payload signature sent by Razorpay webhook service
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  if (!signature || !rawBody) return false;
  if (!webhookSecret) return false;

  try {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch (error) {
    console.error("Webhook signature verification error:", error);
    return false;
  }
}
