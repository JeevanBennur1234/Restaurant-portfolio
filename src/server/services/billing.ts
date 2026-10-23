import { eq, and } from "drizzle-orm";
import { orders, payments, orderEvents, diningSessions, type OrderStatus } from "@/server/db/schema";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import { formatPaiseToINR } from "@/lib/currency";
import { ok, fail, type ServiceResult, type Ctx } from "./result";
import type { RecordCounterPaymentInput } from "@/lib/validations/admin";

export interface ReceiptItemModifier {
  name: string;
  pricePaise: number;
}

export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  modifiers: ReceiptItemModifier[];
  notes?: string | null;
}

export interface ReceiptData {
  receiptNumber: string;
  billNumber: string;
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  createdAt: string;
  paidAt: string | null;
  isPaid: boolean;
  paymentStatus: "pending" | "paid" | "counter" | "failed";
  paymentMethod: string | null;
  paymentReference: string | null;
  restaurant: {
    name: string;
    tagline: string;
    address: string;
    city: string;
    phone: string;
    fssai: string;
    gstin: string;
    currency: string;
  };
  customer: {
    name: string | null;
    phone: string | null;
  };
  specialInstructions: string | null;
  items: ReceiptItem[];
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  taxPaise: number;
  totalPaise: number;
  formattedSubtotal: string;
  formattedCgst: string;
  formattedSgst: string;
  formattedTax: string;
  formattedTotal: string;
  status: "UNPAID_BILL" | "PAID_RECEIPT";
  title: string;
}

export const RESTAURANT_PROFILE = {
  name: "Masala Lane",
  tagline: "Warm flavours, editorial dining & authentic regional craft",
  address: "12, 100 Feet Road, Indiranagar",
  city: "Bengaluru, Karnataka 560038",
  phone: "+91 80 4123 4567",
  email: "dining@masalane.restaurant",
  fssai: "11223334000123",
  gstin: "29AABCU9603R1ZM",
  currency: "INR",
};

/**
 * Format deterministic and collision-safe receipt number
 * E.g., ML-REC-202610-001
 */
export function formatReceiptNumber(orderNumber: string, date: Date = new Date()): string {
  const yearMonth = date.toISOString().slice(0, 7).replace("-", "");
  return `ML-REC-${yearMonth}-${orderNumber}`;
}

/**
 * Format bill/check number
 * E.g., ML-BILL-001
 */
export function formatBillNumber(orderNumber: string): string {
  return `ML-BILL-${orderNumber}`;
}

/**
 * Build unified Receipt/Bill data structure from database order record
 */
