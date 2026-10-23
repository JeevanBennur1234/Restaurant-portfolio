"use client";

import * as React from "react";
import { Receipt, ChevronRight, RotateCcw } from "lucide-react";
import { useLiveTab } from "./use-live-tab";
import { TabModal } from "./tab-modal";

export interface ActiveTabBannerProps {
  token: string;
  tableLabel: string;
  paymentsEnabled?: boolean;
  paymentsTestMode?: boolean;
}

export function ActiveTabBanner({
  token,
  tableLabel,
  paymentsEnabled = true,
  paymentsTestMode = false,
}: ActiveTabBannerProps) {
  const { tab, refreshTab, isReconnecting } = useLiveTab({ token });
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  if (!tab || tab.roundCount === 0 || (tab.status === "closed" && !isModalOpen)) {
    return null;
  }

  const isBillRequested = tab.status === "bill_requested";
  const isCounterRequested = isBillRequested && tab.paymentMethod === "counter";

  const badgeText = isBillRequested
    ? isCounterRequested
      ? "Pay at Counter"
      : "Bill Requested"
    : "Dining";

  return (
    <>
      {tab.status !== "closed" && (
        <aside
          role="region"
          aria-label="Active dining tab summary"
          data-testid="active-tab-banner"
          className="w-full bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 text-white border-b border-stone-700/80 px-4 py-2.5 shadow-md motion-reduce:transition-none"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white shadow-xs">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-serif font-bold text-xs sm:text-sm tracking-wide truncate">
                    Open Tab Active • Round {tab.roundCount}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                      isBillRequested
                        ? "bg-amber-400 text-stone-950 animate-pulse motion-reduce:animate-none"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                    }`}
                  >
                    {badgeText}
                  </span>
                  {isReconnecting && (
                    <span
                      data-testid="banner-reconnecting-note"
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-300"
                    >
                      <RotateCcw className="h-2.5 w-2.5 animate-spin motion-reduce:animate-none" />
                      <span>Reconnecting…</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-stone-300 font-mono tabular-nums truncate">
                  Current Bill: <strong className="text-white">{tab.formattedTotal}</strong> ({tab.roundCount} {tab.roundCount === 1 ? "round" : "rounds"})
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="view-tab-btn"
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 min-h-[44px] flex items-center gap-1 px-3.5 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-xs transition-colors motion-reduce:transition-none cursor-pointer"
            >
              <span>{isBillRequested ? "Pay Bill" : "View Tab & Settle"}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>
      )}

      <TabModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          refreshTab();
        }}
        onAddMoreDishes={() => {
          setIsModalOpen(false);
          refreshTab();
          window.dispatchEvent(new CustomEvent("dinepulse:add-more-dishes"));
        }}
        token={token}
        tableLabel={tableLabel}
        paymentsEnabled={paymentsEnabled}
        paymentsTestMode={paymentsTestMode}
      />
    </>
  );
}
