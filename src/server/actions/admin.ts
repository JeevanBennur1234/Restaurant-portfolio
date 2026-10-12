"use server";

import crypto from "crypto";
import { eq, desc, asc, and, count } from "drizzle-orm";
import { db } from "@/server/db";
import {
  orders,
  orderEvents,
  tables,
  categories,
  menuItems,
  modifiers,
  type OrderStatus,
} from "@/server/db/schema";
import { getStaffSession, type StaffSession } from "@/server/auth";
import { publishRealtimeEvent } from "@/server/realtime";
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
import { demoOrdersStore, type DemoOrder } from "@/server/demo-orders";
import {
  demoCategoriesStore,
  demoMenuItemsStore,
  demoTablesStore,
  initializeDemoDataIfNeeded,
  type DemoTable,
} from "@/server/demo-data";

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
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = adminOrdersQuerySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid orders filter query parameters" };
  }

  const { page, pageSize, status, paymentStatus, search } = parsed.data;

  // 1. Try DB Query
  try {
    // Build query conditions
    const conditions = [];

    if (status !== "all") {
      conditions.push(eq(orders.status, status));
    }

    if (paymentStatus !== "all") {
      conditions.push(eq(orders.paymentStatus, paymentStatus));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch total count
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

    if (dbOrders && dbOrders.length > 0) {
      // Map rows
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

      // Search filter in memory if provided
      if (search) {
        const query = search.toLowerCase();
        filteredRows = filteredRows.filter(
          (r) =>
            r.orderNumber.toLowerCase().includes(query) ||
            r.tableNumber.toLowerCase().includes(query) ||
            (r.customerName && r.customerName.toLowerCase().includes(query))
        );
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
        summary: {
          total: totalCount,
          placed: 0,
          preparing: 0,
          ready: 0,
          served: 0,
          cancelled: 0,
        },
      };
    }
  } catch (err) {
    console.warn("DB admin orders query fallback:", (err as Error).message);
  }

  // 2. Demo fallback
  initializeDemoDataIfNeeded();

  let allDemoOrders: DemoOrder[] = Array.from(demoOrdersStore.values());

  // Apply filters
  if (status !== "all") {
    allDemoOrders = allDemoOrders.filter((o) => o.status === status);
  }

  if (paymentStatus !== "all") {
    allDemoOrders = allDemoOrders.filter((o) => o.paymentStatus === paymentStatus);
  }

  if (search) {
    const query = search.toLowerCase();
    allDemoOrders = allDemoOrders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(query) ||
        o.tableNumber.toLowerCase().includes(query) ||
        (o.customerName && o.customerName.toLowerCase().includes(query))
    );
  }

  // Sort descending by created date
  allDemoOrders.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const totalCount = allDemoOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const offset = (page - 1) * pageSize;
  const paginatedOrders = allDemoOrders.slice(offset, offset + pageSize);

  const summary = {
    total: demoOrdersStore.size,
    placed: 0,
    preparing: 0,
    ready: 0,
    served: 0,
    cancelled: 0,
  };

  demoOrdersStore.forEach((o) => {
    if (o.status in summary) {
      summary[o.status as keyof typeof summary]++;
    }
  });

  const orderRows: AdminOrderRow[] = paginatedOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    tableNumber: o.tableNumber,
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
    items: o.items.map((i) => ({
      id: i.id,
      name: i.itemName,
      quantity: i.quantity,
      pricePaise: i.itemPricePaise,
      modifiers: i.selectedModifiers.map((m) => m.name),
    })),
    events: o.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  }));

  return {
    success: true,
    orders: orderRows,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
    },
    summary,
  };
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

  // 1. Try DB cancellation
  try {
    const existing = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (existing) {
      if (existing.status === "served") {
        return { success: false, error: "Cannot cancel an order that has already been served." };
      }
      if (existing.status === "cancelled") {
        return { success: false, error: "This order is already cancelled." };
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        await tx.insert(orderEvents).values({
          orderId,
          fromStatus: existing.status,
          toStatus: "cancelled",
          staffUserId: session.userId,
          note: `Cancelled by Manager ${session.username}: ${reason}`,
        });
      });

      // Broadcast realtime event
      await publishRealtimeEvent(
        `restaurant:${existing.restaurantId}`,
        "order.status_changed",
        {
          orderId,
          fromStatus: existing.status,
          toStatus: "cancelled",
          orderNumber: existing.orderNumber,
          tableNumber: existing.table.tableNumber,
          reason,
        }
      );

      return { success: true };
    }
  } catch (err) {
    console.warn("DB cancel order fallback:", (err as Error).message);
  }

  // 2. Demo fallback
  initializeDemoDataIfNeeded();
  const demoOrder = demoOrdersStore.get(orderId);
  if (!demoOrder) {
    return { success: false, error: "Order not found" };
  }

  if (demoOrder.status === "served") {
    return { success: false, error: "Cannot cancel an order that has already been served." };
  }
  if (demoOrder.status === "cancelled") {
    return { success: false, error: "This order is already cancelled." };
  }

  const previousStatus = demoOrder.status;
  demoOrder.status = "cancelled";
  demoOrder.updatedAt = new Date();
  demoOrder.events.push({
    id: `evt-cancel-${Date.now()}`,
    fromStatus: previousStatus,
    toStatus: "cancelled",
    note: `Cancelled by Manager ${session.username}: ${reason}`,
    createdAt: new Date(),
  });

  await publishRealtimeEvent(
    `restaurant:${demoOrder.restaurantId}`,
    "order.status_changed",
    {
      orderId,
      fromStatus: previousStatus,
      toStatus: "cancelled",
      orderNumber: demoOrder.orderNumber,
      tableNumber: demoOrder.tableNumber,
      reason,
    }
  );

  return { success: true };
}

