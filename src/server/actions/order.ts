"use server";

import { eq, inArray, and, sql, gte } from "drizzle-orm";
import { db } from "@/server/db";
import { checkRateLimit } from "@/server/rate-limit";
import {
  orders,
  orderItems,
  orderEvents,
  payments,
  menuItems,
  modifiers,
  tables,
  orderCounters,
  type OrderStatus,
} from "@/server/db/schema";
import {
  placeOrderInputSchema,
  createRazorpayOrderSchema,
  verifyPaymentSchema,
  switchPaymentMethodSchema,
  orderStatusParamSchema,
  confirmSimulatedPaymentSchema,
  type PlaceOrderInput,
  type CreateRazorpayOrderInput,
  type VerifyPaymentInput,
  type SwitchPaymentMethodInput,
  type ConfirmSimulatedPaymentInput,
} from "@/lib/validations/order";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import { getGuestTableAndMenu } from "@/server/queries/guest";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  isRazorpayConfigured,
} from "@/server/razorpay";
import { env } from "@/server/env";

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  paymentStatus?: "pending" | "paid" | "counter" | "failed";
  paymentMethod?: "pay_now" | "counter";
  error?: string;
}

export interface OrderItemDetail {
  id: string;
  itemName: string;
  itemPricePaise: number;
  quantity: number;
  selectedModifiers: Array<{ id: string; name: string; pricePaise: number }>;
  totalPaise: number;
  notes: string | null;
}

export interface OrderEventDetail {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
}

export interface OrderDetails {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: "pending" | "paid" | "counter" | "failed";
  paymentMethod: "pay_now" | "counter" | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  tableNumber: string;
  restaurantName: string;
  notes: string | null;
  createdAt: string;
  items: OrderItemDetail[];
  events: OrderEventDetail[];
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
 * Server Action: Places an order with server-computed prices and 5% GST
 * Supports "Pay now (UPI/Card)" and "Pay at counter".
 * Rule: Orders are only sent to the kitchen once paid, or immediately for pay-at-counter.
 */
export async function placeOrderAction(
  rawInput: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const validation = placeOrderInputSchema.safeParse(rawInput);
  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message ?? "Invalid order placement payload";
    return { success: false, error: errorMsg };
  }

  const {
    token,
    items: inputItems,
    paymentMethod = "pay_now",
    notes,
    customerName,
    customerPhone,
  } = validation.data;

  // Max 30 total items per order
  const totalItemCount = inputItems.reduce((acc, item) => acc + item.quantity, 0);
  if (totalItemCount > 30) {
    return {
      success: false,
      error: "Order cannot contain more than 30 total items. Please reduce quantities.",
    };
  }

  // Validate customer phone with Indian format
  if (customerPhone && customerPhone.trim().length > 0) {
    const cleanedPhone = customerPhone.replace(/[\s-]/g, "");
    if (!/^(?:(?:\+?91|0)?[6-9]\d{9})$/.test(cleanedPhone)) {
      return {
        success: false,
        error:
          "Please enter a valid 10-digit Indian phone number (e.g., 9876543210 or +91 98765 43210)",
      };
    }
  }

  // 1. Resolve table and restaurant on server
  const guestData = await getGuestTableAndMenu(token);
  if (!guestData.success) {
    return { success: false, error: "Dining table could not be resolved from token" };
  }

  const { restaurant, table } = guestData.data;
  const initialPaymentStatus = paymentMethod === "counter" ? "counter" : "pending";

