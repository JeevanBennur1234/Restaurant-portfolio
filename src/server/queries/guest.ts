import { eq, asc, and } from "drizzle-orm";
import { db } from "@/server/db";
import {
  tables,
  restaurants,
  categories,
  menuItems,
} from "@/server/db/schema";
import { tokenParamSchema } from "@/lib/validations/guest";

export interface GuestModifier {
  id: string;
  groupName: string;
  name: string;
  pricePaise: number;
  isRequired: boolean;
}

export interface GuestMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  pricePaise: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  modifiers: GuestModifier[];
}

export interface GuestCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface GuestTable {
  id: string;
  tableNumber: string;
  capacity: number;
  qrToken: string;
}

export interface GuestRestaurant {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

export interface GuestMenuData {
  restaurant: GuestRestaurant;
  table: GuestTable;
  categories: GuestCategory[];
  items: GuestMenuItem[];
}

export type GuestQueryResult =
  | { success: true; data: GuestMenuData }
  | {
      success: false;
      error:
        | "INVALID_TOKEN"
        | "NOT_FOUND"
        | "INACTIVE_TABLE"
        | "Service temporarily unavailable";
    };

/**
 * Resolves a QR token to table and menu data exclusively from PostgreSQL.
 */
export async function getGuestTableAndMenu(
  rawToken: string
): Promise<GuestQueryResult> {
  const parsed = tokenParamSchema.safeParse(rawToken);
  if (!parsed.success) {
    return { success: false, error: "INVALID_TOKEN" };
  }
  const token = parsed.data;

  try {
    const tableRecord = await db.query.tables.findFirst({
      where: eq(tables.qrToken, token),
    });

    if (!tableRecord) {
      return { success: false, error: "NOT_FOUND" };
    }

    if (!tableRecord.isActive) {
      return { success: false, error: "INACTIVE_TABLE" };
    }

    const restaurantRecord = await db.query.restaurants.findFirst({
      where: eq(restaurants.id, tableRecord.restaurantId),
    });

    if (!restaurantRecord || !restaurantRecord.isActive) {
      return { success: false, error: "NOT_FOUND" };
    }

    const categoryRecords = await db.query.categories.findMany({
      where: and(
        eq(categories.restaurantId, restaurantRecord.id),
        eq(categories.isActive, true)
      ),
      orderBy: [asc(categories.sortOrder)],
    });

    const menuItemRecords = await db.query.menuItems.findMany({
      where: and(
        eq(menuItems.restaurantId, restaurantRecord.id),
        eq(menuItems.isActive, true)
      ),
      orderBy: [asc(menuItems.sortOrder)],
    });

    const modifierRecords = await db.query.modifiers.findMany();
    const modifiersByItemId = new Map<string, GuestModifier[]>();
    for (const m of modifierRecords) {
      const list = modifiersByItemId.get(m.menuItemId) ?? [];
      list.push({
        id: m.id,
        groupName: m.groupName,
        name: m.name,
        pricePaise: m.pricePaise,
        isRequired: m.isRequired,
      });
      modifiersByItemId.set(m.menuItemId, list);
    }

    const formattedItems: GuestMenuItem[] = menuItemRecords.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      pricePaise: item.pricePaise,
      isVeg: item.isVeg,
      prepTimeMinutes: item.prepTimeMinutes,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      sortOrder: item.sortOrder,
      modifiers: modifiersByItemId.get(item.id) ?? [],
    }));

    return {
      success: true,
      data: {
        restaurant: {
          id: restaurantRecord.id,
          name: restaurantRecord.name,
          slug: restaurantRecord.slug,
          currency: restaurantRecord.currency,
        },
        table: {
          id: tableRecord.id,
          tableNumber: tableRecord.tableNumber,
          capacity: tableRecord.capacity,
          qrToken: tableRecord.qrToken,
        },
        categories: categoryRecords.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          sortOrder: c.sortOrder,
        })),
        items: formattedItems,
      },
    };
  } catch (error) {
    console.error("Database query failed in getGuestTableAndMenu:", error);
    return { success: false, error: "Service temporarily unavailable" };
  }
}
