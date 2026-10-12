import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";

export async function POST(request: NextRequest) {
  // 1. Forbidden unless DEMO_MODE === "true"
  if (env.DEMO_MODE !== "true") {
    return NextResponse.json(
      { success: false, error: "Demo reset is disabled when DEMO_MODE is false" },
      { status: 403 }
    );
  }

  // 2. Authorization check with DEMO_RESET_SECRET
  const expectedSecret = env.DEMO_RESET_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { success: false, error: "DEMO_RESET_SECRET is not configured on server" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Missing Bearer token" },
      { status: 401 }
    );
  }

  const providedToken = authHeader.slice(7).trim();
  const tokenBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedSecret);

  if (
    tokenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
  ) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Invalid secret" },
      { status: 401 }
    );
  }

  // 3. Reset demo orders and re-seed clean demo state
  try {
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.slug, "masala-lane"),
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: "Restaurant 'masala-lane' not found in database" },
        { status: 404 }
      );
    }

    const restaurantId = restaurant.id;

    // Delete existing orders and related records
    const existingOrders = await db.query.orders.findMany({
      where: eq(schema.orders.restaurantId, restaurantId),
      columns: { id: true },
    });

    if (existingOrders.length > 0) {
      const orderIds = existingOrders.map((o) => o.id);
      await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds));
      await db.delete(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds));
      await db.delete(schema.payments).where(inArray(schema.payments.orderId, orderIds));
      await db.delete(schema.orders).where(eq(schema.orders.restaurantId, restaurantId));
    }

    // Reset order counter sequence
    await db
      .update(schema.orderCounters)
      .set({ lastOrderNumber: 0, updatedAt: new Date() })
      .where(eq(schema.orderCounters.restaurantId, restaurantId));

    // Ensure demo table 7 has fixed token
    await db
      .update(schema.tables)
      .set({ qrToken: "demo-table-7", isActive: true, updatedAt: new Date() })
      .where(
        eq(schema.tables.tableNumber, "Table 7")
      );

    // Fetch sample menu items & tables to seed realistic live tickets
    const availableTables = await db.query.tables.findMany({
      where: eq(schema.tables.restaurantId, restaurantId),
      limit: 4,
    });

    const sampleMenuItems = await db.query.menuItems.findMany({
      where: eq(schema.menuItems.restaurantId, restaurantId),
      limit: 6,
    });

    if (availableTables.length > 0 && sampleMenuItems.length > 0) {
      const now = new Date();

      // Seed 2 initial demo orders for a vibrant KDS board:
      // Order 1: Confirmed (Table 3)
      const table3 = availableTables[2] || availableTables[0];
      const item1 = sampleMenuItems[0];
      const item2 = sampleMenuItems[1] || item1;
      const subtotal1 = item1.pricePaise * 2 + item2.pricePaise;
      const tax1 = Math.round(subtotal1 * 0.05);

      const [order1] = await db
        .insert(schema.orders)
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

      await db.insert(schema.orderItems).values([
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

      await db.insert(schema.orderEvents).values({
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

      const [order2] = await db
        .insert(schema.orders)
        .values({
          restaurantId,
          tableId: table7.id,
          orderNumber: "ML-0002",
          status: "preparing",
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          subtotalPaise: subtotal2,
          taxPaise: tax2,
          totalPaise: subtotal2 + tax2,
          createdAt: new Date(now.getTime() - 4 * 60 * 1000), // 4 mins ago
        })
        .returning();

      await db.insert(schema.orderItems).values({
        orderId: order2.id,
        menuItemId: item3.id,
        itemName: item3.name,
        itemPricePaise: item3.pricePaise,
        quantity: 1,
        totalPaise: item3.pricePaise,
      });

      await db.insert(schema.orderEvents).values({
        orderId: order2.id,
        fromStatus: "accepted",
        toStatus: "preparing",
        note: "Kitchen started preparation",
        createdAt: new Date(now.getTime() - 3 * 60 * 1000),
      });

      // Update sequence counter to 2
      await db
        .update(schema.orderCounters)
        .set({ lastOrderNumber: 2, updatedAt: new Date() })
        .where(eq(schema.orderCounters.restaurantId, restaurantId));
    }

    return NextResponse.json({
      success: true,
      message: "Demo orders and KDS tickets reset successfully",
    });
  } catch (err) {
    console.error("Database error during demo reset:", err);
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }
}
