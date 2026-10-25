"use client";

import * as React from "react";
import {
  X,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  CreditCard,
  Banknote,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPaiseToINR } from "@/lib/currency";
import { customerApi } from "@/lib/api/customer";
import type { CreateUpiQrData } from "@/lib/api/types";

export interface UpiQrModalProps {
  isOpen: boolean;
  orderId: string;
  orderNumber: string;
  tableNumber: string;
  totalPaise: number;
  token: string;
  onClose: () => void;
  onSuccess: () => void;
  onSwitchToStandardCheckout: () => void;
  onSwitchToCounter: () => void;
}

export function UpiQrModal({
  isOpen,
  orderId,
  orderNumber,
  tableNumber,
  totalPaise,
  token,
  onClose,
  onSuccess,
  onSwitchToStandardCheckout,
  onSwitchToCounter,
}: UpiQrModalProps) {
  const [qrData, setQrData] = React.useState<CreateUpiQrData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isPaid, setIsPaid] = React.useState(false);
  const [secondsRemaining, setSecondsRemaining] = React.useState<number>(15 * 60);
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [fetchTrigger, setFetchTrigger] = React.useState(0);

  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const stopTimers = React.useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const handleRefreshQr = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    setIsPaid(false);
    setFetchTrigger((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      stopTimers();
      return;
    }

    let isSubscribed = true;
    stopTimers();
    // A provider/network stall must not leave Pay now spinning forever.
    const requestController = new AbortController();
    const requestTimeout = window.setTimeout(() => requestController.abort(), 8000);

    customerApi
      .createUpiQrPayment({ orderId, token }, { signal: requestController.signal })
      .then((res) => {
        window.clearTimeout(requestTimeout);
        if (!isSubscribed) return;
        if (!res.ok) {
          setError(res.message || "Failed to generate UPI QR code. Please try again.");
          setIsLoading(false);
          return;
        }

        setQrData(res.data);
        setIsLoading(false);

        // Only start countdown and live polling if a genuine QR code was created
        if (!res.data.qrAvailable) {
          return;
        }

        // Initialize countdown
        const expiresAtMs = new Date(res.data.expiresAt).getTime();
        const initialRemaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
        setSecondsRemaining(initialRemaining > 0 ? initialRemaining : 15 * 60);

        // Start countdown timer
        countdownIntervalRef.current = setInterval(() => {
          setSecondsRemaining((prev) => {
            if (prev <= 1) {
              stopTimers();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // Start status polling every 2.5 seconds
        pollIntervalRef.current = setInterval(async () => {
          try {
            const statusRes = await customerApi.getPaymentStatus({ orderId, token });
            if (statusRes.ok && statusRes.data.status === "paid") {
              setIsPaid(true);
              stopTimers();
              setTimeout(() => {
                onSuccess();
              }, 1200);
            }
          } catch (pollErr) {
            console.warn("Background payment status poll failed:", pollErr);
          }
        }, 2500);
      })
      .catch((err) => {
        window.clearTimeout(requestTimeout);
        if (!isSubscribed) return;
        const wasTimedOut =
          requestController.signal.aborted || (err as Error)?.name === "AbortError";
        setError(
          wasTimedOut
            ? "UPI QR Unavailable: Online payment setup timed out. Please try secure checkout or Pay at Counter."
            : (err as Error).message || "UPI QR Unavailable: Could not prepare online payment. Please try secure checkout or Pay at Counter."
        );
        setIsLoading(false);
      });

    return () => {
      isSubscribed = false;
      window.clearTimeout(requestTimeout);
      requestController.abort();
      stopTimers();
    };
  }, [isOpen, orderId, token, fetchTrigger, stopTimers, onSuccess]);

  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const isExpired = secondsRemaining <= 0;

  const handleSimulatePayment = async () => {
    setIsSimulating(true);
    setError(null);
    try {
      const simRes = await customerApi.verifyTestUpiPayment({ orderId, token });
      if (simRes.ok) {
        setIsPaid(true);
        stopTimers();
        setTimeout(() => {
          onSuccess();
        }, 1000);
      } else {
        setError(simRes.message || "Test payment simulation failed");
      }
    } catch (err) {
      setError((err as Error).message || "Error running test simulation");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upi-qr-title"
    >
      <div className="relative w-full max-w-md bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex items-start justify-between bg-[var(--bg-subtle)]">
          <div>
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[var(--primary)]" />
              <h2 id="upi-qr-title" className="text-lg font-bold tracking-tight">
                {qrData?.qrAvailable ? "Scan & Pay via UPI" : "Payment Options"}
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Order #{orderNumber} • Table {tableNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
            aria-label="Close payment modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col items-center text-center space-y-4">
          {isPaid ? (
            <div className="py-10 flex flex-col items-center space-y-3 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-full bg-[var(--success-subtle)] border border-[var(--success-border)] flex items-center justify-center text-[var(--success)] shadow-md">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-[var(--success)]">
                Payment Verified!
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {formatPaiseToINR(totalPaise)} paid. Sending your order to the kitchen...
              </p>
            </div>
          ) : isLoading ? (
            <div className="py-16 flex flex-col items-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-[var(--primary)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Preparing payment gateway...
              </p>
            </div>
          ) : error ? (
            <div className="py-8 flex flex-col items-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[var(--destructive-subtle)] border border-[var(--destructive-border)] flex items-center justify-center text-[var(--destructive)]">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <p className="text-sm text-[var(--destructive)] font-medium max-w-xs">
                {error}
              </p>
              <div className="flex w-full max-w-xs flex-col gap-2">
                <Button
                  data-testid="upi-fallback-checkout-btn"
                  onClick={() => {
                    stopTimers();
                    onSwitchToStandardCheckout();
                  }}
                  className="w-full min-h-[48px] gap-2"
                >
                  <CreditCard className="w-4 h-4" /> Continue to Razorpay Checkout
                </Button>
                {!error.toLowerCase().includes("disabled") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshQr}
                    className="gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Try QR Again
                  </Button>
                )}
                <Button
                  data-testid="upi-fallback-counter-btn"
                  variant="outline"
                  onClick={() => {
                    stopTimers();
                    onSwitchToCounter();
                  }}
                  className="w-full min-h-[44px] gap-2"
                >
                  <Banknote className="w-4 h-4" /> Pay at Counter Instead
                </Button>
              </div>
            </div>
          ) : qrData?.qrAvailable && qrData.qrImageUrl ? (
            /* Genuine Razorpay Dynamic UPI QR Flow */
            <>
              {/* Amount Display */}
              <div className="flex flex-col items-center">
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  Total Payable Amount
                </span>
                <span className="text-xl font-normal text-[var(--text-primary)] mt-0.5 tabular-nums">
                  {formatPaiseToINR(totalPaise)}
                </span>
              </div>

              {/* QR Code Container */}
              <div className="relative p-3 bg-white rounded-xl shadow-inner border border-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrData.qrImageUrl}
                  alt="Scan Razorpay UPI QR Code to pay"
                  className={`w-52 h-52 sm:w-60 sm:h-60 object-contain mx-auto rounded-lg transition-opacity duration-300 ${
                    isExpired ? "opacity-20 blur-xs" : "opacity-100"
                  }`}
                />

                {isExpired && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-white/90 rounded-xl space-y-2">
                    <AlertTriangle className="w-8 h-8 text-amber-600" />
                    <p className="text-xs font-semibold text-stone-900">
                      QR Code Expired
                    </p>
                    <Button size="sm" onClick={handleRefreshQr} className="gap-1.5 text-xs">
                      <RotateCcw className="w-3.5 h-3.5" /> Refresh QR
                    </Button>
                  </div>
                )}
              </div>

              {/* Timer & Live Polling Status */}
              <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-[var(--primary)]" />
                  Expires in <strong className="text-[var(--text-primary)]">{formattedTime}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-detecting payment
                </span>
              </div>

              {/* Supported Apps Badges */}
              <div className="pt-2 border-t border-[var(--border-subtle)] w-full">
                <p className="text-[11px] text-[var(--text-muted)] font-medium mb-2 uppercase tracking-wide">
                  Scan with any mobile UPI app
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
                  <Badge variant="outline" className="font-semibold px-2 py-0.5 bg-stone-50 dark:bg-stone-900">
                    Google Pay
                  </Badge>
                  <Badge variant="outline" className="font-semibold px-2 py-0.5 bg-stone-50 dark:bg-stone-900">
                    PhonePe
                  </Badge>
                  <Badge variant="outline" className="font-semibold px-2 py-0.5 bg-stone-50 dark:bg-stone-900">
                    Paytm
                  </Badge>
                  <Badge variant="outline" className="font-semibold px-2 py-0.5 bg-stone-50 dark:bg-stone-900">
                    BHIM
                  </Badge>
                  <Badge variant="outline" className="font-semibold px-2 py-0.5 bg-stone-50 dark:bg-stone-900">
                    CRED
                  </Badge>
                </div>
              </div>
            </>
          ) : (
            /* QR Unavailable / Test Mode Fallback Flow */
            <>
              {/* Amount Display */}
              <div className="flex flex-col items-center">
                <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  Total Payable Amount
                </span>
                <span className="text-xl font-normal text-[var(--text-primary)] mt-0.5 tabular-nums">
                  {formatPaiseToINR(totalPaise)}
                </span>
              </div>

              {/* Customer-facing QR status; never expose provider test instructions. */}
              {!qrData?.qrAvailable && (
                <div className="w-full p-4 rounded-xl bg-stone-500/10 border border-stone-500/30 text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>UPI QR unavailable</span>
                  </div>
                  <p className="text-xs text-stone-700 leading-relaxed">Online checkout is available instead, or you can pay at the counter.</p>
                </div>
              )}

              {/* Supported Options Buttons */}
              <div className="w-full space-y-2 pt-1">
                <Button
                  onClick={() => {
                    stopTimers();
                    onSwitchToStandardCheckout();
                  }}
                  className="w-full gap-2 text-xs font-semibold min-h-[44px]"
                >
                  <CreditCard className="w-4 h-4" />
                  Continue to secure checkout
                </Button>
                <Button
                  data-testid="upi-fallback-counter-btn"
                  variant="outline"
                  onClick={() => {
                    stopTimers();
                    onSwitchToCounter();
                  }}
                  className="w-full gap-2 text-xs min-h-[44px]"
                >
                  <Banknote className="w-4 h-4" /> Pay at Counter Instead
                </Button>
              </div>

              {/* Developer Test Simulation Gate (Only when enabled in local dev environment) */}
              {qrData?.testSimulationAvailable && (
                <div className="w-full p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-left space-y-2 mt-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-800 dark:text-purple-300">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-purple-600" />
                    <span>Local Development Simulation</span>
                  </div>
                  <p className="text-[11px] text-stone-700 leading-relaxed">
                    Opt-in simulation enabled (local dev database only). Simulate instant payment callback:
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSimulatePayment}
                    disabled={isSimulating}
                    className="w-full text-xs gap-1.5 border-purple-500/40 text-purple-800 dark:text-purple-300 hover:bg-purple-500/15"
                  >
                    {isSimulating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Simulate Payment Callback (UPI Paid)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Alternative Actions (Shown only when QR is actively displayed) */}
        {!isPaid && qrData?.qrAvailable && (
          <div className="p-4 bg-[var(--bg-subtle)] border-t border-[var(--border-subtle)] space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  stopTimers();
                  onSwitchToStandardCheckout();
                }}
                className="gap-1.5 text-xs truncate"
              >
                <CreditCard className="w-3.5 h-3.5 shrink-0" /> Cards / Netbanking
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  stopTimers();
                  onSwitchToCounter();
                }}
                className="gap-1.5 text-xs truncate"
              >
                <Banknote className="w-3.5 h-3.5 shrink-0" /> Pay at Counter
              </Button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>100% Secure 256-bit Encrypted Payment</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