export function buildReceiptData(
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: string;
    paymentMethod: string | null;
    subtotalPaise: number;
    taxPaise: number;
    totalPaise: number;
    customerName: string | null;
    customerPhone: string | null;
    specialInstructions: string | null;
    createdAt: Date;
    updatedAt: Date;
    table: { tableNumber: string };
    restaurant: { name: string };
    items: Array<{
      id: string;
      itemName: string;
      itemPricePaise: number;
      quantity: number;
      selectedModifiersJson: string | null;
      totalPaise: number;
      notes: string | null;
    }>;
    payments?: Array<{
      id: string;
      status: string;
      provider: string;
      razorpayPaymentId: string | null;
      amountPaise: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }
): ReceiptData {
  const isPaid = order.paymentStatus === "paid";
  const completedPayment = order.payments?.find((p) => p.status === "completed") ?? null;
  const paidDate = completedPayment?.updatedAt ?? (isPaid ? order.updatedAt : null);

  const receiptNumber = formatReceiptNumber(order.orderNumber, paidDate ?? order.createdAt);
  const billNumber = formatBillNumber(order.orderNumber);

  // 5% GST split: 2.5% CGST + 2.5% SGST integer paise
  const cgstPaise = Math.floor(order.taxPaise / 2);
  const sgstPaise = order.taxPaise - cgstPaise;

  const formattedItems: ReceiptItem[] = order.items.map((item) => {
    let mods: ReceiptItemModifier[] = [];
    if (item.selectedModifiersJson) {
      try {
        const parsed = JSON.parse(item.selectedModifiersJson);
        if (Array.isArray(parsed)) {
          mods = parsed.map((m) => ({
            name: String(m.name || ""),
            pricePaise: Number(m.pricePaise || 0),
          }));
        }
      } catch {
        mods = [];
      }
    }
    return {
      id: item.id,
      name: item.itemName,
      quantity: item.quantity,
      unitPricePaise: item.itemPricePaise,
      totalPaise: item.totalPaise,
      modifiers: mods,
      notes: item.notes,
    };
  });

  const paymentRef =
    completedPayment?.razorpayPaymentId ||
    (order.paymentMethod ? `${order.paymentMethod.toUpperCase()}-${order.id.slice(0, 8)}` : null);

  return {
    receiptNumber,
    billNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
    tableNumber: order.table.tableNumber,
    createdAt: order.createdAt.toISOString(),
    paidAt: paidDate ? paidDate.toISOString() : null,
    isPaid,
    paymentStatus: order.paymentStatus as ReceiptData["paymentStatus"],
    paymentMethod: order.paymentMethod,
    paymentReference: paymentRef,
    restaurant: {
      name: order.restaurant.name || RESTAURANT_PROFILE.name,
      tagline: RESTAURANT_PROFILE.tagline,
      address: RESTAURANT_PROFILE.address,
      city: RESTAURANT_PROFILE.city,
      phone: RESTAURANT_PROFILE.phone,
      fssai: RESTAURANT_PROFILE.fssai,
      gstin: RESTAURANT_PROFILE.gstin,
      currency: RESTAURANT_PROFILE.currency,
    },
    customer: {
      name: order.customerName ?? null,
      phone: order.customerPhone ?? null,
    },
    specialInstructions: order.specialInstructions,
    items: formattedItems,
    subtotalPaise: order.subtotalPaise,
    cgstPaise,
    sgstPaise,
    taxPaise: order.taxPaise,
    totalPaise: order.totalPaise,
    formattedSubtotal: formatPaiseToINR(order.subtotalPaise),
    formattedCgst: formatPaiseToINR(cgstPaise),
    formattedSgst: formatPaiseToINR(sgstPaise),
    formattedTax: formatPaiseToINR(order.taxPaise),
    formattedTotal: formatPaiseToINR(order.totalPaise),
    status: isPaid ? "PAID_RECEIPT" : "UNPAID_BILL",
    title: isPaid ? "PAYMENT RECEIPT" : "UNPAID BILL",
  };
}

/**
 * Fetch digital receipt for customer table session.
 * STRICT SECURITY: Rejects unpaid orders to prevent issuing receipts on unconfirmed transactions.
 */
