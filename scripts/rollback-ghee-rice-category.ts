import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { poolConfig } from "../src/server/db/pool-config";

/**
 * Rollback script to revert Ghee Rice back to "Signature Curries"
 * (ID: '0b1c23be-49de-4afc-b27a-479dcebb1503') if needed.
 */
export async function rollbackGheeRiceCategory(): Promise<{
  success: boolean;
  reverted: boolean;
  message: string;
}> {
  const pool = new Pool(poolConfig);
  const db = drizzle(pool, { schema });

  try {
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.slug, "masala-lane"),
    });

    if (!restaurant) {
      await pool.end();
      return { success: false, reverted: false, message: "Restaurant 'masala-lane' not found." };
    }

    const originalCategory = await db.query.categories.findFirst({
      where: and(
        eq(schema.categories.restaurantId, restaurant.id),
        eq(schema.categories.slug, "signature-curries")
      ),
    });

    if (!originalCategory) {
      await pool.end();
      return { success: false, reverted: false, message: "Category 'signature-curries' not found." };
    }

    const gheeRiceItem = await db.query.menuItems.findFirst({
      where: and(
        eq(schema.menuItems.restaurantId, restaurant.id),
        eq(schema.menuItems.id, "84b8ffaa-e102-49be-b828-1d1a189e3854")
      ),
    });

    if (!gheeRiceItem) {
      await pool.end();
      return { success: false, reverted: false, message: "Ghee Rice record not found." };
    }

    if (gheeRiceItem.categoryId === originalCategory.id) {
      await pool.end();
      return {
        success: true,
        reverted: false,
        message: `Ghee Rice is already assigned to '${originalCategory.name}' (${originalCategory.id}).`,
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.menuItems)
        .set({
          categoryId: originalCategory.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.menuItems.id, gheeRiceItem.id));
    });

    await pool.end();
    return {
      success: true,
      reverted: true,
      message: `Successfully rolled back Ghee Rice to category '${originalCategory.name}' (${originalCategory.id}).`,
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function main() {
  console.log("⏪ Running rollback for Ghee Rice category...");
  const result = await rollbackGheeRiceCategory();
  console.log(`[Result] reverted=${result.reverted}: ${result.message}`);
}

if (require.main === module || process.argv[1]?.includes("rollback-ghee-rice-category")) {
  main().catch((err) => {
    console.error("Rollback failed:", err);
    process.exit(1);
  });
}
