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
import { env } from "@/server/env";
import { formatPaiseToINR } from "@/lib/currency";
import { RESTAURANT_PROFILE, formatReceiptNumber, formatBillNumber, type ReceiptData, type ReceiptItem } from "./billing";
import { ok, fail, type ServiceResult, type Ctx } from "./result";

export interface TabOrderSummary {
  orderId: string;
  orderNumber: string;
  roundNumber: number;
  status: OrderStatus;
  paymentStatus: string;
  alreadyPaidBeforeTab?: boolean;
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
export function isOrderInDiningTab(order: { diningSessionId?: string | null }): boolean {
  // A round linked to a dining session is never individually payable, even if the
  // session has since closed. Closed sessions should already have one tab-level settlement.
  return Boolean(order.diningSessionId);
}

export function wasRoundPaidBeforeTab(
  order: {
    paymentStatus?: string | null;
    paymentMethod?: string | null;
    payments?: Array<{ status: string; diningSessionId: string | null }>;
  },
  session: { id: string; status: string; paymentMethod?: string | null }
): boolean {
  if (order.paymentStatus !== "paid") return false;
  const hasStandaloneCompletedPayment = (order.payments ?? []).some(
    (payment) => payment.status === "completed" && payment.diningSessionId !== session.id
  );
  if (hasStandaloneCompletedPayment) return true;
  return session.status === "closed" && Boolean(
    order.paymentMethod && session.paymentMethod && order.paymentMethod !== session.paymentMethod
  );
}

/**
 * Re-check fulfillment after payment commits to cover the race where the final
 * order is served between the initial read and the payment transaction.
 */
async function closePaidSessionIfFulfilled(ctx: Ctx, sessionId: string): Promise<boolean> {
  const session = await ctx.db.query.diningSessions.findFirst({
    where: eq(diningSessions.id, sessionId),
    columns: { id: true, status: true, paymentStatus: true },
  });
  if (!session || session.paymentStatus !== "paid") return false;
  if (session.status === "closed") return true;

  const sessionOrders = await ctx.db.query.orders.findMany({
    where: and(
      eq(orders.diningSessionId, session.id),
      sql`${orders.status} != 'cancelled'`
    ),
    columns: { status: true },
  });
  if (sessionOrders.length === 0 || !sessionOrders.every((order) => order.status === "served")) {
    return false;
  }

  const now = new Date();
  const closedRows = await ctx.db.update(diningSessions)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(and(
      eq(diningSessions.id, session.id),
      eq(diningSessions.paymentStatus, "paid"),
      inArray(diningSessions.status, ["active", "bill_requested"])
    ))
    .returning({ id: diningSessions.id });

  if (closedRows.length > 0) return true;
  const currentSession = await ctx.db.query.diningSessions.findFirst({
    where: eq(diningSessions.id, session.id),
    columns: { status: true, paymentStatus: true },
  });
  return currentSession?.status === "closed" && currentSession.paymentStatus === "paid";
}

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
        payments: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          orderBy: [asc(orders.createdAt)],
          with: { items: true, payments: true },
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
          payments: true,
          orders: {
            where: sql`${orders.status} != 'cancelled'`,
            orderBy: [asc(orders.createdAt)],
            with: { items: true, payments: true },
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

    // Preserve pre-tab payments when computing the outstanding balance. After a tab
    // closes, rounds paid by this tab settlement are not mistaken for pre-paid rounds.
    const wasPaidBeforeTab = (o: (typeof nonCancelledOrders)[number]) =>
      wasRoundPaidBeforeTab(o, session);
    const paidOrders = nonCancelledOrders.filter(wasPaidBeforeTab);
    const paidPaise = paidOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0);
    const amountDuePaise = session.status === "closed" ? 0 : Math.max(0, computedTotal - paidPaise);

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
      alreadyPaidBeforeTab: wasPaidBeforeTab(o),
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
      where: and(
        inArray(menuItems.id, menuItemIds),
        eq(menuItems.restaurantId, restaurantId),
        eq(menuItems.isActive, true)
      ),
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
            where: and(
              inArray(modifiers.id, allSelectedModIds),
              inArray(modifiers.menuItemId, menuItemIds)
            ),
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
        if (!dbMod || dbMod.menuItemId !== dbItem.id) {
          return fail(
            "VALIDATION",
            `Invalid modifier selected for ${dbItem.name}. Please refresh the menu and try again.`,
            400
          );
        }
        unitPricePaise += dbMod.pricePaise;
        verifiedMods.push({
          id: dbMod.id,
          name: dbMod.name,
          pricePaise: dbMod.pricePaise,
        });
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
        // Freeze the tab once billing is requested so the amount cannot change mid-payment.
        throw new Error("TAB_BILL_ALREADY_REQUESTED");
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
    if (err instanceof Error && err.message === "TAB_BILL_ALREADY_REQUESTED") {
      return fail("CONFLICT", "The bill has already been requested. Please ask staff to reopen the tab before adding more dishes.", 409);
    }
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
      with: {
        payments: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          with: { payments: true },
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "No active dining tab found for this table", 404);
    }

    const computedSubtotal = session.orders.reduce((sum, order) => sum + (order.subtotalPaise ?? 0), 0);
    const computedTax = session.orders.reduce((sum, order) => sum + (order.taxPaise ?? 0), 0);
    const computedTotal = session.orders.reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
    if (computedTotal <= 0) {
      return fail("VALIDATION", "Cannot request bill for empty tab", 400);
    }
    const alreadyPaidPaise = session.orders
      .filter((order) => wasRoundPaidBeforeTab(order, session))
      .reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
    const amountDuePaise = Math.max(0, computedTotal - alreadyPaidPaise);

    if (session.status === "bill_requested" && session.paymentMethod === paymentMethod) {
      return ok({ tabId: session.id, status: "bill_requested", totalPaise: computedTotal });
    }
    if (session.status === "bill_requested" && session.paymentMethod !== paymentMethod) {
      const unresolvedOnlinePayment = (session.payments ?? []).some(
        (payment) =>
          payment.diningSessionId === session.id &&
          payment.provider === "razorpay" &&
          (payment.status === "pending" || payment.status === "completed")
      );
      if (unresolvedOnlinePayment) {
        return fail(
          "CONFLICT",
          "An online tab payment is still pending or recorded. Do not switch to counter payment until staff verifies its status.",
          409
        );
      }
    }

    if (amountDuePaise <= 0) {
      return fail("CONFLICT", "All rounds on this tab are already paid; no bill is due.", 409);
    }

    const stateCondition =
      session.status === "active"
        ? eq(diningSessions.status, "active")
        : session.paymentMethod
          ? and(
              eq(diningSessions.status, "bill_requested"),
              eq(diningSessions.paymentMethod, session.paymentMethod)
            )
          : eq(diningSessions.status, "bill_requested");
    const requestedRows = await ctx.db
      .update(diningSessions)
      .set({
        status: "bill_requested",
        paymentStatus: "bill_requested",
        paymentMethod,
        subtotalPaise: computedSubtotal,
        taxPaise: computedTax,
        totalPaise: computedTotal,
        updatedAt: new Date(),
      })
      .where(and(eq(diningSessions.id, session.id), stateCondition))
      .returning({ id: diningSessions.id });
    if (requestedRows.length === 0) {
      return fail("CONFLICT", "The dining tab changed while the bill was being requested. Refresh the tab and retry.", 409);
    }

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      "tab.bill_requested",
      {
        tabId: session.id,
        tableNumber: tableRecord.tableNumber,
        totalPaise: computedTotal,
        amountDuePaise,
        paymentMethod,
      }
    );

    return ok({
      tabId: session.id,
      status: "bill_requested",
      totalPaise: computedTotal,
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
        payments: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          with: { payments: true },
        },
      },
    });

    if (!session || session.orders.length === 0) {
      return fail("NOT_FOUND", "No active orders on this tab", 404);
    }
    if (session.status !== "bill_requested" || session.paymentMethod !== "pay_now") {
      return fail("CONFLICT", "Request the consolidated bill and select online payment before creating a Razorpay order.", 409);
    }

    const nonCancelledOrders = session.orders;
    const computedTotal =
      nonCancelledOrders.some((o) => o.totalPaise != null)
        ? nonCancelledOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0)
        : session.totalPaise ?? 0;
    const paidOrders = nonCancelledOrders.filter((order) => wasRoundPaidBeforeTab(order, session));
    const paidPaise = paidOrders.reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
    const amountDuePaise = Math.max(0, computedTotal - paidPaise);

    if (amountDuePaise === 0) {
      return fail("CONFLICT", "Tab is already fully paid", 400);
    }

    // A completed online payment against this tab must be reconciled before
    // another checkout can be initialized, even if a stale session status remains.
    const completedTabPayment = (session.payments ?? []).find(
      (payment) =>
        payment.diningSessionId === session.id &&
        payment.provider === "razorpay" &&
        payment.status === "completed"
    );
    if (completedTabPayment) {
      return fail(
        "CONFLICT",
        "A completed online payment is already recorded for this tab. Ask staff to reconcile the payment before retrying.",
        409
      );
    }

    // Reuse the one pending tab-level Razorpay order on retries. Creating a new
    // gateway order for the same balance can allow two separate captures.
    const pendingTabPayment = (session.payments ?? []).find(
      (payment) =>
        payment.diningSessionId === session.id &&
        payment.provider === "razorpay" &&
        payment.status === "pending"
    );
    if (pendingTabPayment) {
      if (
        !pendingTabPayment.razorpayOrderId ||
        pendingTabPayment.amountPaise !== amountDuePaise
      ) {
        return fail(
          "CONFLICT",
          "A previous online payment is still pending for a different tab balance. Please ask staff to reconcile it before retrying.",
          409
        );
      }
      if (!env.RAZORPAY_KEY_ID) {
        return fail("PAYMENT", "Online payments are not configured. Please pay at the counter.", 503);
      }
      return ok({
        tabId: session.id,
        razorpayOrderId: pendingTabPayment.razorpayOrderId,
        amountPaise: pendingTabPayment.amountPaise,
        currency: "INR",
        keyId: env.RAZORPAY_KEY_ID,
      });
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

    const tabPayment = await ctx.db.query.payments.findFirst({
      where: eq(payments.razorpayOrderId, razorpayOrderId),
    });
    if (!tabPayment || !tabPayment.diningSessionId) {
      return fail("PAYMENT", "Razorpay order is not linked to a dining-tab payment", 400);
    }

    const session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.id, tabPayment.diningSessionId),
        eq(diningSessions.tableId, tableRecord.id)
      ),
      with: {
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          with: { payments: true },
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "Dining tab for this payment was not found", 404);
    }
    if (tabPayment.status === "completed" && session.paymentStatus === "paid") {
      return ok({ success: true, tabId: session.id });
    }
    if (tabPayment.status !== "pending") {
      return fail("CONFLICT", "This tab payment is not pending", 409);
    }
    if (session.status !== "bill_requested" || session.paymentMethod !== "pay_now") {
      return fail("CONFLICT", "Request the tab bill online before verifying payment", 409);
    }

    const computedSubtotal = session.orders.reduce((sum, o) => sum + (o.subtotalPaise ?? 0), 0);
    const computedTax = session.orders.reduce((sum, o) => sum + (o.taxPaise ?? 0), 0);
    const computedTotal = session.orders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0);
    const alreadyPaidPaise = session.orders
      .filter((order) => wasRoundPaidBeforeTab(order, session))
      .reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
    const amountDuePaise = Math.max(0, computedTotal - alreadyPaidPaise);
    if (amountDuePaise <= 0 || tabPayment.amountPaise !== amountDuePaise) {
      return fail("PAYMENT", "Tab total changed after payment was initiated. Request a fresh bill and payment.", 409);
    }

    const now = new Date();
    // Payment settles the balance, but the tab stays open until every non-cancelled
    // order has been served. The query above already excludes cancelled orders.
    let allOrdersServed = session.orders.length > 0 && session.orders.every((order) => order.status === "served");
    const didSettle = await ctx.db.transaction(async (tx) => {
      const settledRows = await tx
        .update(diningSessions)
        .set({
          status: allOrdersServed ? "closed" : "bill_requested",
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          subtotalPaise: computedSubtotal,
          taxPaise: computedTax,
          totalPaise: computedTotal,
          closedAt: allOrdersServed ? now : null,
          updatedAt: now,
        })
        .where(and(eq(diningSessions.id, session.id), eq(diningSessions.status, "bill_requested")))
        .returning({ id: diningSessions.id });
      if (settledRows.length === 0) return false;

      const unpaidOrders = session.orders.filter((order) => !wasRoundPaidBeforeTab(order, session));
      const unpaidOrderIds = unpaidOrders.map((o) => o.id);
      if (unpaidOrderIds.length > 0) {
        await tx.update(orders).set({ paymentStatus: "paid", paymentMethod: "pay_now", updatedAt: now })
          .where(inArray(orders.id, unpaidOrderIds));
        for (const order of unpaidOrders) {
          await tx.insert(orderEvents).values({
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,
            note: "Consolidated dining tab paid online via Razorpay",
          });
        }
      }

      await tx.update(payments).set({
        status: "completed",
        razorpayPaymentId,
        razorpaySignature,
        updatedAt: now,
      }).where(eq(payments.id, tabPayment.id));
      return true;
    });
    if (!didSettle) return fail("CONFLICT", "This tab has already been settled by another request", 409);
    allOrdersServed = allOrdersServed || await closePaidSessionIfFulfilled(ctx, session.id);

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      allOrdersServed ? "tab.closed" : "tab.updated",
      {
        tabId: session.id,
        tableNumber: tableRecord.tableNumber,
        status: allOrdersServed ? "closed" : "bill_requested",
        paymentStatus: "paid",
      }
    );

    await publishRealtimeEvent(`tab:${session.id}`, allOrdersServed ? "tab.closed" : "tab.updated", {
      tabId: session.id,
      status: allOrdersServed ? "closed" : "bill_requested",
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
          with: { payments: true },
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "No active dining tab found", 404);
    }
    if (session.paymentStatus === "paid") {
      return ok({ success: true, tabId: session.id });
    }

    const now = new Date();
    let allOrdersServed = session.orders.length > 0 && session.orders.every((order) => order.status === "served");

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(diningSessions)
        .set({
          status: allOrdersServed ? "closed" : "bill_requested",
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          closedAt: allOrdersServed ? now : null,
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
    allOrdersServed = allOrdersServed || await closePaidSessionIfFulfilled(ctx, session.id);

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      allOrdersServed ? "tab.closed" : "tab.updated",
      {
        tabId: session.id,
        tableNumber: tableRecord.tableNumber,
        status: allOrdersServed ? "closed" : "bill_requested",
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
        payments: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          with: { payments: true },
        },
      },
    });

    if (!session) {
      return fail("NOT_FOUND", "Dining tab not found", 404);
    }

    if (session.status === "closed") {
      return fail("CONFLICT", "This tab has already been settled and closed", 409);
    }
    if (session.paymentStatus === "paid") {
      return fail("CONFLICT", "This tab is already paid and is waiting for its orders to be served.", 409);
    }

    const now = new Date();
    const paymentMethodToRecord = paymentMethod || "cash";
    let allOrdersServed = session.orders.length > 0 && session.orders.every((order) => order.status === "served");

    // Never collect at the counter while a Razorpay tab payment could still capture.
    const unresolvedOnlinePayment = (session.payments ?? []).some(
      (payment) =>
        payment.diningSessionId === session.id &&
        payment.provider === "razorpay" &&
        (payment.status === "pending" || payment.status === "completed")
    );
    if (unresolvedOnlinePayment) {
      return fail(
        "CONFLICT",
        "This tab has an online payment pending or recorded. Verify/reconcile that payment before collecting at the counter.",
        409
      );
    }

    const nonCancelledOrders = session.orders;
    const computedSubtotal = nonCancelledOrders.reduce((sum, o) => sum + (o.subtotalPaise ?? 0), 0);
    const computedTax = nonCancelledOrders.reduce((sum, o) => sum + (o.taxPaise ?? 0), 0);
    const computedTotal = nonCancelledOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0);
    const paidOrders = nonCancelledOrders.filter((order) => wasRoundPaidBeforeTab(order, session));
    const paidPaise = paidOrders.reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
    const amountDuePaise = Math.max(0, computedTotal - paidPaise);

    if (amountDuePaise <= 0) {
      return fail("CONFLICT", "All rounds are already paid; no additional counter payment is due.", 409);
    }

    // Conditional close acquires the session row lock and makes settlement one-shot.
    // Only unpaid rounds are updated; their prior payment history is never overwritten.
    const didSettle = await ctx.db.transaction(async (tx) => {
      const closedRows = await tx
        .update(diningSessions)
        .set({
          status: allOrdersServed ? "closed" : "bill_requested",
          paymentStatus: "paid",
          paymentMethod: paymentMethodToRecord,
          notes: notes ?? null,
          subtotalPaise: computedSubtotal,
          taxPaise: computedTax,
          totalPaise: computedTotal,
          closedAt: allOrdersServed ? now : null,
          updatedAt: now,
        })
        .where(and(
          eq(diningSessions.id, session.id),
          inArray(diningSessions.status, ["active", "bill_requested"])
        ))
        .returning({ id: diningSessions.id });

      if (closedRows.length === 0) return false;

      const unpaidOrders = session.orders.filter((order) => !wasRoundPaidBeforeTab(order, session));
      const unpaidOrderIds = unpaidOrders.map((o) => o.id);
      if (unpaidOrderIds.length > 0) {
        await tx
          .update(orders)
          .set({
            paymentStatus: "paid",
            paymentMethod: paymentMethodToRecord,
            updatedAt: now,
          })
          .where(inArray(orders.id, unpaidOrderIds));

        for (const order of unpaidOrders) {
          await tx.insert(orderEvents).values({
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,
            note: "Tab counter settlement recorded by " + ctx.actor!.username + " (" + paymentMethodToRecord + ")",
            staffUserId: ctx.actor!.userId,
          });
        }
      }

      // One payment record for the consolidated balance only—not one per round.
      await tx.insert(payments).values({
        orderId: unpaidOrders[0]?.id ?? session.orders[0].id,
        diningSessionId: session.id,
        restaurantId: session.restaurantId,
        amountPaise: amountDuePaise,
        status: "completed",
        provider: paymentMethodToRecord,
        razorpayOrderId: null,
        razorpayPaymentId: "COUNTER-" + session.id + "-" + now.getTime(),
      });
      return true;
    });

    if (!didSettle) {
      return fail("CONFLICT", "This tab has already been settled by another request.", 409);
    }
    allOrdersServed = allOrdersServed || await closePaidSessionIfFulfilled(ctx, session.id);

    await publishRealtimeEvent(
      getRestaurantChannel(session.restaurantId),
      allOrdersServed ? "tab.closed" : "tab.updated",
      {
        tabId: session.id,
        tableNumber: session.table.tableNumber,
        status: allOrdersServed ? "closed" : "bill_requested",
        paymentStatus: "paid",
        settledBy: ctx.actor.username,
      }
    );

    await publishRealtimeEvent(`tab:${session.id}`, allOrdersServed ? "tab.closed" : "tab.updated", {
      tabId: session.id,
      status: allOrdersServed ? "closed" : "bill_requested",
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
  payments?: Array<{
    status: string;
    amountPaise: number;
    diningSessionId: string | null;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    roundNumber: number;
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string | null;
    payments?: Array<{
      status: string;
      amountPaise: number;
      diningSessionId: string | null;
    }>;
    subtotalPaise?: number;
    taxPaise?: number;
    totalPaise?: number;
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
  const computedSubtotal = session.orders.reduce((sum, order) => sum + (order.subtotalPaise ?? 0), 0) || session.subtotalPaise;
  const computedTax = session.orders.reduce((sum, order) => sum + (order.taxPaise ?? 0), 0) || session.taxPaise;
  const computedTotal = session.orders.reduce((sum, order) => sum + (order.totalPaise ?? 0), 0) || session.totalPaise;
  const alreadyPaidOrders = session.orders.filter((order) =>
    wasRoundPaidBeforeTab(order, session)
  );
  const alreadyPaidPaise = alreadyPaidOrders.reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
  const amountDuePaise = isPaid ? 0 : Math.max(0, computedTotal - alreadyPaidPaise);
  const completedTabPaymentsPaise = (session.payments ?? [])
    .filter((payment) => payment.status === "completed" && payment.diningSessionId === session.id)
    .reduce((sum, payment) => sum + payment.amountPaise, 0);
  const settlementAmountPaise = isPaid
    ? Math.min(Math.max(0, computedTotal - alreadyPaidPaise), completedTabPaymentsPaise || Math.max(0, computedTotal - alreadyPaidPaise))
    : 0;

  const tabCode = `TAB-${session.table.tableNumber}`;
  const receiptNumber = formatReceiptNumber(tabCode, paidDate);
  const billNumber = formatBillNumber(tabCode);

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
        name: item.itemName,
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
    subtotalPaise: computedSubtotal,
    cgstPaise: Math.floor(computedTax / 2),
    sgstPaise: computedTax - Math.floor(computedTax / 2),
    taxPaise: computedTax,
    totalPaise: computedTotal,
    formattedSubtotal: formatPaiseToINR(computedSubtotal),
    formattedCgst: formatPaiseToINR(Math.floor(computedTax / 2)),
    formattedSgst: formatPaiseToINR(computedTax - Math.floor(computedTax / 2)),
    formattedTax: formatPaiseToINR(computedTax),
    formattedTotal: formatPaiseToINR(computedTotal),
    isTabBill: true,
    alreadyPaidPaise,
    formattedAlreadyPaid: formatPaiseToINR(alreadyPaidPaise),
    amountDuePaise,
    formattedAmountDue: formatPaiseToINR(amountDuePaise),
    settlementAmountPaise,
    formattedSettlementAmount: formatPaiseToINR(settlementAmountPaise),
    status: isPaid ? "PAID_RECEIPT" : "UNPAID_BILL",
    title: isPaid ? "CONSOLIDATED TAB RECEIPT" : "CONSOLIDATED TAB BILL",
  };
}

/**
 * Builds one consolidated tab bill/receipt for the manager panel.
 * This is deliberately separate from the legacy single-order bill endpoint.
 */
export async function getAdminTabBillOrReceipt(
  ctx: Ctx,
  rawInput: { tabId: string }
): Promise<ServiceResult<ReceiptData>> {
  if (!ctx.actor || (ctx.actor.role !== "manager" && ctx.actor.role !== "admin")) {
    return fail("UNAUTHENTICATED", "Manager or Admin access required", 401);
  }
  if (!rawInput.tabId) return fail("VALIDATION", "Tab ID is required", 400);

  try {
    const session = await ctx.db.query.diningSessions.findFirst({
      where: and(
        eq(diningSessions.id, rawInput.tabId),
        eq(diningSessions.restaurantId, ctx.actor.restaurantId)
      ),
      with: {
        table: true,
        restaurant: true,
        payments: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          orderBy: [asc(orders.roundNumber)],
          with: { items: true, payments: true },
        },
      },
    });

    if (!session) return fail("NOT_FOUND", "Dining tab not found", 404);
    return ok(buildTabReceiptData(session));
  } catch (err) {
    console.error("Database error in getAdminTabBillOrReceipt:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
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
        payments: true,
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
          with: { items: true, payments: true },
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