export async function getCustomerReceipt(
  ctx: Ctx,
  rawInput: { orderId: string; token: string }
): Promise<ServiceResult<ReceiptData>> {
  const { orderId, token } = rawInput;
  if (!orderId || !token) {
    return fail("VALIDATION", "Order ID and Table Token are required", 400);
  }

  try {
    const dbOrder = await ctx.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        table: true,
        restaurant: true,
        items: true,
        payments: true,
      },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (dbOrder.table.qrToken !== token) {
      return fail("FORBIDDEN", "Unauthorized access to this order", 403);
    }

    if (dbOrder.paymentStatus !== "paid") {
      return fail(
        "PAYMENT",
        "Digital receipt is only available after payment has been completed. For unpaid orders, please complete online payment or pay at the counter.",
        400
      );
    }

    return ok(buildReceiptData(dbOrder));
  } catch (err) {
    console.error("Database error in getCustomerReceipt:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Fetch bill or receipt for Manager / Cashier.
 * Generating an unpaid bill leaves the order state completely unchanged.
 */
export async function getAdminBillOrReceipt(
  ctx: Ctx,
  rawInput: { orderId: string }
): Promise<ServiceResult<ReceiptData>> {
  if (!ctx.actor || (ctx.actor.role !== "manager" && ctx.actor.role !== "admin")) {
    return fail("UNAUTHENTICATED", "Unauthorized: Manager or Admin role required", 401);
  }

  const { orderId } = rawInput;
  if (!orderId) {
    return fail("VALIDATION", "Order ID is required", 400);
  }

  try {
    const dbOrder = await ctx.db.query.orders.findFirst({
      where: and(
        eq(orders.id, orderId),
        eq(orders.restaurantId, ctx.actor.restaurantId)
      ),
      with: {
        table: true,
        restaurant: true,
        items: true,
        payments: true,
      },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    return ok(buildReceiptData(dbOrder));
  } catch (err) {
    console.error("Database error in getAdminBillOrReceipt:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Manager/Cashier records payment received at counter (Cash, Card, or Counter UPI).
 * Idempotent, audit-logged, and updates kitchen/guest realtime listeners.
 */
export async function recordCounterPayment(
  ctx: Ctx,
  rawInput: RecordCounterPaymentInput & { orderId: string }
): Promise<ServiceResult<ReceiptData>> {
  if (!ctx.actor || (ctx.actor.role !== "manager" && ctx.actor.role !== "admin")) {
    return fail("UNAUTHENTICATED", "Unauthorized: Cashier or Manager role required", 401);
  }

  const { orderId, paymentMethod, transactionRef, note } = rawInput;
  if (!orderId) {
    return fail("VALIDATION", "Order ID is required", 400);
  }

  try {
    const dbOrder = await ctx.db.query.orders.findFirst({
      where: and(
        eq(orders.id, orderId),
        eq(orders.restaurantId, ctx.actor.restaurantId)
      ),
      with: {
        table: true,
        restaurant: true,
        items: true,
        payments: true,
        diningSession: true,
      },
    });

    if (!dbOrder) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (dbOrder.status === "cancelled") {
      return fail("CONFLICT", "Cannot record payment for a cancelled order", 400);
    }

    // RULE: An order that belongs to an open tab can never be paid on its own.
    if (dbOrder.diningSessionId) {
      const session =
        dbOrder.diningSession ||
        (ctx.db.query?.diningSessions?.findFirst
          ? await ctx.db.query.diningSessions.findFirst({
              where: eq(diningSessions.id, dbOrder.diningSessionId),
            })
          : null);

      if (session && (session.status === "active" || session.status === "bill_requested")) {
        return fail(
          "TAB_ROUND_NOT_PAYABLE",
          "This order belongs to an open dining tab and cannot be paid individually. Please settle the whole tab.",
          400
        );
      }
    }

    // Idempotency: If already paid, return existing receipt without duplicate records
    if (dbOrder.paymentStatus === "paid") {
      return ok(buildReceiptData(dbOrder));
    }

    const now = new Date();
    const receiptNum = formatReceiptNumber(dbOrder.orderNumber, now);
    const txnReference =
      transactionRef?.trim() ||
      `CTR-${paymentMethod.toUpperCase()}-${dbOrder.orderNumber}-${Date.now().toString(36).toUpperCase()}`;

    await ctx.db.transaction(async (tx) => {
      // 1. Update order payment status
      await tx
        .update(orders)
        .set({
          paymentStatus: "paid",
          paymentMethod: paymentMethod,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));

      // 2. Insert completed payment record for audit
      await tx.insert(payments).values({
        orderId: dbOrder.id,
        restaurantId: dbOrder.restaurantId,
        amountPaise: dbOrder.totalPaise,
        status: "completed",
        provider: paymentMethod,
        razorpayPaymentId: txnReference,
      });

      // 3. Insert audit event
      const auditNote = `Counter payment recorded: ${paymentMethod.toUpperCase()} (${txnReference}). Receipt: ${receiptNum}. Staff: ${ctx.actor!.username}${
        note ? ` - ${note.trim()}` : ""
      }`;

      await tx.insert(orderEvents).values({
        orderId: dbOrder.id,
        fromStatus: dbOrder.status,
        toStatus: dbOrder.status,
        note: auditNote,
        staffUserId: ctx.actor!.userId,
      });
    });

    // 5. Publish realtime event to notify KDS and guest tracker
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

    if (dbOrder.diningSessionId) {
      await publishRealtimeEvent(`tab:${dbOrder.diningSessionId}`, "tab.closed", {
        tabId: dbOrder.diningSessionId,
        status: "closed",
        paymentStatus: "paid",
      });
      await publishRealtimeEvent(
        getRestaurantChannel(dbOrder.restaurantId),
        "tab.closed",
        {
          tabId: dbOrder.diningSessionId,
          tableNumber: dbOrder.table?.tableNumber,
          status: "closed",
          paymentStatus: "paid",
          settledBy: ctx.actor!.username,
        }
      );
    }

    // 6. Re-fetch updated order to build accurate receipt
    const updatedOrder = await ctx.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: {
        table: true,
        restaurant: true,
        items: true,
        payments: true,
      },
    });

    return ok(buildReceiptData(updatedOrder!));
  } catch (err) {
    console.error("Database error in recordCounterPayment:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}
