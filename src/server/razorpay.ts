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

export function isRazorpayTestMode(): boolean {
  return isConfigured && keyId.startsWith("rzp_test_");
}

export interface RazorpayQrResult {
  id: string;
  imageUrl: string;
  status: string;
  closeBy?: number;
}

/**
 * Creates a single-use dynamic UPI QR Code on Razorpay servers
 */
export async function createRazorpayQrCode(
  amountPaise: number,
  orderNumber: string,
  notes?: Record<string, string>
): Promise<RazorpayQrResult | null> {
  if (!razorpayClient) return null;
  try {
    const qr = await razorpayClient.qrCode.create({
      type: "upi_qr",
      name: "Masala Lane",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: amountPaise,
      description: `Order #${orderNumber}`,
      close_by: Math.floor(Date.now() / 1000) + 15 * 60,
      notes: notes ?? {},
    });
    return {
      id: qr.id,
      imageUrl: qr.image_url,
      status: qr.status,
      closeBy: qr.close_by,
    };
  } catch (error) {
    console.warn(
      "Razorpay QR Code API unavailable or not enabled on account:",
      (error as Error)?.message || error
    );
    return null;
  }
}

/**
 * Fetches status and payments received for a Razorpay QR code
 */
export async function fetchRazorpayQrCode(
  qrCodeId: string
): Promise<{ id: string; status: string; paymentsAmountReceived: number } | null> {
  if (!razorpayClient) return null;
  try {
    const qr = await razorpayClient.qrCode.fetch(qrCodeId);
    return {
      id: qr.id,
      status: qr.status,
      paymentsAmountReceived: Number(qr.payments_amount_received ?? 0),
    };
  } catch (error) {
    console.warn("Failed to fetch Razorpay QR code:", (error as Error)?.message || error);
    return null;
  }
}

export interface RazorpayQrPaymentItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
}

/**
 * Fetches all payment transactions associated with a Razorpay QR code
 */
export async function fetchRazorpayQrCodePayments(
  qrCodeId: string
): Promise<RazorpayQrPaymentItem[]> {
  if (!razorpayClient) return [];
  try {
    const res = await (razorpayClient.qrCode as unknown as {
      fetchAllPayments: (id: string) => Promise<{ items?: RazorpayQrPaymentItem[]; count?: number }>;
    }).fetchAllPayments(qrCodeId);
    return res.items ?? [];
  } catch (error) {
    console.warn("Failed to fetch payments for QR code:", (error as Error)?.message || error);
    return [];
  }
}


/**
 * Fetches order details directly from Razorpay
 */
export async function fetchRazorpayOrder(
  orderId: string
): Promise<{ id: string; status: string; amountPaid: number } | null> {
  if (!razorpayClient) return null;
  try {
    const order = await razorpayClient.orders.fetch(orderId);
    return {
      id: order.id,
      status: order.status,
      amountPaid: Number(order.amount_paid ?? 0),
    };
  } catch (error) {
    console.warn("Failed to fetch Razorpay order:", (error as Error)?.message || error);
    return null;
  }
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
