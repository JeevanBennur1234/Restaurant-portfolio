"use client";

import * as React from "react";
import { Receipt, ChevronRight } from "lucide-react";
import { customerApi } from "@/lib/api/customer";
import type { TabDetailsData } from "@/lib/api/types";
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
  const [tab, setTab] = React.useState<TabDetailsData | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const refreshTab = React.useCallback(() => {
    customerApi.getActiveTab(token).then((res) => {
      if (res.ok) {
        setTab(res.data);
      }
    }).catch(() => {
      // Ignore background fetch error
    });
  }, [token]);

  React.useEffect(() => {
    let isMounted = true;

    const doFetch = () => {
      customerApi.getActiveTab(token).then((res) => {
        if (isMounted && res.ok) {
          setTab(res.data);
        }
      }).catch(() => {
        // Ignore background fetch error
      });
    };

    doFetch();

    // Poll every 10 seconds for tab updates
    const interval = setInterval(doFetch, 10000);

    const handleTabUpdated = () => {
      doFetch();
    };
    window.addEventListener("dinepulse:tab-updated", handleTabUpdated);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("dinepulse:tab-updated", handleTabUpdated);
    };
  }, [token]);

  if (!tab || tab.roundCount === 0 || (tab.status === "closed" && !isModalOpen)) {
    return null;
  }

  const isBillRequested = tab.status === "bill_requested";

  return (
    <>
      {tab.status !== "closed" && (
        <div
          data-testid="active-tab-banner"
          className="w-full bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 text-white border-b border-stone-700/80 px-4 py-2.5 shadow-md"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white shadow-xs">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-xs sm:text-sm tracking-wide truncate">
                    Open Tab Active • Round {tab.roundCount}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded ${
                      isBillRequested
                        ? "bg-amber-400 text-stone-950 animate-pulse"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                    }`}
                  >
                    {isBillRequested ? "Bill Requested" : "Dining"}
                  </span>
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
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <span>{isBillRequested ? "Pay Bill" : "View Tab & Settle"}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <TabModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          refreshTab();
        }}
        token={token}
        tableLabel={tableLabel}
        paymentsEnabled={paymentsEnabled}
        paymentsTestMode={paymentsTestMode}
      />
    </>
  );
}
