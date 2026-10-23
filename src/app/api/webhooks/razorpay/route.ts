import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, payments, orderEvents, diningSessions } from "@/server/db/schema";
import { verifyRazorpayWebhookSignature } from "@/server/razorpay";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import { env } from "@/server/env";
import { wasRoundPaidBeforeTab } from "@/server/services/tabs";

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
    order?: {
      entity?: {
        id?: string;
        amount?: number;
        status?: string;
      };
    };
    qr_code?: {
      entity?: {
        id?: string;
        status?: string;
        notes?: {
          orderId?: string;
          tableNumber?: string;
        };
      };
    };
  };
}

export async function POST(req: NextRequest) {
  if (env.PAYMENTS_MODE === "counter_only") {
    return NextResponse.json(
      { error: "Not Found" },
      { status: 404 }
    );
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing x-razorpay-signature header" },
        { status: 400 }
      );
    }

    // 1. Cryptographically verify webhook signature
    const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.error("[Security Alert] Invalid Razorpay webhook signature");
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    // 2. Parse payload
    const data = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const event = data.event;

    // We process successful payment events: payment.captured, order.paid, or qr_code.credited
    if (
      event !== "payment.captured" &&
      event !== "order.paid" &&
      event !== "qr_code.credited"
    ) {
      return NextResponse.json({
        received: true,
        ignored: true,
        event,
      });
    }

    const razorpayPaymentId = data.payload?.payment?.entity?.id;
    const razorpayOrderId =
      data.payload?.payment?.entity?.order_id ||
      data.payload?.order?.entity?.id ||
      data.payload?.qr_code?.entity?.id;

    if (!razorpayOrderId) {
      return NextResponse.json(
        { error: "Missing razorpay order identifier in payload" },
        { status: 400 }
      );
    }

    // 3. Idempotent Database handling
    try {
      let existingPayment = await db.query.payments.findFirst({
        where: eq(payments.razorpayOrderId, razorpayOrderId),
        with: { order: { with: { table: true, diningSession: true } } },
      });

      if (!existingPayment && data.payload?.qr_code?.entity?.notes?.orderId) {
        existingPayment = await db.query.payments.findFirst({
          where: eq(payments.orderId, data.payload.qr_code.entity.notes.orderId),
          with: { order: { with: { table: true, diningSession: true } } },
        });
      }


      if (existingPayment) {
        // A tab-level payment is validated against the saved payment row and settles the
        // session total. Its representative order_id must never be treated as the full bill.
        if (existingPayment.diningSessionId) {
          const paymentEntity = data.payload?.payment?.entity;
          const tabPayloadAmount =
            data.payload?.payment?.entity?.amount ??
            data.payload?.order?.entity?.amount;

          if (paymentEntity?.status && paymentEntity.status !== "captured") {
            return NextResponse.json({ received: true, ignored: true, reason: "Payment not captured" });
          }
          if (paymentEntity?.currency && paymentEntity.currency !== "INR") {
            return NextResponse.json({ error: "Payment currency mismatch" }, { status: 400 });
          }
          if (tabPayloadAmount === undefined || tabPayloadAmount !== existingPayment.amountPaise) {
            return NextResponse.json({ error: "Tab payment amount mismatch" }, { status: 400 });
          }

          const tabSession = await db.query.diningSessions.findFirst({
            where: eq(diningSessions.id, existingPayment.diningSessionId),
            with: {
              table: true,
              orders: {
                where: sql`${orders.status} != 'cancelled'`,
                with: { payments: true },
              },
            },
          });
          if (!tabSession || existingPayment.order?.diningSessionId !== tabSession.id) {
            return NextResponse.json({ error: "Tab payment/session mismatch" }, { status: 400 });
          }
          if (
            existingPayment.status === "completed" &&
            tabSession.status === "closed" &&
            tabSession.paymentStatus === "paid"
          ) {
            return NextResponse.json({ received: true, status: "already_processed", tabId: tabSession.id });
          }
          if (tabSession.status !== "bill_requested" || tabSession.paymentMethod !== "pay_now") {
            return NextResponse.json({ error: "Tab is not awaiting online settlement" }, { status: 409 });
          }

          const computedSubtotal = tabSession.orders.reduce((sum, order) => sum + (order.subtotalPaise ?? 0), 0);
          const computedTax = tabSession.orders.reduce((sum, order) => sum + (order.taxPaise ?? 0), 0);
          const computedTotal = tabSession.orders.reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
          const alreadyPaidPaise = tabSession.orders
            .filter((order) => wasRoundPaidBeforeTab(order, tabSession))
            .reduce((sum, order) => sum + (order.totalPaise ?? 0), 0);
          const amountDuePaise = Math.max(0, computedTotal - alreadyPaidPaise);
          if (amountDuePaise <= 0 || amountDuePaise !== existingPayment.amountPaise) {
            return NextResponse.json({ error: "Tab total changed after payment was initiated" }, { status: 409 });
          }

          const now = new Date();
          const settled = await db.transaction(async (tx) => {
            const closedRows = await tx.update(diningSessions)
              .set({
                status: "closed",
                paymentStatus: "paid",
                paymentMethod: "pay_now",
                subtotalPaise: computedSubtotal,
                taxPaise: computedTax,
                totalPaise: computedTotal,
                closedAt: now,
                updatedAt: now,
              })
              .where(and(eq(diningSessions.id, tabSession.id), eq(diningSessions.status, "bill_requested")))
              .returning({ id: diningSessions.id });
            if (closedRows.length === 0) return false;

            const unpaidOrders = tabSession.orders.filter((order) => order.paymentStatus !== "paid");
            const unpaidOrderIds = unpaidOrders.map((order) => order.id);
            if (unpaidOrderIds.length > 0) {
              await tx.update(orders)
                .set({ paymentStatus: "paid", paymentMethod: "pay_now", updatedAt: now })
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

            await tx.update(payments)
              .set({
                status: "completed",
                razorpayPaymentId: razorpayPaymentId ?? existingPayment.razorpayPaymentId,
                updatedAt: now,
              })
              .where(eq(payments.id, existingPayment.id));
            return true;
          });
          if (!settled) {
            return NextResponse.json({ error: "Tab was settled by another request" }, { status: 409 });
          }

          await publishRealtimeEvent(getRestaurantChannel(tabSession.restaurantId), "tab.closed", {
            tabId: tabSession.id,
            tableNumber: tabSession.table.tableNumber,
            status: "closed",
            paymentStatus: "paid",
          });
          await publishRealtimeEvent(`tab:${tabSession.id}`, "tab.closed", {
            tabId: tabSession.id,
            status: "closed",
            paymentStatus: "paid",
          });
          return NextResponse.json({ received: true, status: "processed_tab", tabId: tabSession.id });
        }


        // RULE: An order that belongs to an open tab can never be paid on its own.
        if (
          !existingPayment.diningSessionId &&
          existingPayment.order?.diningSessionId
        ) {
          const session =
            (existingPayment.order as { diningSession?: { id?: string; status: string } }).diningSession ||
            (db.query?.diningSessions?.findFirst
              ? await db.query.diningSessions.findFirst({
                  where: eq(diningSessions.id, existingPayment.order.diningSessionId),
                })
              : null);

          if (session) {
            console.error(
              `[Security Alert] Rejected individual payment webhook for order ${existingPayment.orderId} belonging to open tab ${session.id}`
            );
            return NextResponse.json(
              {
                error: "TAB_ROUND_NOT_PAYABLE",
                message: "Order belongs to an open dining tab and cannot be paid individually",
              },
              { status: 400 }
            );
          }
        }
        // Idempotency check: if payment already completed or order already marked paid
        if (existingPayment.status === "completed" || existingPayment.order.paymentStatus === "paid") {
          if (existingPayment.status !== "completed") {
            await db
              .update(payments)
              .set({
                status: "completed",
                razorpayPaymentId: razorpayPaymentId ?? existingPayment.razorpayPaymentId,
                updatedAt: new Date(),
              })
              .where(eq(payments.id, existingPayment.id));
          }

          return NextResponse.json({
            received: true,
            status: "already_processed",
            orderId: existingPayment.orderId,
          });
        }

        const paymentEntity = data.payload?.payment?.entity;

        // Verify payment status is captured
        if (paymentEntity?.status && paymentEntity.status !== "captured") {
          console.warn(
            `[Webhook] Ignored payment event with non-captured status: ${paymentEntity.status}`
          );
          return NextResponse.json({
            received: true,
            ignored: true,
            reason: `Payment status is ${paymentEntity.status}, not captured`,
          });
        }

        // Verify currency is INR
        if (paymentEntity?.currency && paymentEntity.currency !== "INR") {
          console.error(
            `[Security Alert] Webhook currency mismatch for order ${existingPayment.orderId}: expected INR, got ${paymentEntity.currency}`
          );
          return NextResponse.json(
            { error: "Payment currency mismatch" },
            { status: 400 }
          );
        }

        // For real QR payments: validate incoming QR ID exactly matches persisted payment record
        if (event === "qr_code.credited") {
          const qrId = data.payload?.qr_code?.entity?.id;
          if (!qrId) {
            return NextResponse.json(
              { error: "Missing QR code identifier in webhook payload" },
              { status: 400 }
            );
          }
          if (
            !existingPayment.razorpayOrderId ||
            existingPayment.razorpayOrderId !== qrId
          ) {
            console.error(
              `[Security Alert] Webhook QR ID mismatch for order ${existingPayment.orderId}: expected persisted '${existingPayment.razorpayOrderId}', got incoming '${qrId}'`
            );
            return NextResponse.json(
              { error: "QR code ID does not match persisted payment record" },
              { status: 400 }
            );
          }
        }

        const payloadAmount =
          data.payload?.payment?.entity?.amount ??
          data.payload?.order?.entity?.amount;

        if (
          payloadAmount === undefined ||
          payloadAmount !== existingPayment.amountPaise ||
          existingPayment.amountPaise !== existingPayment.order.totalPaise
        ) {
          console.error(
            `[Security Alert] Webhook amount mismatch for order ${existingPayment.orderId}: expected ${existingPayment.amountPaise}, got ${payloadAmount}`
          );
          return NextResponse.json(
            { error: "Payment amount mismatch" },
            { status: 400 }
          );
        }

        const targetOrderId = existingPayment.orderId;

        await db.transaction(async (tx) => {
          await tx
            .update(payments)
            .set({
              status: "completed",
              razorpayPaymentId: razorpayPaymentId ?? existingPayment.razorpayPaymentId,
              updatedAt: new Date(),
            })
            .where(eq(payments.id, existingPayment.id));

          await tx
            .update(orders)
            .set({
              paymentStatus: "paid",
              paymentMethod: "pay_now",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, targetOrderId));

          await tx.insert(orderEvents).values({
            orderId: targetOrderId,
            fromStatus: existingPayment.order.status,
            toStatus: existingPayment.order.status,
            note: `Payment captured via Razorpay Webhook (${razorpayPaymentId || event})`,
          });
        });

        // RULE: Orders are only sent to the kitchen once paid!
        await publishRealtimeEvent(
          getRestaurantChannel(existingPayment.restaurantId),
          "order.created",
          {
            orderId: targetOrderId,
            status: existingPayment.order.status,
            paymentStatus: "paid",
          }
        );

        await publishRealtimeEvent(`order:${targetOrderId}`, "order.paid", {
          orderId: targetOrderId,
          status: existingPayment.order.status,
          paymentStatus: "paid",
        });

        return NextResponse.json({
          received: true,
          status: "processed",
          orderId: targetOrderId,
        });
      }

      return NextResponse.json({
        received: true,
        status: "unmatched_order",
        razorpayOrderId,
      });
    } catch (err) {
      console.error("Database error in Razorpay webhook handler:", err);
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error("Razorpay webhook payload error:", error);
    return NextResponse.json(
      { error: "Webhook internal server error" },
      { status: 500 }
    );
  }
}
