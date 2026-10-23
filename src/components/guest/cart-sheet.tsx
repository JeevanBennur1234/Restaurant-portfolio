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
  Receipt,
  AlertTriangle,
  QrCode,
  ArrowLeft,
} from "lucide-react";
import { useCart } from "./cart-context";
import { useToast } from "@/components/ui/toast";
import { customerApi } from "@/lib/api/customer";
import { userMessageFor } from "@/lib/api/errors";
import {
  generateIdempotencyKey,
  createCartSignature,
  shouldRegenerateKeyOnResult,
} from "./idempotency-key";
import { loadRazorpayScript } from "@/lib/razorpay-client";
import type { RazorpayOptions, RazorpaySuccessResponse } from "@/types/razorpay";
import { UpiQrModal } from "./upi-qr-modal";

export interface CartSheetProps {
  tableLabel: string;
  token: string;
  paymentsEnabled?: boolean;
  paymentsTestMode?: boolean;
}

type PaymentOption = "open_tab" | "pay_now" | "counter";

export function CartSheet({
  tableLabel,
  token,
  paymentsEnabled = true,
  paymentsTestMode = false,
}: CartSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [notes, setNotes] = React.useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = React.useState<PaymentOption>("pay_now");
  const paymentMethod: PaymentOption =
    !paymentsEnabled && selectedPaymentMethod === "pay_now"
      ? "counter"
      : selectedPaymentMethod;
  const [activeTabRound, setActiveTabRound] = React.useState<number | null>(null);
  const setPaymentMethod = setSelectedPaymentMethod;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isSubmittingRef = React.useRef(false);
  const statusMessageState = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = statusMessageState;

  // Failure & retry tracking
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);
  const [pendingOrderNumber, setPendingOrderNumber] = React.useState<string | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [isUpiQrOpen, setIsUpiQrOpen] = React.useState(false);

  // Idempotency: generate one key per checkout attempt.
  // Reused when retrying after network error or 5xx; replaced when cart body changes, on 4xx, or on success.
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    generateIdempotencyKey()
  );

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

  const checkActiveTab = React.useCallback(() => {
    customerApi
      .getActiveTab(token)
      .then((res) => {
        if (res.ok && res.data && res.data.status !== "closed" && res.data.roundCount > 0) {
          setActiveTabRound(res.data.roundCount + 1);
          setSelectedPaymentMethod("open_tab");
        } else {
          setActiveTabRound(1);
        }
      })
      .catch(() => {});
  }, [token]);

  React.useEffect(() => {
    checkActiveTab();
  }, [checkActiveTab]);

  React.useEffect(() => {
    if (isCartOpen) {
      checkActiveTab();
    }
  }, [isCartOpen, checkActiveTab]);

  React.useEffect(() => {
    const handleTabUpdated = () => checkActiveTab();
    window.addEventListener("dinepulse:tab-updated", handleTabUpdated);
    return () => window.removeEventListener("dinepulse:tab-updated", handleTabUpdated);
  }, [checkActiveTab]);

  React.useEffect(() => {
    const handleAddMoreDishes = () => {
      setSelectedPaymentMethod("open_tab");
      if (items.length > 0) {
        setIsCartOpen(true);
      } else {
        const target =
          document.querySelector('[id^="category-section-"]') ||
          document.querySelector('[data-testid="menu-search-input"]');
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        showToast({
          title: "Adding Dishes to Tab",
          message: `Browse the menu to pick dishes for Round ${activeTabRound || 2}.`,
          variant: "info",
          duration: 3500,
        });
      }
    };
    window.addEventListener("dinepulse:add-more-dishes", handleAddMoreDishes);
    return () => window.removeEventListener("dinepulse:add-more-dishes", handleAddMoreDishes);
  }, [items.length, activeTabRound, setIsCartOpen, showToast]);

  // Regenerate idempotency key when full request body changes (items, paymentMethod, trimmed notes)
  const cartBodySignature = React.useMemo(
    () => createCartSignature(items, paymentMethod, notes),
    [items, paymentMethod, notes]
  );
  const prevBodySigRef = React.useRef(cartBodySignature);
  React.useEffect(() => {
    if (prevBodySigRef.current !== cartBodySignature) {
      prevBodySigRef.current = cartBodySignature;
      setIdempotencyKey(generateIdempotencyKey());
    }
  }, [cartBodySignature]);

  // Compute 5% GST preview for guest transparency
  const taxPreviewPaise = Math.round(totalPaise * 0.05);
  const grandTotalPaise = totalPaise + taxPreviewPaise;
  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Initiates Razorpay Checkout flow
  const initiateRazorpayPayment = async (orderId: string, orderNumber: string) => {
    setStatusMessage("Opening secure checkout...");
    const rzpOrderRes = await customerApi.createRazorpayOrder({ orderId, token });

    if (!rzpOrderRes.ok) {
      setPaymentError(
        userMessageFor(
          rzpOrderRes.code,
          rzpOrderRes.message || "Could not initialize payment. Please retry or choose Pay at counter."
        )
      );
      setIsSubmitting(false);
      setStatusMessage(null);
      return;
    }


    if (!rzpOrderRes.data.razorpayOrderId) {
      setPaymentError(
        "Could not retrieve payment order ID. Please retry or choose Pay at counter."
      );
      setIsSubmitting(false);
      setStatusMessage(null);
      return;
    }

    if (
      !rzpOrderRes.data.keyId ||
      rzpOrderRes.data.keyId.trim() === "" ||
      rzpOrderRes.data.keyId.toLowerCase().includes("placeholder")
    ) {
      setPaymentError(
        "Payment gateway is not configured. Please choose Pay at counter or configure Razorpay test credentials."
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
      key: rzpOrderRes.data.keyId,
      amount: rzpOrderRes.data.amountPaise ?? grandTotalPaise,
      currency: "INR",
      name: "Masala Lane",
      description: `Order #${orderNumber} • ${tableLabel}`,
      order_id: rzpOrderRes.data.razorpayOrderId,
      prefill: {
        contact: "9876543210",
      },
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
      handler: async function (response: RazorpaySuccessResponse) {
        setStatusMessage("Verifying payment with bank...");
        setIsSubmitting(true);

        // Never trust client-side success: verify signature strictly on server
        const verifyRes = await customerApi.verifyRazorpayPayment({
          orderId,
          token,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });

        if (verifyRes.ok) {
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
            userMessageFor(
              verifyRes.code,
              verifyRes.message || "Payment verification failed on the server."
            )
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

    rzp.on("payment.failed", function (failResponse) {
      setIsSubmitting(false);
      setStatusMessage(null);
      const reason =
        failResponse.error?.description ||
        failResponse.error?.reason ||
        "Payment was declined by your bank.";
      setPaymentError(
        `${reason} Your order is reserved; please retry payment or choose Pay at counter.`
      );
    });

    rzp.open();
  };

  const handleCheckoutSubmit = async () => {
    // An unpaid order already exists; retries must target it instead of creating a duplicate.
    if (items.length === 0 || isSubmitting || isSubmittingRef.current || pendingOrderId) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setPaymentError(null);
    setStatusMessage("Placing order...");

    try {
      if (paymentMethod === "open_tab") {
        const tabPayload = {
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            selectedModifierIds: i.selectedModifierIds,
          })),
          notes: notes.trim() || undefined,
        };
        const result = await customerApi.placeTabRound(token, tabPayload);
        if (!result.ok) {
          setPaymentError(
            userMessageFor(
              result.code,
              result.message || "Could not add round to tab. Please try again."
            )
          );
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          setStatusMessage(null);
          return;
        }
        clearCart();
        setIsCartOpen(false);
        showToast({
          title: "Order Sent to Kitchen!",
          message: `Round #${result.data.roundNumber} sent to kitchen for ${tableLabel}. Pay when done dining.`,
          variant: "success",
          duration: 4000,
        });
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setStatusMessage(null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("dinepulse:tab-updated"));
        }
        return;
      }

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

      const result = await customerApi.placeOrder(token, payload, {
        idempotencyKey,
      });

      if (!result.ok) {
        if (shouldRegenerateKeyOnResult(result)) {
          setIdempotencyKey(generateIdempotencyKey());
        }
        setPaymentError(
          userMessageFor(
            result.code,
            result.message || "Could not place order. Please try again."
          )
        );
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setStatusMessage(null);
        return;
      }

      // Successful order placement: reset idempotency key for next order
      setIdempotencyKey(generateIdempotencyKey());

      setPendingOrderId(result.data.orderId);
      setPendingOrderNumber(result.data.orderNumber);

      // If Pay at counter: order is already sent to kitchen!
      if (paymentMethod === "counter") {
        clearCart();
        setIsCartOpen(false);
        showToast({
          title: "Order Sent to Kitchen",
          message: `Order #${result.data.orderNumber} placed for ${tableLabel}`,
          variant: "success",
          duration: 3500,
        });
        router.push(`/t/${token}/order/${result.data.orderId}`);
        return;
      }

      // If Pay now: open dynamic UPI QR scan modal directly
      setIsUpiQrOpen(true);
      setIsSubmitting(false);
      setStatusMessage(null);
    } catch (err) {
      setPaymentError((err as Error).message ?? "An unexpected error occurred.");
      setIsSubmitting(false);
      setStatusMessage(null);
    } finally {
      if (paymentMethod !== "counter") {
        isSubmittingRef.current = false;
      }
    }
  };

  const handleUpiSuccess = () => {
    setIsUpiQrOpen(false);
    clearCart();
    setIsCartOpen(false);
    showToast({
      title: "Payment Verified",
      message: `Order #${pendingOrderNumber} sent to kitchen!`,
      variant: "success",
      duration: 3500,
    });
    router.push(`/t/${token}/order/${pendingOrderId}`);
  };

  const handleSwitchToCounter = async () => {
    if (!pendingOrderId) return;
    setIsSubmitting(true);
    setStatusMessage("Switching to Pay at counter...");

    try {
      const res = await customerApi.payAtCounter({
        orderId: pendingOrderId,
        token,
      });

      if (res.ok) {
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
        setPaymentError(
          userMessageFor(res.code, res.message || "Failed to switch payment method")
        );
      }
    } finally {
      setIsSubmitting(false);
      setStatusMessage(null);
    }
  };

  return (
    <>
      <Sheet
      isOpen={isCartOpen}
      onClose={() => {
        if (!isSubmitting) setIsCartOpen(false);
      }}
      side="center"
      className="flex flex-col"
      footer={
        items.length > 0 ? (
          <div className="space-y-3">
            {/* Clearer Bill Breakdown */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Items Subtotal ({totalItemCount} {totalItemCount === 1 ? "item" : "items"})</span>
                <span className="text-[var(--text-primary)] tabular-nums">
                  {formatPaiseToINR(totalPaise)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-1">
                  <span>GST (5%)</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    (CGST 2.5% + SGST 2.5%)
                  </span>
                </span>
                <span className="font-normal text-[var(--text-primary)] tabular-nums">
                  {formatPaiseToINR(taxPreviewPaise)}
                </span>
              </div>
              <div className="hairline my-1" />
              <div className="flex items-center justify-between text-sm font-bold text-[var(--text-primary)] pt-0.5">
                <span>Total Amount Due</span>
                <span className="text-base font-normal text-[var(--text-primary)] tabular-nums">
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
                    <div className="flex flex-col gap-2 w-full">
                      {paymentsEnabled && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            isLoading={isSubmitting}
                            onClick={() => setIsUpiQrOpen(true)}
                            className="text-sm min-h-[48px] h-12 px-3 flex-1"
                            leftIcon={<QrCode className="h-3.5 w-3.5" />}
                          >
                            Scan UPI QR
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={isSubmitting}
                            onClick={() =>
                              initiateRazorpayPayment(pendingOrderId, pendingOrderNumber!)
                            }
                            className="text-sm min-h-[48px] h-12 px-3 flex-1"
                            leftIcon={<CreditCard className="h-3 w-3" />}
                          >
                            Cards / Netbanking
                          </Button>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={isSubmitting}
                        onClick={handleSwitchToCounter}
                        className="text-sm min-h-[44px] h-11 px-3 w-full bg-white"
                        leftIcon={<Banknote className="h-3.5 w-3.5" />}
                      >
                        Pay at Counter Instead
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Do not allow a second order while this order is awaiting payment. */}
            {!pendingOrderId && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="md"
                    disabled={isSubmitting}
                    onClick={clearCart}
                    className="text-xs text-[var(--destructive)] border-[var(--destructive-border)] hover:bg-[var(--destructive-subtle)] shrink-0 min-h-[48px] h-12 px-4"
                  >
                    Clear
                  </Button>
                  <Button
                    data-testid="checkout-submit-btn"
                    size="md"
                    variant="primary"
                    isLoading={isSubmitting}
                    disabled={isSubmitting}
                    onClick={handleCheckoutSubmit}
                    className="flex-1 font-semibold shadow-sm justify-between px-4 text-base min-w-0 min-h-[52px] h-[52px]"
                  >
                    <span className="truncate pr-1">
                      {statusMessage ||
                        (paymentMethod === "open_tab"
                          ? `Send ${activeTabRound && activeTabRound > 1 ? `Round ${activeTabRound}` : "Round"} to Kitchen`
                          : paymentMethod === "pay_now"
                          ? "Pay Now"
                          : "Pay at Counter")}
                    </span>
                    <span className="text-sm shrink-0 tabular-nums">
                      {formatPaiseToINR(grandTotalPaise)}
                    </span>
                  </Button>
                </div>
                {paymentsTestMode && (
                  <p
                    data-testid="payments-test-mode-notice"
                    className="text-[11px] text-amber-600 dark:text-amber-400 font-medium text-center"
                  >
                    Test mode: no real money is charged.
                  </p>
                )}
              </div>
            )}

            <p className="text-[10px] text-center text-[var(--text-muted)]">
              {paymentMethod === "pay_now"
                ? "Orders are sent to kitchen upon verified payment."
                : "Order sent immediately to kitchen; settle bill at counter."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-center text-xs text-[var(--text-secondary)]">
              Your items are cleared. Return to the menu whenever you are ready.
            </p>
            <Button
              type="button"
              data-testid="empty-cart-cancel"
              variant="outline"
              size="md"
              onClick={() => setIsCartOpen(false)}
              className="w-full min-h-[48px] h-12 text-base font-semibold"
              leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
            >
              Cancel / Back to menu
            </Button>
          </div>
        )
      }
    >
      {/* Visual Header Banner */}
      <div className="relative -mx-5 -mt-5 mb-5 overflow-hidden rounded-t-[var(--radius-xl)] bg-gradient-to-br from-[#2E2723] via-[#3A312B] to-[#1F1A17] p-4 sm:p-5 text-[#FAF7F2] border-b border-[var(--border-subtle)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[var(--primary)]/25 blur-xl"
        />
        <div className="flex items-center justify-between relative z-10">
          <div>
            <span className="eyebrow text-[10px] text-amber-300/90 font-medium tracking-[0.2em]">
              Masala Lane · Table Service
            </span>
            <h3 className="font-serif text-xl sm:text-2xl font-bold leading-tight text-[#FAF7F2]">
              Your Table Order
            </h3>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[#FAF7F2] font-mono text-xs font-semibold border border-white/20 backdrop-blur-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{tableLabel}</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--text-muted)]">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-subtle)] mb-3">
            <ShoppingBag className="h-8 w-8 opacity-40 text-[var(--primary)]" />
          </div>
          <p className="font-serif text-lg font-medium text-[var(--text-primary)]">
            Your cart is empty
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">
            Explore our curated menu and tap &quot;+&quot; on any item to build your table order.
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
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <VegIndicator isVeg={menuItem.isVeg} size="sm" />
                      <h4 className="font-serif text-base font-semibold text-[var(--text-primary)] truncate">
                        {menuItem.name}
                      </h4>
                    </div>

                    {chosenModifierNames.length > 0 && (
                      <p className="text-xs text-[var(--text-muted)] pl-4">
                        {chosenModifierNames.join(", ")}
                      </p>
                    )}

                    <div className="pl-4 text-sm text-[var(--text-primary)] tabular-nums">
                      {formatPaiseToINR(itemLineTotalPaise)}
                    </div>
                  </div>

                  {/* Quantity Stepper & Remove Button (min 44px tap targets) */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <div className="flex items-center border border-[var(--border-strong)] rounded-[var(--radius-sm)] bg-[var(--bg-surface)]">
                      <button
                        type="button"
                        disabled={Boolean(pendingOrderId)}
                        onClick={() => updateQuantity(cartItem.id, -1)}
                        className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-mono font-bold text-[var(--text-primary)]">
                        {cartItem.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={Boolean(pendingOrderId)}
                        onClick={() => updateQuantity(cartItem.id, 1)}
                        className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={Boolean(pendingOrderId)}
                      onClick={() => removeItem(cartItem.id)}
                      className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[var(--text-muted)] hover:text-[var(--destructive)] transition-colors cursor-pointer"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment Method Selector (min 64px tap targets) */}
          <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--text-primary)] block">
              Payment Choice
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option A: Open Tab (Dine-In) */}
              <button
                type="button"
                data-testid="open-tab-choice"
                disabled={Boolean(pendingOrderId)}
                onClick={() => setPaymentMethod("open_tab")}
                className={`p-3.5 rounded-[var(--radius-md)] border text-left flex flex-col justify-between gap-1.5 transition-all cursor-pointer min-h-[64px] select-none ${
                  paymentMethod === "open_tab"
                    ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Receipt className="h-4.5 w-4.5 text-amber-500" />
                  <span className="text-[10px] uppercase font-bold text-amber-500">
                    Dine-In Tab
                  </span>
                </div>
                <div>
                  <div className="text-sm font-bold">Open Tab</div>
                  <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                    Pay after meal
                  </div>
                </div>
              </button>

              {/* Option B: Pay Now (Online) */}
              {paymentsEnabled && (
                <button
                  type="button"
                  data-testid="pay-now-choice"
                  disabled={Boolean(pendingOrderId)}
                  onClick={() => setPaymentMethod("pay_now")}
                  className={`p-3.5 rounded-[var(--radius-md)] border text-left flex flex-col justify-between gap-1.5 transition-all cursor-pointer min-h-[64px] select-none ${
                    paymentMethod === "pay_now"
                      ? "border-[var(--primary)] bg-[var(--primary-subtle)]/40 ring-1 ring-[var(--primary)] text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <CreditCard className="h-4.5 w-4.5 text-[var(--primary)]" />
                    <span className="text-[10px] uppercase font-bold text-[var(--primary)]">
                      Instant
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-bold">Pay now</div>
                    <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                      UPI, Cards
                    </div>
                  </div>
                </button>
              )}

              {/* Option C: Pay at Counter */}
              <button
                type="button"
                data-testid="pay-counter-choice"
                disabled={Boolean(pendingOrderId)}
                onClick={() => setPaymentMethod("counter")}
                className={`p-3.5 rounded-[var(--radius-md)] border text-left flex flex-col justify-between gap-1.5 transition-all cursor-pointer min-h-[64px] select-none ${
                  paymentMethod === "counter"
                    ? "border-[var(--secondary)] bg-[var(--secondary-subtle)]/60 ring-1 ring-[var(--secondary)] text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Banknote className="h-4.5 w-4.5 text-[var(--secondary)]" />
                  <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">
                    Cashier
                  </span>
                </div>
                <div>
                  <div className="text-sm font-bold">Pay at counter</div>
                  <div className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">
                    Pay now at desk
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Kitchen Notes */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
            <label
              htmlFor="order-kitchen-notes"
              className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)] block"
            >
              Kitchen Notes (Optional)
            </label>
            <input
              id="order-kitchen-notes"
              type="text"
              disabled={Boolean(pendingOrderId)}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Less spicy, serve water with lemon, no onions"
              className="w-full text-base rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 px-3.5 py-2.5 min-h-[44px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>
      )}
    </Sheet>

    {pendingOrderId && (
      <UpiQrModal
        isOpen={isUpiQrOpen}
        orderId={pendingOrderId}
        orderNumber={pendingOrderNumber || ""}
        tableNumber={tableLabel}
        totalPaise={grandTotalPaise}
        token={token}
        onClose={() => setIsUpiQrOpen(false)}
        onSuccess={handleUpiSuccess}
        onSwitchToStandardCheckout={() => {
          setIsUpiQrOpen(false);
          initiateRazorpayPayment(pendingOrderId, pendingOrderNumber!);
        }}
        onSwitchToCounter={() => {
          setIsUpiQrOpen(false);
          handleSwitchToCounter();
        }}
      />
    )}
  </>
  );
}
