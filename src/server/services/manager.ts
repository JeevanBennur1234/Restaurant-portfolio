import crypto from "crypto";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import {
  orders,
  orderItems,
  orderEvents,
  payments,
  tables,
  categories,
  menuItems,
  modifiers,
  diningSessions,
  type OrderStatus,
} from "@/server/db/schema";
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
  updateModifierSchema,
  deleteModifierSchema,
  createTableSchema,
  updateTableSchema,
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
  type UpdateModifierInput,
  type DeleteModifierInput,
  type CreateTableInput,
  type UpdateTableInput,
  type DeleteTableInput,
} from "@/lib/validations/admin";
import { ok, fail, type ServiceResult, type Ctx } from "./result";

function checkManagerActor(ctx: Ctx) {
  if (!ctx.actor) {
    return fail("UNAUTHENTICATED", "Unauthorized: Staff authentication required", 401);
  }
  if (ctx.actor.role !== "manager" && ctx.actor.role !== "admin") {
    return fail("FORBIDDEN", "Forbidden: Manager access required", 403);
  }
  return null;
}

export interface AdminOrderItemSummary {
  id: string;
  name: string;
  quantity: number;
  pricePaise: number;
  modifiers: string[];
}

export interface AdminOrderTabSummary {
  id: string;
  status: string;
  paymentStatus: string;
  roundCount: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  amountDuePaise: number;
  paidPaise: number;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  tableNumber: string;
  roundNumber?: number;
  diningSessionId?: string | null;
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
  tabSummary?: AdminOrderTabSummary | null;
  tab?: AdminOrderTabSummary | null;
}

export interface AdminOrderGroup {
  id: string;
  type: "tab" | "single";
  tableNumber: string;
  diningSessionId?: string | null;
  tabSummary?: AdminOrderTabSummary | null;
  orders: AdminOrderRow[];
  createdAt: string;
  updatedAt: string;
}