  // 2. Process order with PostgreSQL + Drizzle in a transaction
  try {
    // Rate limit: per table token
    const rateLimit = await checkRateLimit({
      key: `place_order:${token}`,
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Too many order requests. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
      };
    }

    const dbTable = await db.query.tables.findFirst({
      where: and(eq(tables.qrToken, token), eq(tables.isActive, true)),
    });

    if (!dbTable) {
      return { success: false, error: "Dining table not found or inactive" };
    }

    // Spam limit 1: max 3 unpaid "pay_now" orders per table in the last 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recentUnpaidOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.tableId, dbTable.id),
        eq(orders.paymentMethod, "pay_now"),
        eq(orders.paymentStatus, "pending"),
        sql`${orders.status} != 'cancelled'`,
        gte(orders.createdAt, thirtyMinutesAgo)
      ),
      columns: { id: true },
    });

    if (recentUnpaidOrders.length >= 3) {
      return {
        success: false,
        error:
          "You have 3 unpaid orders awaiting payment. Please complete or cancel pending payments before placing another order.",
      };
    }

    // Spam limit 2: max 5 orders per table per 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentOrdersLast10Min = await db.query.orders.findMany({
      where: and(
        eq(orders.tableId, dbTable.id),
        gte(orders.createdAt, tenMinutesAgo)
      ),
      columns: { id: true },
    });

    if (recentOrdersLast10Min.length >= 5) {
      return {
        success: false,
        error:
          "Order limit reached for this table (maximum 5 orders per 10 minutes). Please wait a few minutes before placing another order.",
      };
    }

    const menuItemIds = inputItems.map((i) => i.menuItemId);
    const dbMenuItems = await db.query.menuItems.findMany({
      where: and(inArray(menuItems.id, menuItemIds), eq(menuItems.isActive, true)),
    });

    const dbMenuMap = new Map(dbMenuItems.map((m) => [m.id, m]));

    // Verify availability
    for (const inputItem of inputItems) {
      const dbItem = dbMenuMap.get(inputItem.menuItemId);
      if (!dbItem) {
        return { success: false, error: `Menu item not found: ${inputItem.menuItemId}` };
      }
      if (!dbItem.isAvailable) {
        return { success: false, error: `${dbItem.name} is currently sold out` };
      }
    }

    // Re-fetch all modifier prices
    const allSelectedModIds = inputItems.flatMap((i) => i.selectedModifierIds);
    const dbModifiers =
      allSelectedModIds.length > 0
        ? await db.query.modifiers.findMany({
            where: inArray(modifiers.id, allSelectedModIds),
          })
        : [];
    const dbModMap = new Map(dbModifiers.map((m) => [m.id, m]));

    // Compute pricing strictly on the server in integer paise
    let calculatedSubtotalPaise = 0;
    const verifiedItems: Array<{
      menuItemId: string;
      itemName: string;
      itemPricePaise: number;
      quantity: number;
      selectedModifiers: Array<{ id: string; name: string; pricePaise: number }>;
      totalPaise: number;
    }> = [];

    for (const inputItem of inputItems) {
      const dbItem = dbMenuMap.get(inputItem.menuItemId)!;
      let unitPricePaise = dbItem.pricePaise;
      const verifiedMods: Array<{ id: string; name: string; pricePaise: number }> = [];

      for (const modId of inputItem.selectedModifierIds) {
        const dbMod = dbModMap.get(modId);
        if (dbMod) {
          unitPricePaise += dbMod.pricePaise;
          verifiedMods.push({
            id: dbMod.id,
            name: dbMod.name,
            pricePaise: dbMod.pricePaise,
          });
        }
      }

      const lineTotalPaise = unitPricePaise * inputItem.quantity;
      calculatedSubtotalPaise += lineTotalPaise;

      verifiedItems.push({
        menuItemId: dbItem.id,
        itemName: dbItem.name,
        itemPricePaise: dbItem.pricePaise,
        quantity: inputItem.quantity,
        selectedModifiers: verifiedMods,
        totalPaise: lineTotalPaise,
      });
    }

    // Compute 5% GST in integer paise
    const calculatedTaxPaise = Math.round(calculatedSubtotalPaise * 0.05);
    const calculatedTotalPaise = calculatedSubtotalPaise + calculatedTaxPaise;

    // Insert order, items, and event in a single atomic transaction
    const insertedOrder = await db.transaction(async (tx) => {
      // Per-restaurant sequential collision-safe order number (format ML-0001)
      const [counterRow] = await tx
        .insert(orderCounters)
        .values({
          restaurantId: restaurant.id,
          lastOrderNumber: 1,
        })
        .onConflictDoUpdate({
          target: orderCounters.restaurantId,
          set: {
            lastOrderNumber: sql`${orderCounters.lastOrderNumber} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ lastOrderNumber: orderCounters.lastOrderNumber });

      const seqNumber = counterRow.lastOrderNumber;
      const generatedOrderNumber = `ML-${String(seqNumber).padStart(4, "0")}`;

      const [order] = await tx
        .insert(orders)
        .values({
          restaurantId: restaurant.id,
          tableId: table.id,
          orderNumber: generatedOrderNumber,
          status: "placed",
          paymentStatus: initialPaymentStatus,
          paymentMethod,
          subtotalPaise: calculatedSubtotalPaise,
          taxPaise: calculatedTaxPaise,
          totalPaise: calculatedTotalPaise,
          customerName: customerName ?? null,
          customerPhone: customerPhone ?? null,
          specialInstructions: notes ?? null,
        })
        .returning();

      for (const item of verifiedItems) {
        await tx.insert(orderItems).values({
          orderId: order.id,
          menuItemId: item.menuItemId,
          itemName: item.itemName,
          itemPricePaise: item.itemPricePaise,
          quantity: item.quantity,
          selectedModifiersJson: JSON.stringify(item.selectedModifiers),
          totalPaise: item.totalPaise,
        });
      }

      await tx.insert(orderEvents).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: "placed",
        note:
          paymentMethod === "counter"
            ? "Order placed (Pay at counter)"
            : "Order placed (Payment pending)",
      });

      return order;
    });

    // RULE: Orders are only sent to the kitchen once paid, or immediately for pay-at-counter.
    if (paymentMethod === "counter") {
      await publishRealtimeEvent(
        getRestaurantChannel(restaurant.id),
        "order.created",
        {
          orderId: insertedOrder.id,
          status: "placed",
          paymentStatus: "counter",
        }
      );
    }

    await publishRealtimeEvent(`order:${insertedOrder.id}`, "order.created", {
      orderId: insertedOrder.id,
      status: "placed",
      paymentStatus: initialPaymentStatus,
    });

    return {
      success: true,
      orderId: insertedOrder.id,
      orderNumber: insertedOrder.orderNumber,
      paymentStatus: initialPaymentStatus,
      paymentMethod,
    };
  } catch (error) {
    console.error("Database transaction failed in placeOrderAction:", error);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Server Action: Creates Razorpay order from verified server-side total
 */
export async function createRazorpayOrderAction(
  rawInput: CreateRazorpayOrderInput
): Promise<CreateRazorpayOrderResult> {
  const validation = createRazorpayOrderSchema.safeParse(rawInput);
  if (!validation.success) {
    return { success: false, error: "Invalid order parameters" };
  }

  const { orderId, token } = validation.data;

  try {
    // Rate limit: per table token
    const rateLimit = await checkRateLimit({
      key: `razorpay_order:${token}`,
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Too many payment requests. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
      };
    }

    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return { success: false, error: "Order not found" };
    }

    if (dbOrder.table.qrToken !== token) {
      return { success: false, error: "Unauthorized access to order" };
    }

    if (dbOrder.paymentStatus === "paid") {
      return { success: false, error: "Order is already paid" };
    }

    const isSimulated =
      env.DEMO_MODE === "true" &&
      (!isRazorpayConfigured() ||
        env.RAZORPAY_KEY_ID?.includes("placeholder") ||
        env.RAZORPAY_KEY_SECRET?.includes("placeholder"));

    // Check for existing pending payment for this order to reuse
    const existingPayment = await db.query.payments.findFirst({
      where: and(
        eq(payments.orderId, dbOrder.id),
        eq(payments.status, "pending")
      ),
    });

    if (isSimulated) {
      if (!existingPayment || existingPayment.provider !== "simulated") {
        await db.insert(payments).values({
          orderId: dbOrder.id,
          restaurantId: dbOrder.restaurantId,
          amountPaise: dbOrder.totalPaise,
          status: "pending",
          provider: "simulated",
        });
      }

      return {
        success: true,
        simulated: true,
        amountPaise: dbOrder.totalPaise,
        currency: "INR",
        orderNumber: dbOrder.orderNumber,
        tableNumber: dbOrder.table.tableNumber,
      };
    }

    if (!isRazorpayConfigured()) {
      return { success: false, error: "Payment gateway is not configured" };
    }

    // Reuse existing pending payment if it already has a razorpayOrderId and matching amount
    if (
      existingPayment &&
      existingPayment.provider === "razorpay" &&
      existingPayment.razorpayOrderId &&
      existingPayment.amountPaise === dbOrder.totalPaise
    ) {
      return {
        success: true,
        razorpayOrderId: existingPayment.razorpayOrderId,
        amountPaise: dbOrder.totalPaise,
        currency: "INR",
        keyId: env.RAZORPAY_KEY_ID,
        orderNumber: dbOrder.orderNumber,
        tableNumber: dbOrder.table.tableNumber,
      };
    }

    const rzpOrder = await createRazorpayOrder(
      dbOrder.totalPaise,
      dbOrder.orderNumber,
      {
        orderId: dbOrder.id,
        tableNumber: dbOrder.table.tableNumber,
      }
    );

    // Record pending payment
    await db.insert(payments).values({
      orderId: dbOrder.id,
      restaurantId: dbOrder.restaurantId,
      amountPaise: dbOrder.totalPaise,
      status: "pending",
      provider: "razorpay",
      razorpayOrderId: rzpOrder.id,
    });

    return {
      success: true,
      razorpayOrderId: rzpOrder.id,
      amountPaise: dbOrder.totalPaise,
      currency: "INR",
      keyId: rzpOrder.keyId,
      orderNumber: dbOrder.orderNumber,
      tableNumber: dbOrder.table.tableNumber,
    };
  } catch (err) {
    console.error("Database error in createRazorpayOrderAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Server Action: Confirms a simulated payment when in DEMO_MODE.
 * Works ONLY when DEMO_MODE === "true" and order has a pending payment with provider "simulated".
 */
export async function confirmSimulatedPaymentAction(
  rawInput: ConfirmSimulatedPaymentInput
): Promise<VerifyPaymentResult> {
  if (env.DEMO_MODE !== "true") {
    return {
      success: false,
      error: "Simulated payments are only allowed in demo mode",
    };
  }

  const validation = confirmSimulatedPaymentSchema.safeParse(rawInput);
  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message ?? "Invalid simulated payment payload";
    return { success: false, error: errorMsg };
  }

  const { orderId, token } = validation.data;

  try {
    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return { success: false, error: "Order not found" };
    }

    if (dbOrder.table.qrToken !== token) {
      return { success: false, error: "Unauthorized access" };
    }

    if (dbOrder.paymentStatus === "paid") {
      return { success: true, paymentStatus: "paid" };
    }

    const pendingPayment = await db.query.payments.findFirst({
      where: and(
        eq(payments.orderId, orderId),
        eq(payments.status, "pending"),
        eq(payments.provider, "simulated")
      ),
    });

    if (!pendingPayment) {
      return {
        success: false,
        error: "No pending simulated payment found for this order",
      };
    }

    if (pendingPayment.amountPaise !== dbOrder.totalPaise) {
      return { success: false, error: "Payment amount mismatch" };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await tx
        .update(payments)
        .set({
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, pendingPayment.id));

      await tx.insert(orderEvents).values({
        orderId,
        fromStatus: dbOrder.status,
        toStatus: dbOrder.status,
        note: "Payment confirmed (Demo Simulated Payment)",
      });
    });

    // RULE: Orders are only sent to the kitchen once paid!
    await publishRealtimeEvent(
      getRestaurantChannel(dbOrder.restaurantId),
      "order.created",
      {
        orderId: dbOrder.id,
        status: dbOrder.status,
        paymentStatus: "paid",
      }
    );

    await publishRealtimeEvent(`order:${dbOrder.id}`, "order.paid", {
      orderId: dbOrder.id,
      paymentStatus: "paid",
    });

    return { success: true, paymentStatus: "paid" };
  } catch (err) {
    console.error("Database error in confirmSimulatedPaymentAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Server Action: Verifies Razorpay signature server-side.
 * Never trust a client-reported payment success!
 */
export async function verifyRazorpayPaymentAction(
  rawInput: VerifyPaymentInput
): Promise<VerifyPaymentResult> {
  const validation = verifyPaymentSchema.safeParse(rawInput);
  if (!validation.success) {
    return { success: false, error: "Invalid payment verification payload" };
  }

  const { orderId, token, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
    validation.data;

  // Cryptographically verify signature server-side
  const isValid = verifyRazorpaySignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );

  if (!isValid) {
    console.error(
      `[Security Alert] Invalid payment signature attempt for order ${orderId}`
    );
    return { success: false, error: "Invalid payment signature verification failed" };
  }

  try {
    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return { success: false, error: "Order not found" };
    }

    if (dbOrder.table.qrToken !== token) {
      return { success: false, error: "Unauthorized access" };
    }

    // 1. Load the payments row WHERE order_id = orderId AND razorpay_order_id = razorpayOrderId
    const payment = await db.query.payments.findFirst({
      where: and(
        eq(payments.orderId, orderId),
        eq(payments.razorpayOrderId, razorpayOrderId)
      ),
    });

    if (!payment) {
      return { success: false, error: "Payment record not found for this order" };
    }

    // 2. Idempotency: skip if already completed
    if (payment.status === "completed" && dbOrder.paymentStatus === "paid") {
      return { success: true, paymentStatus: "paid" };
    }

    // 3. Require that payments.amount_paise equals orders.total_paise
    if (payment.amountPaise !== dbOrder.totalPaise) {
      return { success: false, error: "Payment amount mismatch" };
    }

    // 4. Update only that payment row and use a transaction
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await tx
        .update(payments)
        .set({
          status: "completed",
          razorpayPaymentId,
          razorpaySignature,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      await tx.insert(orderEvents).values({
        orderId,
        fromStatus: dbOrder.status,
        toStatus: dbOrder.status,
        note: `Payment verified via Razorpay (${razorpayPaymentId})`,
      });
    });

    // RULE: Orders are only sent to the kitchen once paid!
    await publishRealtimeEvent(
      getRestaurantChannel(dbOrder.restaurantId),
      "order.created",
      {
        orderId: dbOrder.id,
        status: dbOrder.status,
        paymentStatus: "paid",
      }
    );

    await publishRealtimeEvent(`order:${dbOrder.id}`, "order.paid", {
      orderId: dbOrder.id,
      status: dbOrder.status,
      paymentStatus: "paid",
    });

    return { success: true, paymentStatus: "paid" };
  } catch (err) {
    console.error("Database error in verifyRazorpayPaymentAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Server Action: Switch unpaid order to Pay at counter
 */
export async function switchOrderToCounterAction(
  rawInput: SwitchPaymentMethodInput
): Promise<{ success: boolean; error?: string }> {
  const validation = switchPaymentMethodSchema.safeParse(rawInput);
  if (!validation.success) {
    return { success: false, error: "Invalid parameters" };
  }

  const { orderId, token, targetMethod } = validation.data;

  try {
    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return { success: false, error: "Order not found" };
    }

    if (dbOrder.table.qrToken !== token) {
      return { success: false, error: "Unauthorized access" };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          paymentStatus: targetMethod === "counter" ? "counter" : "pending",
          paymentMethod: targetMethod,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderEvents).values({
        orderId,
        fromStatus: dbOrder.status,
        toStatus: dbOrder.status,
        note:
          targetMethod === "counter"
            ? "Payment method switched to Pay at counter"
            : "Payment method switched to Pay now",
      });
    });

    if (targetMethod === "counter") {
      await publishRealtimeEvent(
        getRestaurantChannel(dbOrder.restaurantId),
        "order.created",
        {
          orderId: dbOrder.id,
          status: dbOrder.status,
          paymentStatus: "counter",
        }
      );
    }

    await publishRealtimeEvent(`order:${dbOrder.id}`, "order.updated", {
      orderId: dbOrder.id,
      status: dbOrder.status,
      paymentStatus: targetMethod === "counter" ? "counter" : "pending",
    });

    return { success: true };
  } catch (err) {
    console.error("Database error in switchOrderToCounterAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Server Action: Fetches order details with payment status
 */
export async function getOrderDetailsAction(
  orderId: string,
  token: string
): Promise<GetOrderDetailsResult> {
  const validation = orderStatusParamSchema.safeParse({ orderId, token });
  if (!validation.success) {
    return { success: false, error: "Invalid parameters" };
  }

  try {
    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        table: true,
        restaurant: true,
        items: true,
        events: true,
      },
    });

    if (!dbOrder) {
      return { success: false, error: "Order not found" };
    }

    if (dbOrder.table.qrToken !== token) {
      return { success: false, error: "Unauthorized access to this order" };
    }

    const formattedItems: OrderItemDetail[] = dbOrder.items.map((item) => {
      let parsedMods: Array<{ id: string; name: string; pricePaise: number }> = [];
      if (item.selectedModifiersJson) {
        try {
          parsedMods = JSON.parse(item.selectedModifiersJson);
        } catch {
          parsedMods = [];
        }
      }
      return {
        id: item.id,
        itemName: item.itemName,
        itemPricePaise: item.itemPricePaise,
        quantity: item.quantity,
        selectedModifiers: parsedMods,
        totalPaise: item.totalPaise,
        notes: item.notes,
      };
    });

    const formattedEvents: OrderEventDetail[] = dbOrder.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      success: true,
      order: {
        id: dbOrder.id,
        orderNumber: dbOrder.orderNumber,
        status: dbOrder.status,
        paymentStatus: (dbOrder.paymentStatus as OrderDetails["paymentStatus"]) || "pending",
        paymentMethod: (dbOrder.paymentMethod as OrderDetails["paymentMethod"]) || null,
        subtotalPaise: dbOrder.subtotalPaise,
        taxPaise: dbOrder.taxPaise,
        totalPaise: dbOrder.totalPaise,
        tableNumber: dbOrder.table.tableNumber,
        restaurantName: dbOrder.restaurant.name,
        notes: dbOrder.specialInstructions,
        createdAt: dbOrder.createdAt.toISOString(),
        items: formattedItems,
        events: formattedEvents,
      },
    };
  } catch (err) {
    console.error("Database error in getOrderDetailsAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}
