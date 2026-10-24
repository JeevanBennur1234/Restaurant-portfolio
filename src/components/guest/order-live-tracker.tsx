"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { OrderStepper } from "./order-stepper";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPaiseToINR } from "@/lib/currency";
import { customerApi } from "@/lib/api/customer";
import { userMessageFor } from "@/lib/api/errors";
import type { OrderDetails, OrderStatus, ReceiptData } from "@/lib/api/types";
import { loadRazorpayScript } from "@/lib/razorpay-client";
import type { RazorpayOptions, RazorpaySuccessResponse } from "@/types/razorpay";
import {
  PlusCircle,
  Clock,
  Sparkles,
  RotateCw,
  Flame,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Banknote,
  QrCode,
  Receipt,
  Download,
  Eye,
} from "lucide-react";
import { UpiQrModal } from "./upi-qr-modal";
import { ReceiptModal } from "@/components/common/receipt-view";

export interface OrderLiveTrackerProps {
  initialOrder: OrderDetails;
  token: string;
  paymentsEnabled?: boolean;
  paymentsTestMode?: boolean;
}

const statusHeadlines: Record<
  OrderStatus,
  { title: string; subtitle: string; icon: React.ReactNode }
> = {
  placed: {
    title: "Order Placed & Queued",
    subtitle: "Your order ticket has reached the kitchen counter.",
    icon: <Clock className="h-5 w-5 text-[var(--accent)]" />,
  },
  accepted: {
    title: "Order Accepted",
    subtitle: "The chef has reviewed your order and queued preparation.",
    icon: <Clock className="h-5 w-5 text-[var(--accent)]" />,
  },
  preparing: {
    title: "Cooking in Sigdi & Tandoor",
    subtitle: "Our chefs are firing up fresh spices for your table.",
    icon: <Flame className="h-5 w-5 text-[var(--primary)]" />,
  },
  ready: {
    title: "Plated & Ready to Serve",
    subtitle: "Your food is hot and plated. The runner is heading your way.",
    icon: <Sparkles className="h-5 w-5 text-[var(--accent)]" />,
  },
  served: {
    title: "Delivered to Table",
    subtitle: "Enjoy your culinary journey at Masala Lane!",
    icon: <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />,
  },
  cancelled: {
    title: "Order Cancelled",
    subtitle: "This order was cancelled. Please check with your server.",
    icon: <Clock className="h-5 w-5 text-[var(--destructive)]" />,
  },
};

export function shouldOfferServedBill(status: OrderStatus): boolean {
  return status === "served";
}

export function getOrderStatusHeadline(
  order: Pick<OrderDetails, "status" | "paymentStatus">
): { title: string; subtitle: string; icon: React.ReactNode } {
  if (order.status === "served") {
    return {
      ...statusHeadlines.served,
      title: "Thank You!",
      subtitle:
        order.paymentStatus === "counter"
          ? "Your order has been served. Please pay at the counter when you’re ready."
          : "Your order has been served. Thank you for dining with us!",
    };
  }
  return statusHeadlines[order.status] ?? statusHeadlines.placed;
}

