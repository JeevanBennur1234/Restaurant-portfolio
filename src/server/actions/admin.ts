"use server";

import { db } from "@/server/db";
import { getStaffSession, type StaffSession } from "@/server/auth";
import {
  getAdminOrders,
  cancelOrder,
  getAdminMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
  createModifier,
  deleteModifier,
  getAdminTables,
  createTable,
  deleteTable,
  getAdminReports,
  type AdminOrderItemSummary,
  type AdminOrderRow,
  type AdminCategoryData,
  type AdminModifierData,
  type AdminMenuItemData,
  type AdminTableData,
  type TopSellingItem,
  type DayMetric,
  type AdminReportsData,
} from "@/server/services/manager";
import {
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

export type {
  AdminOrderItemSummary,
  AdminOrderRow,
  AdminCategoryData,
  AdminModifierData,
  AdminMenuItemData,
  AdminTableData,
  TopSellingItem,
  DayMetric,
  AdminReportsData,
};

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

export interface GetAdminMenuResult {
  success: boolean;
  categories?: AdminCategoryData[];
  items?: AdminMenuItemData[];
  error?: string;
}

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

export async function getAdminOrdersAction(
  rawInput: AdminOrdersQueryInput
): Promise<GetAdminOrdersResult> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await getAdminOrders({ db, actor: session }, rawInput);
  if (result.ok) {
    return {
      success: true,
      orders: result.data.orders,
      pagination: result.data.pagination,
      summary: result.data.summary,
    };
  }
  return { success: false, error: result.message };
}

export async function cancelOrderAction(
  rawInput: CancelOrderInput
): Promise<{ success: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await cancelOrder({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return { success: false, error: result.message };
}

export async function getAdminMenuAction(): Promise<GetAdminMenuResult> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await getAdminMenu({ db, actor: session });
  if (result.ok) {
    return {
      success: true,
      categories: result.data.categories,
      items: result.data.items,
    };
  }
  return { success: false, error: result.message };
}

export async function createCategoryAction(
  rawInput: CreateCategoryInput
): Promise<{ success: boolean; categoryId?: string; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await createCategory({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true, categoryId: result.data.categoryId };
  }
  return { success: false, error: result.message };
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

  const result = await updateCategory({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return { success: false, error: result.message };
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

  const result = await deleteCategory({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return { success: false, error: result.message };
}

export async function createMenuItemAction(
  rawInput: CreateMenuItemInput
): Promise<{ success: boolean; itemId?: string; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await createMenuItem({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true, itemId: result.data.itemId };
  }
  return { success: false, error: result.message };
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

  const result = await updateMenuItem({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return { success: false, error: result.message };
}

export async function toggleMenuItemAvailabilityAction(
  rawInput: ToggleMenuItemAvailabilityInput
): Promise<{ success: boolean; isAvailable?: boolean; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await toggleMenuItemAvailability({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true, isAvailable: result.data.isAvailable };
  }
  return { success: false, error: result.message };
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

  const result = await deleteMenuItem({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return { success: false, error: result.message };
}

export async function createModifierAction(
  rawInput: CreateModifierInput
): Promise<{ success: boolean; modifierId?: string; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireManagerAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await createModifier({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true, modifierId: result.data.modifierId };
  }
  return { success: false, error: result.message };
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

  const result = await deleteModifier({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return { success: false, error: result.message };
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

  const result = await getAdminTables({ db, actor: session });
  if (result.ok) {
    return { success: true, tables: result.data };
  }
  return { success: false, error: result.message };
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

  const result = await createTable({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true, table: result.data };
  }
  return { success: false, error: result.message };
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

  const result = await deleteTable({ db, actor: session }, rawInput);
  if (result.ok) {
    return { success: true };
  }
  return { success: false, error: result.message };
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

  const result = await getAdminReports({ db, actor: session });
  if (result.ok) {
    return { success: true, reports: result.data };
  }
  return { success: false, error: result.message };
}
