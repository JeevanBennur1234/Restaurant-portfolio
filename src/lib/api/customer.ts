import { apiFetch, type ApiResult } from "./client";
import type {
  GuestMenuData,
  PlaceOrderData,
  OrderDetails,
  CreateRazorpayOrderData,
  VerifyPaymentData,
  PlaceOrderInput,
  CreateUpiQrData,
  PaymentStatusData,
  ReceiptData,
} from "./types";

export interface PlaceOrderOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Fetch restaurant, table info, and menu items for a table session QR token.
 */
export async function getMenu(
  token: string,
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<GuestMenuData>> {
  return apiFetch<GuestMenuData>(
    `/api/v1/customer/tables/${encodeURIComponent(token)}/menu`,
    {
      method: "GET",
      signal: opts?.signal,
    }
  );
}

/**
 * Places a customer order. Accepts an idempotencyKey to prevent duplicate order placement.
 */
export async function placeOrder(
  tokenOrInput: string | PlaceOrderInput,
  dataOrOpts?:
    | Omit<PlaceOrderInput, "token">
    | PlaceOrderInput
    | PlaceOrderOptions,
  opts?: PlaceOrderOptions
): Promise<ApiResult<PlaceOrderData>> {
  let token: string;
  let body: unknown;
  let options: PlaceOrderOptions | undefined;

  if (typeof tokenOrInput === "string") {
    token = tokenOrInput;
    body = dataOrOpts;
    options = opts;
  } else {
    token = tokenOrInput.token;
    body = tokenOrInput;
    options = dataOrOpts as PlaceOrderOptions | undefined;
  }

  return apiFetch<PlaceOrderData>(
    `/api/v1/customer/tables/${encodeURIComponent(token)}/orders`,
    {
      method: "POST",
      body,
      tableToken: token,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    }
  );
}

/**
 * Fetch live order details with current status, paymentStatus, and items.
 */
export async function getOrder(
  orderIdOrObj: string | { orderId: string; token: string },
  tokenOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<OrderDetails>> {
  let orderId: string;
  let token: string;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrOpts as string;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    signal = (tokenOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<OrderDetails>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      tableToken: token,
      signal,
    }
  );
}

/**
 * Initializes a Razorpay order on the server.
 */
export async function createRazorpayOrder(
  orderIdOrObj: string | { orderId: string; token: string },
  tokenOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<CreateRazorpayOrderData>> {
  let orderId: string;
  let token: string;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrOpts as string;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    signal = (tokenOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<CreateRazorpayOrderData>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payment/razorpay`,
    {
      method: "POST",
      tableToken: token,
      signal,
    }
  );
}

/**
 * Verifies Razorpay HMAC-SHA256 signature and marks order as paid.
 */
export async function verifyRazorpayPayment(
  orderIdOrObj:
    | string
    | {
        orderId: string;
        token: string;
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      },
  tokenOrDetails?:
    | string
    | {
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      },
  detailsOrOpts?:
    | {
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      }
    | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<VerifyPaymentData>> {
  let orderId: string;
  let token: string;
  let body: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  };
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrDetails as string;
    body = detailsOrOpts as {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    };
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    body = {
      razorpayOrderId: orderIdOrObj.razorpayOrderId,
      razorpayPaymentId: orderIdOrObj.razorpayPaymentId,
      razorpaySignature: orderIdOrObj.razorpaySignature,
    };
    signal = (tokenOrDetails as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<VerifyPaymentData>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payment/verify`,
    {
      method: "POST",
      body,
      tableToken: token,
      signal,
    }
  );
}

/**
 * Switches an unpaid order to Pay at counter.
 */
export async function payAtCounter(
  orderIdOrObj: string | { orderId: string; token: string },
  tokenOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<{ success: true }>> {
  let orderId: string;
  let token: string;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrOpts as string;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    signal = (tokenOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<{ success: true }>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payment/counter`,
    {
      method: "POST",
      tableToken: token,
      signal,
    }
  );
}

/**
 * Creates dynamic UPI QR Code payment for an order.
 */
export async function createUpiQrPayment(
  orderIdOrObj: string | { orderId: string; token: string },
  tokenOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<CreateUpiQrData>> {
  let orderId: string;
  let token: string;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrOpts as string;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    signal = (tokenOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<CreateUpiQrData>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payment/upi-qr`,
    {
      method: "POST",
      tableToken: token,
      signal,
    }
  );
}

/**
 * Checks payment status server-side for an order.
 */
export async function getPaymentStatus(
  orderIdOrObj: string | { orderId: string; token: string },
  tokenOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<PaymentStatusData>> {
  let orderId: string;
  let token: string;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrOpts as string;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    signal = (tokenOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<PaymentStatusData>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payment/status`,
    {
      method: "GET",
      tableToken: token,
      signal,
    }
  );
}

/**
 * Simulates test UPI payment approval (allowed in Razorpay Test Mode only).
 */
export async function verifyTestUpiPayment(
  orderIdOrObj: string | { orderId: string; token: string },
  tokenOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<{ success: true; paymentStatus: "paid" }>> {
  let orderId: string;
  let token: string;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrOpts as string;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    signal = (tokenOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<{ success: true; paymentStatus: "paid" }>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/payment/test-verify`,
    {
      method: "POST",
      tableToken: token,
      signal,
    }
  );
}

/**
 * Fetches the digital receipt for a completed/paid order.
 */
export async function getReceipt(
  orderIdOrObj: string | { orderId: string; token: string },
  tokenOrOpts?: string | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<ReceiptData>> {
  let orderId: string;
  let token: string;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrObj === "string") {
    orderId = orderIdOrObj;
    token = tokenOrOpts as string;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrObj.orderId;
    token = orderIdOrObj.token;
    signal = (tokenOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<ReceiptData>(
    `/api/v1/customer/orders/${encodeURIComponent(orderId)}/receipt`,
    {
      method: "GET",
      tableToken: token,
      signal,
    }
  );
}

/**
 * Constructs direct PDF download URL for guest receipt
 */
export function getReceiptPdfUrl(
  orderId: string,
  token: string,
  format: "a4" | "thermal" = "a4"
): string {
  return `/api/v1/customer/orders/${encodeURIComponent(orderId)}/receipt/pdf?token=${encodeURIComponent(token)}&format=${format}`;
}

export const customerApi = {
  getMenu,
  placeOrder,
  getOrder,
  getReceipt,
  getReceiptPdfUrl,
  createRazorpayOrder,
  verifyRazorpayPayment,
  createUpiQrPayment,
  getPaymentStatus,
  verifyTestUpiPayment,
  payAtCounter,
  switchOrderToCounter: payAtCounter,
};

