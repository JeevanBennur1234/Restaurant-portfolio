"use server";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  orders,
  orderItems,
  orderEvents,
  payments,
  menuItems,
  modifiers,
  tables,
  type OrderStatus,
} from "@/server/db/schema";
import {
  placeOrderInputSchema,
  createRazorpayOrderSchema,
  verifyPaymentSchema,
  switchPaymentMethodSchema,
  orderStatusParamSchema,
  type PlaceOrderInput,
  type CreateRazorpayOrderInput,
  type VerifyPaymentInput,
  type SwitchPaymentMethodInput,
} from "@/lib/validations/order";
import { publishRealtimeEvent } from "@/server/realtime";
import { getGuestTableAndMenu } from "@/server/queries/guest";
import {
  demoOrdersStore,
  demoPaymentsStore,
  type DemoOrder,
  type DemoOrderItem,
  type DemoPayment,
} from "@/server/demo-orders";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from "@/server/razorpay";

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

  // 1. Resolve table and restaurant on server
  const guestData = await getGuestTableAndMenu(token);
  if (!guestData.success) {
    return { success: false, error: "Dining table could not be resolved from token" };
  }

  const { restaurant, table } = guestData.data;
  const initialPaymentStatus = paymentMethod === "counter" ? "counter" : "pending";

  // 2. Try processing order with PostgreSQL + Drizzle in a transaction
  try {
    const dbTable = await db.query.tables.findFirst({
      where: eq(tables.qrToken, token),
    });

    if (dbTable) {
      const menuItemIds = inputItems.map((i) => i.menuItemId);
      const dbMenuItems = await db.query.menuItems.findMany({
        where: inArray(menuItems.id, menuItemIds),
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

      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const generatedOrderNumber = `ML-${randomDigits}`;

      // Insert order, items, and event in a single atomic transaction
      const insertedOrder = await db.transaction(async (tx) => {
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
          `restaurant:${restaurant.id}`,
          "order.created",
          {
            orderId: insertedOrder.id,
            orderNumber: insertedOrder.orderNumber,
            tableNumber: table.tableNumber,
            totalPaise: calculatedTotalPaise,
            status: "placed",
            paymentStatus: "counter",
            createdAt: insertedOrder.createdAt.toISOString(),
          }
        );
      }

      await publishRealtimeEvent(`order:${insertedOrder.id}`, "order.created", {
        orderId: insertedOrder.id,
        orderNumber: insertedOrder.orderNumber,
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
    }
  } catch (error) {
    console.warn("DB transaction skipped, falling back to demo store:", (error as Error).message);
  }

  // 3. Demo Environment fallback
  const demoItemsMap = new Map(guestData.data.items.map((i) => [i.id, i]));
  let subtotalPaise = 0;
  const demoVerifiedItems: DemoOrderItem[] = [];

  for (const inputItem of inputItems) {
    const itemData = demoItemsMap.get(inputItem.menuItemId);
    if (!itemData) {
      return { success: false, error: `Item not found: ${inputItem.menuItemId}` };
    }
    if (!itemData.isAvailable) {
      return { success: false, error: `${itemData.name} is currently sold out` };
    }

    let itemUnitPaise = itemData.pricePaise;
    const verifiedMods: Array<{ id: string; name: string; pricePaise: number }> = [];

    const modMap = new Map(itemData.modifiers.map((m) => [m.id, m]));
    for (const modId of inputItem.selectedModifierIds) {
      const mod = modMap.get(modId);
      if (mod) {
        itemUnitPaise += mod.pricePaise;
        verifiedMods.push({ id: mod.id, name: mod.name, pricePaise: mod.pricePaise });
      }
    }

    const itemTotalPaise = itemUnitPaise * inputItem.quantity;
    subtotalPaise += itemTotalPaise;

    demoVerifiedItems.push({
      id: `item-${Math.random().toString(36).slice(2, 9)}`,
      menuItemId: itemData.id,
      itemName: itemData.name,
      itemPricePaise: itemData.pricePaise,
      quantity: inputItem.quantity,
      selectedModifiers: verifiedMods,
      totalPaise: itemTotalPaise,
      notes: null,
    });
  }

  const taxPaise = Math.round(subtotalPaise * 0.05);
  const totalPaise = subtotalPaise + taxPaise;
  const orderId = `ord-${Date.now().toString(36)}`;
  const orderNumber = `ML-${Math.floor(1000 + Math.random() * 9000)}`;

  const newDemoOrder: DemoOrder = {
    id: orderId,
    restaurantId: restaurant.id,
    tableId: table.id,
    tableNumber: table.tableNumber,
    orderNumber,
    status: "placed",
    paymentStatus: initialPaymentStatus,
    paymentMethod,
    subtotalPaise,
    taxPaise,
    totalPaise,
    customerName: customerName ?? null,
    customerPhone: customerPhone ?? null,
    specialInstructions: notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: demoVerifiedItems,
    events: [
      {
        id: `evt-${Date.now()}`,
        fromStatus: null,
        toStatus: "placed",
        note:
          paymentMethod === "counter"
            ? "Order placed (Pay at counter)"
            : "Order placed (Payment pending)",
        createdAt: new Date(),
      },
    ],
  };

  demoOrdersStore.set(orderId, newDemoOrder);

  // RULE: Orders are only sent to the kitchen once paid, or immediately for pay-at-counter.
  if (paymentMethod === "counter") {
    await publishRealtimeEvent(`restaurant:${restaurant.id}`, "order.created", {
      orderId,
      orderNumber,
      tableNumber: table.tableNumber,
      totalPaise,
      status: "placed",
      paymentStatus: "counter",
      createdAt: newDemoOrder.createdAt.toISOString(),
    });
  }

  await publishRealtimeEvent(`order:${orderId}`, "order.created", {
    orderId,
    orderNumber,
    status: "placed",
    paymentStatus: initialPaymentStatus,
  });

  return {
    success: true,
    orderId,
    orderNumber,
    paymentStatus: initialPaymentStatus,
    paymentMethod,
  };
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

  // 1. Try DB lookup
  try {
    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (dbOrder) {
      if (dbOrder.table.qrToken !== token) {
        return { success: false, error: "Unauthorized access to order" };
      }

      if (dbOrder.paymentStatus === "paid") {
        return { success: false, error: "Order is already paid" };
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
    }
  } catch (err) {
    console.warn("DB payment order creation fallback:", (err as Error).message);
  }

  // 2. Demo fallback
  const demoOrder = demoOrdersStore.get(orderId);
  if (!demoOrder) {
    return { success: false, error: "Order not found" };
  }

  if (demoOrder.paymentStatus === "paid") {
    return { success: false, error: "Order is already paid" };
  }

  const rzpOrder = await createRazorpayOrder(
    demoOrder.totalPaise,
    demoOrder.orderNumber,
    {
      orderId: demoOrder.id,
      tableNumber: demoOrder.tableNumber,
    }
  );

  const demoPayment: DemoPayment = {
    id: `pay-${Date.now().toString(36)}`,
    orderId: demoOrder.id,
    restaurantId: demoOrder.restaurantId,
    amountPaise: demoOrder.totalPaise,
    status: "pending",
    provider: "razorpay",
    razorpayOrderId: rzpOrder.id,
    razorpayPaymentId: null,
    razorpaySignature: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  demoPaymentsStore.set(rzpOrder.id, demoPayment);

  return {
    success: true,
    razorpayOrderId: rzpOrder.id,
    amountPaise: demoOrder.totalPaise,
    currency: "INR",
    keyId: rzpOrder.keyId,
    orderNumber: demoOrder.orderNumber,
    tableNumber: demoOrder.tableNumber,
  };
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

  // 1. Try DB update
  try {
    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (dbOrder) {
      if (dbOrder.table.qrToken !== token) {
        return { success: false, error: "Unauthorized access" };
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
            razorpayPaymentId,
            razorpaySignature,
            updatedAt: new Date(),
          })
          .where(eq(payments.razorpayOrderId, razorpayOrderId));

        await tx.insert(orderEvents).values({
          orderId,
          fromStatus: dbOrder.status,
          toStatus: dbOrder.status,
          note: `Payment verified via Razorpay (${razorpayPaymentId})`,
        });
      });

      // RULE: Orders are only sent to the kitchen once paid!
      await publishRealtimeEvent(
        `restaurant:${dbOrder.restaurantId}`,
        "order.created",
        {
          orderId: dbOrder.id,
          orderNumber: dbOrder.orderNumber,
          tableNumber: dbOrder.table.tableNumber,
          totalPaise: dbOrder.totalPaise,
          status: dbOrder.status,
          paymentStatus: "paid",
          createdAt: dbOrder.createdAt.toISOString(),
        }
      );

      await publishRealtimeEvent(`order:${dbOrder.id}`, "order.paid", {
        orderId: dbOrder.id,
        paymentStatus: "paid",
        razorpayPaymentId,
      });

      return { success: true, paymentStatus: "paid" };
    }
  } catch (err) {
    console.warn("DB payment verification fallback:", (err as Error).message);
  }

  // 2. Demo fallback
  const demoOrder = demoOrdersStore.get(orderId);
  if (!demoOrder) {
    return { success: false, error: "Order not found" };
  }

  demoOrder.paymentStatus = "paid";
  demoOrder.paymentMethod = "pay_now";
  demoOrder.updatedAt = new Date();
  demoOrder.events.push({
    id: `evt-${Date.now()}`,
    fromStatus: demoOrder.status,
    toStatus: demoOrder.status,
    note: `Payment verified via Razorpay (${razorpayPaymentId})`,
    createdAt: new Date(),
  });

  const demoPayment = demoPaymentsStore.get(razorpayOrderId);
  if (demoPayment) {
    demoPayment.status = "completed";
    demoPayment.razorpayPaymentId = razorpayPaymentId;
    demoPayment.razorpaySignature = razorpaySignature;
    demoPayment.updatedAt = new Date();
  }

  // Publish kitchen event now that order is paid
  await publishRealtimeEvent(`restaurant:${demoOrder.restaurantId}`, "order.created", {
    orderId: demoOrder.id,
    orderNumber: demoOrder.orderNumber,
    tableNumber: demoOrder.tableNumber,
    totalPaise: demoOrder.totalPaise,
    status: demoOrder.status,
    paymentStatus: "paid",
    createdAt: demoOrder.createdAt.toISOString(),
  });

  await publishRealtimeEvent(`order:${demoOrder.id}`, "order.paid", {
    orderId: demoOrder.id,
    paymentStatus: "paid",
    razorpayPaymentId,
  });

  return { success: true, paymentStatus: "paid" };
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

    if (dbOrder) {
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
          `restaurant:${dbOrder.restaurantId}`,
          "order.created",
          {
            orderId: dbOrder.id,
            orderNumber: dbOrder.orderNumber,
            tableNumber: dbOrder.table.tableNumber,
            totalPaise: dbOrder.totalPaise,
            status: dbOrder.status,
            paymentStatus: "counter",
            createdAt: dbOrder.createdAt.toISOString(),
          }
        );
      }

      await publishRealtimeEvent(`order:${dbOrder.id}`, "order.updated", {
        orderId: dbOrder.id,
        paymentStatus: targetMethod === "counter" ? "counter" : "pending",
        paymentMethod: targetMethod,
      });

      return { success: true };
    }
  } catch {
    // fallback
  }

  const demoOrder = demoOrdersStore.get(orderId);
  if (demoOrder) {
    demoOrder.paymentStatus = targetMethod === "counter" ? "counter" : "pending";
    demoOrder.paymentMethod = targetMethod;
    demoOrder.updatedAt = new Date();
    demoOrder.events.push({
      id: `evt-${Date.now()}`,
      fromStatus: demoOrder.status,
      toStatus: demoOrder.status,
      note: `Payment method switched to ${targetMethod === "counter" ? "Pay at counter" : "Pay now"}`,
      createdAt: new Date(),
    });

    if (targetMethod === "counter") {
      await publishRealtimeEvent(
        `restaurant:${demoOrder.restaurantId}`,
        "order.created",
        {
          orderId: demoOrder.id,
          orderNumber: demoOrder.orderNumber,
          tableNumber: demoOrder.tableNumber,
          totalPaise: demoOrder.totalPaise,
          status: demoOrder.status,
          paymentStatus: "counter",
          createdAt: demoOrder.createdAt.toISOString(),
        }
      );
    }

    await publishRealtimeEvent(`order:${demoOrder.id}`, "order.updated", {
      orderId: demoOrder.id,
      paymentStatus: targetMethod === "counter" ? "counter" : "pending",
      paymentMethod: targetMethod,
    });

    return { success: true };
  }

  return { success: false, error: "Order not found" };
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

  // 1. Try PostgreSQL lookup
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

    if (dbOrder) {
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
    }
  } catch (err) {
    console.warn("DB order lookup fallback to demo store:", (err as Error).message);
  }

  // 2. Demo in-memory lookup
  const demoOrder = demoOrdersStore.get(orderId);
  if (demoOrder) {
    return {
      success: true,
      order: {
        id: demoOrder.id,
        orderNumber: demoOrder.orderNumber,
        status: demoOrder.status,
        paymentStatus: demoOrder.paymentStatus,
        paymentMethod: demoOrder.paymentMethod,
        subtotalPaise: demoOrder.subtotalPaise,
        taxPaise: demoOrder.taxPaise,
        totalPaise: demoOrder.totalPaise,
        tableNumber: demoOrder.tableNumber,
        restaurantName: "Masala Lane",
        notes: demoOrder.specialInstructions,
        createdAt: demoOrder.createdAt.toISOString(),
        items: demoOrder.items.map((item) => ({
          id: item.id,
          itemName: item.itemName,
          itemPricePaise: item.itemPricePaise,
          quantity: item.quantity,
          selectedModifiers: item.selectedModifiers,
          totalPaise: item.totalPaise,
          notes: item.notes,
        })),
        events: demoOrder.events.map((e) => ({
          id: e.id,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
        })),
      },
    };
  }

  return { success: false, error: "Order not found" };
}

/**
 * Server Action: Advance status of an order for demo preview
 */
export async function advanceOrderStatusAction(
  orderId: string,
  targetStatus: OrderStatus
): Promise<{ success: boolean; newStatus?: OrderStatus; error?: string }> {
  try {
    const existing = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    if (existing) {
      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({ status: targetStatus, updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        await tx.insert(orderEvents).values({
          orderId,
          fromStatus: existing.status,
          toStatus: targetStatus,
          note: `Status updated to ${targetStatus}`,
        });
      });

      await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
        orderId,
        status: targetStatus,
      });

      return { success: true, newStatus: targetStatus };
    }
  } catch {
    // fallback
  }

  const demo = demoOrdersStore.get(orderId);
  if (demo) {
    const fromStatus = demo.status;
    demo.status = targetStatus;
    demo.updatedAt = new Date();
    demo.events.push({
      id: `evt-${Date.now()}`,
      fromStatus,
      toStatus: targetStatus,
      note: `Status transitioned to ${targetStatus}`,
      createdAt: new Date(),
    });

    await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
      orderId,
      status: targetStatus,
    });

    return { success: true, newStatus: targetStatus };
  }

  return { success: false, error: "Order not found" };
}
