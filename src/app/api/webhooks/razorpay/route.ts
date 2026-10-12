import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, payments, orderEvents } from "@/server/db/schema";
import { verifyRazorpayWebhookSignature } from "@/server/razorpay";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
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
  };
}

export async function POST(req: NextRequest) {
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

    // We process successful payment events: payment.captured or order.paid
    if (event !== "payment.captured" && event !== "order.paid") {
      return NextResponse.json({
        received: true,
        ignored: true,
        event,
      });
    }

    const razorpayPaymentId = data.payload?.payment?.entity?.id;
    const razorpayOrderId =
      data.payload?.payment?.entity?.order_id ||
      data.payload?.order?.entity?.id;

    if (!razorpayOrderId) {
      return NextResponse.json(
        { error: "Missing razorpay order identifier in payload" },
        { status: 400 }
      );
    }

    // 3. Idempotent Database handling
    try {
      const existingPayment = await db.query.payments.findFirst({
        where: eq(payments.razorpayOrderId, razorpayOrderId),
        with: { order: { with: { table: true } } },
      });

      if (existingPayment) {
        // Idempotency check: if payment already completed, return 200 OK immediately
        if (existingPayment.status === "completed") {
          return NextResponse.json({
            received: true,
            status: "already_processed",
            orderId: existingPayment.orderId,
          });
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
