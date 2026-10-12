"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { VegIndicator } from "./veg-indicator";
import { formatPaiseToINR } from "@/lib/currency";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  CreditCard,
  Banknote,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { useCart } from "./cart-context";
import { useToast } from "@/components/ui/toast";
import {
  placeOrderAction,
  createRazorpayOrderAction,
  verifyRazorpayPaymentAction,
  confirmSimulatedPaymentAction,
  switchOrderToCounterAction,
} from "@/server/actions/order";
import { loadRazorpayScript } from "@/lib/razorpay-client";
import type { RazorpayOptions, RazorpaySuccessResponse } from "@/types/razorpay";

export interface CartSheetProps {
  tableLabel: string;
  token: string;
}

type PaymentOption = "pay_now" | "counter";

export function CartSheet({ tableLabel, token }: CartSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [notes, setNotes] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentOption>("pay_now");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  // Failure & retry tracking
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);
  const [pendingOrderNumber, setPendingOrderNumber] = React.useState<string | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);

  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    totalPaise,
    menuItemMap,
    isCartOpen,
    setIsCartOpen,
  } = useCart();

  // Compute 5% GST preview for guest transparency
  const taxPreviewPaise = Math.round(totalPaise * 0.05);
  const grandTotalPaise = totalPaise + taxPreviewPaise;

  // Initiates Razorpay Checkout flow
  const initiateRazorpayPayment = async (orderId: string, orderNumber: string) => {
    setStatusMessage("Opening secure checkout...");
    const rzpOrderRes = await createRazorpayOrderAction({ orderId, token });

    if (!rzpOrderRes.success) {
      setPaymentError(
        rzpOrderRes.error ?? "Could not initialize payment. Please retry or choose Pay at counter."
      );
      setIsSubmitting(false);
      setStatusMessage(null);
      return;
    }

    if (rzpOrderRes.simulated) {
      setStatusMessage("Confirming demo payment...");
      const confirmRes = await confirmSimulatedPaymentAction({ orderId, token });
      if (confirmRes.success) {
        clearCart();
        setIsCartOpen(false);
        showToast({
          title: "Payment Verified",
          message: `Order #${orderNumber} sent to kitchen!`,
          variant: "success",
          duration: 3500,
        });
        router.push(`/t/${token}/order/${orderId}`);
      } else {
        setPaymentError(confirmRes.error ?? "Payment confirmation failed.");
      }
      setIsSubmitting(false);
      setStatusMessage(null);
      return;
    }

    if (!rzpOrderRes.razorpayOrderId) {
      setPaymentError(
        "Could not retrieve payment order ID. Please retry or choose Pay at counter."
      );
      setIsSubmitting(false);
      setStatusMessage(null);
      return;
    }

    const isLoaded = await loadRazorpayScript();

    if (!isLoaded || !window.Razorpay) {
      setPaymentError(
        "Could not load payment gateway. Please retry or choose Pay at counter."
      );
      setIsSubmitting(false);
      setStatusMessage(null);
      return;
    }

    // Launch official Razorpay Checkout popup
    const rzpOptions: RazorpayOptions = {
      key: rzpOrderRes.keyId ?? "rzp_test_placeholder",
      amount: rzpOrderRes.amountPaise ?? grandTotalPaise,
      currency: "INR",
      name: "Masala Lane",
      description: `Order #${orderNumber} • ${tableLabel}`,
      order_id: rzpOrderRes.razorpayOrderId,
      handler: async function (response: RazorpaySuccessResponse) {
        setStatusMessage("Verifying payment with bank...");
        setIsSubmitting(true);

        // Never trust client-side success: verify signature strictly on server
        const verifyRes = await verifyRazorpayPaymentAction({
          orderId,
          token,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });

        if (verifyRes.success) {
          clearCart();
          setIsCartOpen(false);
          showToast({
            title: "Payment Verified",
            message: `Order #${orderNumber} sent to kitchen!`,
            variant: "success",
            duration: 3500,
          });
          router.push(`/t/${token}/order/${orderId}`);
        } else {
          setPaymentError(
            verifyRes.error ?? "Payment verification failed on the server."
          );
        }
        setIsSubmitting(false);
        setStatusMessage(null);
      },
      modal: {
        ondismiss: function () {
          setIsSubmitting(false);
          setStatusMessage(null);
          setPaymentError(
            "Payment dismissed. Your order is reserved; please retry payment or switch to Pay at counter."
          );
        },
      },
      theme: {
        color: "#C85A32",
      },
    };

    const rzp = new window.Razorpay(rzpOptions);
    rzp.open();
  };

  const handleCheckoutSubmit = async () => {
    if (items.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setPaymentError(null);
    setStatusMessage("Placing order...");

    try {
      const payload = {
        token,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          selectedModifierIds: i.selectedModifierIds,
        })),
        paymentMethod,
        notes: notes.trim() || undefined,
      };

      const result = await placeOrderAction(payload);

      if (result.success && result.orderId && result.orderNumber) {
        setPendingOrderId(result.orderId);
        setPendingOrderNumber(result.orderNumber);

        // If Pay at counter: order is already sent to kitchen!
        if (paymentMethod === "counter") {
          clearCart();
          setIsCartOpen(false);
          showToast({
            title: "Order Sent to Kitchen",
            message: `Order #${result.orderNumber} placed for ${tableLabel}`,
            variant: "success",
            duration: 3500,
          });
          router.push(`/t/${token}/order/${result.orderId}`);
          return;
        }

        // If Pay now: initiate Razorpay Checkout
        await initiateRazorpayPayment(result.orderId, result.orderNumber);
      } else {
        setPaymentError(result.error ?? "Could not place order. Please try again.");
        setIsSubmitting(false);
        setStatusMessage(null);
      }
    } catch (err) {
      setPaymentError((err as Error).message ?? "An unexpected error occurred.");
      setIsSubmitting(false);
      setStatusMessage(null);
    }
  };

  const handleSwitchToCounter = async () => {
    if (!pendingOrderId) return;
    setIsSubmitting(true);
    setStatusMessage("Switching to Pay at counter...");

    try {
      const res = await switchOrderToCounterAction({
        orderId: pendingOrderId,
        token,
        targetMethod: "counter",
      });

      if (res.success) {
        clearCart();
        setIsCartOpen(false);
        showToast({
          title: "Switched to Counter",
          message: `Order #${pendingOrderNumber} sent to kitchen!`,
          variant: "success",
          duration: 3500,
        });
        router.push(`/t/${token}/order/${pendingOrderId}`);
      } else {
        setPaymentError(res.error ?? "Failed to switch payment method");
      }
    } finally {
      setIsSubmitting(false);
      setStatusMessage(null);
    }
  };

  return (
    <Sheet
      isOpen={isCartOpen}
      onClose={() => {
        if (!isSubmitting) setIsCartOpen(false);
      }}
      title="Your Table Order"
      description={`Items selected for ${tableLabel}`}
      side="bottom"
      className="max-h-[92vh] sm:max-w-md sm:mx-auto sm:rounded-t-[var(--radius-xl)]"
      footer={
        items.length > 0 ? (
          <div className="space-y-3">
            {/* Bill Summary */}
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Items Subtotal</span>
                <span className="font-mono font-medium">
                  {formatPaiseToINR(totalPaise)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>GST (5%)</span>
                <span className="font-mono font-medium">
                  {formatPaiseToINR(taxPreviewPaise)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold text-[var(--text-primary)] pt-1 border-t border-[var(--border-subtle)]">
                <span>Total Amount Due</span>
                <span className="font-mono text-base text-[var(--primary)]">
                  {formatPaiseToINR(grandTotalPaise)}
                </span>
              </div>
            </div>

            {/* Error & Retry State Alert */}
            {paymentError && (
              <div className="rounded-[var(--radius-md)] border border-[var(--destructive-border)] bg-[var(--destructive-subtle)] p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-[var(--destructive-foreground)]">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--destructive)] mt-0.5" />
                  <p className="leading-snug">{paymentError}</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {pendingOrderId && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        isLoading={isSubmitting}
                        onClick={() =>
                          initiateRazorpayPayment(pendingOrderId, pendingOrderNumber!)
                        }
                        className="text-xs h-7 px-2.5 flex-1"
                        leftIcon={<RotateCcw className="h-3 w-3" />}
                      >
                        Retry Online Payment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={isSubmitting}
                        onClick={handleSwitchToCounter}
                        className="text-xs h-7 px-2.5 flex-1 bg-white"
                      >
                        Pay at Counter Instead
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="md"
                disabled={isSubmitting}
                onClick={clearCart}
                className="text-xs text-[var(--destructive)] border-[var(--destructive-border)] hover:bg-[var(--destructive-subtle)] shrink-0"
              >
                Clear
              </Button>
              <Button
                size="md"
                variant="primary"
                isLoading={isSubmitting}
                disabled={isSubmitting}
                onClick={handleCheckoutSubmit}
                className="flex-1 font-semibold shadow-sm justify-between px-3 text-xs sm:text-sm min-w-0"
              >
                <span className="truncate pr-1">
                  {statusMessage ||
                    (paymentMethod === "pay_now"
                      ? "Pay Now"
                      : "Pay at Counter")}
                </span>
                <span className="font-mono font-bold shrink-0">
                  {formatPaiseToINR(grandTotalPaise)}
                </span>
              </Button>
            </div>

            <p className="text-[10px] text-center text-[var(--text-muted)]">
              {paymentMethod === "pay_now"
                ? "Orders are sent to kitchen upon verified payment."
                : "Order sent immediately to kitchen; settle bill at counter."}
            </p>
          </div>
        ) : null
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--text-muted)]">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-subtle)] mb-3">
            <ShoppingBag className="h-8 w-8 opacity-40 text-[var(--primary)]" />
          </div>
          <p className="font-serif text-lg font-medium text-[var(--text-primary)]">
            Your cart is empty
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">
            Explore our curated menu and tap &quot;Add&quot; on any item to build your table order.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Item List */}
          <div className="divide-y divide-[var(--border-subtle)]">
            {items.map((cartItem) => {
              const menuItem = menuItemMap.get(cartItem.menuItemId);
              if (!menuItem) return null;

              let unitPricePaise = menuItem.pricePaise;
              const chosenModifierNames: string[] = [];

              if (
                cartItem.selectedModifierIds.length > 0 &&
                menuItem.modifiers.length > 0
              ) {
                const modMap = new Map(menuItem.modifiers.map((m) => [m.id, m]));
                for (const modId of cartItem.selectedModifierIds) {
                  const mod = modMap.get(modId);
                  if (mod) {
                    unitPricePaise += mod.pricePaise;
                    chosenModifierNames.push(mod.name);
                  }
                }
              }

              const itemLineTotalPaise = unitPricePaise * cartItem.quantity;

              return (
                <div
                  key={cartItem.id}
                  className="py-3 flex items-start justify-between gap-3"
                >
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center gap-1.5">
                      <VegIndicator isVeg={menuItem.isVeg} size="sm" />
                      <h4 className="font-serif text-sm font-semibold text-[var(--text-primary)]">
                        {menuItem.name}
                      </h4>
                    </div>

                    {chosenModifierNames.length > 0 && (
                      <p className="text-xs text-[var(--text-muted)] pl-4">
                        {chosenModifierNames.join(", ")}
                      </p>
                    )}

                    <div className="pl-4 font-mono text-xs font-semibold text-[var(--primary)]">
                      {formatPaiseToINR(itemLineTotalPaise)}
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <div className="flex items-center border border-[var(--border-strong)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                      <button
                        type="button"
                        onClick={() => updateQuantity(cartItem.id, -1)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-mono font-bold text-[var(--text-primary)]">
                        {cartItem.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(cartItem.id, 1)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(cartItem.id)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors cursor-pointer"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] block">
              Payment Choice
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Option A: Pay Now */}
              <button
                type="button"
                onClick={() => setPaymentMethod("pay_now")}
                className={`p-3 rounded-[var(--radius-md)] border text-left flex flex-col justify-between gap-2 transition-all cursor-pointer ${
                  paymentMethod === "pay_now"
                    ? "border-[var(--primary)] bg-[var(--primary-subtle)]/40 ring-1 ring-[var(--primary)] text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <CreditCard className="h-4 w-4 text-[var(--primary)]" />
                  <span className="text-[10px] uppercase font-bold text-[var(--primary)]">
                    Fastest
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold">Pay now</div>
                  <div className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5">
                    UPI, GPay, Cards
                  </div>
                </div>
              </button>

              {/* Option B: Pay at Counter */}
              <button
                type="button"
                onClick={() => setPaymentMethod("counter")}
                className={`p-3 rounded-[var(--radius-md)] border text-left flex flex-col justify-between gap-2 transition-all cursor-pointer ${
                  paymentMethod === "counter"
                    ? "border-[var(--secondary)] bg-[var(--secondary-subtle)]/60 ring-1 ring-[var(--secondary)] text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Banknote className="h-4 w-4 text-[var(--secondary)]" />
                  <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                    Traditional
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold">Pay at counter</div>
                  <div className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5">
                    Pay after meal
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Kitchen Notes */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
            <label
              htmlFor="order-kitchen-notes"
              className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] block"
            >
              Kitchen Notes (Optional)
            </label>
            <input
              id="order-kitchen-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Less spicy, serve water with lemon, no onions"
              className="w-full text-xs rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
