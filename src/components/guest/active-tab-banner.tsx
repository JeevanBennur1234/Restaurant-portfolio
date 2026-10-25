"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Receipt, ChevronRight, RotateCcw, Clock, Flame, CheckCircle2, Sparkles, XCircle } from "lucide-react";
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
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const handleTabClosed = React.useCallback(() => {
    setIsModalOpen(false);
    router.replace("/");
  }, [router]);

  const { tab, refreshTab, isReconnecting } = useLiveTab({
    token,
    onTabClosed: handleTabClosed,
  });

  if (!tab || tab.roundCount === 0 || (tab.status === "closed" && !isModalOpen)) {
    return null;
  }

  const isBillRequested = tab.status === "bill_requested";

  const badgeText = isBillRequested
    ? "Bill Requested"
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
                  <span className="text-sm font-semibold tracking-wide truncate">
                    Open Dining Tab
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
                <p className="text-sm text-stone-300 tabular-nums truncate">
                  Current bill: <span className="text-white font-normal">{tab.formattedTotal}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="view-tab-btn"
              onClick={() => setIsModalOpen(true)}
              className="shrink-0 min-h-[44px] flex items-center gap-1 px-3.5 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-xs transition-colors motion-reduce:transition-none cursor-pointer"
            >
              <span>View Bill</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {tab.orders.length > 0 && (
            <div className="max-w-7xl mx-auto mt-2 border-t border-white/15 pt-2">
              <details data-testid="active-tab-order-progress" className="group">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm text-stone-100 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2 font-medium">
                    <span>{tab.orders.length} {tab.orders.length === 1 ? "kitchen order" : "kitchen orders"}</span>
                    <span className="text-stone-300">/</span>
                    <span className="text-stone-300">Tap to view live progress</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="grid gap-2 pb-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                  {tab.orders.map((order) => {
                    const statusIndex = order.status === "served" ? 3 : order.status === "ready" ? 2 : order.status === "preparing" || order.status === "accepted" ? 1 : order.status === "cancelled" ? -1 : 0;
                    const statusLabel = order.status === "placed" ? "Placed" : order.status === "accepted" ? "Accepted" : order.status === "preparing" ? "Preparing" : order.status === "ready" ? "Ready" : order.status === "served" ? "Served" : "Cancelled";
                    const StatusIcon = order.status === "served" ? CheckCircle2 : order.status === "ready" ? Sparkles : order.status === "preparing" || order.status === "accepted" ? Flame : order.status === "cancelled" ? XCircle : Clock;
                    return (
                      <article key={order.orderId} data-testid="tab-order-progress-card" className="rounded-xl border border-white/15 bg-white/5 p-3 text-white">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">Order round {order.roundNumber}</p>
                            <p className="mt-0.5 text-xs text-stone-300">{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs">
                            <StatusIcon className="h-3.5 w-3.5" />{statusLabel}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-1" aria-label={`Round ${order.roundNumber} progress`}>
                          {["Placed", "Preparing", "Ready", "Served"].map((step, index) => (
                            <div key={step} className="min-w-0">
                              <div className={`h-1.5 rounded-full ${statusIndex >= index ? "bg-[var(--primary)]" : "bg-white/20"}`} />
                              <p className={`mt-1 text-center text-[10px] ${statusIndex >= index ? "text-white" : "text-stone-400"}`}>{step}</p>
                            </div>
                          ))}
                        </div>
                        <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 text-xs text-stone-200">
                          {order.items.map((item) => <li key={item.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{item.quantity}x {item.itemName}</span><span className="shrink-0">{item.totalPaise > 0 ? `INR ${(item.totalPaise / 100).toFixed(2)}` : ""}</span></li>)}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              </details>
            </div>
          )}
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
