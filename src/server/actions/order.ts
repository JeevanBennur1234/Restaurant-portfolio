"use server";

import { db } from "@/server/db";
import {
  placeOrder,
  getOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  confirmSimulatedPayment,
  switchOrderToCounter,
  type OrderDetails,
  type OrderItemDetail,
  type OrderEventDetail,
} from "@/server/services/customer";
import {
  type PlaceOrderInput,
  type CreateRazorpayOrderInput,
  type VerifyPaymentInput,
  type SwitchPaymentMethodInput,
  type ConfirmSimulatedPaymentInput,
} from "@/lib/validations/order";

export type {
  OrderItemDetail,
  OrderEventDetail,
  OrderDetails,
};

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  paymentStatus?: "pending" | "paid" | "counter" | "failed";
  paymentMethod?: "pay_now" | "counter";
  error?: string;
}

export interface GetOrderDetailsResult {
  success: boolean;
  order?: OrderDetails;
  error?: string;
}

export interface CreateRazorpayOrderResult {
  success: boolean;
  simulated?: boolean;
  razorpayOrderId?: string;
  amountPaise?: number;
  currency?: string;
  keyId?: string;
  orderNumber?: string;
  tableNumber?: string;
  error?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  paymentStatus?: "paid" | "failed";
  error?: string;
}

/**
 * Server Action: Places an order via customer service
 */
export async function placeOrderAction(
  rawInput: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const result = await placeOrder({ db }, rawInput);
  if (result.ok) {
    return {
      success: true,
      orderId: result.data.orderId,
      orderNumber: result.data.orderNumber,
      paymentStatus: result.data.paymentStatus,
      paymentMethod: result.data.paymentMethod,
    };
  }
  return {
    success: false,
    error: result.message,
  };
}

/**
 * Server Action: Creates Razorpay order via customer service
 */
export async function createRazorpayOrderAction(
  rawInput: CreateRazorpayOrderInput
): Promise<CreateRazorpayOrderResult> {
  const result = await createRazorpayOrder({ db }, rawInput);
  if (result.ok) {
    return {
      success: true,
      ...result.data,
    };
  }
  return {
    success: false,
    error: result.message,
  };
}

/**
 * Server Action: Confirms a simulated payment when in DEMO_MODE via customer service
 */
export async function confirmSimulatedPaymentAction(
  rawInput: ConfirmSimulatedPaymentInput
): Promise<VerifyPaymentResult> {
  const result = await confirmSimulatedPayment({ db }, rawInput);
  if (result.ok) {
    return {
      success: true,
      paymentStatus: result.data.paymentStatus,
    };
  }
  return {
    success: false,
    error: result.message,
  };
}

/**
 * Server Action: Verifies Razorpay signature server-side via customer service
 */
export async function verifyRazorpayPaymentAction(
  rawInput: VerifyPaymentInput
): Promise<VerifyPaymentResult> {
  const result = await verifyRazorpayPayment({ db }, rawInput);
  if (result.ok) {
    return {
      success: true,
      paymentStatus: result.data.paymentStatus,
    };
  }
  return {
    success: false,
    error: result.message,
  };
}

/**
 * Server Action: Switch unpaid order to Pay at counter via customer service
 */
export async function switchOrderToCounterAction(
  rawInput: SwitchPaymentMethodInput
): Promise<{ success: boolean; error?: string }> {
  const result = await switchOrderToCounter({ db }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return {
    success: false,
    error: result.message,
  };
}

/**
 * Server Action: Fetches order details with payment status via customer service
 */
export async function getOrderDetailsAction(
  orderId: string,
  token: string
): Promise<GetOrderDetailsResult> {
  const result = await getOrder({ db }, { orderId, token });
  if (result.ok) {
    return {
      success: true,
      order: result.data,
    };
  }
  return {
    success: false,
    error: result.message,
  };
}
