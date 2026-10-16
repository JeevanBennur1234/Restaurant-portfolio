import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import { env } from "@/server/env";
import { SEEDED_DISHES } from "./seed-dishes";
export { SEEDED_DISHES };

const connectionString = env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl:
    connectionString.includes("supabase.co") ||
    connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
});
const db = drizzle(pool, { schema });

async function seed() {
  console.log("🌱 Starting DinePulse database seed for 'Masala Lane'...");

  // 1. Check or insert Restaurant
  const restaurantSlug = "masala-lane";
  const existingRestaurant = await db.query.restaurants.findFirst({
    where: eq(schema.restaurants.slug, restaurantSlug),
  });

  let restaurantId: string;

  if (existingRestaurant) {
    console.log(`ℹ️ Restaurant '${existingRestaurant.name}' already exists (ID: ${existingRestaurant.id}).`);
    restaurantId = existingRestaurant.id;

    // Clean up existing child records in reverse foreign-key order
    console.log("🧹 Cleaning previous seed records for Masala Lane...");
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
    await db.delete(schema.orderCounters).where(eq(schema.orderCounters.restaurantId, restaurantId));
    await db.delete(schema.tables).where(eq(schema.tables.restaurantId, restaurantId));
    await db.delete(schema.menuItems).where(eq(schema.menuItems.restaurantId, restaurantId));
    await db.delete(schema.categories).where(eq(schema.categories.restaurantId, restaurantId));
    await db.delete(schema.staffUsers).where(eq(schema.staffUsers.restaurantId, restaurantId));
  } else {
    const [inserted] = await db
      .insert(schema.restaurants)
      .values({
        name: "Masala Lane",
        slug: restaurantSlug,
        description: "Warm flavours, editorial dining & authentic regional craft in Bengaluru",
        currency: "INR",
        isActive: true,
      })
      .returning();
    restaurantId = inserted.id;
    console.log(`✅ Created Restaurant: Masala Lane (ID: ${restaurantId})`);
  }

  // 2. Insert 12 Tables (Table 7 gets fixed token 'demo-table-7' if DEMO_MODE === 'true')
  console.log("🍽️ Generating 12 tables...");
  const isDemoMode = env.DEMO_MODE === "true";
  const tableValues = Array.from({ length: 12 }, (_, i) => {
    const tableNum = i + 1;
    // When DEMO_MODE === "true", seed Table 7 with fixed token "demo-table-7" so demo launcher links work
    const qrToken =
      isDemoMode && tableNum === 7
        ? "demo-table-7"
        : crypto.randomBytes(16).toString("hex");
    const capacity = tableNum <= 4 ? 2 : tableNum <= 10 ? 4 : 6;

    return {
      restaurantId,
      tableNumber: `Table ${tableNum}`,
      capacity,
      qrToken,
      isActive: true,
    };
  });

  const insertedTables = await db.insert(schema.tables).values(tableValues).returning();
  console.log(`✅ Inserted ${insertedTables.length} tables.`);

  // Initialize orderCounters row so order sequential generation never collides
  await db
    .insert(schema.orderCounters)
    .values({
      restaurantId,
      lastOrderNumber: 0,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.orderCounters.restaurantId,
      set: {
        lastOrderNumber: 0,
        updatedAt: new Date(),
      },
    });

  // 3. Insert 6 Categories
  console.log("📂 Inserting 6 menu categories...");
  const categoryData = [
    { name: "Small Plates & Chaats", slug: "small-plates-chaats", sortOrder: 1 },
    { name: "Tandoor & Sigdi Grills", slug: "tandoor-sigdi-grills", sortOrder: 2 },
    { name: "Signature Curries", slug: "signature-curries", sortOrder: 3 },
    { name: "Dum Biryanis & Pulao", slug: "dum-biryanis-pulao", sortOrder: 4 },
    { name: "Artisanal Breads & Sides", slug: "artisanal-breads-sides", sortOrder: 5 },
    { name: "Desserts & Beverages", slug: "desserts-beverages", sortOrder: 6 },
  ];

  const categoryMap = new Map<string, string>();
  for (const cat of categoryData) {
    const [insertedCat] = await db
      .insert(schema.categories)
      .values({
        restaurantId,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        isActive: true,
      })
      .returning();
    categoryMap.set(cat.slug, insertedCat.id);
  }
  console.log(`✅ Inserted 6 categories.`);

  // 4. Insert 30 Realistic Indian Menu Items (with 1-2 modifiers on some)
  console.log("🍛 Inserting 30 realistic Indian menu items with integer paise prices...");

  const itemsToSeed = SEEDED_DISHES;

  let insertedItemCount = 0;
  let insertedModifierCount = 0;

  for (let idx = 0; idx < itemsToSeed.length; idx++) {
    const item = itemsToSeed[idx];
    const categoryId = categoryMap.get(item.categorySlug);
    if (!categoryId) continue;

    const [insertedItem] = await db
      .insert(schema.menuItems)
      .values({
        restaurantId,
        categoryId,
        name: item.name,
        description: item.description,
        pricePaise: item.pricePaise,
        isVeg: item.isVeg,
        prepTimeMinutes: item.prepTimeMinutes,
        imageUrl: item.imageUrl,
        sortOrder: idx + 1,
        isAvailable: true,
      })
      .returning();

    insertedItemCount++;

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        await db.insert(schema.modifiers).values({
          menuItemId: insertedItem.id,
          groupName: mod.groupName,
          name: mod.name,
          pricePaise: mod.pricePaise,
          isRequired: mod.isRequired,
        });
        insertedModifierCount++;
      }
    }
  }

  console.log(`✅ Inserted ${insertedItemCount} menu items with ${insertedModifierCount} modifiers.`);

  // 5. Insert Two Staff Users (kitchen, manager) with Hashed Passwords
  console.log("👥 Creating 2 staff users (kitchen, manager) with bcrypt hashed passwords...");

  let kitchenPassword = env.SEED_KITCHEN_PASSWORD;
  let managerPassword = env.SEED_MANAGER_PASSWORD;

  if (isDemoMode) {
    kitchenPassword = kitchenPassword || "kitchen123";
    managerPassword = managerPassword || "manager123";
  } else {
    if (!kitchenPassword) {
      kitchenPassword = crypto.randomBytes(12).toString("base64url");
      console.log(`🔑 Generated Kitchen Staff Password: ${kitchenPassword}`);
    }
    if (!managerPassword) {
      managerPassword = crypto.randomBytes(12).toString("base64url");
      console.log(`🔑 Generated Manager Staff Password: ${managerPassword}`);
    }
  }

  const kitchenPasswordHash = await bcrypt.hash(kitchenPassword, 10);
  const managerPasswordHash = await bcrypt.hash(managerPassword, 10);

  const staff = [
    {
      restaurantId,
      username: "kitchen",
      email: "kitchen@masalane.demo",
      passwordHash: kitchenPasswordHash,
      role: "kitchen" as const,
      isActive: true,
      isDemo: isDemoMode,
      sessionVersion: 1,
    },
    {
      restaurantId,
      username: "manager",
      email: "manager@masalane.demo",
      passwordHash: managerPasswordHash,
      role: "manager" as const,
      isActive: true,
      isDemo: isDemoMode,
      sessionVersion: 1,
    },
  ];

  for (const user of staff) {
    await db.insert(schema.staffUsers).values(user);
  }
  console.log(
    isDemoMode
      ? "✅ Inserted staff users: 'kitchen' (pw: kitchen123) and 'manager' (pw: manager123)."
      : "✅ Inserted staff users: 'kitchen' and 'manager'."
  );

  console.log("\n🎉 Seed completed successfully!");
  console.log(`Summary:
  - Restaurant: Masala Lane (${restaurantId})
  - Tables: 12 (with indexed unguessable qr_token)
  - Categories: 6
  - Menu Items: 30 (with veg flags, prep minutes, integer paise)
  - Modifiers: ${insertedModifierCount}
  - Staff Users: 2 (kitchen, manager)
  `);

  await pool.end();
}

seed().catch(async (error) => {
  console.error("❌ Seed failed:", error);
  await pool.end();
  process.exit(1);
});
