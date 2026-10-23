import crypto from "crypto";
import { eq, and, inArray, sql, asc, desc, gte } from "drizzle-orm";
import {
  diningSessions,
  orders,
  orderItems,
  orderEvents,
  payments,
  tables,
  menuItems,
  modifiers,
  orderCounters,
  type OrderStatus,
} from "@/server/db/schema";
import {
  placeTabRoundSchema,
  requestTabBillSchema,
  verifyTabPaymentSchema,
  testVerifyTabPaymentSchema,
  settleTabInputSchema,
  type PlaceTabRoundInput,
  type RequestTabBillInput,
  type VerifyTabPaymentInput,
  type TestVerifyTabPaymentInput,
  type SettleTabInput,
} from "@/lib/validations/order";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import {
  createRazorpayOrder as createRzpOrder,
  verifyRazorpaySignature,
  isOnlinePaymentsEnabled,
  isRazorpayTestMode,
} from "@/server/razorpay";
import { formatPaiseToINR } from "@/lib/currency";
import { RESTAURANT_PROFILE, formatReceiptNumber, formatBillNumber, type ReceiptData, type ReceiptItem } from "./billing";
import { ok, fail, type ServiceResult, type Ctx } from "./result";

export interface TabOrderSummary {
  orderId: string;
  orderNumber: string;
  roundNumber: number;
  status: OrderStatus;
  paymentStatus: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  createdAt: string;
  items: Array<{
    id: string;
    itemName: string;
    itemPricePaise: number;
    quantity: number;
    selectedModifiers: Array<{ id: string; name: string; pricePaise: number }>;
    totalPaise: number;
    notes: string | null;
  }>;
}

export interface TabDetailsData {
  id: string;
  sessionToken: string;
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  restaurantName: string;
  realtimeChannel?: string;
  status: "active" | "bill_requested" | "closed";
  paymentStatus: "open" | "bill_requested" | "paid" | "counter";
  paymentMethod: string | null;
  roundCount: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  paidPaise: number;
  amountDuePaise: number;
  formattedSubtotal: string;
  formattedTax: string;
  formattedTotal: string;
  formattedAmountDue: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
  closedAt: string | null;
  orders: TabOrderSummary[];
  paymentsEnabled: boolean;
  paymentsTestMode: boolean;
}

/**
 * Checks whether an order belongs to an open tab (session status is active or bill_requested).
 */
export async function isOrderInOpenTab(
  ctx: Ctx,
  order: { diningSessionId?: string | null; diningSession?: { status: string } | null }
): Promise<boolean> {
  if (!order.diningSessionId) return false;
  if (order.diningSession) {
    return (
      order.diningSession.status === "active" ||
      order.diningSession.status === "bill_requested"
    );
  }
  const session = ctx.db.query?.diningSessions?.findFirst
    ? await ctx.db.query.diningSessions.findFirst({
        where: eq(diningSessions.id, order.diningSessionId),
      })
    : null;
  return session
    ? session.status === "active" || session.status === "bill_requested"
    : false;
}

export interface PlaceTabRoundData {
  tabId: string;
  orderId: string;
  orderNumber: string;
  roundNumber: number;
  tabTotalPaise: number;
  orderTotalPaise: number;
  status: OrderStatus;
}

/**
 * Fetch or get the active tab for a given table QR token.
 */
