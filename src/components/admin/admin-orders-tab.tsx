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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { formatPaiseToINR } from "@/lib/currency";
import {
  getAdminOrdersAction,
  cancelOrderAction,
  type AdminOrderRow,
} from "@/server/actions/admin";
import type { OrderStatus } from "@/server/db/schema";

interface AdminOrdersTabProps {
  onOrderUpdate?: () => void;
  refreshKey?: number;
}

export function AdminOrdersTab({ onOrderUpdate, refreshKey }: AdminOrdersTabProps) {
  // Filters & Pagination State
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [paymentFilter, setPaymentFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");

  // Data State
  const [orders, setOrders] = React.useState<AdminOrderRow[]>([]);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Detail & Cancel Modal States
  const [selectedOrder, setSelectedOrder] = React.useState<AdminOrderRow | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = React.useState<AdminOrderRow | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const fetchOrders = React.useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      setError(null);
      try {
        const res = await getAdminOrdersAction({
          page,
          pageSize,
          status: statusFilter as "all" | OrderStatus,
          paymentStatus: paymentFilter as "all" | "pending" | "paid" | "counter" | "failed",
          search: searchQuery.trim() || undefined,
        });

        if (res.success && res.orders) {
          setOrders(res.orders);
          if (res.pagination) {
            setTotalPages(res.pagination.totalPages);
            setTotalCount(res.pagination.totalCount);
          }
        } else {
          setError(res.error || "Failed to load orders");
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
    getAdminOrdersAction({
      page,
      pageSize,
      status: statusFilter as "all" | OrderStatus,
      paymentStatus: paymentFilter as "all" | "pending" | "paid" | "counter" | "failed",
      search: searchQuery.trim() || undefined,
    }).then((res) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (res.success && res.orders) {
        setOrders(res.orders);
        if (res.pagination) {
          setTotalPages(res.pagination.totalPages);
          setTotalCount(res.pagination.totalCount);
        }
      } else {
        setError(res.error || "Failed to load orders");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [page, pageSize, statusFilter, paymentFilter, searchQuery, refreshKey]);

  // 5-Second Polling Fallback
  React.useEffect(() => {
    const interval = setInterval(() => {
      getAdminOrdersAction({
        page,
        pageSize,
        status: statusFilter as "all" | OrderStatus,
        paymentStatus: paymentFilter as "all" | "pending" | "paid" | "counter" | "failed",
        search: searchQuery.trim() || undefined,
      }).then((res) => {
        if (res.success && res.orders) {
          setOrders(res.orders);
          if (res.pagination) {
            setTotalPages(res.pagination.totalPages);
            setTotalCount(res.pagination.totalCount);
          }
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
      const res = await cancelOrderAction({
        orderId: cancelModalOrder.id,
        reason: cancelReason.trim(),
      });

      if (res.success) {
        setCancelModalOrder(null);
        setCancelReason("");
        await fetchOrders();
        onOrderUpdate?.();
      } else {
        setCancelError(res.error || "Failed to cancel order");
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
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            Served
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-800">
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
          <span className="inline-flex items-center text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            ● Paid (Online)
          </span>
        );
      case "counter":
        return (
          <span className="inline-flex items-center text-[11px] font-medium text-amber-700 dark:text-amber-400">
            ● Pay at Counter
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center text-[11px] font-medium text-red-600 dark:text-red-400">
            ● Payment Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[11px] font-medium text-zinc-500">
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search order #, table, customer name..."
            className="w-full h-9 pl-9 pr-3 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* Filter Selects & Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Filter className="h-3.5 w-3.5" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter orders by status"
            className="h-9 px-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
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
            className="h-9 px-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer"
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
            className="h-9 px-3 text-xs"
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />}
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
            <table className="w-full text-left text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[var(--text-secondary)] font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Table</th>
                  <th className="py-3 px-4">Items Summary</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4 text-right">Actions</th>
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
                      <td className="py-3.5 px-4 font-mono font-bold text-[var(--text-primary)]">
                        {order.orderNumber}
                      </td>

                      {/* Table */}
                      <td className="py-3.5 px-4 font-medium text-[var(--text-primary)]">
                        {order.tableNumber}
                      </td>

                      {/* Items */}
                      <td className="py-3.5 px-4 max-w-xs truncate text-[var(--text-secondary)]">
                        <span title={order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}>
                          {order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 text-right font-semibold text-[var(--text-primary)] font-mono">
                        {formatPaiseToINR(order.totalPaise)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{getStatusBadge(order.status)}</td>

                      {/* Payment */}
                      <td className="py-3.5 px-4">{getPaymentBadge(order.paymentStatus)}</td>

                      {/* Elapsed Time */}
                      <td className="py-3.5 px-4 text-[var(--text-muted)] font-mono text-[11px]">
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

                        {canCancel && (
                          <button
                            type="button"
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
          <div className="space-y-5 text-xs">
            {/* Status & Payment header */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono block">
                  Kitchen Status
                </span>
                <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono block">
                  Payment Status
                </span>
                <div className="mt-1">{getPaymentBadge(selectedOrder.paymentStatus)}</div>
              </div>
            </div>

            {/* Customer Details if present */}
            {(selectedOrder.customerName || selectedOrder.customerPhone) && (
              <div className="p-3 rounded-lg border border-[var(--border-subtle)] space-y-1.5">
                <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono block">
                  Guest Info
                </span>
                {selectedOrder.customerName && (
                  <div className="flex items-center gap-2 text-[var(--text-primary)]">
                    <User className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>{selectedOrder.customerName}</span>
                  </div>
                )}
                {selectedOrder.customerPhone && (
                  <div className="flex items-center gap-2 text-[var(--text-secondary)] font-mono">
                    <Phone className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>{selectedOrder.customerPhone}</span>
                  </div>
                )}
              </div>
            )}

            {/* Special instructions */}
            {selectedOrder.specialInstructions && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-semibold text-[11px] mb-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Guest Note / Allergies</span>
                </div>
                <p className="text-xs">{selectedOrder.specialInstructions}</p>
              </div>
            )}

            {/* Items list */}
            <div>
              <h5 className="font-semibold text-[var(--text-primary)] uppercase text-[10px] tracking-wider font-mono mb-2">
                Order Items ({selectedOrder.items.length})
              </h5>
              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)]"
                  >
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {item.quantity} × {item.name}
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {item.modifiers.join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="font-mono font-medium text-[var(--text-primary)] text-right">
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
    </div>
  );
}
