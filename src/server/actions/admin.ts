"use server";

import crypto from "crypto";
import { eq, desc, asc, and, count } from "drizzle-orm";
import { db } from "@/server/db";
import {
  orders,
  orderItems,
  orderEvents,
  payments,
  tables,
  categories,
  menuItems,
  modifiers,
  type OrderStatus,
} from "@/server/db/schema";
import { getStaffSession, type StaffSession } from "@/server/auth";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import { rupeesToPaise } from "@/lib/currency";
import {
  adminOrdersQuerySchema,
  cancelOrderSchema,
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  toggleMenuItemAvailabilitySchema,
  deleteMenuItemSchema,
  createModifierSchema,
  deleteModifierSchema,
  createTableSchema,
  deleteTableSchema,
  type AdminOrdersQueryInput,
  type CancelOrderInput,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type DeleteCategoryInput,
  type CreateMenuItemInput,
  type UpdateMenuItemInput,
  type ToggleMenuItemAvailabilityInput,
  type DeleteMenuItemInput,
  type CreateModifierInput,
  type DeleteModifierInput,
  type CreateTableInput,
  type DeleteTableInput,
} from "@/lib/validations/admin";

/**
 * Enforces manager or admin role on all admin actions.
 */
export async function requireManagerAuth(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) {
    throw new Error("Unauthorized: Staff authentication required");
  }
  if (session.role !== "manager" && session.role !== "admin") {
    throw new Error("Forbidden: Manager access required");
  }
  return session;
}

// ============================================================================
// 1. Live Orders Table with Server-Side Pagination & Filters
// ============================================================================

export interface AdminOrderItemSummary {
  id: string;
  name: string;
  quantity: number;
  pricePaise: number;
  modifiers: string[];
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  tableNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethod: string | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  customerName: string | null;
  customerPhone: string | null;
  specialInstructions: string | null;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItemSummary[];
  events: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    createdAt: string;
  }>;
}

export interface GetAdminOrdersResult {
  success: boolean;
  orders?: AdminOrderRow[];
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary?: {
    total: number;
    placed: number;
    preparing: number;
    ready: number;
    served: number;
    cancelled: number;
  };
  error?: string;
}

