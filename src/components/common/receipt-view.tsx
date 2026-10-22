"use client";

import * as React from "react";
import {
  Printer,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPaiseToINR } from "@/lib/currency";
import type { ReceiptData } from "@/lib/api/types";

export interface ReceiptModalProps {
  receipt: ReceiptData | null;
  isOpen: boolean;
  onClose: () => void;
  pdfDownloadUrl?: string;
  isManager?: boolean;
}

export function ReceiptModal({
  receipt,
  isOpen,
  onClose,
  pdfDownloadUrl,
}: ReceiptModalProps) {
  const [printLayout, setPrintLayout] = React.useState<"a4" | "thermal">("a4");

  // Handle ESC key to close modal
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !receipt) return null;

  const isPaid = receipt.status === "PAID_RECEIPT";

  const handlePrint = () => {
    window.print();
  };

  const currentPdfUrl = pdfDownloadUrl
    ? `${pdfDownloadUrl}${pdfDownloadUrl.includes("?") ? "&" : "?"}format=${printLayout}`
    : null;

  return (
    <div
      id="receipt-print-root"
      data-testid="receipt-print-root"
      data-print-layout={printLayout}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full">
        {/* Modal Toolbar (Hidden on Print) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[var(--primary)]" />
            <span
              id="receipt-modal-title"
              className="font-serif font-bold text-base sm:text-lg text-[var(--text-primary)]"
            >
              {isPaid ? "Digital Receipt" : "Unpaid Order Bill"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Print layout switcher */}
            <div className="hidden sm:flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setPrintLayout("a4")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  printLayout === "a4"
                    ? "bg-[var(--primary)] text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                A4 Slip
              </button>
              <button
                type="button"
                onClick={() => setPrintLayout("thermal")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  printLayout === "thermal"
                    ? "bg-[var(--primary)] text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                80mm Thermal
              </button>
            </div>

            {currentPdfUrl && (
              <a
                href={currentPdfUrl}
                target="_blank"
                rel="noreferrer"
                download
              >
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  leftIcon={<Download className="h-3.5 w-3.5" />}
                >
                  PDF
                </Button>
              </a>
            )}

            <Button
              size="sm"
              variant="primary"
              onClick={handlePrint}
              className="h-8 px-3 text-xs"
              leftIcon={<Printer className="h-3.5 w-3.5" />}
            >
              Print
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
              aria-label="Close receipt dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Content */}
        <div
          data-receipt-content="true"
          className={`p-6 sm:p-8 overflow-y-auto space-y-6 print:overflow-visible print:p-0 ${
            printLayout === "thermal" ? "max-w-[80mm] mx-auto font-mono text-xs sm:text-xs" : ""
          }`}
        >
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="font-serif text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              {receipt.restaurant.name}
            </h2>
            <p className="text-xs text-[var(--text-muted)] italic">
              {receipt.restaurant.tagline}
            </p>
            <p className="text-xs text-[var(--text-secondary)] pt-1">
              {receipt.restaurant.address}, {receipt.restaurant.city}
            </p>
            <div className="flex flex-wrap justify-center gap-x-3 text-[11px] text-[var(--text-muted)] font-mono">
              <span>Tel: {receipt.restaurant.phone}</span>
              <span>GSTIN: {receipt.restaurant.gstin}</span>
              <span>FSSAI: {receipt.restaurant.fssai}</span>
            </div>
          </div>

          {/* Status Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
              isPaid
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
                : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isPaid ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <div>
                <h3 className="font-bold text-sm tracking-wide uppercase font-mono">
                  {isPaid ? "Payment Receipt — Paid in Full" : "Unpaid Bill — Not a Tax Receipt"}
                </h3>
                <p className="text-xs opacity-90 mt-0.5">
                  {isPaid
                    ? `Receipt #${receipt.receiptNumber} · Settled via ${receipt.paymentMethod?.toUpperCase() || "ONLINE"}`
                    : `Bill #${receipt.billNumber} · Please settle at the counter or scan UPI QR`}
                </p>
              </div>
            </div>

            <Badge
              variant={isPaid ? "success" : "secondary"}
              className="text-xs font-mono uppercase tracking-wider px-2 py-0.5"
            >
              {isPaid ? "PAID" : "UNPAID"}
            </Badge>
          </div>

          {/* Order Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] text-xs font-mono">
            <div>
              <span className="text-[var(--text-muted)] block uppercase text-[10px]">Order #</span>
              <span className="font-bold text-[var(--text-primary)] text-sm">{receipt.orderNumber}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block uppercase text-[10px]">Table</span>
              <span className="font-bold text-[var(--text-primary)] text-sm">{receipt.tableNumber}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block uppercase text-[10px]">Date Placed</span>
              <span className="font-semibold text-[var(--text-secondary)]">
                {new Date(receipt.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block uppercase text-[10px]">Time</span>
              <span className="font-semibold text-[var(--text-secondary)]">
                {new Date(receipt.createdAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          {/* Customer / Payment Ref info if available */}
          {(receipt.customer.name || receipt.customer.phone || receipt.paymentReference) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] font-mono">
              {receipt.customer.name && (
                <div>
                  <span className="text-[var(--text-muted)]">Guest: </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {receipt.customer.name} {receipt.customer.phone ? `(${receipt.customer.phone})` : ""}
                  </span>
                </div>
              )}
              {receipt.paymentReference && (
                <div>
                  <span className="text-[var(--text-muted)]">Txn Ref: </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {receipt.paymentReference}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Itemized Products Table */}
          <div className="space-y-2">
            <h4 className="font-mono uppercase text-xs tracking-wider text-[var(--text-secondary)] font-semibold">
              Itemized Products ({receipt.items.length})
            </h4>

            <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
              {receipt.items.map((item) => (
                <div key={item.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[var(--text-primary)]">
                      <span className="font-mono text-[var(--primary)] font-bold mr-1.5">
                        {item.quantity}×
                      </span>
                      {item.name}
                    </div>
                    {item.modifiers.length > 0 && (
                      <div className="text-xs text-[var(--text-muted)] pl-4">
                        {item.modifiers.map((m) => m.name).join(", ")}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-xs text-[var(--text-secondary)] italic pl-4">
                        Note: {item.notes}
                      </div>
                    )}
                  </div>
                  <div className="font-mono font-bold text-sm text-[var(--text-primary)] shrink-0">
                    {formatPaiseToINR(item.totalPaise)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals & Tax Calculation Breakdown */}
          <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 space-y-2 font-mono text-xs sm:text-sm">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Subtotal</span>
              <span className="font-semibold">{receipt.formattedSubtotal}</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>CGST (2.5%)</span>
              <span>{receipt.formattedCgst}</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>SGST (2.5%)</span>
              <span>{receipt.formattedSgst}</span>
            </div>
            <div className="flex justify-between text-[var(--text-muted)] text-[11px] pt-0.5">
              <span>Total GST (5%)</span>
              <span>{receipt.formattedTax}</span>
            </div>

            <div className="flex justify-between items-center pt-2.5 border-t border-[var(--border-subtle)] text-base sm:text-lg font-bold text-[var(--text-primary)]">
              <span>{isPaid ? "Amount Paid" : "Total Due"}</span>
              <span className="font-extrabold text-[var(--primary)] text-xl">
                {receipt.formattedTotal}
              </span>
            </div>
          </div>

          {/* Footer Legal & Courtesy notice */}
          <div className="text-center pt-2 pb-1 space-y-1 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
            <p className="font-semibold text-[var(--text-primary)]">
              Thank you for dining with Masala Lane!
            </p>
            <p>
              {isPaid
                ? "This digital receipt confirms that your payment has been processed and accepted."
                : "This is a proforma table check. A payment receipt will be issued upon payment."}
            </p>
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden on Print) */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 flex items-center justify-between print:hidden shrink-0">
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {isPaid ? `Receipt #${receipt.receiptNumber}` : `Bill #${receipt.billNumber}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 px-4 text-xs font-semibold"
            >
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Printer className="h-4 w-4" />}
              className="h-9 px-4 text-xs font-semibold"
            >
              Print {printLayout === "thermal" ? "Thermal (80mm)" : "Receipt (A4)"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
