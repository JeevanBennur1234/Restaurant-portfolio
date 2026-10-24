"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Utensils,
  Receipt,
  CreditCard,
  Banknote,
  CheckCircle,
  Download,
  AlertCircle,
  X,
  Plus,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPaiseToINR } from "@/lib/currency";
import { formatTableDisplayName } from "@/lib/table-label";
import { customerApi } from "@/lib/api/customer";
import { loadRazorpayScript } from "@/lib/razorpay-client";
import { useLiveTab } from "./use-live-tab";
import type { TabDetailsData } from "@/lib/api/types";
import type { RazorpayOptions, RazorpaySuccessResponse } from "@/types/razorpay";

export interface TabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMoreDishes?: () => void;
  token: string;
  tableLabel: string;
  paymentsEnabled?: boolean;
  paymentsTestMode?: boolean;
  initialTab?: TabDetailsData | null;
}

export function shouldRedirectToOrderAfterSettlement(
  tab: Pick<TabDetailsData, "status" | "paymentStatus"> | null | undefined
): boolean {
  return tab?.status === "closed" && tab.paymentStatus === "paid";
}

export function TabModal({
  isOpen,
  onClose,
  onAddMoreDishes,
  token,
  tableLabel,
  paymentsEnabled = true,
  paymentsTestMode = false,
  initialTab = null,
}: TabModalProps) {
  const router = useRouter();
  const {
    tab,
    setTab,
    isLoading,
    isReconnecting,
    refreshTab,
    errorMessage: liveErrorMessage,
  } = useLiveTab({
    token,
    initialTab,
    enabled: isOpen,
  });

  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  // Keep the settled receipt visible until the customer chooses what to do next.
  // A counter request is not a settlement and never enters the paid state.

  if (!isOpen) return null;

  const handleRequestBill = async (method: "pay_now" | "counter") => {
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await customerApi.requestTabBill(token, method);
      if (res.ok) {
        if (method === "counter") {
          setSuccessMessage("Your request has been sent. The tab stays unpaid until staff confirms the full amount. Keep this screen open; your receipt and next-step options will appear after settlement.");
          // Keep the screen open so the live tab can show the post-settlement choices
          // when staff confirms payment. A request itself never marks the tab as paid.
          await refreshTab();
        } else {
          setSuccessMessage("Bill requested! Our staff has been notified.");
          await refreshTab();
        }
      } else {
        setErrorMessage(res.message || "Failed to request bill");
      }
    } catch {
      setErrorMessage("Failed to request bill. Please call your server.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePayOnline = async () => {
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const isTestMode = Boolean(tab?.paymentsTestMode || paymentsTestMode);
      if (isTestMode) {
        // Safe simulated payment in test environment
        const simRes = await customerApi.testVerifyTabPayment(token);
        if (simRes.ok) {
          setSuccessMessage("Payment successful! Thank you for dining with us. Returning to table ordering…");
          await refreshTab();
          setTab((prev) =>
            prev
              ? {
                  ...prev,
                  status: "closed",
                  paymentStatus: "paid",
                  paymentMethod: "pay_now",
                }
              : null
          );
          setIsActionLoading(false);
          return;
        }
      }

      const orderRes = await customerApi.createTabRazorpayPayment(token);
      if (!orderRes.ok) {
        setErrorMessage(orderRes.message || "Failed to initialize payment gateway");
        setIsActionLoading(false);
        return;
      }

      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !window.Razorpay) {
        setErrorMessage("Could not load payment gateway. Please pay at counter.");
        setIsActionLoading(false);
        return;
      }

      const options: RazorpayOptions = {
        key: orderRes.data.keyId,
        amount: orderRes.data.amountPaise,
        currency: "INR",
        name: "Masala Lane",
        description: `Dining Tab • ${tableLabel}`,
        order_id: orderRes.data.razorpayOrderId,
        handler: async (resp: RazorpaySuccessResponse) => {
          setIsActionLoading(true);
          const verifyRes = await customerApi.verifyTabPayment(token, {
            razorpayOrderId: resp.razorpay_order_id,
            razorpayPaymentId: resp.razorpay_payment_id,
            razorpaySignature: resp.razorpay_signature,
          });
          if (verifyRes.ok) {
            setSuccessMessage("Payment verified successfully! Thank you for dining with us. Returning to table ordering…");
            await refreshTab();
            setTab((prev) =>
              prev
                ? {
                    ...prev,
                    status: "closed",
                    paymentStatus: "paid",
                    paymentMethod: "pay_now",
                  }
                : null
            );
          } else {
            setErrorMessage(verifyRes.message || "Payment verification failed. Please check counter.");
          }
          setIsActionLoading(false);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setErrorMessage((err as Error)?.message || "Payment initialization failed");
    } finally {
      setIsActionLoading(false);
    }
  };

  const downloadPdf = (format: "a4" | "thermal" = "a4") => {
    const url = customerApi.getTabReceiptPdfUrl(token, format);
    window.open(url, "_blank");
  };

  const isClosed = tab?.status === "closed";
  const isBillRequested = tab?.status === "bill_requested";
  const isCounterRequested = isBillRequested && tab?.paymentMethod === "counter";
  // Badge text matching the real state
  const statusBadgeText = isClosed
    ? "Paid · Settled"
    : isCounterRequested
    ? "Pay at Counter"
    : isBillRequested
    ? "Bill Requested"
    : "Open Tab";

  const statusBadgeClasses = isClosed
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
    : isCounterRequested
    ? "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-800"
    : isBillRequested
    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse motion-reduce:animate-none"
    : "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800";

  // Aggregate active rounds into one item summary so the customer sees a clean list, not repeated round-by-round details.
  const itemTotals = new Map<string, { itemName: string; modifiers: string[]; quantity: number; totalPaise: number }>();
  for (const order of tab?.orders ?? []) {
    if (order.status === "cancelled") continue;
    for (const item of order.items) {
      const modifiers = item.selectedModifiers.map((modifier) => modifier.name);
      const key = JSON.stringify([item.itemName, modifiers]);
      const existing = itemTotals.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPaise += item.totalPaise;
      } else {
        itemTotals.set(key, { itemName: item.itemName, modifiers, quantity: item.quantity, totalPaise: item.totalPaise });
      }
    }
  }
  const consolidatedItems = [...itemTotals.entries()];

  // Calm status card wording following requirements
  const statusCardWording = isClosed
    ? "Paid. Thank you! Your dining tab is closed. Choose Order Again to start a fresh tab, or Close Ordering to finish. Your receipt remains available below."
    : isBillRequested
    ? "Your bill is ready. Choose Pay Online or Pay at Counter below to settle the tab."
    : "Your tab is open. Order more or request the bill anytime.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tab-modal-title"
      data-testid="tab-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 motion-reduce:transition-none"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 bg-[var(--bg-subtle)]/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow-xs">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h3 id="tab-modal-title" className="font-serif text-lg font-bold text-[var(--text-primary)]">
                Dining Tab • {formatTableDisplayName(tableLabel)}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {isClosed
                  ? "Settled & Closed"
                  : isCounterRequested
                  ? "Staff notified for counter payment"
                  : isBillRequested
                  ? "Online payment requested"
                  : "Open Table Tab"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tab modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && !tab && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
              <RefreshCw className="h-6 w-6 animate-spin text-[var(--primary)] motion-reduce:animate-none" />
              <span className="text-xs font-mono">Loading dining tab...</span>
            </div>
          )}

          {(errorMessage || liveErrorMessage) && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300 flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage || liveErrorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2"
            >
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {!isLoading && !tab && !errorMessage && (
            <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
              <p>No active dining tab found for this table.</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Place an order from the menu to start your tab.
              </p>
            </div>
          )}

          {tab && (
            <>
              {/* Calm Status Card (aria-live="polite") */}
              <div
                aria-live="polite"
                data-testid="tab-status-card"
                className="p-4 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[var(--text-secondary)] block">
                      Current Consolidated Total
                    </span>
                    <div
                      data-testid="tab-grand-total"
                      className="text-lg font-normal text-[var(--text-primary)] tabular-nums leading-tight"
                    >
                      {tab.formattedTotal}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span
                      data-testid="tab-status-badge"
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${statusBadgeClasses}`}
                    >
                      {statusBadgeText}
                    </span>
                    {isReconnecting && (
                      <span
                        data-testid="tab-reconnecting-note"
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400"
                      >
                        <RotateCcw className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                        <span>Reconnecting…</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)] text-sm">
                  <p
                    data-testid="status-card-wording"
                    className="text-[var(--text-secondary)] font-normal leading-relaxed"
                  >
                    {statusCardWording}
                  </p>
                </div>
              </div>

              {/* Consolidated items list: food is grouped for readability while progress stays visible per order. */}
              <section className="space-y-2.5" data-testid="tab-items-summary">
                <h4 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Utensils className="h-4 w-4 text-[var(--primary)]" />
                  <span>Items Ordered</span>
                </h4>
                {consolidatedItems.length > 0 ? (
                  <ul className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] px-3">
                    {consolidatedItems.map(([key, item]) => (
                      <li key={key} className="flex items-start justify-between gap-4 py-3 text-base text-[var(--text-primary)]">
                        <div className="min-w-0">
                          <span className="font-normal">{item.quantity} × {item.itemName}</span>
                          {item.modifiers.length > 0 && (
                            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                              {item.modifiers.join(", ")}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-base font-normal tabular-nums">
                          {formatPaiseToINR(item.totalPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-[var(--border-subtle)] p-3 text-sm text-[var(--text-secondary)]">
                    No active items on this tab.
                  </p>
                )}
              </section>

              {/* A dining tab groups multiple order rounds; individual progress tracks are shown on each order's own tracking page. */}
              {/* Bill Financial Breakdown */}
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 space-y-2 text-sm">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-normal">{tab.formattedSubtotal}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>5% GST (2.5% CGST + 2.5% SGST)</span>
                  <span className="tabular-nums font-normal">{tab.formattedTax}</span>
                </div>
                {tab.paidPaise && tab.paidPaise > 0 ? (
                  <>
                    <div className="flex justify-between text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
                      <span>Tab Total</span>
                      <span className="tabular-nums font-normal">{tab.formattedTotal}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span>Already paid</span>
                      <span className="font-normal tabular-nums">-{formatPaiseToINR(tab.paidPaise)}</span>
                    </div>
                    <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between text-sm font-normal text-[var(--text-primary)]">
                      <span>Total Amount Due</span>
                      <span className="tabular-nums">{tab.formattedAmountDue || tab.formattedTotal}</span>
                    </div>
                  </>
                ) : (
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between text-sm font-normal text-[var(--text-primary)]">
                    <span>Total Amount Due</span>
                    <span className="tabular-nums">{tab.formattedAmountDue || tab.formattedTotal}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {tab && (
          <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 flex flex-col gap-2">
            {/* Active Tab State: Add More Dishes & Request Bill */}
            {!isClosed && !isBillRequested && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="md"
                  onClick={onAddMoreDishes ?? onClose}
                  className="flex-1 text-xs min-h-[44px]"
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Add More Dishes
                </Button>
                <Button
                  data-testid="request-tab-bill-btn"
                  variant="primary"
                  size="md"
                  onClick={() => handleRequestBill("pay_now")}
                  isLoading={isActionLoading}
                  className="flex-1 text-xs font-semibold min-h-[44px]"
                  leftIcon={<Receipt className="h-4 w-4" />}
                >
                  Request Bill &amp; Pay
                </Button>
              </div>
            )}

            {/* Bill Requested State: always let the customer choose online or counter payment. */}
            {!isClosed && isBillRequested && (
              <div className="space-y-2">
                {paymentsEnabled && (
                  <Button
                    data-testid="pay-tab-online-btn"
                    variant="primary"
                    size="md"
                    onClick={handlePayOnline}
                    isLoading={isActionLoading}
                    className="w-full text-xs font-semibold min-h-[44px]"
                    leftIcon={<CreditCard className="h-4 w-4" />}
                  >
                    Pay Now ({tab.formattedAmountDue || tab.formattedTotal})
                  </Button>
                )}
                <Button
                  data-testid="settle-tab-counter-btn"
                  variant="outline"
                  size="md"
                  onClick={() => handleRequestBill("counter")}
                  isLoading={isActionLoading}
                  className="w-full text-xs min-h-[44px]"
                  leftIcon={<Banknote className="h-4 w-4" />}
                >
                  Pay at Counter
                </Button>
              </div>
            )}

            {/* Settled State: let the customer choose instead of auto-redirecting. */}
            {isClosed && tab.paymentStatus === "paid" && (
              <div className="space-y-2" data-testid="tab-settlement-actions">
                <Button
                  data-testid="order-again-after-settlement-btn"
                  variant="primary"
                  size="md"
                  onClick={() => {
                    onClose();
                    // The old session is closed; the menu remains available for a fresh checkout.
                  }}
                  className="w-full text-sm font-semibold min-h-[46px]"
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Order Again
                </Button>
                <Button
                  data-testid="close-ordering-after-settlement-btn"
                  variant="outline"
                  size="md"
                  onClick={() => {
                    onClose();
                    router.replace("/order");
                  }}
                  className="w-full text-sm min-h-[44px]"
                >
                  Close Ordering
                </Button>
                <Button
                  data-testid="download-tab-receipt-btn"
                  variant="ghost"
                  size="md"
                  onClick={() => downloadPdf("a4")}
                  className="w-full text-xs min-h-[40px]"
                  leftIcon={<Download className="h-4 w-4" />}
                >
                  Download Receipt (PDF)
                </Button>
              </div>
            )}
            {isClosed && tab.paymentStatus !== "paid" && (
              <Button variant="outline" size="md" onClick={onClose} className="w-full min-h-[44px]">
                Close
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
