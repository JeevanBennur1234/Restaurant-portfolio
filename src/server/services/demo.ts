import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  orders,
  orderEvents,
  orderItems,
  payments,
  orderCounters,
  tables,
  restaurants,
  menuItems,
  type OrderStatus,
} from "@/server/db/schema";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import { env } from "@/server/env";
import { VALID_TRANSITIONS, NEXT_STEP_TRANSITIONS } from "@/server/order-status";
import { ok, fail, type ServiceResult, type Ctx } from "./result";

const simulateKitchenStepSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});

export type SimulateKitchenStepInput = z.infer<typeof simulateKitchenStepSchema>;

/**
 * Advances an order to the next valid kitchen status in demo preview.
 */
export async function simulateKitchenStep(
  ctx: Ctx,
  rawInput: SimulateKitchenStepInput
): Promise<ServiceResult<{ newStatus: OrderStatus }>> {
  if (env.DEMO_MODE !== "true") {
    return fail("FORBIDDEN", "Demo simulation is disabled", 403);
  }

  const validation = simulateKitchenStepSchema.safeParse(rawInput);
  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message ?? "Invalid simulation parameters";
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

    // Verify that the table token owns the order
    if (dbOrder.table.qrToken !== token) {
      return fail("FORBIDDEN", "Unauthorized access to order", 403);
    }

    // Determine the next valid status using the shared transition map
    const nextStatus = NEXT_STEP_TRANSITIONS[dbOrder.status];
    if (!nextStatus) {
      return fail(
        "CONFLICT",
        `Order at status '${dbOrder.status}' cannot be advanced further`,
        400
      );
    }

    const allowedTransitions = VALID_TRANSITIONS[dbOrder.status] ?? [];
    if (!allowedTransitions.includes(nextStatus)) {
      return fail(
        "CONFLICT",
        `Invalid status transition: cannot move from '${dbOrder.status}' to '${nextStatus}'`,
        400
      );
    }

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderEvents).values({
        orderId,
        fromStatus: dbOrder.status,
        toStatus: nextStatus,
        note: `Demo simulation: kitchen advanced ticket to ${nextStatus}`,
      });
    });

    // Broadcast status change to kitchen and guest channels
    await publishRealtimeEvent(
      getRestaurantChannel(dbOrder.restaurantId),
      "order.status_changed",
      {
        orderId,
        fromStatus: dbOrder.status,
        toStatus: nextStatus,
      }
    );

    await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
      orderId,
      status: nextStatus,
    });

    return ok({ newStatus: nextStatus });
  } catch (err) {
    console.error("Database error in simulateKitchenStep service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Resets demo orders and re-seeds clean demo state in a single atomic transaction.
 */
export async function resetDemoData(
  ctx: Ctx
): Promise<ServiceResult<{ message: string }>> {
  if (env.DEMO_MODE !== "true") {
    return fail("FORBIDDEN", "Demo reset is disabled when DEMO_MODE is false", 403);
  }

  try {
    const restaurant = await ctx.db.query.restaurants.findFirst({
      where: eq(restaurants.slug, "masala-lane"),
    });

    if (!restaurant) {
      return fail("NOT_FOUND", "Restaurant 'masala-lane' not found in database", 404);
    }

    const restaurantId = restaurant.id;

    // Fetch sample menu items & tables to seed realistic live tickets
    const availableTables = (await ctx.db.query.tables.findMany({
      where: eq(tables.restaurantId, restaurantId),
      limit: 12,
    })) ?? [];

    const sampleMenuItems = (await ctx.db.query.menuItems.findMany({
      where: eq(menuItems.restaurantId, restaurantId),
      limit: 6,
    })) ?? [];

    await ctx.db.transaction(async (tx) => {
      // Delete existing orders and related records
      const existingOrders = await tx.query.orders.findMany({
        where: eq(orders.restaurantId, restaurantId),
        columns: { id: true },
      });

      if (existingOrders.length > 0) {
        const orderIds = existingOrders.map((o) => o.id);
        await tx.delete(orderEvents).where(inArray(orderEvents.orderId, orderIds));
        await tx.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
        await tx.delete(payments).where(inArray(payments.orderId, orderIds));
        await tx.delete(orders).where(eq(orders.restaurantId, restaurantId));
      }

      // Reset order counter sequence
      await tx
        .insert(orderCounters)
        .values({
          restaurantId,
          lastOrderNumber: 0,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: orderCounters.restaurantId,
          set: {
            lastOrderNumber: 0,
            updatedAt: new Date(),
          },
        });

      // Ensure demo table 7 has fixed token, scoped to restaurantId and tableNumber
      await tx
        .update(tables)
        .set({ qrToken: "demo-table-7", isActive: true, updatedAt: new Date() })
        .where(
          and(
            eq(tables.restaurantId, restaurantId),
            eq(tables.tableNumber, "Table 7")
          )
        );

      if (availableTables.length > 0 && sampleMenuItems.length > 0) {
        const now = ctx.now ?? new Date();

        // Seed 2 initial demo orders for a vibrant KDS board:
        // Order 1: Confirmed (Table 3)
        const table3 = availableTables[2] || availableTables[0];
        const item1 = sampleMenuItems[0];
        const item2 = sampleMenuItems[1] || item1;
        const subtotal1 = item1.pricePaise * 2 + item2.pricePaise;
        const tax1 = Math.round(subtotal1 * 0.05);

        const [order1] = await tx
          .insert(orders)
          .values({
            restaurantId,
            tableId: table3.id,
            orderNumber: "ML-0001",
            status: "accepted",
            paymentStatus: "paid",
            paymentMethod: "pay_now",
            subtotalPaise: subtotal1,
            taxPaise: tax1,
            totalPaise: subtotal1 + tax1,
            createdAt: new Date(now.getTime() - 8 * 60 * 1000), // 8 mins ago
          })
          .returning();

        await tx.insert(orderItems).values([
          {
            orderId: order1.id,
            menuItemId: item1.id,
            itemName: item1.name,
            itemPricePaise: item1.pricePaise,
            quantity: 2,
            totalPaise: item1.pricePaise * 2,
          },
          {
            orderId: order1.id,
            menuItemId: item2.id,
            itemName: item2.name,
            itemPricePaise: item2.pricePaise,
            quantity: 1,
            totalPaise: item2.pricePaise,
          },
        ]);

        await tx.insert(orderEvents).values({
          orderId: order1.id,
          fromStatus: "placed",
          toStatus: "accepted",
          note: "Demo seeded ticket",
          createdAt: new Date(now.getTime() - 7 * 60 * 1000),
        });

        // Order 2: Preparing (Table 7)
        const table7 = availableTables.find((t) => t.tableNumber === "Table 7") || availableTables[0];
        const item3 = sampleMenuItems[2] || item1;
        const subtotal2 = item3.pricePaise;
        const tax2 = Math.round(subtotal2 * 0.05);

        const [order2] = await tx
          .insert(orders)
          .values({
            restaurantId,
            tableId: table7.id,
            orderNumber: "ML-0002",
            status: "preparing",
            paymentStatus: "counter",
            paymentMethod: "pay_counter",
            subtotalPaise: subtotal2,
            taxPaise: tax2,
            totalPaise: subtotal2 + tax2,
            createdAt: new Date(now.getTime() - 4 * 60 * 1000), // 4 mins ago
          })
          .returning();

        await tx.insert(orderItems).values([
          {
            orderId: order2.id,
            menuItemId: item3.id,
            itemName: item3.name,
            itemPricePaise: item3.pricePaise,
            quantity: 1,
            totalPaise: item3.pricePaise,
          },
        ]);

        await tx.insert(orderEvents).values({
          orderId: order2.id,
          fromStatus: "accepted",
          toStatus: "preparing",
          note: "Kitchen started preparation",
          createdAt: new Date(now.getTime() - 3 * 60 * 1000),
        });

        // Update sequence counter to 2
        await tx
          .insert(orderCounters)
          .values({
            restaurantId,
            lastOrderNumber: 2,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: orderCounters.restaurantId,
            set: {
              lastOrderNumber: 2,
              updatedAt: new Date(),
            },
          });
      }
    });

    return ok({ message: "Demo orders and KDS tickets reset successfully" });
  } catch (err) {
    console.error("Database error during demo reset service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}