export interface GetAdminOrdersData {
  orders: AdminOrderRow[];
  groups?: AdminOrderGroup[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: {
    total: number;
    placed: number;
    preparing: number;
    ready: number;
    served: number;
    cancelled: number;
  };
}

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

export interface GetAdminMenuData {
  categories: AdminCategoryData[];
  items: AdminMenuItemData[];
}

export interface AdminTableData {
  id: string;
  tableNumber: string;
  capacity: number;
  qrToken: string;
  isActive: boolean;
  createdAt: string;
  activeTab?: {
    id: string;
    status: string;
    paymentStatus: string;
    roundCount: number;
    totalPaise: number;
  } | null;
}

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

export async function getAdminOrders(
  ctx: Ctx,
  rawInput: AdminOrdersQueryInput = {}
): Promise<ServiceResult<GetAdminOrdersData>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = adminOrdersQuerySchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid orders filter query parameters", 400);
  }

  const { page, pageSize, status, paymentStatus, search } = parsed.data;

  try {
    const toIso = (d: unknown) => {
      if (d instanceof Date) return d.toISOString();
      if (typeof d === "string") return d;
      return new Date().toISOString();
    };

    // Fetch all restaurant orders with tables, items, events, and dining sessions
    const dbOrders = await ctx.db.query.orders.findMany({
      where: eq(orders.restaurantId, ctx.actor!.restaurantId),
      with: {
        table: true,
        items: true,
        events: {
          orderBy: [desc(orderEvents.createdAt)],
        },
        diningSession: true,
      },
      orderBy: [desc(orders.createdAt)],
    });

    const formattedOrders: AdminOrderRow[] = dbOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      tableNumber: o.table?.tableNumber ?? "1",
      roundNumber: o.roundNumber ?? 1,
      diningSessionId: o.diningSessionId ?? null,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod ?? null,
      subtotalPaise: o.subtotalPaise ?? 0,
      taxPaise: o.taxPaise ?? 0,
      totalPaise: o.totalPaise ?? 0,
      customerName: o.customerName ?? null,
      customerPhone: o.customerPhone ?? null,
      specialInstructions: o.specialInstructions ?? null,
      createdAt: toIso(o.createdAt),
      updatedAt: toIso(o.updatedAt),
      items: (o.items ?? []).map((i) => {
        let modNames: string[] = [];
        if (i.selectedModifiersJson) {
          try {
            const parsedMods = JSON.parse(i.selectedModifiersJson) as Array<{ name: string }>;
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
      events: (o.events ?? []).map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        note: e.note ?? null,
        createdAt: toIso(e.createdAt),
      })),
    }));

    // Group orders by dining session (for tabs) and standalone orders
    const tabOrdersMap = new Map<string, AdminOrderRow[]>();
    const standaloneOrders: AdminOrderRow[] = [];

    for (const order of formattedOrders) {
      if (order.diningSessionId) {
        const list = tabOrdersMap.get(order.diningSessionId) || [];
        list.push(order);
        tabOrdersMap.set(order.diningSessionId, list);
      } else {
        standaloneOrders.push(order);
      }
    }

    const groups: AdminOrderGroup[] = [];

    for (const [sessionId, rounds] of tabOrdersMap.entries()) {
      rounds.sort((a, b) => (a.roundNumber ?? 1) - (b.roundNumber ?? 1));

      const activeRounds = rounds.filter((r) => r.status !== "cancelled");
      const roundCount = activeRounds.length;
      const subtotalPaise = activeRounds.reduce((acc, r) => acc + (r.subtotalPaise || 0), 0);
      const taxPaise = activeRounds.reduce((acc, r) => acc + (r.taxPaise || 0), 0);
      const totalPaise = activeRounds.reduce((acc, r) => acc + (r.totalPaise || 0), 0);
      const paidPaise = activeRounds
        .filter((r) => r.paymentStatus === "paid")
        .reduce((acc, r) => acc + (r.totalPaise || 0), 0);
      const amountDuePaise = Math.max(0, totalPaise - paidPaise);

      const dbSession = dbOrders.find((o) => o.diningSessionId === sessionId)?.diningSession;
      let status = dbSession?.status ?? "active";
      if (!dbSession) {
        if (rounds.some((r) => r.paymentStatus === "bill_requested")) {
          status = "bill_requested";
        } else if (
          activeRounds.length > 0 &&
          activeRounds.every((r) => r.status === "served") &&
          amountDuePaise === 0
        ) {
          status = "closed";
        } else {
          status = "active";
        }
      }

      let paymentStatus = dbSession?.paymentStatus ?? "open";
      if (!dbSession) {
        if (amountDuePaise === 0 && activeRounds.length > 0) {
          paymentStatus = "paid";
        } else if (status === "bill_requested") {
          paymentStatus = "bill_requested";
        } else {
          paymentStatus = "open";
        }
      }

      const tabSummary: AdminOrderTabSummary = {
        id: sessionId,
        status,
        paymentStatus,
        roundCount,
        subtotalPaise,
        taxPaise,
        totalPaise,
        amountDuePaise,
        paidPaise,
      };

      for (const r of rounds) {
        r.tabSummary = tabSummary;
        r.tab = tabSummary;
      }

      const latestRound = rounds[rounds.length - 1];
      groups.push({
        id: sessionId,
        type: "tab",
        tableNumber: rounds[0]?.tableNumber ?? "1",
        diningSessionId: sessionId,
        tabSummary,
        orders: rounds,
        createdAt: latestRound?.createdAt ?? new Date().toISOString(),
        updatedAt: latestRound?.updatedAt ?? new Date().toISOString(),
      });
    }

    for (const single of standaloneOrders) {
      groups.push({
        id: single.id,
        type: "single",
        tableNumber: single.tableNumber,
        diningSessionId: null,
        tabSummary: null,
        orders: [single],
        createdAt: single.createdAt,
        updatedAt: single.updatedAt,
      });
    }

    // Sort groups: bill_requested first, then newest activity first
    groups.sort((a, b) => {
      const aBillReq =
        a.tabSummary?.status === "bill_requested" ||
        a.orders.some((o) => o.paymentStatus === "bill_requested");
      const bBillReq =
        b.tabSummary?.status === "bill_requested" ||
        b.orders.some((o) => o.paymentStatus === "bill_requested");

      if (aBillReq && !bBillReq) return -1;
      if (!aBillReq && bBillReq) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Apply filters matching on ANY round of the group
    let filteredGroups = groups;

    if (status !== "all") {
      filteredGroups = filteredGroups.filter((g) =>
        g.orders.some((o) => o.status === status)
      );
    }

    if (paymentStatus !== "all") {
      filteredGroups = filteredGroups.filter((g) => {
        if (g.type === "tab" && g.tabSummary) {
          if (paymentStatus === "paid") {
            return (
              g.tabSummary.paymentStatus === "paid" ||
              g.orders.every((o) => o.paymentStatus === "paid")
            );
          }
          if (paymentStatus === "counter") {
            return (
              g.tabSummary.paymentStatus === "open" ||
              g.tabSummary.paymentStatus === "bill_requested" ||
              g.orders.some((o) => o.paymentStatus === "counter")
            );
          }
          return g.orders.some((o) => o.paymentStatus === paymentStatus);
        }
        return g.orders.some((o) => o.paymentStatus === paymentStatus);
      });
    }

    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      filteredGroups = filteredGroups.filter(
        (g) =>
          g.tableNumber.toLowerCase().includes(q) ||
          g.orders.some(
            (o) =>
              o.orderNumber.toLowerCase().includes(q) ||
              (o.customerName && o.customerName.toLowerCase().includes(q)) ||
              o.items.some((i) => i.name.toLowerCase().includes(q))
          )
      );
    }

    // Paginate by groups, not rounds
    const totalCount = filteredGroups.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const offset = (page - 1) * pageSize;
    const pagedGroups = filteredGroups.slice(offset, offset + pageSize);
    const pagedOrders = pagedGroups.flatMap((g) => g.orders);

    const summary = {
      total: formattedOrders.length,
      placed: formattedOrders.filter((o) => o.status === "placed").length,
      preparing: formattedOrders.filter((o) => o.status === "preparing").length,
      ready: formattedOrders.filter((o) => o.status === "ready").length,
      served: formattedOrders.filter((o) => o.status === "served").length,
      cancelled: formattedOrders.filter((o) => o.status === "cancelled").length,
    };

    return ok({
      orders: pagedOrders,
      groups: pagedGroups,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
      summary,
    });
  } catch (err) {
    console.error("Database error in getAdminOrders service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function cancelOrder(
  ctx: Ctx,
  rawInput: CancelOrderInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = cancelOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid cancellation input",
      400
    );
  }

  const { orderId, reason } = parsed.data;

  try {
    const existing = await ctx.db.query.orders.findFirst({
      where: and(
        eq(orders.id, orderId),
        eq(orders.restaurantId, ctx.actor!.restaurantId)
      ),
      with: { table: true, payments: true },
    });

    if (!existing) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    if (existing.status === "served") {
      return fail("CONFLICT", "Cannot cancel an order that has already been served.", 400);
    }
    if (existing.status === "cancelled") {
      return fail("CONFLICT", "This order is already cancelled.", 400);
    }

    const isPaymentCompleted =
      existing.paymentStatus === "paid" ||
      existing.payments.some((p) => p.status === "completed");

    if (ctx.actor!.isDemo && isPaymentCompleted) {
      return fail("FORBIDDEN", "Demo manager accounts cannot cancel paid orders.", 403);
    }

    await ctx.db.transaction(async (tx) => {
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
          staffUserId: ctx.actor!.userId,
          note: `Cancelled by Manager ${ctx.actor!.username ?? ctx.actor!.role}: ${reason}. Payment marked refund_pending`,
        });
      } else {
        await tx.insert(orderEvents).values({
          orderId,
          fromStatus: existing.status,
          toStatus: "cancelled",
          staffUserId: ctx.actor!.userId,
          note: `Cancelled by Manager ${ctx.actor!.username ?? ctx.actor!.role}: ${reason}`,
        });
      }

      // Maintain invariant: tab total must always equal the sum of its non-cancelled rounds
      if (existing.diningSessionId && tx.query?.orders?.findMany) {
        const remainingSessionOrders = await tx.query.orders.findMany({
          where: and(
            eq(orders.diningSessionId, existing.diningSessionId),
            sql`${orders.status} != 'cancelled' AND ${orders.id} != ${orderId}`
          ),
        });
        const newSubtotal = remainingSessionOrders.reduce((sum, o) => sum + (o.subtotalPaise ?? 0), 0);
        const newTax = remainingSessionOrders.reduce((sum, o) => sum + (o.taxPaise ?? 0), 0);
        const newTotal = remainingSessionOrders.reduce((sum, o) => sum + (o.totalPaise ?? 0), 0);

        await tx
          .update(diningSessions)
          .set({
            subtotalPaise: newSubtotal,
            taxPaise: newTax,
            totalPaise: newTotal,
            updatedAt: new Date(),
          })
          .where(eq(diningSessions.id, existing.diningSessionId));
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

    return ok({ success: true });
  } catch (err) {
    console.error("Database error in cancelOrder service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function getAdminMenu(
  ctx: Ctx
): Promise<ServiceResult<GetAdminMenuData>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  try {
    const dbCats = await ctx.db.query.categories.findMany({
      where: eq(categories.restaurantId, ctx.actor!.restaurantId),
      orderBy: [asc(categories.sortOrder), asc(categories.name)],
    });

    const dbItems = await ctx.db.query.menuItems.findMany({
      where: and(
        eq(menuItems.restaurantId, ctx.actor!.restaurantId),
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

    return ok({ categories: catList, items: itemList });
  } catch (err) {
    console.error("Database error in getAdminMenu service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function createCategory(
  ctx: Ctx,
  rawInput: CreateCategoryInput
): Promise<ServiceResult<{ categoryId: string }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = createCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid category data", 400);
  }

  const { name, slug, sortOrder } = parsed.data;

  try {
    const [inserted] = await ctx.db
      .insert(categories)
      .values({
        restaurantId: ctx.actor!.restaurantId,
        name,
        slug,
        sortOrder,
        isActive: true,
      })
      .returning({ id: categories.id });

    if (!inserted) {
      return fail("INTERNAL", "Failed to create category", 500);
    }

    return ok({ categoryId: inserted.id });
  } catch (err) {
    console.error("Database error in createCategory service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function updateCategory(
  ctx: Ctx,
  rawInput: UpdateCategoryInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = updateCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid category data", 400);
  }

  const { id, name, slug, sortOrder, isActive } = parsed.data;

  try {
    await ctx.db
      .update(categories)
      .set({ name, slug, sortOrder, isActive, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.restaurantId, ctx.actor!.restaurantId)));
    return ok({ success: true });
  } catch (err) {
    console.error("Database error in updateCategory service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function deleteCategory(
  ctx: Ctx,
  rawInput: DeleteCategoryInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = deleteCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid category ID", 400);
  }

  if (ctx.actor!.isDemo) {
    return fail("FORBIDDEN", "Demo manager accounts cannot delete categories.", 403);
  }

  const { id } = parsed.data;

  try {
    const hasItems = await ctx.db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.categoryId, id),
        eq(menuItems.restaurantId, ctx.actor!.restaurantId)
      ),
    });

    if (hasItems) {
      return fail(
        "CONFLICT",
        "Cannot delete category containing menu items. Please reassign or delete the menu items first.",
        400
      );
    }

    await ctx.db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.restaurantId, ctx.actor!.restaurantId)));
    return ok({ success: true });
  } catch (err) {
    console.error("Database error in deleteCategory service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function createMenuItem(
  ctx: Ctx,
  rawInput: CreateMenuItemInput
): Promise<ServiceResult<{ itemId: string }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = createMenuItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid item data", 400);
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

  // Validate that the category exists and belongs to this restaurant
  const categoryExists = await ctx.db.query.categories.findFirst({
    where: and(
      eq(categories.id, categoryId),
      eq(categories.restaurantId, ctx.actor!.restaurantId)
    ),
  });

  if (!categoryExists) {
    return fail("NOT_FOUND", "Category not found in this restaurant", 404);
  }

  const pricePaise = rupeesToPaise(priceRupees);

  try {
    const [inserted] = await ctx.db
      .insert(menuItems)
      .values({
        restaurantId: ctx.actor!.restaurantId,
        categoryId,
        name: name.trim(),
        description: description?.trim() || null,
        pricePaise,
        isVeg,
        prepTimeMinutes,
        imageUrl: imageUrl?.trim() || null,
        isAvailable,
        sortOrder,
      })
      .returning({ id: menuItems.id });

    if (!inserted) {
      return fail("INTERNAL", "Failed to create menu item", 500);
    }

    return ok({ itemId: inserted.id });
  } catch (err) {
    console.error("Database error in createMenuItem service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function updateMenuItem(
  ctx: Ctx,
  rawInput: UpdateMenuItemInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = updateMenuItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid item data", 400);
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

  if (categoryId) {
    const categoryExists = await ctx.db.query.categories.findFirst({
      where: and(
        eq(categories.id, categoryId),
        eq(categories.restaurantId, ctx.actor!.restaurantId)
      ),
    });

    if (!categoryExists) {
      return fail("NOT_FOUND", "Category not found in this restaurant", 404);
    }
  }

  const pricePaise = rupeesToPaise(priceRupees);

  try {
    await ctx.db
      .update(menuItems)
      .set({
        name: name.trim(),
        categoryId,
        pricePaise,
        isVeg,
        prepTimeMinutes,
        description: description?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        isAvailable,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, ctx.actor!.restaurantId)));
    return ok({ success: true });
  } catch (err) {
    console.error("Database error in updateMenuItem service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function toggleMenuItemAvailability(
  ctx: Ctx,
  rawInput: ToggleMenuItemAvailabilityInput
): Promise<ServiceResult<{ isAvailable: boolean }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = toggleMenuItemAvailabilitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid availability toggle parameters", 400);
  }

  const { id, isAvailable } = parsed.data;

  try {
    await ctx.db
      .update(menuItems)
      .set({ isAvailable, updatedAt: new Date() })
      .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, ctx.actor!.restaurantId)));
    return ok({ isAvailable });
  } catch (err) {
    console.error("Database error in toggleMenuItemAvailability service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function deleteMenuItem(
  ctx: Ctx,
  rawInput: DeleteMenuItemInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = deleteMenuItemSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid item ID", 400);
  }

  if (ctx.actor!.isDemo) {
    return fail("FORBIDDEN", "Demo manager accounts cannot delete menu items.", 403);
  }

  const { id } = parsed.data;

  try {
    const appearsInOrders = await ctx.db.query.orderItems.findFirst({
      where: eq(orderItems.menuItemId, id),
    });

    if (appearsInOrders) {
      await ctx.db
        .update(menuItems)
        .set({ isActive: false, isAvailable: false, updatedAt: new Date() })
        .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, ctx.actor!.restaurantId)));
    } else {
      await ctx.db
        .delete(menuItems)
        .where(and(eq(menuItems.id, id), eq(menuItems.restaurantId, ctx.actor!.restaurantId)));
    }

    return ok({ success: true });
  } catch (err) {
    console.error("Database error in deleteMenuItem service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function createModifier(
  ctx: Ctx,
  rawInput: CreateModifierInput
): Promise<ServiceResult<{ modifierId: string }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = createModifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid modifier data", 400);
  }

  const { menuItemId, groupName, name, priceRupees, isRequired } = parsed.data;
  const pricePaise = rupeesToPaise(priceRupees);

  try {
    const item = await ctx.db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.id, menuItemId),
        eq(menuItems.restaurantId, ctx.actor!.restaurantId)
      ),
    });
    if (!item) {
      return fail("NOT_FOUND", "Menu item not found", 404);
    }

    const [inserted] = await ctx.db
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
      return fail("INTERNAL", "Failed to create modifier", 500);
    }

    return ok({ modifierId: inserted.id });
  } catch (err) {
    console.error("Database error in createModifier service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function deleteModifier(
  ctx: Ctx,
  rawInput: DeleteModifierInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = deleteModifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid modifier ID", 400);
  }

  const { id } = parsed.data;

  try {
    const mod = await ctx.db.query.modifiers.findFirst({
      where: eq(modifiers.id, id),
      with: { menuItem: true },
    });
    if (!mod || mod.menuItem.restaurantId !== ctx.actor!.restaurantId) {
      return fail("NOT_FOUND", "Modifier not found", 404);
    }

    await ctx.db.delete(modifiers).where(eq(modifiers.id, id));
    return ok({ success: true });
  } catch (err) {
    console.error("Database error in deleteModifier service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function updateModifier(
  ctx: Ctx,
  rawInput: { id: string; menuItemId?: string } & UpdateModifierInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = updateModifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid modifier parameters",
      400
    );
  }

  const { id } = rawInput;
  if (!id) {
    return fail("VALIDATION", "Modifier ID is required", 400);
  }

  try {
    const mod = await ctx.db.query.modifiers.findFirst({
      where: eq(modifiers.id, id),
      with: { menuItem: true },
    });
    if (!mod || mod.menuItem.restaurantId !== ctx.actor!.restaurantId) {
      return fail("NOT_FOUND", "Modifier not found", 404);
    }

    const updates: Partial<typeof modifiers.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.groupName !== undefined) updates.groupName = parsed.data.groupName;
    if (parsed.data.isRequired !== undefined) updates.isRequired = parsed.data.isRequired;
    if (parsed.data.priceRupees !== undefined) {
      updates.pricePaise = rupeesToPaise(parsed.data.priceRupees);
    }

    await ctx.db.update(modifiers).set(updates).where(eq(modifiers.id, id));
    return ok({ success: true });
  } catch (err) {
    console.error("Database error in updateModifier service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function getModifiersForItem(
  ctx: Ctx,
  menuItemId: string
): Promise<ServiceResult<AdminModifierData[]>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  try {
    const item = await ctx.db.query.menuItems.findFirst({
      where: and(
        eq(menuItems.id, menuItemId),
        eq(menuItems.restaurantId, ctx.actor!.restaurantId)
      ),
      with: { modifiers: true },
    });

    if (!item) {
      return fail("NOT_FOUND", "Menu item not found", 404);
    }

    return ok(
      item.modifiers.map((m) => ({
        id: m.id,
        menuItemId: m.menuItemId,
        groupName: m.groupName,
        name: m.name,
        pricePaise: m.pricePaise,
        isRequired: m.isRequired,
      }))
    );
  } catch (err) {
    console.error("Database error in getModifiersForItem service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}


export async function getAdminTables(
  ctx: Ctx
): Promise<ServiceResult<AdminTableData[]>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  try {
    const dbTables = await ctx.db.query.tables.findMany({
      where: and(
        eq(tables.restaurantId, ctx.actor!.restaurantId),
        eq(tables.isActive, true)
      ),
      orderBy: [asc(tables.tableNumber)],
    });

    const activeSessions = await ctx.db.query.diningSessions.findMany({
      where: and(
        eq(diningSessions.restaurantId, ctx.actor!.restaurantId),
        sql`${diningSessions.status} IN ('active', 'bill_requested')`
      ),
      with: {
        orders: {
          where: sql`${orders.status} != 'cancelled'`,
        },
      },
    });

    const sessionByTable = new Map(activeSessions.map((s) => [s.tableId, s]));

    return ok(
      dbTables.map((t) => {
        const s = sessionByTable.get(t.id);
        return {
          id: t.id,
          tableNumber: t.tableNumber,
          capacity: t.capacity,
          qrToken: t.qrToken,
          isActive: t.isActive,
          createdAt: t.createdAt.toISOString(),
          activeTab: s
            ? {
                id: s.id,
                status: s.status,
                paymentStatus: s.paymentStatus,
                roundCount: s.orders.length,
                totalPaise: s.totalPaise,
              }
            : null,
        };
      })
    );
  } catch (err) {
    console.error("Database error in getAdminTables service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function createTable(
  ctx: Ctx,
  rawInput: CreateTableInput
): Promise<ServiceResult<AdminTableData>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = createTableSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid table parameters", 400);
  }

  const { tableNumber, capacity } = parsed.data;
  const qrToken = `ml-tbl-${crypto.randomBytes(6).toString("hex")}`;

  try {
    const [inserted] = await ctx.db
      .insert(tables)
      .values({
        restaurantId: ctx.actor!.restaurantId,
        tableNumber,
        capacity,
        qrToken,
        isActive: true,
      })
      .returning();

    if (!inserted) {
      return fail("INTERNAL", "Failed to create table", 500);
    }

    return ok({
      id: inserted.id,
      tableNumber: inserted.tableNumber,
      capacity: inserted.capacity,
      qrToken: inserted.qrToken,
      isActive: inserted.isActive,
      createdAt: inserted.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Database error in createTable service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function deleteTable(
  ctx: Ctx,
  rawInput: DeleteTableInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = deleteTableSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid table ID", 400);
  }

  if (ctx.actor!.isDemo) {
    return fail("FORBIDDEN", "Demo manager accounts cannot delete tables.", 403);
  }

  const { id } = parsed.data;

  try {
    await ctx.db
      .update(tables)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(tables.id, id), eq(tables.restaurantId, ctx.actor!.restaurantId)));
    return ok({ success: true });
  } catch (err) {
    console.error("Database error in deleteTable service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

export async function updateTable(
  ctx: Ctx,
  rawInput: { id: string } & UpdateTableInput
): Promise<ServiceResult<{ success: true }>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  const parsed = updateTableSchema.safeParse(rawInput);
  if (!parsed.success) {
    return fail(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid table parameters",
      400
    );
  }

  const { id } = rawInput;
  if (!id) {
    return fail("VALIDATION", "Table ID is required", 400);
  }

  try {
    const existing = await ctx.db.query.tables.findFirst({
      where: and(
        eq(tables.id, id),
        eq(tables.restaurantId, ctx.actor!.restaurantId)
      ),
    });

    if (!existing) {
      return fail("NOT_FOUND", "Table not found", 404);
    }

    const updates: Partial<typeof tables.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.tableNumber !== undefined) updates.tableNumber = parsed.data.tableNumber;
    if (parsed.data.capacity !== undefined) updates.capacity = parsed.data.capacity;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    await ctx.db
      .update(tables)
      .set(updates)
      .where(and(eq(tables.id, id), eq(tables.restaurantId, ctx.actor!.restaurantId)));

    return ok({ success: true });
  } catch (err) {
    console.error("Database error in updateTable service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}


export async function getAdminReports(
  ctx: Ctx
): Promise<ServiceResult<AdminReportsData>> {
  const authErr = checkManagerActor(ctx);
  if (authErr) return authErr;

  try {
    const allDbOrders = await ctx.db.query.orders.findMany({
      where: eq(orders.restaurantId, ctx.actor!.restaurantId),
      with: {
        items: true,
        events: true,
      },
      orderBy: [desc(orders.createdAt)],
    });

    const now = ctx.now ?? new Date();
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

    return ok({
      todayRevenuePaise,
      todayOrderCount,
      todayAvgTicketPaise,
      avgPrepTimeMinutes,
      topItems,
      sevenDayHistory,
    });
  } catch (err) {
    console.error("Database error in getAdminReports service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}
