import { eq, inArray, and, sql, gte, asc } from "drizzle-orm";
import {
  orders,
  orderItems,
  orderEvents,
  payments,
  menuItems,
  modifiers,
  tables,
  restaurants,
  categories,
  orderCounters,
  type OrderStatus,
} from "@/server/db/schema";
import { checkRateLimit } from "@/server/rate-limit";
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
import { tokenParamSchema } from "@/lib/validations/guest";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import {
  createRazorpayOrder as createRzpOrder,
  verifyRazorpaySignature,
  isRazorpayConfigured,
} from "@/server/razorpay";
import { env } from "@/server/env";
import { ok, fail, type ServiceResult, type Ctx } from "./result";

export interface GuestModifier {
  id: string;
  groupName: string;
  name: string;
  pricePaise: number;
  isRequired: boolean;
}

export interface GuestMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  pricePaise: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  modifiers: GuestModifier[];
}

export interface GuestCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface GuestTable {
  id: string;
  tableNumber: string;
  capacity: number;
  qrToken: string;
}

export interface GuestRestaurant {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface GuestMenuData {
  restaurant: GuestRestaurant;
  table: GuestTable;
  categories: GuestCategory[];
  items: GuestMenuItem[];
}

export interface PlaceOrderData {
  orderId: string;
  orderNumber: string;
  paymentStatus: "pending" | "paid" | "counter" | "failed";
  paymentMethod: "pay_now" | "counter";
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

export interface CreateRazorpayOrderData {
  simulated?: boolean;
  razorpayOrderId?: string;
  amountPaise: number;
  currency: string;
  keyId?: string;
  orderNumber: string;
  tableNumber: string;
}

export interface VerifyPaymentData {
  paymentStatus: "paid" | "failed";
}

/**
 * Resolves QR token to table and menu data
 */
export async function getMenuForTable(
  ctx: Ctx,
  rawToken: string
): Promise<ServiceResult<GuestMenuData>> {
  const parsed = tokenParamSchema.safeParse(rawToken);
  if (!parsed.success) {
    return fail("VALIDATION", "INVALID_TOKEN", 400);
  }
  const token = parsed.data;

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: eq(tables.qrToken, token),
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "NOT_FOUND", 404);
    }

    if (!tableRecord.isActive) {
      return fail("VALIDATION", "INACTIVE_TABLE", 400);
    }

    const restaurantRecord = ctx.db.query.restaurants?.findFirst
      ? await ctx.db.query.restaurants.findFirst({
          where: eq(restaurants.id, tableRecord.restaurantId),
        })
      : { id: tableRecord.restaurantId, name: "Masala Lane", slug: "masala-lane", currency: "INR", isActive: true };

    if (!restaurantRecord || ("isActive" in restaurantRecord && !restaurantRecord.isActive)) {
      return fail("NOT_FOUND", "NOT_FOUND", 404);
    }

    const categoryRecords = ctx.db.query.categories?.findMany
      ? await ctx.db.query.categories.findMany({
          where: and(
            eq(categories.restaurantId, restaurantRecord.id),
            eq(categories.isActive, true)
          ),
          orderBy: [asc(categories.sortOrder)],
        })
      : [];

    const menuItemRecords = ctx.db.query.menuItems?.findMany
      ? await ctx.db.query.menuItems.findMany({
          where: and(
            eq(menuItems.restaurantId, restaurantRecord.id),
            eq(menuItems.isActive, true)
          ),
          orderBy: [asc(menuItems.sortOrder)],
        })
      : [];

    const modifierRecords = ctx.db.query.modifiers?.findMany
      ? await ctx.db.query.modifiers.findMany()
      : [];

    const modifiersByItemId = new Map<string, GuestModifier[]>();
    for (const m of modifierRecords) {
      const list = modifiersByItemId.get(m.menuItemId) ?? [];
      list.push({
        id: m.id,
        groupName: m.groupName,
        name: m.name,
        pricePaise: m.pricePaise,
        isRequired: m.isRequired,
      });
      modifiersByItemId.set(m.menuItemId, list);
    }

