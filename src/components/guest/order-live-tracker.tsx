"use client";

import * as React from "react";
import Link from "next/link";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { OrderStepper } from "./order-stepper";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPaiseToINR } from "@/lib/currency";
import { customerApi } from "@/lib/api/customer";
import { userMessageFor } from "@/lib/api/errors";
import type { OrderDetails, OrderStatus } from "@/lib/api/types";
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
} from "lucide-react";

export interface OrderLiveTrackerProps {
  initialOrder: OrderDetails;
  token: string;
  isDemoMode?: boolean;
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

export function OrderLiveTracker({
  initialOrder,
  token,
  isDemoMode = false,
}: OrderLiveTrackerProps) {
  const [order, setOrder] = React.useState<OrderDetails>(initialOrder);
  const [isAdvancing, setIsAdvancing] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date>(new Date());

  // Payment retry states
  const [isPaying, setIsPaying] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);

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
      return createClient(supabaseUrl, supabaseAnonKey);
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

  const currentHeadline = statusHeadlines[order.status] ?? statusHeadlines.placed;

  // Next status for test simulation
  const nextStatusMap: Partial<Record<OrderStatus, OrderStatus>> = {
    placed: "preparing",
    accepted: "preparing",
    preparing: "ready",
    ready: "served",
  };
  const nextStatus = nextStatusMap[order.status];

  const handleSimulateAdvance = async () => {
    if (!nextStatus || isAdvancing) return;
    setIsAdvancing(true);
    try {
      const res = await customerApi.advanceOrder({ orderId: order.id, token });
      if (res.ok && res.data?.newStatus) {
        setOrder((prev) => ({ ...prev, status: res.data.newStatus }));
      }
    } finally {
      setIsAdvancing(false);
    }
  };

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

      if (rzpRes.data.simulated) {
        const confirmRes = await customerApi.simulatePayment({
          orderId: order.id,
          token,
        });

        if (confirmRes.ok) {
          setOrder((prev) => ({ ...prev, paymentStatus: "paid" }));
        } else {
          setPaymentError(
            userMessageFor(
              confirmRes.code,
              confirmRes.message || "Payment confirmation failed"
            )
          );
        }
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

  // Switch to Counter handler
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
          <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-secondary)]">
            Live Order • {order.tableNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {order.paymentStatus === "paid" ? (
            <Badge variant="success" size="sm" className="font-sans text-[11px]">
              Paid Online
            </Badge>
          ) : order.paymentStatus === "counter" ? (
            <Badge variant="secondary" size="sm" className="font-sans text-[11px]">
              Pay at Counter
            </Badge>
          ) : (
            <Badge variant="destructive" size="sm" className="font-sans text-[11px]">
              Payment Pending
            </Badge>
          )}

          <Badge variant="secondary" size="md" className="font-mono text-xs">
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
              <Button
                size="sm"
                variant="primary"
                isLoading={isPaying}
                onClick={handleRetryOnlinePayment}
                className="flex-1 justify-center shadow-xs"
                leftIcon={<CreditCard className="h-4 w-4" />}
              >
                Pay Now • {formatPaiseToINR(order.totalPaise)}
              </Button>

              <Button
                size="sm"
                variant="outline"
                isLoading={isPaying}
                onClick={handleSwitchToCounter}
                className="flex-1 justify-center bg-white"
                leftIcon={<Banknote className="h-4 w-4" />}
              >
                Pay at Counter Instead
              </Button>
            </div>
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
              <CardTitle className="text-lg">{currentHeadline.title}</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                {currentHeadline.subtitle}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {/* Stepper (Placed -> Preparing -> Ready -> Served) */}
          <OrderStepper status={order.status} />

          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-3">
            <span>
              Placed at{" "}
              {new Date(order.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <RotateCw className="h-3 w-3 animate-spin opacity-50" />
              Sync ({lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })})
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Demo Simulation Advance Pill */}
      {isDemoMode && nextStatus && (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--primary)] bg-[var(--primary-subtle)]/30 p-3 flex items-center justify-between">
          <div className="text-xs">
            <span className="font-bold text-[var(--primary)]">Demo Preview: </span>
            <span className="text-[var(--text-secondary)]">
              Simulate kitchen advancing order to{" "}
              <b className="capitalize">{nextStatus}</b>
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            isLoading={isAdvancing}
            onClick={handleSimulateAdvance}
            className="text-xs h-7 px-3 border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
          >
            Advance Step
          </Button>
        </div>
      )}

      {/* Itemized Order Summary */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Order Summary</CardTitle>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {order.items.reduce((s, i) => s + i.quantity, 0)} items
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y divide-[var(--border-subtle)] text-xs">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="py-2.5 flex items-start justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-[var(--text-primary)]">
                    <span className="font-mono font-bold text-[var(--primary)] mr-1.5">
                      {item.quantity}×
                    </span>
                    {item.itemName}
                  </div>
                  {item.selectedModifiers.length > 0 && (
                    <div className="text-[11px] text-[var(--text-muted)] pl-5">
                      {item.selectedModifiers.map((m) => m.name).join(", ")}
                    </div>
                  )}
                </div>
                <span className="font-mono font-semibold text-[var(--text-primary)] shrink-0">
                  {formatPaiseToINR(item.totalPaise)}
                </span>
              </div>
            ))}
          </div>

          {/* Pricing Breakdown (Server Computed) */}
          <div className="border-t border-[var(--border-subtle)] pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Subtotal</span>
              <span className="font-mono">
                {formatPaiseToINR(order.subtotalPaise)}
              </span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>GST (5%)</span>
              <span className="font-mono">{formatPaiseToINR(order.taxPaise)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-[var(--text-primary)] pt-1 border-t border-[var(--border-subtle)]">
              <span>Total Amount</span>
              <span className="font-mono text-base text-[var(--primary)]">
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

      {/* Sticky Bottom Actions: "Order More" */}
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
    </div>
  );
}
