"use client";

import * as React from "react";
import {
  Search,
  Filter,
  RefreshCw,
  XCircle,
  Eye,
  AlertTriangle,
  Receipt,
  User,
  Phone,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
  Printer,
  Download,
  Banknote,
  CreditCard,
  QrCode,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { formatPaiseToINR } from "@/lib/currency";
import { adminApi } from "@/lib/api/admin";
import { userMessageFor } from "@/lib/api/errors";
import type { AdminOrderRow, ReceiptData } from "@/lib/api/types";
import type { OrderStatus } from "@/server/db/schema";
import { ReceiptModal } from "@/components/common/receipt-view";

export interface AdminOrdersTabProps {
  onOrderUpdate?: () => void;
  refreshKey?: number;
  initialOrders?: AdminOrderRow[];
  initialPagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export function AdminOrdersTab({
  onOrderUpdate,
  refreshKey,
  initialOrders,
  initialPagination,
}: AdminOrdersTabProps) {
  // Filters & Pagination State
  const [page, setPage] = React.useState(initialPagination?.page ?? 1);
  const pageSize = 10;
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  // Data State
  const [orders, setOrders] = React.useState<AdminOrderRow[]>(initialOrders ?? []);
  const [totalPages, setTotalPages] = React.useState(initialPagination?.totalPages ?? 1);
  const [totalCount, setTotalCount] = React.useState(
    initialPagination?.totalCount ?? (initialOrders?.length ?? 0)
  );
  const [isLoading, setIsLoading] = React.useState(initialOrders ? false : true);
  const [error, setError] = React.useState<string | null>(null);

  // Detail & Cancel Modal States
  const [selectedOrder, setSelectedOrder] = React.useState<AdminOrderRow | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = React.useState<AdminOrderRow | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  // Bill / Receipt & Counter Payment States
  const [receiptData, setReceiptData] = React.useState<ReceiptData | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = React.useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = React.useState<AdminOrderRow | null>(null);
  const [counterPaymentMethod, setCounterPaymentMethod] = React.useState<"cash" | "card" | "upi">("cash");
  const [counterPaymentRef, setCounterPaymentRef] = React.useState("");
  const [counterPaymentNote, setCounterPaymentNote] = React.useState("");
  const [isRecordingPayment, setIsRecordingPayment] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [isLoadingBill, setIsLoadingBill] = React.useState(false);

  const handleViewBillOrReceipt = async (order: AdminOrderRow) => {
    setIsLoadingBill(true);
    try {
      const res = await adminApi.getBillOrReceipt(order.id);
      if (res.ok && res.data) {
        setReceiptData(res.data);
        setIsReceiptModalOpen(true);
      }
    } catch (err) {
      console.error("Failed to load bill/receipt:", err);
    } finally {
      setIsLoadingBill(false);
    }
  };

  const handleOpenRecordPayment = (order: AdminOrderRow) => {
    setPaymentModalOrder(order);
    setCounterPaymentMethod("cash");
    setCounterPaymentRef("");
    setCounterPaymentNote("");
    setPaymentError(null);
  };

  const handleConfirmCounterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalOrder) return;

    setIsRecordingPayment(true);
    setPaymentError(null);

    try {
      const res = await adminApi.recordCounterPayment(paymentModalOrder.id, {
        paymentMethod: counterPaymentMethod,
        transactionRef: counterPaymentRef.trim() || undefined,
        note: counterPaymentNote.trim() || undefined,
      });

      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === paymentModalOrder.id
              ? {
                  ...o,
                  paymentStatus: "paid",
                  paymentMethod: counterPaymentMethod,
                }
              : o
          )
        );

        if (selectedOrder?.id === paymentModalOrder.id) {
          setSelectedOrder((prev) =>
            prev
              ? {
                  ...prev,
                  paymentStatus: "paid",
                  paymentMethod: counterPaymentMethod,
                }
              : null
          );
        }

        setPaymentModalOrder(null);
        setReceiptData(res.data);
        setIsReceiptModalOpen(true);
        onOrderUpdate?.();
      } else {
        setPaymentError(res.message || "Failed to record counter payment");
      }
    } catch (err) {
      setPaymentError((err as Error).message || "Error recording payment");
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const fetchOrders = React.useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      setError(null);
      try {
        const res = await adminApi.listOrders({
          page,
          pageSize,
          status: statusFilter as "all" | OrderStatus,
          paymentStatus: paymentFilter as "all" | "pending" | "paid" | "counter" | "failed",
          search: searchQuery.trim() || undefined,
        });

        if (res.ok) {
          setOrders(res.data.orders);
          setTotalPages(res.data.pagination.totalPages);
          setTotalCount(res.data.pagination.totalCount);
        } else {
          if (res.status === 401) {
            window.location.reload();
            return;
          }
          const msg =
            res.status === 403
              ? res.message
              : res.status === 429 && res.retryAfter
              ? `Too many requests. Please retry in ${res.retryAfter}s.`
              : userMessageFor(res.code, res.message || "Failed to load orders");
          setError(msg);
        }
      } catch (err) {
        setError((err as Error).message || "Error fetching orders");
      } finally {
        setIsLoading(false);
      }
    },
    [page, pageSize, statusFilter, paymentFilter, searchQuery]
  );

  React.useEffect(() => {
    let isMounted = true;
    adminApi
      .listOrders({
        page,
        pageSize,
        status: statusFilter as "all" | OrderStatus,
        paymentStatus: paymentFilter as "all" | "pending" | "paid" | "counter" | "failed",
        search: searchQuery.trim() || undefined,
      })
      .then((res) => {
        if (!isMounted) return;
        setIsLoading(false);
        if (res.ok) {
          setOrders(res.data.orders);
          setTotalPages(res.data.pagination.totalPages);
          setTotalCount(res.data.pagination.totalCount);
        } else {
          if (res.status === 401) {
            window.location.reload();
            return;
          }
          const msg =
            res.status === 403
              ? res.message
              : res.status === 429 && res.retryAfter
              ? `Too many requests. Please retry in ${res.retryAfter}s.`
              : userMessageFor(res.code, res.message || "Failed to load orders");
          setError(msg);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [page, pageSize, statusFilter, paymentFilter, searchQuery, refreshKey]);

  // 5-Second Polling Fallback
  React.useEffect(() => {
    const interval = setInterval(() => {
      adminApi
        .listOrders({
          page,
          pageSize,
          status: statusFilter as "all" | OrderStatus,
          paymentStatus: paymentFilter as "all" | "pending" | "paid" | "counter" | "failed",
          search: searchQuery.trim() || undefined,
        })
        .then((res) => {
          if (res.ok) {
            setOrders(res.data.orders);
            setTotalPages(res.data.pagination.totalPages);
            setTotalCount(res.data.pagination.totalCount);
          }
        });
    }, 5000);
    return () => clearInterval(interval);
  }, [page, pageSize, statusFilter, paymentFilter, searchQuery]);

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalOrder || !cancelReason.trim()) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await adminApi.cancelOrder(
        cancelModalOrder.id,
        cancelReason.trim()
      );

      if (res.ok) {
        setCancelModalOrder(null);
        setCancelReason("");
        await fetchOrders();
        onOrderUpdate?.();
      } else {
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        const msg =
          res.status === 403
            ? res.message
            : res.status === 429 && res.retryAfter
            ? `Too many requests. Please retry in ${res.retryAfter}s.`
            : userMessageFor(res.code, res.message || "Failed to cancel order");
        setCancelError(msg);
      }
    } catch (err) {
      setCancelError((err as Error).message || "Error canceling order");
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case "placed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Placed
          </span>
        );
      case "accepted":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Accepted
          </span>
        );
      case "preparing":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse">
            Preparing
          </span>
        );
      case "ready":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Ready
          </span>
        );
      case "served":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            Served
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs sm:text-sm font-semibold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-800">
            Cancelled
          </span>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <span className="inline-flex items-center text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-400">
            ● Paid (Online)
          </span>
        );
      case "counter":
        return (
          <span className="inline-flex items-center text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400">
            ● Pay at Counter
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center text-xs sm:text-sm font-medium text-red-600 dark:text-red-400">
            ● Payment Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-xs sm:text-sm font-medium text-zinc-500">
            ● Pending
          </span>
        );
    }
  };

  const formatElapsedTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search order #, table, customer name..."
            className="w-full h-11 pl-10 pr-3.5 text-sm sm:text-base rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* Filter Selects & Refresh */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
            <Filter className="h-4 w-4" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter orders by status"
            className="h-11 px-3 text-sm font-medium rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="placed">Placed</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready</option>
            <option value="served">Served</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter orders by payment status"
            className="h-11 px-3 text-sm font-medium rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
          >
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="counter">Pay at Counter</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOrders(true)}
            isLoading={isLoading}
            className="h-11 px-3.5 text-sm font-semibold"
            leftIcon={<RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Orders Table Container */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : orders.length === 0 && !isLoading ? (
          <div className="p-12 text-center">
            <Receipt className="mx-auto h-10 w-10 text-[var(--text-muted)] opacity-50 mb-3" />
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">No orders found</h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Try adjusting your search criteria or status filter.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto no-scrollbar sm:scrollbar-thin">
            <table className="w-full text-left text-sm border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[var(--text-secondary)] font-mono uppercase text-xs tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">Order #</th>
                  <th className="py-3.5 px-4 font-semibold">Table</th>
                  <th className="py-3.5 px-4 font-semibold">Items Summary</th>
                  <th className="py-3.5 px-4 text-right font-semibold">Total</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Payment</th>
                  <th className="py-3.5 px-4 font-semibold">Time</th>
                  <th className="py-3.5 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {orders.map((order) => {
                  const canCancel =
                    order.status !== "served" && order.status !== "cancelled";

                  return (
                    <tr
                      key={order.id}
                      tabIndex={0}
                      className="hover:bg-[var(--bg-subtle)]/80 focus-within:bg-[var(--bg-subtle)]/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)] transition-colors"
                    >
                      {/* Order Number */}
                      <td className="py-4 px-4 font-mono font-bold text-sm sm:text-base text-[var(--text-primary)]">
                        {order.orderNumber}
                      </td>

                      {/* Table */}
                      <td className="py-4 px-4 font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                        {order.tableNumber}
                      </td>

                      {/* Items */}
                      <td className="py-4 px-4 max-w-xs truncate text-sm text-[var(--text-secondary)]">
                        <span title={order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}>
                          {order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-4 px-4 text-right font-bold text-sm sm:text-base text-[var(--text-primary)] font-mono">
                        {formatPaiseToINR(order.totalPaise)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">{getStatusBadge(order.status)}</td>

                      {/* Payment */}
                      <td className="py-4 px-4">{getPaymentBadge(order.paymentStatus)}</td>

                      {/* Elapsed Time */}
                      <td className="py-4 px-4 text-[var(--text-muted)] font-mono text-xs sm:text-sm">
                        {formatElapsedTime(order.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                          title="View order details"
                          aria-label={`View order ${order.orderNumber}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleViewBillOrReceipt(order)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                          title={order.paymentStatus === "paid" ? "Print Receipt" : "Print Bill"}
                          aria-label={`${order.paymentStatus === "paid" ? "Print receipt" : "Print bill"} for ${order.orderNumber}`}
                        >
                          <Printer className="h-4 w-4" />
                        </button>

                        {order.paymentStatus !== "paid" && order.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() => handleOpenRecordPayment(order)}
                            className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                            title="Record counter payment"
                            aria-label={`Record payment for ${order.orderNumber}`}
                          >
                            <Banknote className="h-4 w-4" />
                          </button>
                        )}

                        {canCancel && (
                          <button
                            type="button"
                            data-testid="cancel-order-btn"
                            onClick={() => {
                              setCancelModalOrder(order);
                              setCancelReason("");
                              setCancelError(null);
                            }}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            title="Cancel order"
                            aria-label={`Cancel order ${order.orderNumber}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 text-xs text-[var(--text-secondary)]">
          <div>
            Showing{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {Math.min(page * pageSize, totalCount)}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              {totalCount}
            </span>{" "}
            orders
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 text-xs"
              leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
            >
              Previous
            </Button>

            <span className="font-mono text-xs font-semibold px-2">
              {page} / {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2.5 text-xs"
              rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* View Order Detail Sheet */}
      <Sheet
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        side="right"
        title={
          selectedOrder ? `Order ${selectedOrder.orderNumber}` : "Order Details"
        }
        description={
          selectedOrder
            ? `${selectedOrder.tableNumber} · Placed ${formatElapsedTime(selectedOrder.createdAt)}`
            : undefined
        }
      >
        {selectedOrder && (
          <div className="space-y-5 text-sm sm:text-base">
            {/* Status & Payment header */}
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-xs text-[var(--text-muted)] uppercase font-mono block">
                  Kitchen Status
                </span>
                <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="text-right">
                <span className="text-xs text-[var(--text-muted)] uppercase font-mono block">
                  Payment Status
                </span>
                <div className="mt-1">{getPaymentBadge(selectedOrder.paymentStatus)}</div>
              </div>
            </div>

            {/* Customer Details if present */}
            {(selectedOrder.customerName || selectedOrder.customerPhone) && (
              <div className="p-3.5 rounded-lg border border-[var(--border-subtle)] space-y-2">
                <span className="text-xs text-[var(--text-muted)] uppercase font-mono block">
                  Guest Info
                </span>
                {selectedOrder.customerName && (
                  <div className="flex items-center gap-2 text-sm sm:text-base text-[var(--text-primary)] font-medium">
                    <User className="h-4 w-4 text-[var(--text-muted)]" />
                    <span>{selectedOrder.customerName}</span>
                  </div>
                )}
                {selectedOrder.customerPhone && (
                  <div className="flex items-center gap-2 text-sm sm:text-base text-[var(--text-secondary)] font-mono">
                    <Phone className="h-4 w-4 text-[var(--text-muted)]" />
                    <span>{selectedOrder.customerPhone}</span>
                  </div>
                )}
              </div>
            )}

            {/* Special instructions */}
            {selectedOrder.specialInstructions && (
              <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <MessageSquare className="h-4 w-4" />
                  <span>Guest Note / Allergies</span>
                </div>
                <p className="text-sm leading-relaxed">{selectedOrder.specialInstructions}</p>
              </div>
            )}

            {/* Items list */}
            <div>
              <h5 className="font-semibold text-[var(--text-primary)] uppercase text-xs tracking-wider font-mono mb-2">
                Order Items ({selectedOrder.items.length})
              </h5>
              <div className="space-y-2.5">
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
                  >
                    <div>
                      <div className="font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                        {item.quantity} × {item.name}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
                          {item.modifiers.join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="font-mono font-semibold text-sm sm:text-base text-[var(--text-primary)] text-right">
                      {formatPaiseToINR(item.pricePaise * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-3 rounded-lg border border-[var(--border-subtle)] space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Subtotal</span>
                <span>{formatPaiseToINR(selectedOrder.subtotalPaise)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>GST (5%)</span>
                <span>{formatPaiseToINR(selectedOrder.taxPaise)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-[var(--border-subtle)] font-bold text-sm text-[var(--text-primary)]">
                <span>Total Bill</span>
                <span>{formatPaiseToINR(selectedOrder.totalPaise)}</span>
              </div>
            </div>

            {/* Billing Workflow Controls */}
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)] uppercase font-mono block">
                  Billing Workflow
                </span>
                <Badge
                  variant={selectedOrder.paymentStatus === "paid" ? "success" : "secondary"}
                  className="text-[10px] font-mono uppercase"
                >
                  {selectedOrder.paymentStatus === "paid" ? "PAID" : "UNPAID"}
                </Badge>
              </div>

              {selectedOrder.paymentStatus !== "paid" ? (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={isLoadingBill}
                      onClick={() => handleViewBillOrReceipt(selectedOrder)}
                      className="flex-1 justify-center h-10 text-xs font-semibold"
                      leftIcon={<FileText className="h-4 w-4" />}
                    >
                      View / Print Bill
                    </Button>
                    {selectedOrder.status !== "cancelled" && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleOpenRecordPayment(selectedOrder)}
                        className="flex-1 justify-center h-10 text-xs font-semibold shadow-xs"
                        leftIcon={<Banknote className="h-4 w-4" />}
                      >
                        Record Payment
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] italic">
                    Generating an unpaid bill leaves order status and payment status untouched.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={isLoadingBill}
                    onClick={() => handleViewBillOrReceipt(selectedOrder)}
                    className="flex-1 justify-center h-10 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                    leftIcon={<Printer className="h-4 w-4" />}
                  >
                    View / Print Receipt
                  </Button>
                  <a
                    href={adminApi.getReceiptPdfUrl(selectedOrder.id)}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="flex-1"
                  >
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="w-full justify-center h-10 text-xs font-semibold shadow-xs"
                      leftIcon={<Download className="h-4 w-4" />}
                    >
                      Download PDF
                    </Button>
                  </a>
                </div>
              )}
            </div>

            {/* Lifecycle Events Timeline */}
            <div>
              <h5 className="font-semibold text-[var(--text-primary)] uppercase text-[10px] tracking-wider font-mono mb-2">
                Audit Timeline
              </h5>
              <div className="space-y-2 border-l-2 border-[var(--border-subtle)] pl-3 ml-2">
                {selectedOrder.events.map((evt) => (
                  <div key={evt.id} className="relative pb-1">
                    <div className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-[var(--primary)]" />
                    <div className="font-semibold text-[var(--text-primary)] capitalize">
                      {evt.toStatus}
                    </div>
                    {evt.note && (
                      <p className="text-[11px] text-[var(--text-secondary)]">{evt.note}</p>
                    )}
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {new Date(evt.createdAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {/* Cancel Order Confirmation Modal */}
      {cancelModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6 text-[var(--text-primary)]">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-2.5 rounded-full bg-red-100 dark:bg-red-950/60">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base">Cancel Order {cancelModalOrder.orderNumber}?</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {cancelModalOrder.tableNumber} · {formatPaiseToINR(cancelModalOrder.totalPaise)}
                </p>
              </div>
            </div>

            {cancelError && (
              <div className="mb-4 p-2.5 rounded-lg bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                {cancelError}
              </div>
            )}

            <form onSubmit={handleConfirmCancel} className="space-y-4">
              <div>
                <label
                  htmlFor="cancel-reason"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Cancellation Reason (Required for Audit Log)
                </label>
                <textarea
                  id="cancel-reason"
                  data-testid="cancel-reason-input"
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Guest requested cancellation, table vacated, duplicate order..."
                  className="w-full p-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelModalOrder(null)}
                >
                  Dismiss
                </Button>
                <Button
                  data-testid="confirm-cancel-btn"
                  type="submit"
                  variant="destructive"
                  size="sm"
                  isLoading={isCancelling}
                  leftIcon={<XCircle className="h-4 w-4" />}
                >
                  Confirm Cancellation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Counter Payment Modal */}
      {paymentModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-payment-title"
        >
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6 text-[var(--text-primary)]">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 mb-4">
              <div className="p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60">
                <Banknote className="h-6 w-6" />
              </div>
              <div>
                <h3 id="record-payment-title" className="font-bold text-base">
                  Record Counter Payment
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Order {paymentModalOrder.orderNumber} · {paymentModalOrder.tableNumber}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] mb-4 text-center">
              <span className="text-xs text-[var(--text-muted)] uppercase font-mono block">
                Total Amount Due
              </span>
              <span className="text-2xl font-extrabold text-[var(--primary)] font-mono">
                {formatPaiseToINR(paymentModalOrder.totalPaise)}
              </span>
            </div>

            {paymentError && (
              <div className="mb-4 p-2.5 rounded-lg bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                {paymentError}
              </div>
            )}

            <form onSubmit={handleConfirmCounterPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCounterPaymentMethod("cash")}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      counterPaymentMethod === "cash"
                        ? "border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)] font-bold shadow-xs"
                        : "border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <Banknote className="h-4 w-4" />
                    <span className="text-xs">Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCounterPaymentMethod("card")}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      counterPaymentMethod === "card"
                        ? "border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)] font-bold shadow-xs"
                        : "border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs">Card / POS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCounterPaymentMethod("upi")}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      counterPaymentMethod === "upi"
                        ? "border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)] font-bold shadow-xs"
                        : "border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <QrCode className="h-4 w-4" />
                    <span className="text-xs">Counter UPI</span>
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="counter-payment-ref"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Reference / Terminal Approval Code (Optional)
                </label>
                <input
                  id="counter-payment-ref"
                  type="text"
                  value={counterPaymentRef}
                  onChange={(e) => setCounterPaymentRef(e.target.value)}
                  placeholder="e.g. POS Auth #12345 or UPI RRN"
                  className="w-full p-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label
                  htmlFor="counter-payment-note"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Cashier Audit Note (Optional)
                </label>
                <input
                  id="counter-payment-note"
                  type="text"
                  value={counterPaymentNote}
                  onChange={(e) => setCounterPaymentNote(e.target.value)}
                  placeholder="e.g. Paid in cash at counter"
                  className="w-full p-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentModalOrder(null)}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="confirm-counter-payment-btn"
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isRecordingPayment}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                >
                  Confirm & Settle Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Bill & Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        receipt={receiptData}
        pdfDownloadUrl={receiptData ? adminApi.getReceiptPdfUrl(receiptData.orderId) : undefined}
        isManager={true}
      />
    </div>
  );
}
