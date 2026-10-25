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
import type {
  AdminOrderRow,
  AdminOrderTabSummary,
  ReceiptData,
} from "@/lib/api/types";
import type { OrderStatus } from "@/server/db/schema";
import { ReceiptModal } from "@/components/common/receipt-view";
import { formatTableDisplayName as getTableDisplayName } from "@/lib/table-label";

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

interface DisplayGroup {
  id: string; // diningSessionId or orderId
  type: "tab" | "single";
  tableNumber: string;
  diningSessionId: string | null;
  tabSummary: AdminOrderTabSummary | null;
  orders: AdminOrderRow[];
  createdAt: string;
  isBillRequested: boolean;
}

export interface ConsolidatedDisplayItem {
  key: string;
  name: string;
  modifiers: string[];
  quantity: number;
  totalPaise: number;
}

export function getConsolidatedGroupItems(orders: AdminOrderRow[]): ConsolidatedDisplayItem[] {
  const items = new Map<string, ConsolidatedDisplayItem>();

  for (const order of orders) {
    if (order.status === "cancelled") continue;

    for (const item of order.items) {
      const modifiers = item.modifiers ?? [];
      const key = JSON.stringify([item.name, modifiers]);
      const existing = items.get(key);

      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPaise += item.pricePaise * item.quantity;
      } else {
        items.set(key, {
          key,
          name: item.name,
          modifiers,
          quantity: item.quantity,
          totalPaise: item.pricePaise * item.quantity,
        });
      }
    }
  }

  return [...items.values()];
}

