"use client";

import * as React from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { KitchenHeader } from "./kitchen-header";
import { KitchenTicketCard } from "./kitchen-ticket";
import { playKitchenChime } from "@/lib/sound";
import {
  getKitchenTicketsAction,
  transitionOrderStatusAction,
  type KitchenTicket,
} from "@/server/actions/kitchen";
import type { StaffSession } from "@/server/auth";
import type { OrderStatus } from "@/server/db/schema";
import { Utensils, Flame, Sparkles } from "lucide-react";

export interface KitchenBoardProps {
  initialTickets: KitchenTicket[];
  session: StaffSession;
  realtimeChannel: string;
}

export function KitchenBoard({
  initialTickets,
  session,
  realtimeChannel,
}: KitchenBoardProps) {
  const [tickets, setTickets] = React.useState<KitchenTicket[]>(initialTickets);
  const [highlightedIds, setHighlightedIds] = React.useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = React.useState(false);

  // Sound ref to access current value in realtime callbacks without stale closure
  const soundEnabledRef = React.useRef(soundEnabled);
  React.useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Audio & visual highlight trigger for incoming orders
  const triggerNewOrderAlert = React.useCallback((orderId: string) => {
    if (soundEnabledRef.current) {
      playKitchenChime();
    }
    setHighlightedIds((prev) => new Set([...prev, orderId]));
    setTimeout(() => {
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }, 6000);
  }, []);

  // Supabase client instantiated once per component
  const supabase = React.useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("placeholder") &&
      !supabaseAnonKey.includes("placeholder")
    ) {
      return createClient(supabaseUrl, supabaseAnonKey);
    }
    return null;
  }, []);

  // 1. Supabase Realtime WebSocket subscription
  React.useEffect(() => {
    if (!supabase || !realtimeChannel) return;

    let channel: RealtimeChannel | null = null;

    try {
      channel = supabase
        .channel(realtimeChannel)
        .on("broadcast", { event: "order.created" }, (payload) => {
          const orderId = payload.payload?.orderId as string | undefined;
          if (orderId) {
            triggerNewOrderAlert(orderId);
          }
          // Refresh tickets via authenticated action
          getKitchenTicketsAction().then((res) => {
            if (res.success && res.tickets) {
              setTickets(res.tickets);
            }
          });
        })
        .on("broadcast", { event: "order.status_changed" }, (payload) => {
          const orderId = payload.payload?.orderId as string | undefined;
          const toStatus = payload.payload?.toStatus as OrderStatus | undefined;
          if (orderId && toStatus) {
            setTickets((prev) =>
              prev
                .map((t) => (t.id === orderId ? { ...t, status: toStatus } : t))
                .filter((t) => t.status !== "served" && t.status !== "cancelled")
            );
          }
          // Re-fetch via authenticated action as event is a hint
          getKitchenTicketsAction().then((res) => {
            if (res.success && res.tickets) {
              setTickets(res.tickets);
            }
          });
        })
        .subscribe();
    } catch (err) {
      console.warn("Kitchen Supabase Realtime subscription error:", err);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, realtimeChannel, triggerNewOrderAlert]);

  // 2. 5-Second Polling Fallback
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await getKitchenTicketsAction();
        if (res.success && res.tickets) {
          // Check if any new ticket arrived that wasn't in current list
          setTickets((current) => {
            const currentIds = new Set(current.map((t) => t.id));
            const brandNewTickets = res.tickets!.filter((t) => !currentIds.has(t.id));

            for (const newTicket of brandNewTickets) {
              triggerNewOrderAlert(newTicket.id);
            }
            return res.tickets!;
          });
        }
      } catch {
        // Silently tolerate background network hiccups
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [triggerNewOrderAlert]);

  // Handle transition tap action (enforcing valid transition server-side)
  const handleTransition = async (orderId: string, toStatus: OrderStatus) => {
    // Optimistic UI update
    setTickets((prev) =>
      prev
        .map((t) => (t.id === orderId ? { ...t, status: toStatus } : t))
        .filter((t) => t.status !== "served" && t.status !== "cancelled")
    );

    const result = await transitionOrderStatusAction({ orderId, toStatus });
    if (!result.success) {
      // Revert if server rejected transition
      const refreshed = await getKitchenTicketsAction();
      if (refreshed.success && refreshed.tickets) {
        setTickets(refreshed.tickets);
      }
    }
  };

  // Group tickets into 3 columns
  const newTickets = tickets.filter(
    (t) => t.status === "placed" || t.status === "accepted"
  );
  const preparingTickets = tickets.filter((t) => t.status === "preparing");
  const readyTickets = tickets.filter((t) => t.status === "ready");

  const activeCounts = {
    new: newTickets.length,
    preparing: preparingTickets.length,
    ready: readyTickets.length,
  };

  return (
    <div className="min-h-screen bg-[#110F0E] text-white flex flex-col overflow-hidden">
      {/* KDS Header Bar */}
      <KitchenHeader
        session={session}
        activeCounts={activeCounts}
        soundEnabled={soundEnabled}
        onToggleSound={setSoundEnabled}
      />

      {/* 3-Column Board (Designed for Tablet Landscape & Touch) */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-hidden h-[calc(100vh-64px)]">
        {/* Column 1: NEW */}
        <section className="flex flex-col rounded-xl bg-[#171513] border border-[#26221E] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#26221E] bg-[#1E1A17]">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
                <Utensils className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-100 font-mono">
                New Tickets
              </h2>
            </div>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 text-black font-bold font-mono text-xs px-1.5">
              {newTickets.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3.5">
            {newTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-500">
                <p className="text-xs font-mono uppercase tracking-wider">
                  No new orders in queue
                </p>
              </div>
            ) : (
              newTickets.map((ticket) => (
                <KitchenTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isHighlighted={highlightedIds.has(ticket.id)}
                  onTransition={handleTransition}
                />
              ))
            )}
          </div>
        </section>

        {/* Column 2: PREPARING */}
        <section className="flex flex-col rounded-xl bg-[#171513] border border-[#26221E] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#26221E] bg-[#1E1A17]">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/20 text-orange-400">
                <Flame className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-100 font-mono">
                Cooking / Prep
              </h2>
            </div>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 text-black font-bold font-mono text-xs px-1.5">
              {preparingTickets.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3.5">
            {preparingTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-500">
                <p className="text-xs font-mono uppercase tracking-wider">
                  No tickets currently cooking
                </p>
              </div>
            ) : (
              preparingTickets.map((ticket) => (
                <KitchenTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isHighlighted={highlightedIds.has(ticket.id)}
                  onTransition={handleTransition}
                />
              ))
            )}
          </div>
        </section>

        {/* Column 3: READY */}
        <section className="flex flex-col rounded-xl bg-[#171513] border border-[#26221E] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#26221E] bg-[#1E1A17]">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                <Sparkles className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-100 font-mono">
                Ready to Serve
              </h2>
            </div>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500 text-black font-bold font-mono text-xs px-1.5">
              {readyTickets.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3.5">
            {readyTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-500">
                <p className="text-xs font-mono uppercase tracking-wider">
                  No plated tickets ready for dispatch
                </p>
              </div>
            ) : (
              readyTickets.map((ticket) => (
                <KitchenTicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isHighlighted={highlightedIds.has(ticket.id)}
                  onTransition={handleTransition}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
