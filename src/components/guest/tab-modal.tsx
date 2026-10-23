"use client";

import * as React from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPaiseToINR } from "@/lib/currency";
import { customerApi } from "@/lib/api/customer";
import { loadRazorpayScript } from "@/lib/razorpay-client";
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
}

export function TabModal({
  isOpen,
  onClose,
  onAddMoreDishes,
  token,
  tableLabel,
  paymentsEnabled = true,
  paymentsTestMode = false,
}: TabModalProps) {
  const [tab, setTab] = React.useState<TabDetailsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  const fetchTab = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await customerApi.getActiveTab(token);
      if (res.ok) {
        setTab(res.data);
      } else {
        setErrorMessage(res.message || "Could not load dining tab");
      }
    } catch {
      setErrorMessage("Network error while loading tab");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    customerApi
      .getActiveTab(token)
      .then((res) => {
        if (!isMounted) return;
        setIsLoading(false);
        if (res.ok) {
          setTab(res.data);
        } else {
          setErrorMessage(res.message || "Could not load dining tab");
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoading(false);
        setErrorMessage("Network error while loading tab");
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, token]);

  // Auto-poll every 3 seconds while waiting for counter settlement or payment updates
  React.useEffect(() => {
    if (!isOpen || tab?.status === "closed") return;
    const interval = setInterval(() => {
      fetchTab();
    }, 3000);
    const handleTabUpdated = () => fetchTab();
    window.addEventListener("dinepulse:tab-updated", handleTabUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener("dinepulse:tab-updated", handleTabUpdated);
    };
  }, [isOpen, tab?.status, fetchTab]);

  if (!isOpen) return null;

  const handleRequestBill = async (method: "pay_now" | "counter") => {
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await customerApi.requestTabBill(token, method);
      if (res.ok) {
        setSuccessMessage("Bill requested! Our staff has been notified.");
        await fetchTab();
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
          setSuccessMessage("Payment successful! Dining tab closed.");
          await fetchTab();
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
            setSuccessMessage("Payment verified successfully! Thank you for dining with us.");
            await fetchTab();
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tab-modal-title"
      data-testid="tab-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
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
                Dining Tab • {tableLabel}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {isClosed
                  ? "Settled & Closed"
                  : isCounterRequested
                    ? "Waiting for counter staff"
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
              <RefreshCw className="h-6 w-6 animate-spin text-[var(--primary)]" />
              <span className="text-xs font-mono">Loading dining tab...</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300 flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
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
              {/* Tab Status Card */}
              <div className="p-4 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[var(--text-secondary)]">
                    Current Consolidated Total
                  </span>
                  <div
                    data-testid="tab-grand-total"
                    className="font-serif text-2xl font-bold text-[var(--text-primary)] font-mono tabular-nums"
                  >
                    {tab.formattedTotal}
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Includes 5% GST • {tab.roundCount} {tab.roundCount === 1 ? "round" : "rounds"} ordered
                  </span>
                </div>
                <div className="text-right">
                  <span
                    data-testid="tab-status-badge"
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
                      isClosed
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300"
                        : isBillRequested
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 animate-pulse"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300"
                    }`}
                  >
                    {isClosed ? "Tab Settled" : isCounterRequested ? "Counter Requested" : isBillRequested ? "Bill Requested" : "Tab Active"}
                  </span>
                </div>
              </div>

              {/* Rounds List */}
              <div className="space-y-3">
                <h4 className="font-serif text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Utensils className="h-4 w-4 text-[var(--primary)]" />
                  <span>Dishes Ordered by Round</span>
                </h4>

                {tab.orders.map((round) => (
                  <div
                    key={round.orderId}
                    data-testid={`tab-round-${round.roundNumber}`}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[var(--border-subtle)] font-mono">
                      <span className="font-bold text-[var(--text-primary)]">
                        Round {round.roundNumber} (#{round.orderNumber})
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded capitalize bg-[var(--bg-subtle)] font-semibold text-[var(--text-secondary)]">
                        {round.status}
                      </span>
                    </div>

                    <ul className="space-y-1.5 text-xs">
                      {round.items.map((item) => (
                        <li key={item.id} className="flex items-start justify-between text-[var(--text-primary)]">
                          <span className="font-medium">
                            {item.quantity}× {item.itemName}
                            {item.selectedModifiers.length > 0 && (
                              <span className="text-[11px] text-[var(--text-secondary)] block">
                                + {item.selectedModifiers.map((m) => m.name).join(", ")}
                              </span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums shrink-0 font-semibold text-[var(--text-secondary)]">
                            {formatPaiseToINR(item.totalPaise)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Bill Financial Breakdown */}
              <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-semibold">{tab.formattedSubtotal}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>5% GST (2.5% CGST + 2.5% SGST)</span>
                  <span className="tabular-nums font-semibold">{tab.formattedTax}</span>
                </div>
                <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between text-sm font-bold text-[var(--text-primary)]">
                  <span>Total Amount Due</span>
                  <span className="tabular-nums">{tab.formattedTotal}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {tab && (
          <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 flex flex-col gap-2">
            {!isClosed && !isBillRequested && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="md"
                  onClick={onAddMoreDishes ?? onClose}
                  className="flex-1 text-xs"
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
                  className="flex-1 text-xs font-semibold"
                  leftIcon={<Receipt className="h-4 w-4" />}
                >
                  Request Bill &amp; Pay
                </Button>
              </div>
            )}

            {!isClosed && isCounterRequested && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 space-y-2.5">
                <div>
                  <p className="font-semibold">Counter payment requested</p>
                  <p className="mt-1 text-xs">Your order rounds are saved. Please pay the displayed total to staff at the counter. Staff must confirm payment to close this tab.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddMoreDishes ?? onClose}
                    className="flex-1 text-xs"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Add More Dishes
                  </Button>
                  {paymentsEnabled && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handlePayOnline}
                      isLoading={isActionLoading}
                      className="flex-1 text-xs font-semibold"
                      leftIcon={<CreditCard className="h-3.5 w-3.5" />}
                    >
                      Pay Online Instead
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="md"
                  onClick={fetchTab}
                  isLoading={isLoading}
                  className="w-full text-xs"
                  leftIcon={<RefreshCw className="h-4 w-4" />}
                >
                  Refresh Tab Status
                </Button>
              </div>
            )}

            {!isClosed && isBillRequested && !isCounterRequested && (
              <div className="space-y-2">
                {paymentsEnabled && (
                  <Button
                    data-testid="pay-tab-online-btn"
                    variant="primary"
                    size="md"
                    onClick={handlePayOnline}
                    isLoading={isActionLoading}
                    className="w-full text-xs font-semibold"
                    leftIcon={<CreditCard className="h-4 w-4" />}
                  >
                    Pay Online Now ({tab.formattedTotal})
                  </Button>
                )}
                <Button
                  data-testid="settle-tab-counter-btn"
                  variant="outline"
                  size="md"
                  onClick={() => handleRequestBill("counter")}
                  isLoading={isActionLoading}
                  className="w-full text-xs"
                  leftIcon={<Banknote className="h-4 w-4" />}
                >
                  Pay at Counter Cash / Card
                </Button>
              </div>
            )}

            {isClosed && (
              <div className="flex items-center gap-2">
                <Button
                  data-testid="download-tab-receipt-btn"
                  variant="primary"
                  size="md"
                  onClick={() => downloadPdf("a4")}
                  className="flex-1 text-xs"
                  leftIcon={<Download className="h-4 w-4" />}
                >
                  Download Receipt (PDF)
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  onClick={onClose}
                  className="text-xs px-4"
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
