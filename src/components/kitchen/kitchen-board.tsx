"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { KitchenHeader } from "./kitchen-header";
import { KitchenTicketCard } from "./kitchen-ticket";
import { playKitchenChime } from "@/lib/sound";
import { kitchenApi } from "@/lib/api/kitchen";
import type { KitchenTicket, OrderStatus, StaffSession } from "@/lib/api/types";
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
  const router = useRouter();
  const [tickets, setTickets] = React.useState<KitchenTicket[]>(initialTickets);
  const [highlightedIds, setHighlightedIds] = React.useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState<"all" | "new" | "preparing" | "ready">("all");

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

  const refreshTickets = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await kitchenApi.listTickets();
      if (res.ok) {
        setTickets((current) => {
          const currentIds = new Set(current.map((t) => t.id));
          const brandNewTickets = res.data.filter((t) => !currentIds.has(t.id));
          for (const newTicket of brandNewTickets) {
            triggerNewOrderAlert(newTicket.id);
          }
          return res.data;
        });
      } else if (res.status === 401 || res.code === "UNAUTHENTICATED") {
        router.refresh();
      }
    } catch {
      // tolerate background network hiccup
    } finally {
      setIsRefreshing(false);
    }
  }, [triggerNewOrderAlert, router]);

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
          // Refresh tickets via API client
          kitchenApi.listTickets().then((res) => {
            if (res.ok) {
              setTickets(res.data);
            } else if (res.status === 401 || res.code === "UNAUTHENTICATED") {
              router.refresh();
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
          // Re-fetch via API client as event is a hint
          kitchenApi.listTickets().then((res) => {
            if (res.ok) {
              setTickets(res.data);
            } else if (res.status === 401 || res.code === "UNAUTHENTICATED") {
              router.refresh();
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
  }, [supabase, realtimeChannel, triggerNewOrderAlert, router]);

  // 2. Continuous 3s Polling with visibilitychange listener and 429 backoff
  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isCancelled = false;

    const poll = async () => {
      let delayMs = 3000;
      try {
        const res = await kitchenApi.listTickets();
        if (isCancelled) return;

        if (res.ok) {
          setTickets((current) => {
            const currentIds = new Set(current.map((t) => t.id));
            const brandNewTickets = res.data.filter((t) => !currentIds.has(t.id));

            for (const newTicket of brandNewTickets) {
              triggerNewOrderAlert(newTicket.id);
            }
            return res.data;
          });
        } else if (res.status === 401 || res.code === "UNAUTHENTICATED") {
          router.refresh();
          return;
        } else if (res.status === 429) {
          const retryAfterSec =
            res.retryAfter && res.retryAfter > 0 ? res.retryAfter : 15;
          delayMs = retryAfterSec * 1000;
        }
      } catch {
        // Silently tolerate background network hiccups
      }

      if (!isCancelled) {
        timeoutId = setTimeout(poll, delayMs);
      }
    };

    // Initial poll after 1s
    timeoutId = setTimeout(poll, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void poll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [triggerNewOrderAlert, router]);

  // Handle transition tap action (enforcing valid transition server-side)
  const handleTransition = async (orderId: string, toStatus: OrderStatus) => {
    // Optimistic UI update
    setTickets((prev) =>
      prev
        .map((t) => (t.id === orderId ? { ...t, status: toStatus } : t))
        .filter((t) => t.status !== "served" && t.status !== "cancelled")
    );

    const result = await kitchenApi.transition(orderId, toStatus);
    if (!result.ok) {
      if (result.status === 401 || result.code === "UNAUTHENTICATED") {
        router.refresh();
        return;
      }
      // Revert if server rejected transition
      const refreshed = await kitchenApi.listTickets();
      if (refreshed.ok) {
        setTickets(refreshed.data);
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
        isRefreshing={isRefreshing}
        onRefresh={refreshTickets}
      />

      {/* Mobile Column Switcher (Visible on <md screens) */}
      <div className="md:hidden flex items-center gap-1.5 p-2 bg-[#171513] border-b border-[#26221E] shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("all")}
          className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
            mobileTab === "all"
              ? "bg-[#2D2622] text-white border border-[#4A3C34] shadow-xs"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          All ({tickets.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("new")}
          className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
            mobileTab === "new"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-xs"
              : "text-zinc-400 hover:text-amber-400"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          New ({newTickets.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("preparing")}
          className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
            mobileTab === "preparing"
              ? "bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-xs"
              : "text-zinc-400 hover:text-orange-400"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          Cook ({preparingTickets.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("ready")}
          className={`flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
            mobileTab === "ready"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs"
              : "text-zinc-400 hover:text-emerald-400"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Ready ({readyTickets.length})
        </button>
      </div>

      {/* 3-Column Board (Designed for Tablet Landscape & Touch) */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-y-auto md:overflow-hidden md:h-[calc(100vh-64px)]">
        {/* Column 1: NEW */}
        <section className={`flex-col rounded-xl bg-[#171513] border border-[#26221E] overflow-hidden ${mobileTab !== "all" && mobileTab !== "new" ? "hidden md:flex" : "flex"}`}>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#26221E] bg-[#1E1A17]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
                <Utensils className="h-4.5 w-4.5" />
              </span>
              <h2 className="text-base font-bold tracking-wider uppercase text-zinc-100 font-mono">
                New Tickets
              </h2>
            </div>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-500 text-black font-extrabold font-mono text-sm px-2">
              {newTickets.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3.5">
            {newTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-500">
                <p className="text-sm font-mono uppercase tracking-wider">
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
        <section className={`flex-col rounded-xl bg-[#171513] border border-[#26221E] overflow-hidden ${mobileTab !== "all" && mobileTab !== "preparing" ? "hidden md:flex" : "flex"}`}>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#26221E] bg-[#1E1A17]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/20 text-orange-400">
                <Flame className="h-4.5 w-4.5" />
              </span>
              <h2 className="text-base font-bold tracking-wider uppercase text-zinc-100 font-mono">
                Cooking / Prep
              </h2>
            </div>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-500 text-black font-extrabold font-mono text-sm px-2">
              {preparingTickets.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3.5">
            {preparingTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-500">
                <p className="text-sm font-mono uppercase tracking-wider">
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
        <section className={`flex-col rounded-xl bg-[#171513] border border-[#26221E] overflow-hidden ${mobileTab !== "all" && mobileTab !== "ready" ? "hidden md:flex" : "flex"}`}>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#26221E] bg-[#1E1A17]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <h2 className="text-base font-bold tracking-wider uppercase text-zinc-100 font-mono">
                Ready to Serve
              </h2>
            </div>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-500 text-black font-extrabold font-mono text-sm px-2">
              {readyTickets.length}
            </span>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-3.5">
            {readyTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-500">
                <p className="text-sm font-mono uppercase tracking-wider">
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