    const formattedItems: GuestMenuItem[] = menuItemRecords.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      pricePaise: item.pricePaise,
      isVeg: item.isVeg,
      prepTimeMinutes: item.prepTimeMinutes,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      sortOrder: item.sortOrder,
      modifiers: modifiersByItemId.get(item.id) ?? [],
    }));

    return ok({
      restaurant: {
        id: restaurantRecord.id,
        name: restaurantRecord.name,
        slug: restaurantRecord.slug,
        currency: restaurantRecord.currency ?? "INR",
      },
      table: {
        id: tableRecord.id,
        tableNumber: tableRecord.tableNumber,
        capacity: tableRecord.capacity,
        qrToken: tableRecord.qrToken,
      },
      categories: categoryRecords.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
      })),
      items: formattedItems,
    });
  } catch (error) {
    console.error("Database query failed in getMenuForTable:", error);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Places an order with server-computed prices and 5% GST
 */
export async function placeOrder(
  ctx: Ctx,
  rawInput: PlaceOrderInput
): Promise<ServiceResult<PlaceOrderData>> {
  const validation = placeOrderInputSchema.safeParse(rawInput);
  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message ?? "Invalid order placement payload";
    return fail("VALIDATION", errorMsg, 400);
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
    return fail(
      "VALIDATION",
      "Order cannot contain more than 30 total items. Please reduce quantities.",
      400
    );
  }

  // Validate customer phone with Indian format
  if (customerPhone && customerPhone.trim().length > 0) {
    const cleanedPhone = customerPhone.replace(/[\s-]/g, "");
    if (!/^(?:(?:\+?91|0)?[6-9]\d{9})$/.test(cleanedPhone)) {
      return fail(
        "VALIDATION",
        "Please enter a valid 10-digit Indian phone number (e.g., 9876543210 or +91 98765 43210)",
        400
      );
    }
  }

  // Rate limit: per table token
  const rateLimit = await checkRateLimit({
    key: `place_order:${token}`,
    limit: 10,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return fail(
      "RATE_LIMITED",
      `Too many order requests. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
      429
    );
  }

  try {
    const dbTable = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, token), eq(tables.isActive, true)),
    });

    if (!dbTable) {
      return fail("NOT_FOUND", "Dining table not found or inactive", 404);
    }

    const restaurantId = dbTable.restaurantId;
    const initialPaymentStatus = paymentMethod === "counter" ? "counter" : "pending";

    // Spam limit 1: max 3 unpaid "pay_now" orders per table in the last 30 minutes
    const now = ctx.now ?? new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const recentUnpaidOrders = await ctx.db.query.orders.findMany({
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
      return fail(
        "VALIDATION",
        "You have 3 unpaid orders awaiting payment. Please complete or cancel pending payments before placing another order.",
        400
      );
    }

    // Spam limit 2: max 5 orders per table per 10 minutes
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const recentOrdersLast10Min = await ctx.db.query.orders.findMany({
      where: and(
        eq(orders.tableId, dbTable.id),
        gte(orders.createdAt, tenMinutesAgo)
      ),
      columns: { id: true },
    });

    if (recentOrdersLast10Min.length >= 5) {
      return fail(
        "VALIDATION",
        "Order limit reached for this table (maximum 5 orders per 10 minutes). Please wait a few minutes before placing another order.",
        400
      );
    }

    const menuItemIds = inputItems.map((i) => i.menuItemId);
    const dbMenuItems = await ctx.db.query.menuItems.findMany({
      where: and(inArray(menuItems.id, menuItemIds), eq(menuItems.isActive, true)),
    });

    const dbMenuMap = new Map(dbMenuItems.map((m) => [m.id, m]));

    // Verify availability
    for (const inputItem of inputItems) {
      const dbItem = dbMenuMap.get(inputItem.menuItemId);
      if (!dbItem) {
        return fail("NOT_FOUND", `Menu item not found: ${inputItem.menuItemId}`, 404);
      }
      if (!dbItem.isAvailable) {
        return fail("CONFLICT", `${dbItem.name} is currently sold out`, 409);
      }
    }

    // Re-fetch all modifier prices
    const allSelectedModIds = inputItems.flatMap((i) => i.selectedModifierIds);
    const dbModifiers =
      allSelectedModIds.length > 0
        ? await ctx.db.query.modifiers.findMany({
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
    const insertedOrder = await ctx.db.transaction(async (tx) => {
      // Per-restaurant sequential collision-safe order number (format ML-0001)
      const [counterRow] = await tx
        .insert(orderCounters)
        .values({
          restaurantId,
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

      const seqNumber = counterRow?.lastOrderNumber ?? 1;
      const generatedOrderNumber = `ML-${String(seqNumber).padStart(4, "0")}`;

      const [order] = await tx
        .insert(orders)
        .values({
          restaurantId,
          tableId: dbTable.id,
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
        getRestaurantChannel(restaurantId),
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

    return ok({
      orderId: insertedOrder.id,
      orderNumber: insertedOrder.orderNumber,
      paymentStatus: initialPaymentStatus,
      paymentMethod,
    });
  } catch (error) {
    console.error("Database transaction failed in placeOrder service:", error);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Fetches order details with payment status
 */
export async function getOrder(
  ctx: Ctx,
  rawInput: { orderId: string; token: string }
): Promise<ServiceResult<OrderDetails>> {
  const validation = orderStatusParamSchema.safeParse(rawInput);
  if (!validation.success) {
    return fail("VALIDATION", "Invalid parameters", 400);
  }

  const { orderId, token } = validation.data;

  try {
    const dbOrder = await ctx.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        table: true,
        restaurant: true,
        items: true,
        events: true,
      },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (dbOrder.table.qrToken !== token) {
      return fail("FORBIDDEN", "Unauthorized access to this order", 403);
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

    return ok({
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
    });
  } catch (err) {
    console.error("Database error in getOrder service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Creates Razorpay order from verified server-side total
 */
export async function createRazorpayOrder(
  ctx: Ctx,
  rawInput: CreateRazorpayOrderInput
): Promise<ServiceResult<CreateRazorpayOrderData>> {
  const validation = createRazorpayOrderSchema.safeParse(rawInput);
  if (!validation.success) {
    return fail("VALIDATION", "Invalid order parameters", 400);
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
      return fail(
        "RATE_LIMITED",
        `Too many payment requests. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
        429
      );
    }

    const dbOrder = await ctx.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (dbOrder.table.qrToken !== token) {
      return fail("FORBIDDEN", "Unauthorized access to order", 403);
    }

    if (dbOrder.paymentStatus === "paid") {
      return fail("CONFLICT", "Order is already paid", 409);
    }

    const isSimulated =
      env.DEMO_MODE === "true" &&
      (!isRazorpayConfigured() ||
        env.RAZORPAY_KEY_ID?.includes("placeholder") ||
        env.RAZORPAY_KEY_SECRET?.includes("placeholder"));

    // Check for existing pending payment for this order to reuse
    const existingPayment = await ctx.db.query.payments.findFirst({
      where: and(
        eq(payments.orderId, dbOrder.id),
        eq(payments.status, "pending")
      ),
    });

    if (isSimulated) {
      if (!existingPayment || existingPayment.provider !== "simulated") {
        await ctx.db.insert(payments).values({
          orderId: dbOrder.id,
          restaurantId: dbOrder.restaurantId,
          amountPaise: dbOrder.totalPaise,
          status: "pending",
          provider: "simulated",
        });
      }

      return ok({
        simulated: true,
        amountPaise: dbOrder.totalPaise,
        currency: "INR",
        orderNumber: dbOrder.orderNumber,
        tableNumber: dbOrder.table.tableNumber,
      });
    }

    if (!isRazorpayConfigured()) {
      return fail("PAYMENT", "Payment gateway is not configured", 503);
    }

    // Reuse existing pending payment if it already has a razorpayOrderId and matching amount
    if (
      existingPayment &&
      existingPayment.provider === "razorpay" &&
      existingPayment.razorpayOrderId &&
      existingPayment.amountPaise === dbOrder.totalPaise
    ) {
      return ok({
        razorpayOrderId: existingPayment.razorpayOrderId,
        amountPaise: dbOrder.totalPaise,
        currency: "INR",
        keyId: env.RAZORPAY_KEY_ID,
        orderNumber: dbOrder.orderNumber,
        tableNumber: dbOrder.table.tableNumber,
      });
    }

    const rzpOrder = await createRzpOrder(
      dbOrder.totalPaise,
      dbOrder.orderNumber,
      {
        orderId: dbOrder.id,
        tableNumber: dbOrder.table.tableNumber,
      }
    );

    // Record pending payment
    await ctx.db.insert(payments).values({
      orderId: dbOrder.id,
      restaurantId: dbOrder.restaurantId,
      amountPaise: dbOrder.totalPaise,
      status: "pending",
      provider: "razorpay",
      razorpayOrderId: rzpOrder.id,
    });

    return ok({
      razorpayOrderId: rzpOrder.id,
      amountPaise: dbOrder.totalPaise,
      currency: "INR",
      keyId: rzpOrder.keyId,
      orderNumber: dbOrder.orderNumber,
      tableNumber: dbOrder.table.tableNumber,
    });
  } catch (err) {
    console.error("Database error in createRazorpayOrder service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Confirms a simulated payment when in DEMO_MODE.
 */
export async function confirmSimulatedPayment(
  ctx: Ctx,
  rawInput: ConfirmSimulatedPaymentInput
): Promise<ServiceResult<VerifyPaymentData>> {
  if (env.DEMO_MODE !== "true") {
    return fail("FORBIDDEN", "Simulated payments are only allowed in demo mode", 403);
  }

  const validation = confirmSimulatedPaymentSchema.safeParse(rawInput);
  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message ?? "Invalid simulated payment payload";
    return fail("VALIDATION", errorMsg, 400);
  }

  const { orderId, token } = validation.data;

  try {
    const dbOrder = await ctx.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (dbOrder.table.qrToken !== token) {
      return fail("FORBIDDEN", "Unauthorized access", 403);
    }

    if (dbOrder.paymentStatus === "paid") {
      return ok({ paymentStatus: "paid" });
    }

    const pendingPayment = await ctx.db.query.payments.findFirst({
      where: and(
        eq(payments.orderId, orderId),
        eq(payments.status, "pending"),
        eq(payments.provider, "simulated")
      ),
    });

    if (!pendingPayment) {
      return fail("NOT_FOUND", "No pending simulated payment found for this order", 404);
    }

    if (pendingPayment.amountPaise !== dbOrder.totalPaise) {
      return fail("CONFLICT", "Payment amount mismatch", 400);
    }

    await ctx.db.transaction(async (tx) => {
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

    return ok({ paymentStatus: "paid" });
  } catch (err) {
    console.error("Database error in confirmSimulatedPayment service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Verifies Razorpay signature server-side.
 */
export async function verifyRazorpayPayment(
  ctx: Ctx,
  rawInput: VerifyPaymentInput
): Promise<ServiceResult<VerifyPaymentData>> {
  const validation = verifyPaymentSchema.safeParse(rawInput);
  if (!validation.success) {
    return fail("VALIDATION", "Invalid payment verification payload", 400);
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
    return fail("PAYMENT", "Invalid payment signature verification failed", 400);
  }

  try {
    const dbOrder = await ctx.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (dbOrder.table.qrToken !== token) {
      return fail("FORBIDDEN", "Unauthorized access", 403);
    }

    // 1. Load the payments row WHERE order_id = orderId AND razorpay_order_id = razorpayOrderId
    const payment = await ctx.db.query.payments.findFirst({
      where: and(
        eq(payments.orderId, orderId),
        eq(payments.razorpayOrderId, razorpayOrderId)
      ),
    });

    if (!payment) {
      return fail("NOT_FOUND", "Payment record not found for this order", 404);
    }

    // 2. Idempotency: skip if already completed
    if (payment.status === "completed" && dbOrder.paymentStatus === "paid") {
      return ok({ paymentStatus: "paid" });
    }

    // 3. Require that payments.amount_paise equals orders.total_paise
    if (payment.amountPaise !== dbOrder.totalPaise) {
      return fail("CONFLICT", "Payment amount mismatch", 400);
    }

    // 4. Update only that payment row and use a transaction
    await ctx.db.transaction(async (tx) => {
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

    return ok({ paymentStatus: "paid" });
  } catch (err) {
    console.error("Database error in verifyRazorpayPayment service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Switch unpaid order to Pay at counter
 */
export async function switchOrderToCounter(
  ctx: Ctx,
  rawInput: SwitchPaymentMethodInput
): Promise<ServiceResult<{ success: true }>> {
  const validation = switchPaymentMethodSchema.safeParse(rawInput);
  if (!validation.success) {
    return fail("VALIDATION", "Invalid parameters", 400);
  }

  const { orderId, token, targetMethod } = validation.data;

  try {
    const dbOrder = await ctx.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (dbOrder.table.qrToken !== token) {
      return fail("FORBIDDEN", "Unauthorized access", 403);
    }

    await ctx.db.transaction(async (tx) => {
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

    return ok({ success: true });
  } catch (err) {
    console.error("Database error in switchOrderToCounter service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}