export async function getAdminOrdersAction(
  rawInput: AdminOrdersQueryInput
): Promise<GetAdminOrdersResult> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = adminOrdersQuerySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid orders filter query parameters" };
  }

  const { page, pageSize, status, paymentStatus, search } = parsed.data;

  try {
    const conditions = [eq(orders.restaurantId, session.restaurantId)];

    if (status !== "all") {
      conditions.push(eq(orders.status, status));
    }

    if (paymentStatus !== "all") {
      conditions.push(eq(orders.paymentStatus, paymentStatus));
    }

    const whereClause = and(...conditions);

    // Fetch total count for pagination
    const [countResult] = await db
      .select({ val: count() })
      .from(orders)
      .where(whereClause);
    const totalCount = countResult?.val ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const offset = (page - 1) * pageSize;

    const dbOrders = await db.query.orders.findMany({
      where: whereClause,
      with: {
        table: true,
        items: true,
        events: {
          orderBy: [desc(orderEvents.createdAt)],
        },
      },
      orderBy: [desc(orders.createdAt)],
      limit: pageSize,
      offset,
    });

    let filteredRows: AdminOrderRow[] = dbOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      tableNumber: o.table.tableNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      subtotalPaise: o.subtotalPaise,
      taxPaise: o.taxPaise,
      totalPaise: o.totalPaise,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      specialInstructions: o.specialInstructions,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      items: o.items.map((i) => {
        let modNames: string[] = [];
        if (i.selectedModifiersJson) {
          try {
            const parsedMods = JSON.parse(i.selectedModifiersJson) as Array<{
              name: string;
            }>;
            modNames = parsedMods.map((m) => m.name);
          } catch {
            modNames = [];
          }
        }
        return {
          id: i.id,
          name: i.itemName,
          quantity: i.quantity,
          pricePaise: i.itemPricePaise,
          modifiers: modNames,
        };
      }),
      events: o.events.map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
      })),
    }));

    if (search) {
      const query = search.toLowerCase();
      filteredRows = filteredRows.filter(
        (r) =>
          r.orderNumber.toLowerCase().includes(query) ||
          r.tableNumber.toLowerCase().includes(query) ||
          (r.customerName && r.customerName.toLowerCase().includes(query))
      );
    }

    // Status counts summary
    const statusCounts = await db
      .select({ status: orders.status, val: count() })
      .from(orders)
      .where(eq(orders.restaurantId, session.restaurantId))
      .groupBy(orders.status);

    const summary = {
      total: 0,
      placed: 0,
      preparing: 0,
      ready: 0,
      served: 0,
      cancelled: 0,
    };

    for (const sc of statusCounts) {
      summary.total += sc.val;
      if (sc.status in summary) {
        summary[sc.status as keyof typeof summary] = sc.val;
      }
    }

    return {
      success: true,
      orders: filteredRows,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
      summary,
    };
  } catch (err) {
    console.error("Database error in getAdminOrdersAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Server Action: Cancels an order with a reason
 */
export async function cancelOrderAction(
  rawInput: CancelOrderInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = cancelOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid cancellation input",
    };
  }

  const { orderId, reason } = parsed.data;

  try {
    const existing = await db.query.orders.findFirst({
      where: and(
        eq(orders.id, orderId),
        eq(orders.restaurantId, session.restaurantId)
      ),
      with: { table: true, payments: true },
    });

    if (!existing) {
      return { success: false, error: "Order not found" };
    }

    if (existing.status === "served") {
      return { success: false, error: "Cannot cancel an order that has already been served." };
    }
    if (existing.status === "cancelled") {
      return { success: false, error: "This order is already cancelled." };
    }

    const isPaymentCompleted =
      existing.paymentStatus === "paid" ||
      existing.payments.some((p) => p.status === "completed");

    if (session.isDemo && isPaymentCompleted) {
      return {
        success: false,
        error: "Demo manager accounts cannot cancel paid orders.",
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: "cancelled",
          ...(isPaymentCompleted ? { paymentStatus: "refund_pending" } : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      if (isPaymentCompleted) {
        await tx
          .update(payments)
          .set({ status: "refund_pending", updatedAt: new Date() })
          .where(
            and(
              eq(payments.orderId, orderId),
              eq(payments.status, "completed")
            )
          );

        await tx.insert(orderEvents).values({
          orderId,
          fromStatus: existing.status,
          toStatus: "cancelled",
          staffUserId: session.userId,
          note: `Cancelled by Manager ${session.username}: ${reason}. Payment marked refund_pending`,
        });
      } else {
        await tx.insert(orderEvents).values({
          orderId,
          fromStatus: existing.status,
          toStatus: "cancelled",
          staffUserId: session.userId,
          note: `Cancelled by Manager ${session.username}: ${reason}`,
        });
      }
    });

    // Broadcast realtime event
    await publishRealtimeEvent(
      getRestaurantChannel(existing.restaurantId),
      "order.status_changed",
      {
        orderId,
        fromStatus: existing.status,
        toStatus: "cancelled",
      }
    );

    await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
      orderId,
      status: "cancelled",
    });

    return { success: true };
  } catch (err) {
    console.error("Database error in cancelOrderAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

// ============================================================================
// 2. Menu Catalog & Modifier Management CRUD
// ============================================================================

export interface AdminCategoryData {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface AdminModifierData {
  id: string;
  menuItemId: string;
  groupName: string;
  name: string;
  pricePaise: number;
  isRequired: boolean;
}

export interface AdminMenuItemData {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  pricePaise: number;
  isVeg: boolean;
  prepTimeMinutes: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  modifiers: AdminModifierData[];
}

export interface GetAdminMenuResult {
  success: boolean;
  categories?: AdminCategoryData[];
  items?: AdminMenuItemData[];
  error?: string;
}

export async function getAdminMenuAction(): Promise<GetAdminMenuResult> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  try {
    const dbCats = await db.query.categories.findMany({
      where: eq(categories.restaurantId, session.restaurantId),
      orderBy: [asc(categories.sortOrder), asc(categories.name)],
    });

    const dbItems = await db.query.menuItems.findMany({
      where: and(
        eq(menuItems.restaurantId, session.restaurantId),
        eq(menuItems.isActive, true)
      ),
      with: {
        category: true,
        modifiers: true,
      },
      orderBy: [asc(menuItems.sortOrder), asc(menuItems.name)],
    });

    const itemsCountByCat = new Map<string, number>();
    dbItems.forEach((i) => {
      itemsCountByCat.set(i.categoryId, (itemsCountByCat.get(i.categoryId) ?? 0) + 1);
    });

    const catList: AdminCategoryData[] = dbCats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      itemCount: itemsCountByCat.get(c.id) ?? 0,
    }));

    const itemList: AdminMenuItemData[] = dbItems.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      categoryName: i.category?.name ?? "General",
      name: i.name,
      description: i.description,
      pricePaise: i.pricePaise,
      isVeg: i.isVeg,
      prepTimeMinutes: i.prepTimeMinutes,
      imageUrl: i.imageUrl,
      isAvailable: i.isAvailable,
      sortOrder: i.sortOrder,
      modifiers: i.modifiers.map((m) => ({
        id: m.id,
        menuItemId: m.menuItemId,
        groupName: m.groupName,
        name: m.name,
        pricePaise: m.pricePaise,
        isRequired: m.isRequired,
      })),
    }));

    return { success: true, categories: catList, items: itemList };
  } catch (err) {
    console.error("Database error in getAdminMenuAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Category Mutations
 */
export async function createCategoryAction(
  rawInput: CreateCategoryInput
): Promise<{ success: boolean; categoryId?: string; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = createCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid category data" };
  }

  const { name, slug, sortOrder } = parsed.data;

  try {
    const [inserted] = await db
      .insert(categories)
      .values({
        restaurantId: session.restaurantId,
        name,
        slug,
        sortOrder,
        isActive: true,
      })
      .returning({ id: categories.id });

    if (!inserted) {
      return { success: false, error: "Failed to create category" };
    }

    return { success: true, categoryId: inserted.id };
  } catch (err) {
    console.error("Database error in createCategoryAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

export async function updateCategoryAction(
  rawInput: UpdateCategoryInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = updateCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid category data" };
  }

  const { id, name, slug, sortOrder, isActive } = parsed.data;

  try {
    await db
      .update(categories)
      .set({ name, slug, sortOrder, isActive, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.restaurantId, session.restaurantId)));
    return { success: true };
  } catch (err) {
    console.error("Database error in updateCategoryAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

export async function deleteCategoryAction(
  rawInput: DeleteCategoryInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid category ID" };
  }

  if (session.isDemo) {
    return { success: false, error: "Demo manager accounts cannot delete categories." };
  }

  const { id } = parsed.data;

  try {
    const hasItems = await db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.categoryId, id),
        eq(menuItems.restaurantId, session.restaurantId)
      ),
    });

    if (hasItems) {
      return {
        success: false,
        error: "Cannot delete category containing menu items. Please reassign or delete the menu items first.",
      };
    }

    await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.restaurantId, session.restaurantId)));
    return { success: true };
  } catch (err) {
    console.error("Database error in deleteCategoryAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Menu Item Mutations
 */
export async function createMenuItemAction(
  rawInput: CreateMenuItemInput
): Promise<{ success: boolean; itemId?: string; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = createMenuItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid item data" };
  }

  const {
    name,
    categoryId,
    priceRupees,
    isVeg,
    prepTimeMinutes,
    description,
    imageUrl,
    isAvailable,
    sortOrder,
  } = parsed.data;

  // Server-side source of truth: strictly compute integer paise
  const pricePaise = rupeesToPaise(priceRupees);

  try {
    const [inserted] = await db
      .insert(menuItems)
      .values({
        restaurantId: session.restaurantId,
        categoryId,
        name,
        description: description ?? null,
        pricePaise,
        isVeg,
        prepTimeMinutes,
        imageUrl: imageUrl ?? null,
        isAvailable,
        sortOrder,
      })
      .returning({ id: menuItems.id });

    if (!inserted) {
      return { success: false, error: "Failed to create menu item" };
    }

    return { success: true, itemId: inserted.id };
  } catch (err) {
    console.error("Database error in createMenuItemAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

export async function updateMenuItemAction(
  rawInput: UpdateMenuItemInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = updateMenuItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid item data" };
  }

  const {
    id,
    name,
    categoryId,
    priceRupees,
    isVeg,
    prepTimeMinutes,
    description,
    imageUrl,
    isAvailable,
    sortOrder,
  } = parsed.data;

  const pricePaise = rupeesToPaise(priceRupees);

  try {
    await db
      .update(menuItems)
      .set({
        name,
        categoryId,
        pricePaise,
        isVeg,
        prepTimeMinutes,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
        isAvailable,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, session.restaurantId)));
    return { success: true };
  } catch (err) {
    console.error("Database error in updateMenuItemAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Quick Availability Toggle Server Action
 */
export async function toggleMenuItemAvailabilityAction(
  rawInput: ToggleMenuItemAvailabilityInput
): Promise<{ success: boolean; isAvailable?: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = toggleMenuItemAvailabilitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid availability toggle parameters" };
  }

  const { id, isAvailable } = parsed.data;

  try {
    await db
      .update(menuItems)
      .set({ isAvailable, updatedAt: new Date() })
      .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, session.restaurantId)));
    return { success: true, isAvailable };
  } catch (err) {
    console.error("Database error in toggleMenuItemAvailabilityAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

export async function deleteMenuItemAction(
  rawInput: DeleteMenuItemInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteMenuItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid item ID" };
  }

  if (session.isDemo) {
    return { success: false, error: "Demo manager accounts cannot delete menu items." };
  }

  const { id } = parsed.data;

  try {
    const appearsInOrders = await db.query.orderItems.findFirst({
      where: eq(orderItems.menuItemId, id),
    });

    if (appearsInOrders) {
      // Soft-delete to preserve order history
      await db
        .update(menuItems)
        .set({ isActive: false, isAvailable: false, updatedAt: new Date() })
        .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, session.restaurantId)));
    } else {
      // Hard delete if never ordered
      await db
        .delete(menuItems)
        .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, session.restaurantId)));
    }

    return { success: true };
  } catch (err) {
    console.error("Database error in deleteMenuItemAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

/**
 * Modifier Mutations
 */
export async function createModifierAction(
  rawInput: CreateModifierInput
): Promise<{ success: boolean; modifierId?: string; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = createModifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid modifier data" };
  }

  const { menuItemId, groupName, name, priceRupees, isRequired } = parsed.data;
  const pricePaise = rupeesToPaise(priceRupees);

  try {
    const item = await db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.id, menuItemId),
        eq(menuItems.restaurantId, session.restaurantId)
      ),
    });
    if (!item) {
      return { success: false, error: "Menu item not found" };
    }

    const [inserted] = await db
      .insert(modifiers)
      .values({
        menuItemId,
        groupName,
        name,
        pricePaise,
        isRequired,
      })
      .returning({ id: modifiers.id });

    if (!inserted) {
      return { success: false, error: "Failed to create modifier" };
    }

    return { success: true, modifierId: inserted.id };
  } catch (err) {
    console.error("Database error in createModifierAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

export async function deleteModifierAction(
  rawInput: DeleteModifierInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteModifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid modifier ID" };
  }

  const { id } = parsed.data;

  try {
    const mod = await db.query.modifiers.findFirst({
      where: eq(modifiers.id, id),
      with: { menuItem: true },
    });
    if (!mod || mod.menuItem.restaurantId !== session.restaurantId) {
      return { success: false, error: "Modifier not found" };
    }

    await db.delete(modifiers).where(eq(modifiers.id, id));
    return { success: true };
  } catch (err) {
    console.error("Database error in deleteModifierAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

// ============================================================================
// 3. Tables Management: Add, Remove & List
// ============================================================================

export interface AdminTableData {
  id: string;
  tableNumber: string;
  capacity: number;
  qrToken: string;
  isActive: boolean;
  createdAt: string;
}

export async function getAdminTablesAction(): Promise<{
  success: boolean;
  tables?: AdminTableData[];
  error?: string;
}> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  try {
    const dbTables = await db.query.tables.findMany({
      where: and(
        eq(tables.restaurantId, session.restaurantId),
        eq(tables.isActive, true)
      ),
      orderBy: [asc(tables.tableNumber)],
    });

    return {
      success: true,
      tables: dbTables.map((t) => ({
        id: t.id,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        qrToken: t.qrToken,
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("Database error in getAdminTablesAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

export async function createTableAction(
  rawInput: CreateTableInput
): Promise<{ success: boolean; table?: AdminTableData; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = createTableSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid table parameters" };
  }

  const { tableNumber, capacity } = parsed.data;
  // Generate cryptographically unguessable token
  const qrToken = `ml-tbl-${crypto.randomBytes(6).toString("hex")}`;

  try {
    const [inserted] = await db
      .insert(tables)
      .values({
        restaurantId: session.restaurantId,
        tableNumber,
        capacity,
        qrToken,
        isActive: true,
      })
      .returning();

    if (!inserted) {
      return { success: false, error: "Failed to create table" };
    }

    return {
      success: true,
      table: {
        id: inserted.id,
        tableNumber: inserted.tableNumber,
        capacity: inserted.capacity,
        qrToken: inserted.qrToken,
        isActive: inserted.isActive,
        createdAt: inserted.createdAt.toISOString(),
      },
    };
  } catch (err) {
    console.error("Database error in createTableAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

export async function deleteTableAction(
  rawInput: DeleteTableInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteTableSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid table ID" };
  }

  if (session.isDemo) {
    return { success: false, error: "Demo manager accounts cannot delete tables." };
  }

  const { id } = parsed.data;

  try {
    await db
      .update(tables)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(tables.id, id), eq(tables.restaurantId, session.restaurantId)));
    return { success: true };
  } catch (err) {
    console.error("Database error in deleteTableAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

// ============================================================================
// 4. Reports: Today's Revenue, Order Count, Avg Ticket, Prep Time, Top Items, 7-Day Chart
// ============================================================================

export interface TopSellingItem {
  id: string;
  name: string;
  isVeg: boolean;
  totalQuantity: number;
  totalRevenuePaise: number;
}

export interface DayMetric {
  date: string;
  dayLabel: string;
  revenuePaise: number;
  orderCount: number;
}

export interface AdminReportsData {
  todayRevenuePaise: number;
  todayOrderCount: number;
  todayAvgTicketPaise: number;
  avgPrepTimeMinutes: number;
  topItems: TopSellingItem[];
  sevenDayHistory: DayMetric[];
}

export async function getAdminReportsAction(): Promise<{
  success: boolean;
  reports?: AdminReportsData;
  error?: string;
}> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  try {
    const allDbOrders = await db.query.orders.findMany({
      where: eq(orders.restaurantId, session.restaurantId),
      with: {
        items: true,
        events: true,
      },
      orderBy: [desc(orders.createdAt)],
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayOrders = allDbOrders.filter(
      (o) => new Date(o.createdAt).getTime() >= startOfToday.getTime()
    );

    const todayCompletedOrders = todayOrders.filter(
      (o) => o.status !== "cancelled" && (o.paymentStatus === "paid" || o.paymentStatus === "counter")
    );

    const todayRevenuePaise = todayCompletedOrders.reduce(
      (acc, o) => acc + o.totalPaise,
      0
    );
    const todayOrderCount = todayOrders.length;
    const todayAvgTicketPaise =
      todayCompletedOrders.length > 0
        ? Math.round(todayRevenuePaise / todayCompletedOrders.length)
        : 0;

    let totalPrepTimeMinutes = 0;
    let prepOrderCount = 0;

    todayOrders.forEach((o) => {
      const readyEvent = o.events.find(
        (e) => e.toStatus === "ready" || e.toStatus === "served"
      );
      if (readyEvent) {
        const diffMs =
          new Date(readyEvent.createdAt).getTime() - new Date(o.createdAt).getTime();
        const mins = Math.max(1, Math.round(diffMs / 60000));
        totalPrepTimeMinutes += mins;
        prepOrderCount++;
      }
    });

    const avgPrepTimeMinutes =
      prepOrderCount > 0 ? Math.round(totalPrepTimeMinutes / prepOrderCount) : 15;

    // Top items across orders
    const itemAggregation = new Map<
      string,
      { name: string; isVeg: boolean; count: number; revenuePaise: number }
    >();

    allDbOrders.forEach((o) => {
      if (o.status !== "cancelled") {
        o.items.forEach((item) => {
          const key = item.itemName;
          const current = itemAggregation.get(key) ?? {
            name: item.itemName,
            isVeg: true,
            count: 0,
            revenuePaise: 0,
          };
          current.count += item.quantity;
          current.revenuePaise += item.totalPaise;
          itemAggregation.set(key, current);
        });
      }
    });

    const topItems: TopSellingItem[] = Array.from(itemAggregation.entries())
      .map(([, val], index) => ({
        id: `top-${index + 1}`,
        name: val.name,
        isVeg: !val.name.toLowerCase().includes("chicken") &&
          !val.name.toLowerCase().includes("murgh") &&
          !val.name.toLowerCase().includes("gosht") &&
          !val.name.toLowerCase().includes("fish") &&
          !val.name.toLowerCase().includes("lamb"),
        totalQuantity: val.count,
        totalRevenuePaise: val.revenuePaise,
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);

    // 7-day history (past 6 days + today)
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const sevenDayHistory: DayMetric[] = [];

    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday.getTime() - i * 86400000);
      const dayEnd = new Date(dayStart.getTime() + 86400000);

      const dayOrders = allDbOrders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });

      const dayRevenue = dayOrders
        .filter(
          (o) =>
            o.status !== "cancelled" &&
            (o.paymentStatus === "paid" || o.paymentStatus === "counter")
        )
        .reduce((sum, o) => sum + o.totalPaise, 0);

      const dateStr = dayStart.toISOString().split("T")[0] ?? "";
      const dayLabel = i === 0 ? "Today" : (dayNames[dayStart.getDay()] ?? "");

      sevenDayHistory.push({
        date: dateStr,
        dayLabel,
        revenuePaise: dayRevenue,
        orderCount: dayOrders.length,
      });
    }

    return {
      success: true,
      reports: {
        todayRevenuePaise,
        todayOrderCount,
        todayAvgTicketPaise,
        avgPrepTimeMinutes,
        topItems,
        sevenDayHistory,
      },
    };
  } catch (err) {
    console.error("Database error in getAdminReportsAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}
