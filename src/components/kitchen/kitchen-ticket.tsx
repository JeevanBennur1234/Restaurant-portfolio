"use client";

import * as React from "react";
import { Clock, Flame, CheckCircle, ChevronRight, AlertCircle } from "lucide-react";
import type { KitchenTicket } from "@/server/actions/kitchen";
import type { OrderStatus } from "@/server/db/schema";

export interface KitchenTicketProps {
  ticket: KitchenTicket;
  isHighlighted?: boolean;
  onTransition: (orderId: string, toStatus: OrderStatus) => Promise<void>;
}

export function KitchenTicketCard({
  ticket,
  isHighlighted = false,
  onTransition,
}: KitchenTicketProps) {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [isPending, setIsPending] = React.useState(false);

  // Live timer tick
  React.useEffect(() => {
    const calc = () => {
      const diff = Math.max(
        0,
        Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 1000)
      );
      setElapsedSeconds(diff);
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [ticket.createdAt]);

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const displaySec = String(elapsedSeconds % 60).padStart(2, "0");
  const displayMin = String(elapsedMinutes).padStart(2, "0");

  // Timer urgency color coding
  // Amber at 10 minutes, Red at 15 minutes
  const isRed = elapsedMinutes >= 15;
  const isAmber = elapsedMinutes >= 10 && elapsedMinutes < 15;

  const timerColorClasses = isRed
    ? "bg-red-950/90 text-red-200 border-red-500 ring-2 ring-red-500/50 animate-pulse font-bold"
    : isAmber
    ? "bg-amber-950/80 text-amber-300 border-amber-500 font-bold"
    : "bg-[#25211D] text-zinc-300 border-[#38332D]";

  const handleAction = async (toStatus: OrderStatus) => {
    if (isPending) return;
    setIsPending(true);
    try {
      await onTransition(ticket.id, toStatus);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <article
      className={`relative flex flex-col rounded-xl border transition-all duration-300 bg-[#1A1816] select-none ${
        isHighlighted
          ? "ring-4 ring-amber-400 border-amber-400 shadow-2xl animate-pulse"
          : "border-[#2E2A26] shadow-md hover:border-[#3E3832]"
      }`}
    >
      {/* Ticket Header */}
      <div className="flex items-center justify-between border-b border-[#2C2825] bg-[#221F1C] px-3.5 py-3 rounded-t-xl">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-xl font-bold tracking-tight text-white">
            {ticket.tableNumber}
          </span>
          <span className="text-xs font-mono text-zinc-400">
            #{ticket.orderNumber}
          </span>
        </div>

        {/* Live Urgency Timer */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono transition-colors ${timerColorClasses}`}
          title={`Elapsed time: ${elapsedMinutes}m ${displaySec}s`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>
            {displayMin}:{displaySec}
          </span>
        </div>
      </div>

      {/* Ticket Body / Order Items */}
      <div className="flex-1 p-3.5 space-y-3 overflow-y-auto max-h-72">
        <div className="divide-y divide-[#2C2825]">
          {ticket.items.map((item) => (
            <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded bg-[#2D2824] px-1.5 text-sm font-black font-mono text-amber-400 border border-[#3E3731]">
                    {item.quantity}
                  </span>
                  <span className="text-sm font-semibold text-zinc-100 leading-snug">
                    {item.name}
                  </span>
                </div>
              </div>

              {/* Modifiers List */}
              {item.modifiers.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 pl-8">
                  {item.modifiers.map((mod, i) => (
                    <span
                      key={i}
                      className="rounded bg-[#2B231D] border border-amber-900/60 px-1.5 py-0.5 text-[11px] font-medium text-amber-300"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              )}

              {item.notes && (
                <p className="mt-1 pl-8 text-[11px] italic text-zinc-400">
                  Note: {item.notes}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Kitchen Special Instructions Banner */}
        {ticket.specialInstructions && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-2.5 text-xs text-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px] block">
                Chef Instruction:
              </span>
              <span>{ticket.specialInstructions}</span>
            </div>
          </div>
        )}
      </div>

      {/* Ticket Footer Action Buttons (Touch-Sized >= 48px) */}
      <div className="p-3 border-t border-[#2C2825] bg-[#161412] rounded-b-xl">
        {/* Valid State Transitions Only */}
        {ticket.status === "placed" || ticket.status === "accepted" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAction("preparing")}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-[0.98] text-white font-bold text-sm tracking-wide uppercase transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <Flame className="h-4 w-4" />
            <span>Start Prep</span>
            <ChevronRight className="h-4 w-4 ml-1 opacity-70" />
          </button>
        ) : ticket.status === "preparing" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAction("ready")}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white font-bold text-sm tracking-wide uppercase transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Mark Ready</span>
            <ChevronRight className="h-4 w-4 ml-1 opacity-70" />
          </button>
        ) : ticket.status === "ready" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleAction("served")}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-sm tracking-wide uppercase transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Served / Dispatch</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