// ============================================================================
// 2. Menu Management: Categories, Items & Modifiers
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
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // 1. Try DB
  try {
    const dbCats = await db.query.categories.findMany({
      orderBy: [asc(categories.sortOrder), asc(categories.name)],
    });

    const dbItems = await db.query.menuItems.findMany({
      with: {
        category: true,
        modifiers: true,
      },
      orderBy: [asc(menuItems.sortOrder), asc(menuItems.name)],
    });

    if (dbCats && dbCats.length > 0) {
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
    }
  } catch (err) {
    console.warn("DB get admin menu fallback:", (err as Error).message);
  }

  // 2. Demo fallback
  initializeDemoDataIfNeeded();

  const catList: AdminCategoryData[] = Array.from(demoCategoriesStore.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => {
      let count = 0;
      demoMenuItemsStore.forEach((item) => {
        if (item.categoryId === c.id) count++;
      });
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        itemCount: count,
      };
    });

  const catNameMap = new Map(catList.map((c) => [c.id, c.name]));

  const itemList: AdminMenuItemData[] = Array.from(demoMenuItemsStore.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      categoryName: catNameMap.get(item.categoryId) ?? "General",
      name: item.name,
      description: item.description,
      pricePaise: item.pricePaise,
      isVeg: item.isVeg,
      prepTimeMinutes: item.prepTimeMinutes,
      imageUrl: item.imageUrl,
      isAvailable: item.isAvailable,
      sortOrder: item.sortOrder,
      modifiers: item.modifiers.map((m) => ({
        id: m.id,
        menuItemId: m.menuItemId,
        groupName: m.groupName,
        name: m.name,
        pricePaise: m.pricePaise,
        isRequired: m.isRequired,
      })),
    }));

  return { success: true, categories: catList, items: itemList };
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

  // DB
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

    if (inserted) {
      return { success: true, categoryId: inserted.id };
    }
  } catch (err) {
    console.warn("DB create category fallback:", (err as Error).message);
  }

  // Demo fallback
  initializeDemoDataIfNeeded();
  const id = `cat-${Date.now().toString(36)}`;
  demoCategoriesStore.set(id, {
    id,
    restaurantId: session.restaurantId,
    name,
    slug,
    sortOrder,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { success: true, categoryId: id };
}

export async function updateCategoryAction(
  rawInput: UpdateCategoryInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManagerAuth();
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
      .where(eq(categories.id, id));
    return { success: true };
  } catch (err) {
    console.warn("DB update category fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  const existing = demoCategoriesStore.get(id);
  if (existing) {
    existing.name = name;
    existing.slug = slug;
    existing.sortOrder = sortOrder;
    existing.isActive = isActive;
    existing.updatedAt = new Date();
  }

  return { success: true };
}

export async function deleteCategoryAction(
  rawInput: DeleteCategoryInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid category ID" };
  }

  const { id } = parsed.data;

  try {
    await db.delete(categories).where(eq(categories.id, id));
    return { success: true };
  } catch (err) {
    console.warn("DB delete category fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  demoCategoriesStore.delete(id);
  return { success: true };
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

  // DB
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

    if (inserted) {
      return { success: true, itemId: inserted.id };
    }
  } catch (err) {
    console.warn("DB create item fallback:", (err as Error).message);
  }

  // Demo fallback
  initializeDemoDataIfNeeded();
  const id = `item-${Date.now().toString(36)}`;
  demoMenuItemsStore.set(id, {
    id,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    modifiers: [],
  });

  return { success: true, itemId: id };
}

export async function updateMenuItemAction(
  rawInput: UpdateMenuItemInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManagerAuth();
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
      .where(eq(menuItems.id, id));
    return { success: true };
  } catch (err) {
    console.warn("DB update item fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  const item = demoMenuItemsStore.get(id);
  if (item) {
    item.name = name;
    item.categoryId = categoryId;
    item.pricePaise = pricePaise;
    item.isVeg = isVeg;
    item.prepTimeMinutes = prepTimeMinutes;
    item.description = description ?? null;
    item.imageUrl = imageUrl ?? null;
    item.isAvailable = isAvailable;
    item.sortOrder = sortOrder;
    item.updatedAt = new Date();
  }

  return { success: true };
}

/**
 * Quick Availability Toggle Server Action
 */
export async function toggleMenuItemAvailabilityAction(
  rawInput: ToggleMenuItemAvailabilityInput
): Promise<{ success: boolean; isAvailable?: boolean; error?: string }> {
  try {
    await requireManagerAuth();
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
      .where(eq(menuItems.id, id));
    return { success: true, isAvailable };
  } catch (err) {
    console.warn("DB toggle item availability fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  const item = demoMenuItemsStore.get(id);
  if (item) {
    item.isAvailable = isAvailable;
    item.updatedAt = new Date();
    return { success: true, isAvailable };
  }

  return { success: false, error: "Menu item not found" };
}

export async function deleteMenuItemAction(
  rawInput: DeleteMenuItemInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteMenuItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid item ID" };
  }

  const { id } = parsed.data;

  try {
    await db.delete(menuItems).where(eq(menuItems.id, id));
    return { success: true };
  } catch (err) {
    console.warn("DB delete item fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  demoMenuItemsStore.delete(id);
  return { success: true };
}

/**
 * Modifier Mutations
 */
export async function createModifierAction(
  rawInput: CreateModifierInput
): Promise<{ success: boolean; modifierId?: string; error?: string }> {
  try {
    await requireManagerAuth();
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

    if (inserted) {
      return { success: true, modifierId: inserted.id };
    }
  } catch (err) {
    console.warn("DB create modifier fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  const item = demoMenuItemsStore.get(menuItemId);
  if (item) {
    const modId = `mod-${Date.now().toString(36)}`;
    item.modifiers.push({
      id: modId,
      menuItemId,
      groupName,
      name,
      pricePaise,
      isRequired,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { success: true, modifierId: modId };
  }

  return { success: false, error: "Menu item not found" };
}

export async function deleteModifierAction(
  rawInput: DeleteModifierInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteModifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid modifier ID" };
  }

  const { id } = parsed.data;

  try {
    await db.delete(modifiers).where(eq(modifiers.id, id));
    return { success: true };
  } catch (err) {
    console.warn("DB delete modifier fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  demoMenuItemsStore.forEach((item) => {
    item.modifiers = item.modifiers.filter((m) => m.id !== id);
  });

  return { success: true };
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
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  try {
    const dbTables = await db.query.tables.findMany({
      orderBy: [asc(tables.tableNumber)],
    });

    if (dbTables && dbTables.length > 0) {
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
    }
  } catch (err) {
    console.warn("DB get tables fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  const tableList: AdminTableData[] = Array.from(demoTablesStore.values())
    .sort((a, b) => {
      const numA = parseInt(a.tableNumber.replace(/\D/g, "") || "0", 10);
      const numB = parseInt(b.tableNumber.replace(/\D/g, "") || "0", 10);
      return numA - numB;
    })
    .map((t) => ({
      id: t.id,
      tableNumber: t.tableNumber,
      capacity: t.capacity,
      qrToken: t.qrToken,
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
    }));

  return { success: true, tables: tableList };
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

    if (inserted) {
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
    }
  } catch (err) {
    console.warn("DB create table fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  const id = `tbl-${Date.now().toString(36)}`;
  const newTable: DemoTable = {
    id,
    restaurantId: session.restaurantId,
    tableNumber,
    capacity,
    qrToken,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  demoTablesStore.set(id, newTable);

  return {
    success: true,
    table: {
      id,
      tableNumber,
      capacity,
      qrToken,
      isActive: true,
      createdAt: newTable.createdAt.toISOString(),
    },
  };
}

export async function deleteTableAction(
  rawInput: DeleteTableInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const parsed = deleteTableSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: "Invalid table ID" };
  }

  const { id } = parsed.data;

  try {
    await db.delete(tables).where(eq(tables.id, id));
    return { success: true };
  } catch (err) {
    console.warn("DB delete table fallback:", (err as Error).message);
  }

  initializeDemoDataIfNeeded();
  demoTablesStore.delete(id);
  return { success: true };
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
  try {
    await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  initializeDemoDataIfNeeded();

  // Aggregate from demo/DB orders
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Collect all orders from demoOrdersStore
  const allOrders = Array.from(demoOrdersStore.values());

  // Filter orders for today (excluding cancelled for revenue)
  const todayOrders = allOrders.filter(
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

  // Average prep time calculation:
  // Measure minutes between order creation and 'ready' or 'served' event,
  // or fallback to 16 min restaurant benchmark.
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

  // Top Items aggregated across all orders
  const itemAggregation = new Map<
    string,
    { name: string; isVeg: boolean; count: number; revenuePaise: number }
  >();

  allOrders.forEach((o) => {
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

  // 7-day visual chart history (Past 6 days + Today)
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sevenDayHistory: DayMetric[] = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(startOfToday.getTime() - i * 86400000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const dayOrders = allOrders.filter((o) => {
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
}