function summarizeGroupItems(group: DisplayGroup): string {
  const quantities = new Map<string, number>();
  for (const item of getConsolidatedGroupItems(group.orders)) {
    quantities.set(item.name, (quantities.get(item.name) ?? 0) + item.quantity);
  }
  return [...quantities.entries()].map(([name, quantity]) => `${quantity}x ${name}`).join(", ") || "No items";
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

  // Raw Orders & Pagination State
  const [orders, setOrders] = React.useState<AdminOrderRow[]>(initialOrders ?? []);
  const [totalPages, setTotalPages] = React.useState(initialPagination?.totalPages ?? 1);
  const [totalCount, setTotalCount] = React.useState(
    initialPagination?.totalCount ?? (initialOrders?.length ?? 0)
  );
  const [isLoading, setIsLoading] = React.useState(initialOrders ? false : true);
  const [error, setError] = React.useState<string | null>(null);

  // Detail & Cancel Modal States
  const [selectedOrder, setSelectedOrder] = React.useState<AdminOrderRow | null>(null);
  const [selectedTabItemsGroup, setSelectedTabItemsGroup] = React.useState<DisplayGroup | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = React.useState<AdminOrderRow | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  // Bill / Receipt States
  const [receiptData, setReceiptData] = React.useState<ReceiptData | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = React.useState(false);
  const [isLoadingBill, setIsLoadingBill] = React.useState(false);

  // Single Order Counter Payment Modal States (legacy single orders only)
  const [paymentModalOrder, setPaymentModalOrder] = React.useState<AdminOrderRow | null>(null);
  const [counterPaymentMethod, setCounterPaymentMethod] = React.useState<"cash" | "card" | "upi">("cash");
  const [counterPaymentRef, setCounterPaymentRef] = React.useState("");
  const [counterPaymentNote, setCounterPaymentNote] = React.useState("");
  const [isRecordingPayment, setIsRecordingPayment] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);

  // Tab Settle Modal States (for grouped dining tabs)
  const [settleModalGroup, setSettleModalGroup] = React.useState<DisplayGroup | null>(null);
  const [tabPaymentMethod, setTabPaymentMethod] = React.useState<"cash" | "card" | "upi">("cash");
  const [tabPaymentNote, setTabPaymentNote] = React.useState("");
  const [isSettlingTab, setIsSettlingTab] = React.useState(false);
  const [tabSettleError, setTabSettleError] = React.useState<string | null>(null);

  // Group orders into DisplayGroups (tabs or legacy singles)
  const groups = React.useMemo<DisplayGroup[]>(() => {
    const tabMap = new Map<string, AdminOrderRow[]>();
    const singleOrders: AdminOrderRow[] = [];

    for (const o of orders) {
      if (o.diningSessionId) {
        const list = tabMap.get(o.diningSessionId) || [];
        list.push(o);
        tabMap.set(o.diningSessionId, list);
      } else {
        singleOrders.push(o);
      }
    }

    const result: DisplayGroup[] = [];

    for (const [sessionId, rounds] of tabMap.entries()) {
      rounds.sort((a, b) => (a.roundNumber ?? 1) - (b.roundNumber ?? 1));

      const activeRounds = rounds.filter((r) => r.status !== "cancelled");
      const subtotalPaise = activeRounds.reduce((acc, r) => acc + (r.subtotalPaise || 0), 0);
      const taxPaise = activeRounds.reduce((acc, r) => acc + (r.taxPaise || 0), 0);
      const totalPaise = activeRounds.reduce((acc, r) => acc + (r.totalPaise || 0), 0);
      const paidPaise = activeRounds
        .filter((r) => r.paymentStatus === "paid")
        .reduce((acc, r) => acc + (r.totalPaise || 0), 0);
      const amountDuePaise = Math.max(0, totalPaise - paidPaise);

      const existingSummary = rounds[0]?.tabSummary ?? rounds[0]?.tab;

      const status =
        existingSummary?.status ??
        (rounds.some((r) => r.paymentStatus === "bill_requested")
          ? "bill_requested"
          : activeRounds.length > 0 &&
            activeRounds.every((r) => r.status === "served") &&
            amountDuePaise === 0
          ? "closed"
          : "active");

      const paymentStatus =
        existingSummary?.paymentStatus ??
        (amountDuePaise === 0 && activeRounds.length > 0
          ? "paid"
          : status === "bill_requested"
          ? "bill_requested"
          : "open");

      const tabSummary: AdminOrderTabSummary = {
        id: sessionId,
        status,
        paymentStatus,
        roundCount: activeRounds.length,
        subtotalPaise: existingSummary?.subtotalPaise ?? subtotalPaise,
        taxPaise: existingSummary?.taxPaise ?? taxPaise,
        totalPaise: existingSummary?.totalPaise ?? totalPaise,
        amountDuePaise: existingSummary?.amountDuePaise ?? amountDuePaise,
        paidPaise: existingSummary?.paidPaise ?? paidPaise,
      };

      const isBillRequested =
        status === "bill_requested" ||
        rounds.some((r) => r.paymentStatus === "bill_requested");

      const latestRound = rounds[rounds.length - 1];

      result.push({
        id: sessionId,
        type: "tab",
        tableNumber: rounds[0]?.tableNumber ?? "1",
        diningSessionId: sessionId,
        tabSummary,
        orders: rounds,
        createdAt: latestRound?.createdAt ?? new Date().toISOString(),
        isBillRequested,
      });
    }

    for (const s of singleOrders) {
      result.push({
        id: s.id,
        type: "single",
        tableNumber: s.tableNumber,
        diningSessionId: null,
        tabSummary: null,
        orders: [s],
        createdAt: s.createdAt,
        isBillRequested: false,
      });
    }

    // Sort: bill_requested first, then newest activity first
    result.sort((a, b) => {
      if (a.isBillRequested && !b.isBillRequested) return -1;
      if (!a.isBillRequested && b.isBillRequested) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [orders]);

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

  // Settle whole tab action
  const handleOpenSettleTab = (group: DisplayGroup) => {
    setSettleModalGroup(group);
    setTabPaymentMethod("cash");
    setTabPaymentNote("");
    setTabSettleError(null);
  };

  const handleConfirmSettleTab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalGroup || !settleModalGroup.diningSessionId) return;

    setIsSettlingTab(true);
    setTabSettleError(null);

    try {
      const res = await adminApi.settleTab(
        settleModalGroup.diningSessionId,
        tabPaymentMethod,
        tabPaymentNote.trim() || undefined
      );

      if (res.ok) {
        // Mark all rounds in this tab as paid with this method
        setOrders((prev) =>
          prev.map((o) =>
            o.diningSessionId === settleModalGroup.diningSessionId
              ? {
                  ...o,
                  status: "served",
                  paymentStatus: "paid",
                  paymentMethod: tabPaymentMethod,
                  tabSummary: o.tabSummary
                    ? {
                        ...o.tabSummary,
                        status: "closed",
                        paymentStatus: "paid",
                        amountDuePaise: 0,
                        paidPaise: o.tabSummary.totalPaise,
                      }
                    : null,
                }
              : o
          )
        );

        setSettleModalGroup(null);
        await fetchOrders();
        onOrderUpdate?.();
      } else {
        setTabSettleError(res.message || "Failed to settle dining tab");
      }
    } catch (err) {
      setTabSettleError((err as Error).message || "Error settling tab");
    } finally {
      setIsSettlingTab(false);
    }
  };

  // View Bill / Receipt
  const handleViewBillOrReceipt = async (order: AdminOrderRow) => {
    setIsLoadingBill(true);
    try {
      const res = order.diningSessionId
        ? await adminApi.getTabBillOrReceipt(order.diningSessionId)
        : await adminApi.getBillOrReceipt(order.id);
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

  // Legacy single-order counter payment
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

  // Cancel order action
  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalOrder || !cancelReason.trim()) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      const res = await adminApi.cancelOrder(cancelModalOrder.id, cancelReason.trim());

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
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Placed
          </span>
        );
      case "accepted":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Accepted
          </span>
        );
      case "preparing":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse">
            Preparing
          </span>
        );
      case "ready":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Ready
          </span>
        );
      case "served":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            Served
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-800">
            Cancelled
          </span>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTabStatusBadge = (group: DisplayGroup) => {
    if (group.isBillRequested) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-700 animate-pulse">
          Bill Requested
        </span>
      );
    }
    const tabStatus = group.tabSummary?.status;
    if (tabStatus === "closed") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
          Closed
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
        Open Tab
      </span>
    );
  };

  const getPaymentBadge = (status: string, method?: string | null) => {
    switch (status) {
      case "paid": {
        const isOnline = method === "pay_now" || method === "online";
        const label = isOnline
          ? "Paid (Online)"
          : method
          ? `Paid (${method === "counter" || method === "cash" ? "Counter" : method.toUpperCase()})`
          : "Paid (Online)";
        return (
          <span className="inline-flex items-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
            ● {label}
          </span>
        );
      }
      case "counter":
      case "open":
        return (
          <span className="inline-flex items-center text-sm font-medium text-amber-700 dark:text-amber-400">
            ● Pay at Counter
          </span>
        );
      case "bill_requested":
        return (
          <span className="inline-flex items-center text-sm font-medium text-amber-600 dark:text-amber-400 font-semibold">
            ● Bill Requested
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center text-sm font-medium text-red-600 dark:text-red-400">
            ● Payment Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-sm font-medium text-zinc-500">
            ● Pending
          </span>
        );
    }
  };

  const getGroupPaymentState = (group: DisplayGroup) => {
    if (group.type === "tab") {
      return {
        status:
          group.tabSummary?.paymentStatus ??
          (group.isBillRequested
            ? "bill_requested"
            : group.orders.length > 0 && group.orders.every((order) => order.paymentStatus === "paid")
              ? "paid"
              : "open"),
        method:
          group.orders.find((order) => order.paymentStatus === "paid")?.paymentMethod ??
          group.orders[0]?.paymentMethod ??
          null,
      };
    }
    return {
      status: group.orders[0]?.paymentStatus ?? "pending",
      method: group.orders[0]?.paymentMethod ?? null,
    };
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

  const selectedTabItems = selectedTabItemsGroup ? getConsolidatedGroupItems(selectedTabItemsGroup.orders) : [];

  return (
    <div className="space-y-3 w-full max-w-full overflow-x-hidden">
      {/* Search & Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[var(--bg-surface)] p-2.5 sm:p-3 rounded-xl border border-[var(--border-subtle)] shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-[340px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search order #, table, customer, item..."
            className="w-full h-10 pl-10 pr-3.5 text-base rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
          />
        </div>

        {/* Filter Selects & Refresh */}
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
          <div className="flex items-center gap-1.5 text-base font-medium text-[var(--text-secondary)]">
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
            className="h-10 px-3 text-base font-medium rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer min-h-[44px]"
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
            className="h-10 px-3 text-base font-medium rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] cursor-pointer min-h-[44px]"
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
            className="h-10 px-3.5 text-sm font-semibold min-h-[44px]"
            leftIcon={<RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Orders List Container */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : groups.length === 0 && !isLoading ? (
          <div className="p-12 text-center">
            <Receipt className="mx-auto h-10 w-10 text-[var(--text-muted)] opacity-50 mb-3" />
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">No orders found</h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Try adjusting your search criteria or status filter.
            </p>
          </div>
        ) : (
          <div className="w-full">
            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block w-full overflow-x-auto">
              <table className="w-full table-fixed text-left text-base border-collapse min-w-[1325px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[#F4EFEA] text-[#29231F] font-mono uppercase text-sm font-extrabold tracking-wide">
                    <th className="w-[115px] py-3 px-2 font-extrabold">Table</th>
                    <th className="w-[180px] py-3 px-2 font-extrabold">Order ID</th>
                    <th className="w-[300px] py-3 px-2 font-extrabold">Items Summary</th>
                    <th className="w-[120px] py-3 px-2 text-right font-extrabold">Total</th>
                    <th className="w-[150px] py-3 px-2 font-extrabold">Final Status</th>
                    <th className="w-[165px] py-3 px-2 font-extrabold">Payment Status</th>
                    <th className="w-[100px] py-3 px-2 font-extrabold">Time</th>
                    <th className="w-[195px] py-3 px-2 text-right font-extrabold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {groups.map((group) => {
                    const isTab = group.type === "tab" && group.diningSessionId;
                    const isPaid =
                      (group.tabSummary?.paymentStatus === "paid" ||
                        group.orders.every((o) => o.paymentStatus === "paid")) &&
                      group.tabSummary?.amountDuePaise === 0;

                    const activeRounds = group.orders.filter((o) => o.status !== "cancelled");
                    const itemsSummaryText = summarizeGroupItems(group);

                    const totalAmountPaise = group.tabSummary
                      ? group.tabSummary.totalPaise
                      : group.orders[0]?.totalPaise ?? 0;

                    const rowBgClass = group.isBillRequested
                      ? "bg-amber-50/70 dark:bg-amber-950/20 border-l-4 border-l-amber-500"
                      : "hover:bg-[var(--bg-subtle)]/80 transition-colors";

                    return (
                      <React.Fragment key={group.id}>
                        <tr
                          data-testid="tab-group-row"
                          tabIndex={0}
                          className={`${rowBgClass} focus-within:bg-[var(--bg-subtle)]/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]`}
                        >
                          {/* Table */}
                          <td className="py-3 px-2 align-top">
                            <div className="font-semibold text-base text-[var(--text-primary)]">
                              {getTableDisplayName(group.tableNumber)}
                            </div>
                          </td>

                          {/* One customer-facing order ID per open dining tab; kitchen rounds stay internal. */}
                          <td className="py-3 px-2 align-top">
                            <div className="text-base font-semibold leading-6 text-[var(--text-primary)]" title={isTab ? "One dining-tab order reference; individual kitchen rounds are tracked internally" : group.orders[0]?.orderNumber}>
                              <span className="whitespace-nowrap">#{group.orders[0]?.orderNumber ?? "?"}</span>
                              {isTab && group.orders.length > 1 && (
                                <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">{group.orders.length} kitchen rounds</span>
                              )}
                            </div>
                          </td>

                          {/* Items Summary */}
                          <td className="py-3 px-2 align-top text-base leading-6 text-[var(--text-primary)]">
                            <span title={itemsSummaryText}>{itemsSummaryText}</span>
                          </td>

                          {/* Plain total amount; subtotal and tax belong on the bill. */}
                          <td className="py-3 px-2 text-right align-top text-base font-semibold text-[var(--text-primary)] tabular-nums whitespace-nowrap">
                            {formatPaiseToINR(totalAmountPaise)}
                          </td>

                          {/* Final kitchen stage is the primary table status; tab billing remains secondary. */}
                          <td className="py-3 px-2 align-top">
                            <div className="flex flex-col items-start gap-1.5">
                              {getStatusBadge((activeRounds[activeRounds.length - 1] ?? group.orders[group.orders.length - 1])?.status ?? "placed")}
                              {isTab && <span className="text-sm text-[var(--text-muted)]">{getTabStatusBadge(group)}</span>}
                            </div>
                          </td>

                          {/* Payment status is kept separate from kitchen progress. */}
                          <td data-testid="payment-status-cell" className="py-3 px-2 align-top">
                            {(() => {
                              const payment = getGroupPaymentState(group);
                              return getPaymentBadge(payment.status, payment.method);
                            })()}
                          </td>

                          {/* Time */}
                          <td className="py-3 px-2 align-top text-sm font-medium text-[var(--text-secondary)] tabular-nums">
                            {formatElapsedTime(group.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap align-top">
                            {isTab ? (
                              <>
                                <button type="button" onClick={() => setSelectedTabItemsGroup(group)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer" title="View all ordered items" aria-label={`View items for ${getTableDisplayName(group.tableNumber)}`}><Eye className="h-5 w-5" /></button>
                                {!isPaid && (
                                  <Button
                                    type="button"
                                    data-testid="settle-tab-btn"
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleOpenSettleTab(group)}
                                    aria-label={`Settle ${getTableDisplayName(group.tableNumber)} tab`}
                                    className="h-10 px-3 text-base font-semibold shadow-xs"
                                    leftIcon={<Banknote className="h-4 w-4" />}
                                  >
                                    Settle Tab
                                  </Button>
                                )}
                                {group.orders[0] && (
                                  <button
                                    type="button"
                                    onClick={() => handleViewBillOrReceipt(group.orders[0])}
                                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                                    title={isPaid ? "Print Tab Receipt" : "Print Tab Bill"}
                                    aria-label={`Print for ${getTableDisplayName(group.tableNumber)}`}
                                  >
                                    <Printer className="h-5 w-5" />
                                  </button>
                                )}
                              </>
                            ) : (
                              // Legacy Single Order Actions
                              <>
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrder(group.orders[0])}
                                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                                  title="View order details"
                                  aria-label={`View order ${group.orders[0]?.orderNumber}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleViewBillOrReceipt(group.orders[0])}
                                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                                  title={group.orders[0]?.paymentStatus === "paid" ? "Print Receipt" : "Print Bill"}
                                  aria-label={`Print bill for ${group.orders[0]?.orderNumber}`}
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                                {group.orders[0]?.paymentStatus !== "paid" &&
                                  group.orders[0]?.status !== "cancelled" &&
                                  !group.orders[0]?.diningSessionId && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenRecordPayment(group.orders[0])}
                                      className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                                      title="Record counter payment"
                                      aria-label={`Record payment for ${group.orders[0]?.orderNumber}`}
                                    >
                                      <Banknote className="h-4 w-4" />
                                    </button>
                                  )}
                                {group.orders[0]?.status !== "served" &&
                                  group.orders[0]?.status !== "cancelled" && (
                                    <button
                                      type="button"
                                      data-testid="cancel-order-btn"
                                      onClick={() => {
                                        setCancelModalOrder(group.orders[0]);
                                        setCancelReason("");
                                        setCancelError(null);
                                      }}
                                      className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                                      title="Cancel order"
                                      aria-label={`Cancel order ${group.orders[0]?.orderNumber}`}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </button>
                                  )}
                              </>
                            )}
                          </td>
                        </tr>

                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (< 768px, down to 360px) */}
            <div className="block md:hidden divide-y divide-[var(--border-subtle)]">
              {groups.map((group) => {
                const isTab = group.type === "tab" && group.diningSessionId;
                const isPaid =
                  (group.tabSummary?.paymentStatus === "paid" ||
                    group.orders.every((o) => o.paymentStatus === "paid")) &&
                  group.tabSummary?.amountDuePaise === 0;

                const activeRounds = group.orders.filter((o) => o.status !== "cancelled");
                const itemsSummaryText = summarizeGroupItems(group);

                const totalAmountPaise = group.tabSummary
                  ? group.tabSummary.totalPaise
                  : group.orders[0]?.totalPaise ?? 0;

                const cardHighlight = group.isBillRequested
                  ? "bg-amber-50/60 dark:bg-amber-950/20 border-l-4 border-l-amber-500"
                  : "";

                return (
                  <div
                    key={group.id}
                    data-testid="tab-group-row"
                    className={`p-3.5 sm:p-4 space-y-3 ${cardHighlight}`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                          <span className="font-semibold text-lg text-[var(--text-primary)]">
                            {getTableDisplayName(group.tableNumber)}
                          </span>
                        <div className="mt-1 space-y-0.5 text-base text-[var(--text-secondary)]">
                          <div>Order ID: {group.orders[0]?.orderNumber ?? "?"}</div>
                          {group.type === "tab" && group.orders.length > 1 && (
                            <div className="text-xs text-[var(--text-muted)]">{group.orders.length} kitchen rounds ? one dining tab</div>
                          )}
                          <div className="text-[var(--text-muted)]">{formatElapsedTime(group.createdAt)}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-normal text-[var(--text-primary)] tabular-nums">
                          {formatPaiseToINR(totalAmountPaise)}
                        </div>
                        <div className="mt-1">
                          {getStatusBadge((activeRounds[activeRounds.length - 1] ?? group.orders[group.orders.length - 1])?.status ?? "placed")}
                        </div>
                      </div>
                    </div>

                    {/* Items summary */}
                    <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                      {itemsSummaryText}
                    </p>

                    {/* Billing and payment are separate from the kitchen stage. */}
                    {isTab && <div className="text-base pt-1">{getTabStatusBadge(group)}</div>}
                    <div data-testid="mobile-payment-status" className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-2">
                      <span className="text-sm font-semibold text-[var(--text-secondary)]">Payment Status</span>
                      {(() => {
                        const payment = getGroupPaymentState(group);
                        return getPaymentBadge(payment.status, payment.method);
                      })()}
                    </div>

                    {/* Mobile Touch Action Buttons (at least 44px min height) */}
                    <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
                      {isTab ? (
                        <>
                          {!isPaid && (
                            <Button
                              type="button"
                              data-testid="settle-tab-btn"
                              variant="primary"
                              onClick={() => handleOpenSettleTab(group)}
                              aria-label={`Settle ${getTableDisplayName(group.tableNumber)} tab`}
                              className="h-11 min-h-[44px] flex-1 justify-center text-base font-semibold shadow-xs"
                              leftIcon={<Banknote className="h-4 w-4" />}
                            >
                              Settle Tab
                            </Button>
                          )}
                          <Button
                            type="button"
                            data-testid="view-tab-items-btn"
                            variant="outline"
                            aria-label={`View items for ${getTableDisplayName(group.tableNumber)}`}
                            onClick={() => setSelectedTabItemsGroup(group)}
                            className="h-11 min-h-[44px] flex-1 justify-center text-base font-semibold"
                            leftIcon={<Eye className="h-4 w-4" />}
                          >
                            View Items
                          </Button>
                          {group.orders[0] && (
                            <Button
                              type="button"
                              data-testid="print-tab-bill-btn"
                              variant="outline"
                              onClick={() => handleViewBillOrReceipt(group.orders[0])}
                              isLoading={isLoadingBill}
                              className="h-11 min-h-[44px] flex-1 justify-center text-base font-semibold"
                              leftIcon={<Printer className="h-4 w-4" />}
                            >
                              View / Print Bill
                            </Button>
                          )}
                        </>
                      ) : (
                        // Legacy single order mobile actions
                        <div className="flex items-center gap-2 w-full">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedOrder(group.orders[0])}
                            className="h-11 min-h-[44px] flex-1 justify-center text-base font-semibold"
                            leftIcon={<Eye className="h-4 w-4" />}
                          >
                            Details
                          </Button>
                          {group.orders[0]?.paymentStatus !== "paid" &&
                            group.orders[0]?.status !== "cancelled" &&
                            !group.orders[0]?.diningSessionId && (
                              <Button
                                type="button"
                                variant="primary"
                                onClick={() => handleOpenRecordPayment(group.orders[0])}
                                className="h-11 min-h-[44px] flex-1 justify-center text-base font-semibold shadow-xs"
                                leftIcon={<Banknote className="h-4 w-4" />}
                              >
                                Record Payment
                              </Button>
                            )}
                        </div>
                      )}
                      {group.orders[0] &&
                        group.orders[0].status !== "served" &&
                        group.orders[0].status !== "cancelled" && (
                          <Button
                            type="button"
                            data-testid="cancel-order-btn"
                            variant="outline"
                            onClick={() => {
                              setCancelModalOrder(group.orders[0]);
                              setCancelReason("");
                              setCancelError(null);
                            }}
                            className="h-11 min-h-[44px] w-full justify-center border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                            leftIcon={<XCircle className="h-4 w-4" />}
                          >
                            Cancel Order
                          </Button>
                        )}
                    </div>

                  </div>
                );
              })}
            </div>
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
            {totalCount === 1 ? "group / tab" : "groups / tabs"}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-9 min-h-[36px] px-2.5 text-xs"
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
              className="h-9 min-h-[36px] px-2.5 text-xs"
              rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Settle Dining Tab Modal */}
      {settleModalGroup && (
        <div
          data-testid="settle-tab-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settle-tab-title"
        >
          <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl p-6 text-[var(--text-primary)]">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 mb-4">
              <div className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-950/60">
                <Banknote className="h-6 w-6" />
              </div>
              <div>
                <h3 id="settle-tab-title" className="font-bold text-base">
                  Settle {getTableDisplayName(settleModalGroup.tableNumber)} Tab
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Consolidated bill and outstanding balance
                </p>
              </div>
            </div>

            {/* Financial breakdown */}
            <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] mb-4 space-y-2 text-sm tabular-nums">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Subtotal</span>
                <span>
                  {formatPaiseToINR(settleModalGroup.tabSummary?.subtotalPaise ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>GST (5%)</span>
                <span>
                  {formatPaiseToINR(settleModalGroup.tabSummary?.taxPaise ?? 0)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[var(--border-subtle)] font-bold text-sm text-[var(--text-primary)]">
                <span>Tab Total</span>
                <span>
                  {formatPaiseToINR(settleModalGroup.tabSummary?.totalPaise ?? 0)}
                </span>
              </div>
              {(settleModalGroup.tabSummary?.paidPaise ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Already Paid</span>
                  <span>
                    - {formatPaiseToINR(settleModalGroup.tabSummary?.paidPaise ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-dashed border-[var(--border-subtle)] text-base font-extrabold text-[var(--primary)]">
                <span>Amount Due</span>
                <span>
                  {formatPaiseToINR(
                    settleModalGroup.tabSummary?.amountDuePaise ??
                      settleModalGroup.tabSummary?.totalPaise ??
                      0
                  )}
                </span>
              </div>
            </div>

            {tabSettleError && (
              <div className="mb-4 p-2.5 rounded-lg bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                {tabSettleError}
              </div>
            )}

            <form onSubmit={handleConfirmSettleTab} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                  Select Settlement Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTabPaymentMethod("cash")}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer min-h-[44px] ${
                      tabPaymentMethod === "cash"
                        ? "border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)] font-bold shadow-xs"
                        : "border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <Banknote className="h-4 w-4" />
                    <span className="text-xs">Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTabPaymentMethod("card")}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer min-h-[44px] ${
                      tabPaymentMethod === "card"
                        ? "border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)] font-bold shadow-xs"
                        : "border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs">Card / POS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTabPaymentMethod("upi")}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer min-h-[44px] ${
                      tabPaymentMethod === "upi"
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
                  htmlFor="tab-settle-note"
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
                >
                  Cashier Audit Note (Optional)
                </label>
                <input
                  id="tab-settle-note"
                  type="text"
                  value={tabPaymentNote}
                  onChange={(e) => setTabPaymentNote(e.target.value)}
                  placeholder="e.g. Settle table tab at counter"
                  className="w-full p-2.5 text-xs rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSettleModalGroup(null)}
                  className="min-h-[44px] px-4"
                >
                  Cancel
                </Button>
                <Button
                  data-testid="confirm-settle-tab-btn"
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSettlingTab}
                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                  className="min-h-[44px] px-4 font-semibold"
                >
                  Confirm & Close Tab
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consolidated tab items drawer */}
      <Sheet
        isOpen={Boolean(selectedTabItemsGroup)}
        onClose={() => setSelectedTabItemsGroup(null)}
        side="right"
        title={selectedTabItemsGroup ? "Items for " + getTableDisplayName(selectedTabItemsGroup.tableNumber) : "Tab Items"}
      >
        {selectedTabItemsGroup && (
          <div className="space-y-4 text-base" data-testid="tab-items-drawer">
            <h4 className="text-base font-semibold text-[var(--text-primary)]">Items Ordered</h4>
            {selectedTabItems.length > 0 ? (
              <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] px-3">
                {selectedTabItems.map((item) => (
                  <li key={item.key} className="flex items-start justify-between gap-4 py-3 text-base text-[var(--text-primary)]">
                    <div className="min-w-0">
                      <span className="font-normal">{item.quantity} × {item.name}</span>
                      {item.modifiers.length > 0 && (
                        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{item.modifiers.join(", ")}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-base font-normal tabular-nums">{formatPaiseToINR(item.totalPaise)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-[var(--border-subtle)] p-3 text-sm text-[var(--text-secondary)]">No active items on this tab.</p>
            )}
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-base">
              <span>Total</span>
              <span className="tabular-nums font-normal text-[var(--text-primary)]">{formatPaiseToINR(selectedTabItemsGroup.tabSummary?.totalPaise ?? 0)}</span>
            </div>
            <Button
              type="button"
              variant="primary"
              className="w-full min-h-11 justify-center text-sm"
              isLoading={isLoadingBill}
              onClick={() => {
                const firstOrder = selectedTabItemsGroup.orders[0];
                setSelectedTabItemsGroup(null);
                if (firstOrder) void handleViewBillOrReceipt(firstOrder);
              }}
              leftIcon={<Printer className="h-4 w-4" />}
            >
              View / Print Consolidated Bill
            </Button>
          </div>
        )}
      </Sheet>

      {/* View Order Detail Sheet */}
      <Sheet
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        side="right"
        title={selectedOrder ? `Order ${selectedOrder.orderNumber}` : "Order Details"}
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
                <span className="text-sm text-[var(--text-muted)] uppercase block">
                  Kitchen Status
                </span>
                <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="text-right">
                <span className="text-xs text-[var(--text-muted)] uppercase font-mono block">
                  Payment Status
                </span>
                <div className="mt-1">
                  {selectedOrder.diningSessionId ? (
                    <span className="inline-flex items-center text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-400">
                      {selectedOrder.alreadyPaidBeforeTab
                        ? "Already Paid Before Tab"
                        : selectedOrder.tabSummary?.status === "closed"
                          ? "Settled With Tab"
                          : "Included In Tab"}
                    </span>
                  ) : (
                    getPaymentBadge(selectedOrder.paymentStatus, selectedOrder.paymentMethod)
                  )}
                </div>
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
                    <div className="text-sm sm:text-base text-[var(--text-primary)] text-right tabular-nums">
                      {formatPaiseToINR(item.pricePaise * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-3 rounded-lg border border-[var(--border-subtle)] space-y-2 text-sm tabular-nums">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Subtotal</span>
                <span>{formatPaiseToINR(selectedOrder.subtotalPaise)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>GST (5%)</span>
                <span>{formatPaiseToINR(selectedOrder.taxPaise)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-[var(--border-subtle)] text-base text-[var(--text-primary)]">
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
                  variant={
                    selectedOrder.diningSessionId
                      ? selectedOrder.alreadyPaidBeforeTab || selectedOrder.tabSummary?.status === "closed"
                        ? "success"
                        : "secondary"
                      : selectedOrder.paymentStatus === "paid"
                        ? "success"
                        : "secondary"
                  }
                  className="text-sm uppercase"
                >
                  {selectedOrder.diningSessionId
                    ? selectedOrder.alreadyPaidBeforeTab
                      ? "PAID BEFORE TAB"
                      : selectedOrder.tabSummary?.status === "closed"
                        ? "SETTLED WITH TAB"
                        : "INCLUDED IN TAB"
                    : selectedOrder.paymentStatus === "paid"
                      ? "PAID"
                      : "UNPAID"}
                </Badge>
              </div>

              {selectedOrder.diningSessionId ? (
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
                      {selectedOrder.tabSummary?.status === "closed"
                        ? "View / Print Consolidated Receipt"
                        : "View / Print Consolidated Tab Bill"}
                    </Button>
                    <a
                      href={adminApi.tabReceiptPdfUrl(selectedOrder.diningSessionId)}
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
                        Download Consolidated PDF
                      </Button>
                    </a>
                  </div>
                  {selectedOrder.alreadyPaidBeforeTab ? (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 italic">
                      This order was paid previously, so its amount is excluded from the balance due.
                    </p>
                  ) : selectedOrder.tabSummary?.status !== "closed" ? (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                      This order is included in the consolidated bill. Collect the outstanding balance once for the entire table.
                    </p>
                  ) : null}
                </div>
              ) : selectedOrder.paymentStatus !== "paid" ? (
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
                    {evt.note && <p className="text-[11px] text-[var(--text-secondary)]">{evt.note}</p>}
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

      {/* Record Counter Payment Modal (Legacy Single Orders Only) */}
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
              <span className="text-base font-normal text-[var(--text-primary)] tabular-nums">
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
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer min-h-[44px] ${
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
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer min-h-[44px] ${
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
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 cursor-pointer min-h-[44px] ${
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
        pdfDownloadUrl={
          receiptData
            ? receiptData.isTabBill
              ? adminApi.tabReceiptPdfUrl(receiptData.orderId)
              : adminApi.getReceiptPdfUrl(receiptData.orderId)
            : undefined
        }
        isManager={true}
      />
    </div>
  );
}