export function OrderLiveTracker({
  initialOrder,
  token,
  paymentsEnabled = true,
  paymentsTestMode = false,
}: OrderLiveTrackerProps) {
  const router = useRouter();
  const [order, setOrder] = React.useState<OrderDetails>(initialOrder);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date>(new Date());

  // Payment retry states
  const [isPaying, setIsPaying] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [isUpiQrOpen, setIsUpiQrOpen] = React.useState(false);

  // Digital Receipt state
  const [receiptData, setReceiptData] = React.useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = React.useState(false);
  const [isLoadingReceipt, setIsLoadingReceipt] = React.useState(false);
  const [billViewError, setBillViewError] = React.useState<string | null>(null);
  const [isRequestingBill, setIsRequestingBill] = React.useState(false);
  const [billRequestMessage, setBillRequestMessage] = React.useState<string | null>(null);

  const fetchReceipt = React.useCallback(async () => {
    setIsLoadingReceipt(true);
    try {
      const res = await customerApi.getReceipt({ orderId: order.id, token });
      if (res.ok && res.data) {
        setReceiptData(res.data);
        return res.data;
      }
      return null;
    } catch {
      return null;
    } finally {
      setIsLoadingReceipt(false);
    }
  }, [order.id, token]);

  const handleOpenReceipt = async () => {
    if (!receiptData) {
      const data = await fetchReceipt();
      if (data) {
        setIsReceiptOpen(true);
      }
    } else {
      setIsReceiptOpen(true);
    }
  };

  const handleRequestBill = async () => {
    setIsRequestingBill(true);
    setBillViewError(null);
    setBillRequestMessage(null);
    try {
      const result = await customerApi.requestTabBill(token, "counter");
      if (!result.ok) {
        setBillViewError(result.message || "Could not request your bill. Please ask your server for help.");
        return;
      }
      setBillRequestMessage("Bill requested! Your server has been notified. Please pay at the counter when they arrive.");
    } catch {
      setBillViewError("Could not request your bill. Please try again or ask your server for help.");
    } finally {
      setIsRequestingBill(false);
    }
  };

  const handleViewBill = async () => {
    setIsLoadingReceipt(true);
    setBillViewError(null);
    try {
      const result = order.diningSessionId
        ? await customerApi.getTabReceipt(token)
        : await customerApi.getBillOrReceipt(order.id, token);
      if (!result.ok) {
        setBillViewError(result.message || "Could not load your bill. Please ask the staff for help.");
        return;
      }
      if (!result.data) {
        setBillViewError("Could not load your bill. Please ask the staff for help.");
        return;
      }
      setReceiptData(result.data);
      setIsReceiptOpen(true);
    } catch {
      setBillViewError("Could not load your bill. Please try again or ask the staff for help.");
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const handleCloseReceipt = () => {
    setIsReceiptOpen(false);
    if (!shouldOfferServedBill(order.status)) return;

    // A browser only permits window.close() for windows opened by script.
    // For a normal user-opened tab, return to the table menu instead.
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    router.replace(`/t/${token}`);
  };

  const refreshOrder = React.useCallback(async () => {
    try {
      const res = await customerApi.getOrder({ orderId: order.id, token });
      if (res.ok && res.data) {
        setOrder(res.data);
        setLastRefreshed(new Date());
      }
    } catch {
      // Silent fail on network hiccup
    }
  }, [order.id, token]);

  // Supabase client instantiated once per component
  const supabase = React.useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("placeholder") &&
      !supabaseAnonKey.includes("placeholder")
    ) {
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return null;
  }, []);

  // 1. Setup Supabase Realtime WebSocket listener
  React.useEffect(() => {
    if (!supabase || !order.id) return;

    let channel: RealtimeChannel | null = null;

    try {
      channel = supabase
        .channel(`order:${order.id}`)
        .on("broadcast", { event: "order.status_changed" }, (payload) => {
          const newStatus = payload.payload?.status as OrderStatus | undefined;
          if (newStatus) {
            setOrder((prev) => ({ ...prev, status: newStatus }));
            setLastRefreshed(new Date());
          }
          // Treat event as hint and re-fetch via authenticated action
          refreshOrder();
        })
        .on("broadcast", { event: "order.paid" }, () => {
          setOrder((prev) => ({ ...prev, paymentStatus: "paid" }));
          setLastRefreshed(new Date());
          refreshOrder();
        })
        .on("broadcast", { event: "order.updated" }, () => {
          refreshOrder();
        })
        .subscribe();
    } catch (err) {
      console.warn("Supabase Realtime subscription error:", err);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, order.id, refreshOrder]);

  // 2. Setup 5-Second Polling Fallback
  React.useEffect(() => {
    const interval = setInterval(() => {
      refreshOrder();
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshOrder]);

  const currentHeadline = getOrderStatusHeadline(order);

  // The customer chooses when to view and close the bill after the kitchen marks the order served.

  // Online Payment Retry handler
  const handleRetryOnlinePayment = async () => {
    setIsPaying(true);
    setPaymentError(null);

    try {
      const rzpRes = await customerApi.createRazorpayOrder({
        orderId: order.id,
        token,
      });

      if (!rzpRes.ok) {
        setPaymentError(
          userMessageFor(
            rzpRes.code,
            rzpRes.message || "Failed to initialize payment gateway"
          )
        );
        setIsPaying(false);
        return;
      }

      if (!rzpRes.data.razorpayOrderId) {
        setPaymentError("Failed to retrieve payment order ID");
        setIsPaying(false);
        return;
      }

      const isLoaded = await loadRazorpayScript();

      if (!isLoaded || !window.Razorpay) {
        setPaymentError(
          "Could not load payment gateway. Please retry or switch to Pay at counter."
        );
        setIsPaying(false);
        return;
      }

      const options: RazorpayOptions = {
        key: rzpRes.data.keyId ?? "rzp_test_placeholder",
        amount: rzpRes.data.amountPaise ?? order.totalPaise,
        currency: "INR",
        name: "Masala Lane",
        description: `Order #${order.orderNumber} • ${order.tableNumber}`,
        order_id: rzpRes.data.razorpayOrderId,
        prefill: {},
        config: {
          display: {
            blocks: {
              upi: {
                name: "Pay using UPI",
                instruments: [
                  {
                    method: "upi",
                    flows: ["qr", "intent"],
                  },
                ],
              },
              other: {
                name: "Cards, Netbanking & Wallets",
                instruments: [
                  { method: "card" },
                  { method: "netbanking" },
                  { method: "wallet" },
                ],
              },
            },
            sequence: ["block.upi", "block.other"],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
        handler: async (response: RazorpaySuccessResponse) => {
          setIsPaying(true);
          const verifyRes = await customerApi.verifyRazorpayPayment({
            orderId: order.id,
            token,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });

          if (verifyRes.ok) {
            setOrder((prev) => ({ ...prev, paymentStatus: "paid" }));
          } else {
            setPaymentError(
              userMessageFor(
                verifyRes.code,
                verifyRes.message || "Verification failed on server"
              )
            );
          }
          setIsPaying(false);
        },
        modal: {
          ondismiss: () => {
            setIsPaying(false);
            setPaymentError(
              "Payment modal closed. You can retry paying now or switch to Pay at counter."
            );
          },
        },
        theme: {
          color: "#C85A32",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setPaymentError((err as Error).message ?? "Payment encountered an error");
      setIsPaying(false);
    }
  };

  const handleSwitchToCounter = async () => {
    setIsPaying(true);
    setPaymentError(null);
    try {
      const res = await customerApi.payAtCounter({
        orderId: order.id,
        token,
      });
      if (res.ok) {
        setOrder((prev) => ({
          ...prev,
          paymentStatus: "counter",
          paymentMethod: "counter",
        }));
      } else {
        setPaymentError(
          userMessageFor(res.code, res.message || "Failed to switch payment method")
        );
      }
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 py-6 max-w-lg mx-auto w-full space-y-5 pb-24">
      {/* Live Order Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
          </span>
          <span className="text-xs sm:text-sm font-mono uppercase tracking-widest text-[var(--text-secondary)]">
            Live Order • {order.tableNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {order.paymentStatus === "paid" ? (
            <Badge variant="success" size="sm" className="font-sans text-xs">
              Paid Online
            </Badge>
          ) : order.paymentStatus === "counter" ? (
            <Badge variant="secondary" size="sm" className="font-sans text-xs">
              {order.diningSessionId ? "Open Dine-In Tab" : "Pay at Counter"}
            </Badge>
          ) : (
            <Badge variant="destructive" size="sm" className="font-sans text-xs">
              Payment Pending
            </Badge>
          )}

          <Badge
            data-testid="order-number-badge"
            variant="secondary"
            size="md"
            className="font-mono text-sm font-semibold"
          >
            #{order.orderNumber}
          </Badge>
        </div>
      </div>

      {/* Payment Pending Alert & Actions */}
      {order.paymentStatus === "pending" && (
        <Card className="border-[var(--warning-border)] bg-[var(--warning-subtle)]/40 shadow-xs">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2.5 text-xs text-[var(--warning-foreground)]">
              <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--warning)] mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">
                  Payment Pending
                </h4>
                <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  Orders are sent to the kitchen display as soon as payment is confirmed. Please complete online payment or switch to paying at the counter.
                </p>
              </div>
            </div>

            {paymentError && (
              <div className="rounded-[var(--radius-sm)] bg-red-50 border border-red-200 p-2.5 text-[11px] text-red-800">
                {paymentError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {paymentsEnabled ? (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={isPaying}
                    onClick={() => setIsUpiQrOpen(true)}
                    className="flex-1 justify-center shadow-xs"
                    leftIcon={<QrCode className="h-4 w-4" />}
                  >
                    Scan UPI QR • {formatPaiseToINR(order.totalPaise)}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={isPaying}
                    onClick={handleRetryOnlinePayment}
                    className="flex-1 justify-center bg-white"
                    leftIcon={<CreditCard className="h-4 w-4" />}
                  >
                    Cards / Netbanking
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={isPaying}
                    onClick={handleSwitchToCounter}
                    className="flex-1 justify-center bg-white"
                    leftIcon={<Banknote className="h-4 w-4" />}
                  >
                    Pay at Counter
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  isLoading={isPaying}
                  onClick={handleSwitchToCounter}
                  className="flex-1 justify-center shadow-xs"
                  leftIcon={<Banknote className="h-4 w-4" />}
                >
                  Pay at Counter
                </Button>
              )}
            </div>

            {paymentsEnabled && paymentsTestMode && (
              <p
                data-testid="payments-test-mode-notice"
                className="text-[11px] text-[var(--text-muted)] italic text-center pt-1"
              >
                Test mode: no real money is charged.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {order.status === "served" && order.paymentStatus === "paid" && (
        <Card data-testid="served-paid-completion" className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 shadow-sm">
          <CardContent className="p-5 space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Order completed!</h2>
            <p className="text-sm text-[var(--text-secondary)]">Your payment is confirmed and your food has been served. Thank you for dining with us.</p>
            <Button data-testid="order-again-after-served-paid" className="w-full justify-center" onClick={() => router.replace(`/t/${token}`)} leftIcon={<PlusCircle className="h-4 w-4" />}>Order Again</Button>
            <Button variant="outline" className="w-full justify-center" onClick={() => { if (window.opener && !window.opener.closed) window.close(); else router.replace("/order"); }}>Close Ordering</Button>
          </CardContent>
        </Card>
      )}

      {/* Status Hero Card */}
      <Card className="border-[var(--border-strong)] shadow-[var(--shadow-card)] bg-[var(--bg-surface)]">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-[var(--primary-subtle)] p-2 shrink-0 mt-0.5">
              {currentHeadline.icon}
            </div>
            <div>
              <CardTitle data-testid="order-status-title" className="text-xl font-bold">
                {currentHeadline.title}
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                {currentHeadline.subtitle}
              </p>
              {order.status === "served" && (
                <p role="status" className="mt-2 text-xs font-medium text-[var(--success)]">
                  Your bill is ready to view below.
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {/* Stepper (Placed -> Preparing -> Ready -> Served) */}
          <OrderStepper status={order.status} />

          <div className="mt-2 flex items-center justify-between text-sm text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-3 gap-3">
            <span>
              Placed at{" "}
              {new Date(order.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {order.status !== "served" && (
              <span className="flex items-center gap-1 font-mono">
                <RotateCw className="h-3.5 w-3.5 animate-spin opacity-50" />
                Sync ({lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })})
              </span>
            )}
          </div>
          {shouldOfferServedBill(order.status) && (
            <div data-testid="served-bill-actions" className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
              <p className="text-sm text-[var(--text-secondary)]">Your order has been served.</p>
              {billRequestMessage && (
                <p role="status" className="rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 p-3 text-sm text-[var(--text-primary)]">{billRequestMessage}</p>
              )}
              {billViewError && (
                <p role="alert" className="rounded-lg border border-[var(--destructive-border)] bg-[var(--destructive-subtle)] p-3 text-sm text-[var(--destructive-foreground)]">
                  {billViewError}
                </p>
              )}
              {order.paymentStatus === "counter" && order.diningSessionId && !billRequestMessage && (
                <Button
                  type="button"
                  data-testid="request-served-bill-btn"
                  size="lg"
                  variant="primary"
                  isLoading={isRequestingBill}
                  onClick={handleRequestBill}
                  className="w-full justify-center gap-2"
                  leftIcon={<Receipt className="h-5 w-5" />}
                >
                  Request a Bill
                </Button>
              )}
              <Button
                type="button"
                data-testid="view-served-bill-btn"
                size="lg"
                variant="primary"
                isLoading={isLoadingReceipt}
                onClick={handleViewBill}
                className="w-full justify-center gap-2"
                leftIcon={<Receipt className="h-5 w-5" />}
              >
                View Bill
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paid Receipt Access Card */}
      {order.paymentStatus === "paid" && order.status !== "served" && (
        <Card className="border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/25 shadow-xs">
          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 p-2.5 text-emerald-700 dark:text-emerald-300 shrink-0">
                <Receipt className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                    Official Payment Receipt
                  </h4>
                  <Badge variant="success" className="text-[10px] font-mono uppercase">
                    PAID
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Payment has been confirmed. View your itemized digital receipt, print, or download PDF.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0">
              <Button
                size="sm"
                variant="outline"
                isLoading={isLoadingReceipt}
                onClick={handleOpenReceipt}
                className="h-9 px-3.5 text-xs font-semibold bg-white dark:bg-[var(--bg-surface)] shadow-xs"
                leftIcon={<Eye className="h-3.5 w-3.5" />}
              >
                View Receipt
              </Button>
              <a
                href={customerApi.getReceiptPdfUrl(order.id, token)}
                target="_blank"
                rel="noreferrer"
                download
              >
                <Button
                  size="sm"
                  variant="primary"
                  className="h-9 px-3.5 text-xs font-semibold shadow-xs"
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                >
                  Download PDF
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Itemized Order Summary */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">Order Summary</CardTitle>
            <span className="text-base text-[var(--text-muted)] font-mono">
              {order.items.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y divide-[var(--border-subtle)] text-sm">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-start justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-base sm:text-lg text-[var(--text-primary)]">
                    <span className="font-mono font-bold text-[var(--primary)] mr-1.5">
                      {item.quantity}×
                    </span>
                    {item.itemName}
                  </div>
                  {item.selectedModifiers.length > 0 && (
                    <div className="text-xs sm:text-sm text-[var(--text-muted)] pl-5">
                      {item.selectedModifiers.map((m) => m.name).join(", ")}
                    </div>
                  )}
                </div>
                <span className="text-base sm:text-lg font-medium text-[var(--text-primary)] tabular-nums shrink-0">
                  {formatPaiseToINR(item.totalPaise)}
                </span>
              </div>
            ))}
          </div>

          {/* Pricing Breakdown (Server Computed) */}
          <div className="border-t border-[var(--border-subtle)] pt-3 space-y-3 text-base">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {formatPaiseToINR(order.subtotalPaise)}
              </span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>GST (5%)</span>
              <span className="tabular-nums">{formatPaiseToINR(order.taxPaise)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold text-[var(--text-primary)] pt-2 border-t border-[var(--border-subtle)]">
              <span>Total Amount</span>
              <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
                {formatPaiseToINR(order.totalPaise)}
              </span>
            </div>
          </div>

          {order.notes && (
            <div className="rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] p-2.5 text-[11px] text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">
                Kitchen note:{" "}
              </span>
              {order.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tab orders remain open for more dishes; standalone counter orders do not. */}
      {order.status !== "served" && (order.paymentStatus !== "counter" || Boolean(order.diningSessionId)) && (
        <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-30">
          <Link href={`/t/${token}`} className="block w-full">
            <Button
              size="lg"
              variant="primary"
              className="w-full justify-center gap-2 shadow-[var(--shadow-elevated)]"
              leftIcon={<PlusCircle className="h-5 w-5" />}
            >
              Order More for {order.tableNumber}
            </Button>
          </Link>
        </div>
      )}

      {order.paymentStatus === "pending" && (
        <UpiQrModal
          isOpen={isUpiQrOpen}
          orderId={order.id}
          orderNumber={order.orderNumber}
          tableNumber={order.tableNumber}
          totalPaise={order.totalPaise}
          token={token}
          onClose={() => setIsUpiQrOpen(false)}
          onSuccess={() => {
            setOrder((prev) => ({ ...prev, paymentStatus: "paid" }));
            setIsUpiQrOpen(false);
          }}
          onSwitchToStandardCheckout={() => {
            setIsUpiQrOpen(false);
            handleRetryOnlinePayment();
          }}
          onSwitchToCounter={() => {
            setIsUpiQrOpen(false);
            handleSwitchToCounter();
          }}
        />
      )}

      {/* Digital Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={handleCloseReceipt}
        receipt={receiptData}
        pdfDownloadUrl={
          receiptData?.isTabBill
            ? customerApi.getTabReceiptPdfUrl(token)
            : receiptData?.isPaid
              ? customerApi.getReceiptPdfUrl(order.id, token)
              : undefined
        }
      />
    </div>
  );
}
