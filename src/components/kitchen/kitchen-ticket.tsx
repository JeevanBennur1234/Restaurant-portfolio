"use client";

import * as React from "react";
import {
  Clock,
  Flame,
  CheckCircle,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { kitchenApi } from "@/lib/api/kitchen";
import type { KitchenTicket, OrderStatus } from "@/lib/api/types";

export interface KitchenTicketProps {
  ticket: KitchenTicket;
  isHighlighted?: boolean;
  onTransition?: (orderId: string, toStatus: OrderStatus) => Promise<void>;
}

export function KitchenTicketCard({
  ticket,
  isHighlighted = false,
  onTransition,
}: KitchenTicketProps) {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [isPending, setIsPending] = React.useState(false);

  // Live timer tick with clock skew compensation
  React.useEffect(() => {
    const mountedAt = Date.now();
    const createdMs = new Date(ticket.createdAt).getTime();
    const isInvalid = isNaN(createdMs);

    const updateTimer = () => {
      if (isInvalid) {
        setElapsedSeconds(0);
        return;
      }
      const now = Date.now();
      const realElapsed = Math.floor((now - createdMs) / 1000);
      if (realElapsed >= 0) {
        setElapsedSeconds(realElapsed);
      } else {
        // Compensate for clock skew: if database timestamp is ahead of client clock,
        // count up elapsed seconds from when the ticket appeared on the KDS board
        const mountElapsed = Math.max(0, Math.floor((now - mountedAt) / 1000));
        setElapsedSeconds(mountElapsed);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [ticket.createdAt]);

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const displaySec = String(elapsedSeconds % 60).padStart(2, "0");
  const displayMin = String(elapsedMinutes).padStart(2, "0");

  // Timer urgency: Amber at 10 minutes, Red at 15 minutes.
  // Must NOT rely on colour alone: distinct icons and explicit text labels are provided.
  const isRed = elapsedMinutes >= 15;
  const isAmber = elapsedMinutes >= 10 && elapsedMinutes < 15;

  const timerColorClasses = isRed
    ? "bg-red-950/90 text-red-100 border-red-500 ring-1 ring-red-500/60 font-bold"
    : isAmber
    ? "bg-amber-950/80 text-amber-200 border-amber-500 font-bold"
    : "bg-[#25211D] text-zinc-300 border-[#38332D]";

  // Status colour band for the left edge of each ticket
  const statusBandColor =
    ticket.status === "placed" || ticket.status === "accepted"
      ? "bg-[var(--primary)]" // Clay Oven Ember for New Queue
      : ticket.status === "preparing"
      ? "bg-amber-500" // Saffron Gold for Cooking
      : ticket.status === "ready"
      ? "bg-emerald-500" // Emerald for Plated / Ready
      : "bg-zinc-600";

  const handleAction = async (toStatus: OrderStatus) => {
    if (isPending) return;
    setIsPending(true);
    try {
      if (onTransition) {
        await onTransition(ticket.id, toStatus);
      } else {
        await kitchenApi.transition(ticket.id, toStatus);
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <article
      data-testid="kitchen-ticket"
      className={cn(
        "relative flex flex-col rounded-xl border transition-all duration-300 bg-[#1A1816] select-none overflow-hidden pl-2",
        isHighlighted
          ? "animate-highlight-once ring-2 ring-amber-400 border-amber-400 shadow-2xl"
          : "border-[#2E2A26] shadow-md hover:border-[#3E3832]"
      )}
    >
      {/* Status Colour Band on Left Edge of Ticket */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-0 bottom-0 w-2 rounded-l-xl transition-colors",
          statusBandColor
        )}
      />

      {/* Ticket Header: Bold with Table Label in Large Display Size */}
      <div className="flex items-center justify-between border-b border-[#2C2825] bg-[#221F1C] px-3.5 py-3 rounded-tr-xl">
        <div className="flex items-baseline gap-2.5">
          {/* Table Label in Large Display Size */}
          <span className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">
            {ticket.tableNumber}
          </span>
          <span
            data-testid="ticket-order-number"
            className="font-mono text-sm font-semibold px-2.5 py-0.5 rounded bg-black/40 text-amber-300/90 border border-white/10"
          >
            #{ticket.orderNumber}
          </span>
          {ticket.roundNumber !== undefined && ticket.roundNumber !== null && ticket.roundNumber >= 1 && (
            <span
              data-testid="ticket-round-badge"
              className={cn(
                "font-mono text-xs font-bold px-2 py-0.5 rounded border",
                ticket.roundNumber > 1
                  ? "bg-orange-950/80 text-orange-300 border-orange-700/80"
                  : "bg-stone-800 text-stone-300 border-stone-600/80"
              )}
            >
              Round {ticket.roundNumber}
            </span>
          )}
        </div>

        {/* Live Urgency Timer with Color + Distinct Icon + Explicit Text Label (Non-color reliant) */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs sm:text-sm font-mono transition-colors",
            timerColorClasses
          )}
          title={`Elapsed time: ${elapsedMinutes}m ${displaySec}s`}
        >
          {isRed ? (
            <Flame className="h-4 w-4 text-red-300 shrink-0" />
          ) : isAmber ? (
            <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0" />
          ) : (
            <Clock className="h-4 w-4 text-zinc-400 shrink-0" />
          )}

          {/* Explicit status label so it does not rely on colour alone */}
          {isRed ? (
            <span className="text-xs font-black uppercase tracking-wider bg-red-900/80 px-1 rounded text-red-100">
              15m+ Delayed
            </span>
          ) : isAmber ? (
            <span className="text-xs font-bold uppercase tracking-wider bg-amber-900/80 px-1 rounded text-amber-200">
              10m+ Wait
            </span>
          ) : null}

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
                <div className="flex items-baseline gap-2.5">
                  <span className="flex h-7 min-w-7 items-center justify-center rounded bg-[#2D2824] px-1.5 text-base font-black font-mono text-amber-400 border border-[#3E3731]">
                    {item.quantity}
                  </span>
                  <span className="text-base sm:text-lg font-bold text-zinc-100 leading-snug">
                    {item.name}
                  </span>
                </div>
              </div>

              {/* Modifiers List */}
              {item.modifiers.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5 pl-9">
                  {item.modifiers.map((mod, i) => (
                    <span
                      key={i}
                      className="rounded bg-[#2B231D] border border-amber-900/60 px-2 py-0.5 text-xs sm:text-sm font-medium text-amber-300"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              )}

              {item.notes && (
                <p className="mt-1 pl-9 text-xs sm:text-sm italic text-zinc-300">
                  Note: {item.notes}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Kitchen Special Instructions Banner */}
        {ticket.specialInstructions && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-3 text-sm text-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <span className="font-bold text-amber-300 uppercase tracking-wider text-xs block">
                Chef Instruction:
              </span>
              <span>{ticket.specialInstructions}</span>
            </div>
          </div>
        )}
      </div>

      {/* Ticket Footer Action Buttons (Large Touch Target >= 48px) */}
      <div className="p-3 border-t border-[#2C2825] bg-[#161412]">
        {/* Valid State Transitions Only */}
        {ticket.status === "placed" || ticket.status === "accepted" ? (
          <button
            type="button"
            data-testid="ticket-action-btn"
            disabled={isPending}
            onClick={() => handleAction("preparing")}
            className="w-full h-12 min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-[0.98] text-white font-bold text-base tracking-wide uppercase transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <Flame className="h-5 w-5" />
            <span>Start Prep</span>
            <ChevronRight className="h-5 w-5 ml-1 opacity-70" />
          </button>
        ) : ticket.status === "preparing" ? (
          <button
            type="button"
            data-testid="ticket-action-btn"
            disabled={isPending}
            onClick={() => handleAction("ready")}
            className="w-full h-12 min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-white font-bold text-base tracking-wide uppercase transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <CheckCircle className="h-5 w-5" />
            <span>Mark Ready</span>
            <ChevronRight className="h-5 w-5 ml-1 opacity-70" />
          </button>
        ) : ticket.status === "ready" ? (
          <button
            type="button"
            data-testid="ticket-action-btn"
            disabled={isPending}
            onClick={() => handleAction("served")}
            className="w-full h-12 min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-base tracking-wide uppercase transition-all shadow-md cursor-pointer disabled:opacity-50"
          >
            <CheckCircle className="h-5 w-5" />
            <span>Served / Dispatch</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