export async function getActiveTab(
  ctx: Ctx,
  tableToken: string
): Promise<ServiceResult<TabDetailsData | null>> {
  if (!tableToken) {
    return fail("VALIDATION", "Table token is required", 400);
  }

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, tableToken), eq(tables.isActive, true)),
      with: { restaurant: true },
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "Table not found", 404);
    }

    let session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.tableId, tableRecord.id),
        sql`${diningSessions.status} IN ('active', 'bill_requested')`
      ),
      with: {
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          orderBy: [asc(orders.createdAt)],
          with: { items: true },
        },
      },
    });

    // If no active or bill_requested tab, check if there is a tab that was closed recently (within 15 minutes)
    // so guests who just settled can view their receipt and download the PDF.
    if (!session) {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      session = await ctx.db.query.diningSessions.findFirst({
        where: and(
          eq(diningSessions.tableId, tableRecord.id),
          eq(diningSessions.status, "closed"),
          gte(diningSessions.closedAt, fifteenMinutesAgo)
        ),
        orderBy: [desc(diningSessions.closedAt)],
        with: {
          orders: {
            where: sql`${orders.status} != 'cancelled'`,
            orderBy: [asc(orders.createdAt)],
            with: { items: true },
          },
        },
      });
    }

    if (!session) {
      return ok(null);
    }

    const nonCancelledOrders = session.orders;
    const computedSubtotal =
      nonCancelledOrders.some((o) => o.subtotalPaise != null)
        ? nonCancelledOrders.reduce((sum, o) => sum + (o.subtotalPaise ?? 0), 0)
        : session.subtotalPaise ?? 0;
    const computedTax =
      nonCancelledOrders.some((o) => o.taxPaise != null)
        ? nonCancelledOrders.reduce((sum, o) => sum + (o.taxPaise ?? 0), 0)
        : session.taxPaise ?? 0;
    const computedTotal =
      nonCancelledOrders.some((o) => o.totalPaise != null)
        ? nonCancelledOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0)
        : session.totalPaise ?? 0;

    // Sum of already-paid non-cancelled rounds (pre-paid rounds)
    const paidOrders = nonCancelledOrders.filter((o) => o.paymentStatus === "paid");
    const paidPaise = paidOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0);
    const amountDuePaise = Math.max(0, computedTotal - paidPaise);

    // Invariant guard: ensure diningSessions row in DB stays synchronized with non-cancelled rounds
    if (
      session.totalPaise !== computedTotal ||
      session.subtotalPaise !== computedSubtotal ||
      session.taxPaise !== computedTax
    ) {
      if (ctx.db.update) {
        await ctx.db
          .update(diningSessions)
          .set({
            subtotalPaise: computedSubtotal,
            taxPaise: computedTax,
            totalPaise: computedTotal,
            updatedAt: new Date(),
          })
          .where(eq(diningSessions.id, session.id));
      }
    }

    const formattedOrders: TabOrderSummary[] = session.orders.map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      roundNumber: o.roundNumber || 1,
      status: o.status,
      paymentStatus: o.paymentStatus,
      subtotalPaise: o.subtotalPaise,
      taxPaise: o.taxPaise,
      totalPaise: o.totalPaise,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((i) => {
        let mods: Array<{ id: string; name: string; pricePaise: number }> = [];
        if (i.selectedModifiersJson) {
          try {
            mods = JSON.parse(i.selectedModifiersJson);
          } catch {
            mods = [];
          }
        }
        return {
          id: i.id,
          itemName: i.itemName,
          itemPricePaise: i.itemPricePaise,
          quantity: i.quantity,
          selectedModifiers: mods,
          totalPaise: i.totalPaise,
          notes: i.notes,
        };
      }),
    }));

    return ok({
      id: session.id,
      sessionToken: session.sessionToken,
      tableId: tableRecord.id,
      tableNumber: tableRecord.tableNumber,
      restaurantId: tableRecord.restaurant.id,
      restaurantName: tableRecord.restaurant.name,
      realtimeChannel: getRestaurantChannel(tableRecord.restaurant.id),
      status: session.status as TabDetailsData["status"],
      paymentStatus: session.paymentStatus as TabDetailsData["paymentStatus"],
      paymentMethod: session.paymentMethod,
      roundCount: session.orders.length,
      subtotalPaise: computedSubtotal,
      taxPaise: computedTax,
      totalPaise: computedTotal,
      paidPaise,
      amountDuePaise,
      formattedSubtotal: formatPaiseToINR(computedSubtotal),
      formattedTax: formatPaiseToINR(computedTax),
      formattedTotal: formatPaiseToINR(computedTotal),
      formattedAmountDue: formatPaiseToINR(amountDuePaise),
      customerName: session.customerName,
      customerPhone: session.customerPhone,
      createdAt: session.createdAt ? new Date(session.createdAt).toISOString() : new Date().toISOString(),
      closedAt: session.closedAt ? new Date(session.closedAt).toISOString() : null,
      orders: formattedOrders,
      paymentsEnabled: isOnlinePaymentsEnabled(),
      paymentsTestMode: isRazorpayTestMode(),
    });
  } catch (err) {
    console.error("Database error in getActiveTab:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Places a food order round onto an active or newly created dining session.
 * Immediately routes the ticket to the kitchen display board.
 */
export async function placeTabRound(
  ctx: Ctx,
  rawInput: PlaceTabRoundInput
): Promise<ServiceResult<PlaceTabRoundData>> {
  const parsed = placeTabRoundSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid tab order", 400);
  }

  const { token, items: inputItems, notes, customerName, customerPhone } = parsed.data;

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, token), eq(tables.isActive, true)),
      with: { restaurant: true },
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "Dining table not found or inactive", 404);
    }

    const restaurantId = tableRecord.restaurantId;

    // Validate menu items and compute prices server-side
    const menuItemIds = inputItems.map((i) => i.menuItemId);
    const dbMenuItems = await ctx.db.query.menuItems.findMany({
      where: and(inArray(menuItems.id, menuItemIds), eq(menuItems.isActive, true)),
    });
    const dbMenuMap = new Map(dbMenuItems.map((m) => [m.id, m]));

    for (const inputItem of inputItems) {
      const item = dbMenuMap.get(inputItem.menuItemId);
      if (!item) {
        return fail("NOT_FOUND", `Item not found: ${inputItem.menuItemId}`, 404);
      }
      if (!item.isAvailable) {
        return fail("CONFLICT", `${item.name} is currently sold out`, 409);
      }
    }

    const allSelectedModIds = inputItems.flatMap((i) => i.selectedModifierIds);
    const dbModifiers =
      allSelectedModIds.length > 0
        ? await ctx.db.query.modifiers.findMany({
            where: inArray(modifiers.id, allSelectedModIds),
          })
        : [];
    const dbModMap = new Map(dbModifiers.map((m) => [m.id, m]));

    let roundSubtotalPaise = 0;
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
      roundSubtotalPaise += lineTotalPaise;

      verifiedItems.push({
        menuItemId: dbItem.id,
        itemName: dbItem.name,
        itemPricePaise: dbItem.pricePaise,
        quantity: inputItem.quantity,
        selectedModifiers: verifiedMods,
        totalPaise: lineTotalPaise,
      });
    }

    const roundTaxPaise = Math.round(roundSubtotalPaise * 0.05);
    const roundTotalPaise = roundSubtotalPaise + roundTaxPaise;

    // Run transaction: create or find active session, calculate round number, insert order and items
    const result = await ctx.db.transaction(async (tx) => {
      let activeSession = await tx.query.diningSessions.findFirst({
        where: and(
          eq(diningSessions.tableId, tableRecord.id),
          sql`${diningSessions.status} IN ('active', 'bill_requested')`
        ),
      });

      if (!activeSession) {
        const [newSession] = await tx
          .insert(diningSessions)
          .values({
            restaurantId,
            tableId: tableRecord.id,
            sessionToken: crypto.randomBytes(16).toString("hex"),
            status: "active",
            paymentStatus: "open",
            customerName: customerName ?? null,
            customerPhone: customerPhone ?? null,
            subtotalPaise: 0,
            taxPaise: 0,
            totalPaise: 0,
          })
          .returning();
        activeSession = newSession;
      } else if (activeSession.status === "bill_requested") {
        // Adding more food resets status to active
        await tx
          .update(diningSessions)
          .set({ status: "active", paymentStatus: "open", updatedAt: new Date() })
          .where(eq(diningSessions.id, activeSession.id));
      }

      // Count prior orders in this session to determine Round number
      const priorOrders = await tx.query.orders.findMany({
        where: and(
          eq(orders.diningSessionId, activeSession.id),
          sql`${orders.status} != 'cancelled'`
        ),
      });

      const nextRound = priorOrders.length + 1;

      // Sequential collision-safe order number (format ML-0001)
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
          tableId: tableRecord.id,
          diningSessionId: activeSession.id,
          roundNumber: nextRound,
          orderNumber: generatedOrderNumber,
          status: "placed",
          paymentStatus: "counter", // open tab orders are immediately routed
          paymentMethod: "counter",
          subtotalPaise: roundSubtotalPaise,
          taxPaise: roundTaxPaise,
          totalPaise: roundTotalPaise,
          customerName: customerName ?? activeSession.customerName,
          customerPhone: customerPhone ?? activeSession.customerPhone,
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
        note: `Round ${nextRound} placed on Open Tab`,
      });

      // Update session totals strictly matching sum of all non-cancelled rounds including the new one
      const priorSubtotal =
        priorOrders.length > 0 && priorOrders.some((o) => o.subtotalPaise != null)
          ? priorOrders.reduce((s, o) => s + (o.subtotalPaise ?? 0), 0)
          : activeSession.subtotalPaise ?? 0;
      const priorTax =
        priorOrders.length > 0 && priorOrders.some((o) => o.taxPaise != null)
          ? priorOrders.reduce((s, o) => s + (o.taxPaise ?? 0), 0)
          : activeSession.taxPaise ?? 0;
      const priorTotal =
        priorOrders.length > 0 && priorOrders.some((o) => o.totalPaise != null)
          ? priorOrders.reduce((s, o) => s + (o.totalPaise ?? 0), 0)
          : activeSession.totalPaise ?? 0;

      const newSubtotal = priorSubtotal + roundSubtotalPaise;
      const newTax = priorTax + roundTaxPaise;
      const newTotal = priorTotal + roundTotalPaise;

      await tx
        .update(diningSessions)
        .set({
          subtotalPaise: newSubtotal,
          taxPaise: newTax,
          totalPaise: newTotal,
          updatedAt: new Date(),
        })
        .where(eq(diningSessions.id, activeSession.id));

      return {
        tabId: activeSession.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        roundNumber: nextRound,
        tabTotalPaise: newTotal,
        orderTotalPaise: roundTotalPaise,
        status: order.status,
      };
    });

    // Realtime notification: ticket sent directly to kitchen
    await publishRealtimeEvent(
      getRestaurantChannel(restaurantId),
      "order.created",
      {
        orderId: result.orderId,
        status: "placed",
        paymentStatus: "counter",
        roundNumber: result.roundNumber,
        tableNumber: tableRecord.tableNumber,
      }
    );

    await publishRealtimeEvent(`tab:${result.tabId}`, "tab.updated", {
      tabId: result.tabId,
      roundNumber: result.roundNumber,
      orderId: result.orderId,
    });

    return ok(result);
  } catch (err) {
    console.error("Database error in placeTabRound:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Customer requests the final consolidated bill for the table tab.
 */
export async function requestTabBill(
  ctx: Ctx,
  rawInput: RequestTabBillInput
): Promise<ServiceResult<{ tabId: string; status: string; totalPaise: number }>> {
  const parsed = requestTabBillSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }

  const { token, paymentMethod } = parsed.data;

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, token), eq(tables.isActive, true)),
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "Table not found", 404);
    }

    const session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.tableId, tableRecord.id),
        sql`${diningSessions.status} IN ('active', 'bill_requested')`
      ),
    });

    if (!session) {
      return fail("NOT_FOUND", "No active dining tab found for this table", 404);
    }

    if (session.totalPaise <= 0) {
      return fail("VALIDATION", "Cannot request bill for empty tab", 400);
    }

    await ctx.db
      .update(diningSessions)
      .set({
        status: "bill_requested",
        paymentStatus: "bill_requested",
        paymentMethod,
        updatedAt: new Date(),
      })
      .where(eq(diningSessions.id, session.id));

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      "tab.bill_requested",
      {
        tabId: session.id,
        tableNumber: tableRecord.tableNumber,
        totalPaise: session.totalPaise,
        paymentMethod,
      }
    );

    return ok({
      tabId: session.id,
      status: "bill_requested",
      totalPaise: session.totalPaise,
    });
  } catch (err) {
    console.error("Database error in requestTabBill:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Initiates Razorpay payment for open tab.
 */
export async function createTabRazorpayOrder(
  ctx: Ctx,
  tableToken: string
): Promise<ServiceResult<{
  tabId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}>> {
  if (!tableToken) {
    return fail("VALIDATION", "Table token is required", 400);
  }

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, tableToken), eq(tables.isActive, true)),
      with: { restaurant: true },
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "Table not found", 404);
    }

    const session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.tableId, tableRecord.id),
        sql`${diningSessions.status} IN ('active', 'bill_requested')`
      ),
      with: {
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
        },
      },
    });

    if (!session || session.orders.length === 0) {
      return fail("NOT_FOUND", "No active orders on this tab", 404);
    }

    const nonCancelledOrders = session.orders;
    const computedTotal =
      nonCancelledOrders.some((o) => o.totalPaise != null)
        ? nonCancelledOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0)
        : session.totalPaise ?? 0;
    const paidOrders = nonCancelledOrders.filter((o) => o.paymentStatus === "paid");
    const paidPaise = paidOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0);
    const amountDuePaise = Math.max(0, computedTotal - paidPaise);

    if (amountDuePaise === 0) {
      return fail("CONFLICT", "Tab is already fully paid", 400);
    }

    let rzpOrder;
    try {
      rzpOrder = await createRzpOrder(
        amountDuePaise,
        `ML-TAB-${session.id.slice(0, 8)}`,
        {
          tabId: session.id,
          tableId: tableRecord.id,
          restaurantId: tableRecord.restaurantId,
        }
      );
    } catch (error) {
      return fail("PAYMENT", (error as Error)?.message || "Failed to create payment gateway order", 500);
    }

    const firstOrder = session.orders[0];

    // Persist pending payment record linked to tab and primary order
    await ctx.db.insert(payments).values({
      orderId: firstOrder.id,
      diningSessionId: session.id,
      restaurantId: tableRecord.restaurantId,
      amountPaise: amountDuePaise,
      status: "pending",
      provider: "razorpay",
      razorpayOrderId: rzpOrder.id,
    });

    return ok({
      tabId: session.id,
      razorpayOrderId: rzpOrder.id,
      amountPaise: amountDuePaise,
      currency: "INR",
      keyId: rzpOrder.keyId,
    });
  } catch (err) {
    console.error("Error in createTabRazorpayOrder:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Verifies Razorpay signature and settles the dining tab.
 */
export async function verifyTabPayment(
  ctx: Ctx,
  rawInput: VerifyTabPaymentInput
): Promise<ServiceResult<{ success: true; tabId: string }>> {
  const parsed = verifyTabPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid payment data", 400);
  }

  const { token, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  // Validate Razorpay signature
  const isValidSignature = verifyRazorpaySignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature
  );

  if (!isValidSignature) {
    return fail("PAYMENT", "Payment verification signature mismatch", 400);
  }

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, token), eq(tables.isActive, true)),
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "Table not found", 404);
    }

    const session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.tableId, tableRecord.id),
        sql`${diningSessions.status} IN ('active', 'bill_requested')`
      ),
      with: {
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "No active dining tab found", 404);
    }

    const now = new Date();

    // Settle session and all its orders in transaction
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(diningSessions)
        .set({
          status: "closed",
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(diningSessions.id, session.id));

      const orderIds = session.orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await tx
          .update(orders)
          .set({
            paymentStatus: "paid",
            paymentMethod: "pay_now",
            updatedAt: now,
          })
          .where(inArray(orders.id, orderIds));

        for (const oId of orderIds) {
          await tx.insert(orderEvents).values({
            orderId: oId,
            fromStatus: null,
            toStatus: "accepted",
            note: "Consolidated tab paid online via Razorpay",
          });
        }
      }

      await tx
        .update(payments)
        .set({
          status: "completed",
          razorpayPaymentId,
          razorpaySignature,
          updatedAt: now,
        })
        .where(eq(payments.razorpayOrderId, razorpayOrderId));
    });

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      "tab.closed",
      {
        tabId: session.id,
        tableNumber: tableRecord.tableNumber,
        status: "closed",
        paymentStatus: "paid",
      }
    );

    await publishRealtimeEvent(`tab:${session.id}`, "tab.closed", {
      tabId: session.id,
      status: "closed",
      paymentStatus: "paid",
    });

    return ok({ success: true, tabId: session.id });
  } catch (err) {
    console.error("Database error in verifyTabPayment:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Simulated tab payment verification for tests/e2e
 */
export async function testVerifyTabPayment(
  ctx: Ctx,
  rawInput: TestVerifyTabPaymentInput
): Promise<ServiceResult<{ success: true; tabId: string }>> {
  const parsed = testVerifyTabPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid table token", 400);
  }

  const { token } = parsed.data;

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, token), eq(tables.isActive, true)),
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "Table not found", 404);
    }

    const session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.tableId, tableRecord.id),
        sql`${diningSessions.status} IN ('active', 'bill_requested')`
      ),
      with: {
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "No active dining tab found", 404);
    }

    const now = new Date();

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(diningSessions)
        .set({
          status: "closed",
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(diningSessions.id, session.id));

      const orderIds = session.orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await tx
          .update(orders)
          .set({ paymentStatus: "paid", updatedAt: now })
          .where(inArray(orders.id, orderIds));
      }

      if (session.orders.length > 0) {
        await tx.insert(payments).values({
          orderId: session.orders[0].id,
          diningSessionId: session.id,
          restaurantId: session.restaurantId,
          amountPaise: session.totalPaise,
          status: "completed",
          provider: "test_simulation",
          razorpayOrderId: `test_rzp_${session.id.slice(0, 8)}`,
          razorpayPaymentId: `test_pay_${Date.now()}`,
        });
      }
    });

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      "tab.closed",
      {
        tabId: session.id,
        tableNumber: tableRecord.tableNumber,
        status: "closed",
        paymentStatus: "paid",
      }
    );

    return ok({ success: true, tabId: session.id });
  } catch (err) {
    console.error("Error in testVerifyTabPayment:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Manager settlements: marks open tab as paid at counter.
 */
export async function settleTabAtCounter(
  ctx: Ctx,
  rawInput: SettleTabInput
): Promise<ServiceResult<{ success: true; tabId: string }>> {
  if (!ctx.actor || (ctx.actor.role !== "manager" && ctx.actor.role !== "admin")) {
    return fail("UNAUTHENTICATED", "Unauthorized: Manager or Admin access required", 401);
  }

  const parsed = settleTabInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid settlement data", 400);
  }

  const { tabId, paymentMethod, notes } = parsed.data;

  try {
    const session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.id, tabId),
        eq(diningSessions.restaurantId, ctx.actor.restaurantId)
      ),
      with: {
        table: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "Dining tab not found", 404);
    }

    if (session.status === "closed") {
      return fail("CONFLICT", "This tab has already been settled and closed", 409);
    }

    const now = new Date();
    const paymentMethodToRecord = paymentMethod || "counter";

    const nonCancelledOrders = session.orders;
    const computedTotal =
      nonCancelledOrders.some((o) => o.totalPaise != null)
        ? nonCancelledOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0)
        : session.totalPaise ?? 0;
    const paidOrders = nonCancelledOrders.filter((o) => o.paymentStatus === "paid");
    const paidPaise = paidOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0);
    const amountDuePaise = Math.max(0, computedTotal - paidPaise);

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(diningSessions)
        .set({
          status: "closed",
          paymentStatus: "paid",
          paymentMethod: paymentMethodToRecord,
          notes: notes ?? null,
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(diningSessions.id, session.id));

      const orderIds = session.orders.map((o) => o.id);
      if (orderIds.length > 0) {
        await tx
          .update(orders)
          .set({
            paymentStatus: "paid",
            paymentMethod: paymentMethodToRecord,
            updatedAt: now,
          })
          .where(inArray(orders.id, orderIds));

        for (const oId of orderIds) {
          await tx.insert(orderEvents).values({
            orderId: oId,
            fromStatus: null,
            toStatus: "accepted",
            note: `Tab settled at counter (${paymentMethodToRecord}) by ${ctx.actor!.username}`,
            staffUserId: ctx.actor!.userId,
          });
        }
      }

      if (session.orders.length > 0) {
        await tx.insert(payments).values({
          orderId: session.orders[0].id,
          diningSessionId: session.id,
          restaurantId: session.restaurantId,
          amountPaise: amountDuePaise,
          status: "completed",
          provider: paymentMethodToRecord,
          razorpayOrderId: null,
          razorpayPaymentId: `COUNTER-${Date.now()}`,
        });
      }
    });

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      "tab.closed",
      {
        tabId: session.id,
        tableNumber: session.table.tableNumber,
        status: "closed",
        paymentStatus: "paid",
        settledBy: ctx.actor.username,
      }
    );

    await publishRealtimeEvent(`tab:${session.id}`, "tab.closed", {
      tabId: session.id,
      status: "closed",
      paymentStatus: "paid",
    });

    return ok({ success: true, tabId: session.id });
  } catch (err) {
    console.error("Database error in settleTabAtCounter:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Generates consolidated ReceiptData for a dining session.
 */
export function buildTabReceiptData(session: {
  id: string;
  table: { tableNumber: string };
  restaurant: { name: string };
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    roundNumber: number;
    items: Array<{
      id: string;
      itemName: string;
      itemPricePaise: number;
      quantity: number;
      selectedModifiersJson: string | null;
      totalPaise: number;
      notes: string | null;
    }>;
  }>;
}): ReceiptData {
  const isPaid = session.status === "closed" && session.paymentStatus === "paid";
  const paidDate = session.closedAt ?? session.updatedAt;

  const tabCode = `TAB-${session.table.tableNumber}`;
  const receiptNumber = formatReceiptNumber(tabCode, paidDate);
  const billNumber = formatBillNumber(tabCode);

  const cgstPaise = Math.floor(session.taxPaise / 2);
  const sgstPaise = session.taxPaise - cgstPaise;

  const allItems: ReceiptItem[] = [];
  for (const order of session.orders) {
    for (const item of order.items) {
      let mods: Array<{ name: string; pricePaise: number }> = [];
      if (item.selectedModifiersJson) {
        try {
          mods = JSON.parse(item.selectedModifiersJson);
        } catch {
          mods = [];
        }
      }
      allItems.push({
        id: item.id,
        name: `[Round ${order.roundNumber || 1}] ${item.itemName}`,
        quantity: item.quantity,
        unitPricePaise: item.itemPricePaise,
        totalPaise: item.totalPaise,
        modifiers: mods,
        notes: item.notes,
      });
    }
  }

  return {
    receiptNumber,
    billNumber,
    orderId: session.id,
    orderNumber: tabCode,
    tableNumber: session.table.tableNumber,
    createdAt: session.createdAt.toISOString(),
    paidAt: isPaid ? paidDate.toISOString() : null,
    isPaid,
    paymentStatus: isPaid ? "paid" : "pending",
    paymentMethod: session.paymentMethod,
    paymentReference: isPaid ? `TAB-${session.id.slice(0, 8)}` : null,
    restaurant: {
      name: session.restaurant.name || RESTAURANT_PROFILE.name,
      tagline: RESTAURANT_PROFILE.tagline,
      address: RESTAURANT_PROFILE.address,
      city: RESTAURANT_PROFILE.city,
      phone: RESTAURANT_PROFILE.phone,
      fssai: RESTAURANT_PROFILE.fssai,
      gstin: RESTAURANT_PROFILE.gstin,
      currency: RESTAURANT_PROFILE.currency,
    },
    customer: {
      name: session.customerName ?? null,
      phone: session.customerPhone ?? null,
    },
    specialInstructions: null,
    items: allItems,
    subtotalPaise: session.subtotalPaise,
    cgstPaise,
    sgstPaise,
    taxPaise: session.taxPaise,
    totalPaise: session.totalPaise,
    formattedSubtotal: formatPaiseToINR(session.subtotalPaise),
    formattedCgst: formatPaiseToINR(cgstPaise),
    formattedSgst: formatPaiseToINR(sgstPaise),
    formattedTax: formatPaiseToINR(session.taxPaise),
    formattedTotal: formatPaiseToINR(session.totalPaise),
    status: isPaid ? "PAID_RECEIPT" : "UNPAID_BILL",
    title: isPaid ? "CONSOLIDATED TAB RECEIPT" : "CONSOLIDATED TAB BILL",
  };
}

/**
 * Fetches digital consolidated receipt for customer.
 */
export async function getCustomerTabReceipt(
  ctx: Ctx,
  tableToken: string
): Promise<ServiceResult<ReceiptData>> {
  if (!tableToken) {
    return fail("VALIDATION", "Table token is required", 400);
  }

  try {
    const tableRecord = await ctx.db.query.tables.findFirst({
      where: and(eq(tables.qrToken, tableToken), eq(tables.isActive, true)),
      with: { restaurant: true },
    });

    if (!tableRecord) {
      return fail("NOT_FOUND", "Table not found", 404);
    }

    const session = await ctx.db.query.diningSessions.findFirst({
      where: eq(diningSessions.tableId, tableRecord.id),
      orderBy: [desc(diningSessions.createdAt)],
      with: {
        table: true,
        restaurant: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          with: { items: true },
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "No dining tab found for this table", 404);
    }

    return ok(buildTabReceiptData(session));
  } catch (err) {
    console.error("Database error in getCustomerTabReceipt:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}
