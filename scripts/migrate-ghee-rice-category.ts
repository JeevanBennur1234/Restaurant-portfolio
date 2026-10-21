import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, or, ilike } from "drizzle-orm";
import * as schema from "../src/server/db/schema";
import { poolConfig } from "../src/server/db/pool-config";

/**
 * Idempotent migration script to assign Ghee Rice to the correct category:
 * "Dum Biryanis & Pulao" (slug: "dum-biryanis-pulao").
 */
export async function migrateGheeRiceCategory(options: { dryRun?: boolean } = {}): Promise<{
  success: boolean;
  updated: boolean;
  dryRun?: boolean;
  item?: { id: string; name: string; oldCategoryId: string; newCategoryId: string };
  message: string;
}> {
  const pool = new Pool(poolConfig);
  const db = drizzle(pool, { schema });
  const isDryRun = Boolean(options.dryRun);

  try {
    // 1. Locate the Masala Lane restaurant
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.slug, "masala-lane"),
    });

    if (!restaurant) {
      await pool.end();
      return {
        success: false,
        updated: false,
        message: "Restaurant 'masala-lane' not found in database.",
      };
    }

    // 2. Locate target category: "Dum Biryanis & Pulao" (slug: "dum-biryanis-pulao")
    const targetCategory = await db.query.categories.findFirst({
      where: and(
        eq(schema.categories.restaurantId, restaurant.id),
        eq(schema.categories.slug, "dum-biryanis-pulao")
      ),
    });

    if (!targetCategory) {
      await pool.end();
      return {
        success: false,
        updated: false,
        message: "Category 'dum-biryanis-pulao' not found for restaurant.",
      };
    }

    // 3. Locate Ghee Rice item
    const gheeRiceItem = await db.query.menuItems.findFirst({
      where: and(
        eq(schema.menuItems.restaurantId, restaurant.id),
        or(
          ilike(schema.menuItems.name, "ghee-rice"),
          ilike(schema.menuItems.name, "ghee rice"),
          eq(schema.menuItems.id, "84b8ffaa-e102-49be-b828-1d1a189e3854")
        )
      ),
    });

    if (!gheeRiceItem) {
      await pool.end();
      return {
        success: true,
        updated: false,
        message: "Ghee Rice menu item not found in database; nothing to update.",
      };
    }

    // 4. Check if already in target category
    if (gheeRiceItem.categoryId === targetCategory.id) {
      await pool.end();
      return {
        success: true,
        updated: false,
        item: {
          id: gheeRiceItem.id,
          name: gheeRiceItem.name,
          oldCategoryId: gheeRiceItem.categoryId,
          newCategoryId: targetCategory.id,
        },
        message: `Ghee Rice (${gheeRiceItem.name}) is already assigned to '${targetCategory.name}' (${targetCategory.id}).`,
      };
    }

    // 5. Update category safely and idempotently
    const oldCategoryId = gheeRiceItem.categoryId;
    if (isDryRun) {
      await pool.end();
      return {
        success: true,
        updated: false,
        dryRun: true,
        item: {
          id: gheeRiceItem.id,
          name: gheeRiceItem.name,
          oldCategoryId,
          newCategoryId: targetCategory.id,
        },
        message: `[DRY-RUN] Would re-assign '${gheeRiceItem.name}' (${gheeRiceItem.id}) from category '${oldCategoryId}' to '${targetCategory.name}' (${targetCategory.id}).`,
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.menuItems)
        .set({
          categoryId: targetCategory.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.menuItems.id, gheeRiceItem.id));
    });

    await pool.end();
    return {
      success: true,
      updated: true,
      item: {
        id: gheeRiceItem.id,
        name: gheeRiceItem.name,
        oldCategoryId,
        newCategoryId: targetCategory.id,
      },
      message: `Successfully re-assigned '${gheeRiceItem.name}' from category '${oldCategoryId}' to '${targetCategory.name}' (${targetCategory.id}).`,
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`🍚 Running ${isDryRun ? "[DRY-RUN] " : ""}migration for Ghee Rice category...`);
  const result = await migrateGheeRiceCategory({ dryRun: isDryRun });
  console.log(`[Result] updated=${result.updated}: ${result.message}`);
}

if (require.main === module || process.argv[1]?.includes("migrate-ghee-rice-category")) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
