import { apiFetch, apiUpload, type ApiResult } from "./client";
import type {
  AdminOrdersQueryInput,
  GetAdminOrdersData,
  AdminCategoryData,
  CreateCategoryInput,
  UpdateCategoryInput,
  AdminMenuItemData,
  CreateMenuItemInput,
  UpdateMenuItemInput,
  AdminModifierData,
  CreateModifierInput,
  UpdateModifierInput,
  AdminTableData,
  CreateTableInput,
  UpdateTableInput,
  AdminReportsData,
  ReceiptData,
  RecordCounterPaymentInput,
  OrderStatus,
} from "./types";

export interface RequestOptions {
  signal?: AbortSignal;
}

export const adminApi = {
  // --- Orders ---
  async listOrders(
    query?: AdminOrdersQueryInput,
    opts?: RequestOptions
  ): Promise<ApiResult<GetAdminOrdersData>> {
    return apiFetch<GetAdminOrdersData>("/api/v1/admin/orders", {
      method: "GET",
      query: query as Record<string, string | number | boolean | undefined | null>,
      signal: opts?.signal,
    });
  },

  async cancelOrder(
    orderId: string,
    reason: string,
    opts?: RequestOptions
  ): Promise<ApiResult<void>> {
    return apiFetch<void>(`/api/v1/admin/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
      body: { reason },
      signal: opts?.signal,
    });
  },

  async getBillOrReceipt(
    orderId: string,
    opts?: RequestOptions
  ): Promise<ApiResult<ReceiptData>> {
    return apiFetch<ReceiptData>(`/api/v1/admin/orders/${encodeURIComponent(orderId)}/bill`, {
      method: "GET",
      signal: opts?.signal,
    });
  },

  async recordCounterPayment(
    orderId: string,
    data: RecordCounterPaymentInput,
    opts?: RequestOptions
  ): Promise<ApiResult<ReceiptData>> {
    return apiFetch<ReceiptData>(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/pay-counter`,
      {
        method: "POST",
        body: data,
        signal: opts?.signal,
      }
    );
  },

  async transitionOrderStatus(
    orderId: string,
    toStatus: OrderStatus,
    opts?: RequestOptions
  ): Promise<ApiResult<{ newStatus: OrderStatus }>> {
    return apiFetch<{ newStatus: OrderStatus }>(
      `/api/v1/kitchen/orders/${encodeURIComponent(orderId)}/transition`,
      {
        method: "POST",
        body: { toStatus },
        signal: opts?.signal,
      }
    );
  },

  getReceiptPdfUrl(orderId: string, format: "a4" | "thermal" = "a4"): string {
    return `/api/v1/admin/orders/${encodeURIComponent(orderId)}/receipt/pdf?format=${format}`;
  },

  // --- Categories ---
  async listCategories(
    opts?: RequestOptions
  ): Promise<ApiResult<AdminCategoryData[]>> {
    return apiFetch<AdminCategoryData[]>("/api/v1/admin/categories", {
      method: "GET",
      signal: opts?.signal,
    });
  },

  async createCategory(
    data: CreateCategoryInput,
    opts?: RequestOptions
  ): Promise<ApiResult<AdminCategoryData>> {
    return apiFetch<AdminCategoryData>("/api/v1/admin/categories", {
      method: "POST",
      body: data,
      signal: opts?.signal,
    });
  },

  async updateCategory(
    id: string,
    data: Omit<UpdateCategoryInput, "id">,
    opts?: RequestOptions
  ): Promise<ApiResult<AdminCategoryData>> {
    return apiFetch<AdminCategoryData>(
      `/api/v1/admin/categories/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: data,
        signal: opts?.signal,
      }
    );
  },

  async deleteCategory(
    id: string,
    opts?: RequestOptions
  ): Promise<ApiResult<void>> {
    return apiFetch<void>(
      `/api/v1/admin/categories/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        signal: opts?.signal,
      }
    );
  },

  // --- Items ---
  async listItems(
    opts?: RequestOptions
  ): Promise<ApiResult<AdminMenuItemData[]>> {
    return apiFetch<AdminMenuItemData[]>("/api/v1/admin/items", {
      method: "GET",
      signal: opts?.signal,
    });
  },

  async createItem(
    data: CreateMenuItemInput,
    opts?: RequestOptions
  ): Promise<ApiResult<{ itemId: string }>> {
    return apiFetch<{ itemId: string }>("/api/v1/admin/items", {
      method: "POST",
      body: data,
      signal: opts?.signal,
    });
  },

  async updateItem(
    id: string,
    data: Omit<UpdateMenuItemInput, "id">,
    opts?: RequestOptions
  ): Promise<ApiResult<{ success: true }>> {
    return apiFetch<{ success: true }>(
      `/api/v1/admin/items/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: data,
        signal: opts?.signal,
      }
    );
  },

  async deleteItem(
    id: string,
    opts?: RequestOptions
  ): Promise<ApiResult<void>> {
    return apiFetch<void>(`/api/v1/admin/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: opts?.signal,
    });
  },

  async setItemAvailability(
    id: string,
    isAvailable: boolean,
    opts?: RequestOptions
  ): Promise<ApiResult<void>> {
    return apiFetch<void>(
      `/api/v1/admin/items/${encodeURIComponent(id)}/availability`,
      {
        method: "POST",
        body: { isAvailable },
        signal: opts?.signal,
      }
    );
  },

  // --- Modifiers ---
  async listModifiers(
    itemId: string,
    opts?: RequestOptions
  ): Promise<ApiResult<AdminModifierData[]>> {
    return apiFetch<AdminModifierData[]>(
      `/api/v1/admin/items/${encodeURIComponent(itemId)}/modifiers`,
      {
        method: "GET",
        signal: opts?.signal,
      }
    );
  },

  async createModifier(
    itemId: string,
    data: Omit<CreateModifierInput, "menuItemId">,
    opts?: RequestOptions
  ): Promise<ApiResult<AdminModifierData>> {
    return apiFetch<AdminModifierData>(
      `/api/v1/admin/items/${encodeURIComponent(itemId)}/modifiers`,
      {
        method: "POST",
        body: data,
        signal: opts?.signal,
      }
    );
  },

  async updateModifier(
    itemId: string,
    modifierId: string,
    data: Omit<UpdateModifierInput, "id" | "menuItemId">,
    opts?: RequestOptions
  ): Promise<ApiResult<AdminModifierData>> {
    return apiFetch<AdminModifierData>(
      `/api/v1/admin/items/${encodeURIComponent(itemId)}/modifiers/${encodeURIComponent(modifierId)}`,
      {
        method: "PATCH",
        body: data,
        signal: opts?.signal,
      }
    );
  },

  async deleteModifier(
    itemId: string,
    modifierId: string,
    opts?: RequestOptions
  ): Promise<ApiResult<void>> {
    return apiFetch<void>(
      `/api/v1/admin/items/${encodeURIComponent(itemId)}/modifiers/${encodeURIComponent(modifierId)}`,
      {
        method: "DELETE",
        signal: opts?.signal,
      }
    );
  },

  // --- Tables ---
  async listTables(
    opts?: RequestOptions
  ): Promise<ApiResult<AdminTableData[]>> {
    return apiFetch<AdminTableData[]>("/api/v1/admin/tables", {
      method: "GET",
      signal: opts?.signal,
    });
  },

  async createTable(
    data: CreateTableInput,
    opts?: RequestOptions
  ): Promise<ApiResult<AdminTableData>> {
    return apiFetch<AdminTableData>("/api/v1/admin/tables", {
      method: "POST",
      body: data,
      signal: opts?.signal,
    });
  },

  async updateTable(
    id: string,
    data: Omit<UpdateTableInput, "id">,
    opts?: RequestOptions
  ): Promise<ApiResult<AdminTableData>> {
    return apiFetch<AdminTableData>(
      `/api/v1/admin/tables/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: data,
        signal: opts?.signal,
      }
    );
  },

  async deleteTable(
    id: string,
    opts?: RequestOptions
  ): Promise<ApiResult<void>> {
    return apiFetch<void>(`/api/v1/admin/tables/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: opts?.signal,
    });
  },

  // --- Reports ---
  async getReports(
    opts?: RequestOptions
  ): Promise<ApiResult<AdminReportsData>> {
    return apiFetch<AdminReportsData>("/api/v1/admin/reports", {
      method: "GET",
      signal: opts?.signal,
    });
  },

  // --- Uploads ---
  async uploadImage(
    file: File,
    opts?: RequestOptions
  ): Promise<ApiResult<{ url: string; fileName: string }>> {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload<{ url: string; fileName: string }>(
      "/api/v1/admin/uploads",
      formData,
      opts
    );
  },

  // --- QR Standees PDF ---
  qrPdfUrl(): string {
    return "/api/v1/admin/tables/qr.pdf";
  },

  // --- Dining Sessions / Open Tabs ---
  async getTabBillOrReceipt(
    tabId: string,
    opts?: RequestOptions
  ): Promise<ApiResult<ReceiptData>> {
    return apiFetch<ReceiptData>(`/api/v1/admin/tabs/${encodeURIComponent(tabId)}/bill`, {
      method: "GET",
      signal: opts?.signal,
    });
  },

  async settleTab(
    tabId: string,
    paymentMethod: "counter" | "cash" | "card" | "upi" = "counter",
    notes?: string,
    opts?: RequestOptions
  ): Promise<ApiResult<{ success: true; tabId: string }>> {
    return apiFetch<{ success: true; tabId: string }>(
      `/api/v1/admin/tabs/${encodeURIComponent(tabId)}/settle`,
      {
        method: "POST",
        body: { tabId, paymentMethod, notes },
        signal: opts?.signal,
      }
    );
  },

  tabReceiptPdfUrl(tabId: string, format: "a4" | "thermal" = "a4"): string {
    return `/api/v1/admin/tabs/${encodeURIComponent(tabId)}/receipt/pdf?format=${format}`;
  },
};
