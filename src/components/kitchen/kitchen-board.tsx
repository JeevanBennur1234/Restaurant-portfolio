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

// Order status progression rank: strictly monotonic forward progression
const STATUS_RANK: Record<OrderStatus, number> = {
  placed: 1,
  accepted: 1, // placed and accepted both reside in the "New" column
  preparing: 2, // Cook column
  ready: 3, // Ready column
  served: 4, // Terminal / cleared
  cancelled: 5, // Terminal / cleared
};

interface PendingTransition {
  toStatus: OrderStatus;
  targetRank: number;
  timestamp: number;
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
  const [inFlightOrderIds, setInFlightOrderIds] = React.useState<Set<string>>(new Set());

  // Pending transitions map to prevent race conditions from background polls or realtime re-fetches
  const pendingTransitionsRef = React.useRef<Map<string, PendingTransition>>(new Map());

  // Set of order IDs already seen to prevent repeat alerts if tickets are re-fetched
  const seenOrderIdsRef = React.useRef<Set<string>>(new Set(initialTickets.map((t) => t.id)));

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

  /**
   * Reconciles incoming server tickets with current client tickets and pending transitions.
   * Guarantees monotonic forward status progression: an order that has moved forward
   * (e.g. to preparing or ready) will NEVER jump backwards due to a stale in-flight poll.
   */
  const reconcileTickets = React.useCallback(
    (incoming: KitchenTicket[], current: KitchenTicket[]): KitchenTicket[] => {
      const currentMap = new Map(current.map((t) => [t.id, t]));
      const now = Date.now();

      // Clean up expired pending transitions (older than 10 seconds)
      for (const [id, pt] of pendingTransitionsRef.current.entries()) {
        if (now - pt.timestamp > 10000) {
          pendingTransitionsRef.current.delete(id);
        }
      }

      const reconciled: KitchenTicket[] = [];

      for (const ticket of incoming) {
        // If cancelled on server, drop from board and clear any pending transition
        if (ticket.status === "cancelled") {
          pendingTransitionsRef.current.delete(ticket.id);
          continue;
        }

        const pending = pendingTransitionsRef.current.get(ticket.id);
        const existing = currentMap.get(ticket.id);

        let effectiveStatus: OrderStatus = ticket.status;

        // 1. Guard against stale poll if we have an active pending transition
        if (pending && now - pending.timestamp <= 10000) {
          if (STATUS_RANK[effectiveStatus] < pending.targetRank) {
            effectiveStatus = pending.toStatus;
          } else if (STATUS_RANK[effectiveStatus] >= pending.targetRank) {
            pendingTransitionsRef.current.delete(ticket.id);
          }
        }

        // 2. Monotonic guard: never downgrade an existing ticket's forward progress
        if (existing && existing.status !== "cancelled") {
          if (STATUS_RANK[effectiveStatus] < STATUS_RANK[existing.status]) {
            effectiveStatus = existing.status;
          }
        }

        // 3. Exclude served or cancelled from active kitchen board
        if (effectiveStatus === "served" || effectiveStatus === "cancelled") {
          continue;
        }

        reconciled.push({
          ...ticket,
          status: effectiveStatus,
        });
      }

      // 4. Preserve any tickets that were optimistically updated but not yet returned by server
      for (const cur of current) {
        if (
          !incoming.some((inc) => inc.id === cur.id) &&
          pendingTransitionsRef.current.has(cur.id)
        ) {
          const pt = pendingTransitionsRef.current.get(cur.id)!;
          if (pt.toStatus !== "served" && pt.toStatus !== "cancelled") {
            reconciled.push(cur);
          }
        }
      }

      return reconciled;
    },
    []
  );

  /**
   * Applies incoming server tickets, reconciling them and alerting only for genuinely new orders.
   */
  const applyIncomingTickets = React.useCallback(
    (incoming: KitchenTicket[]) => {
      setTickets((current) => {
        const reconciled = reconcileTickets(incoming, current);

        // Alert only for genuinely brand-new tickets never seen on this board before
        const brandNewTickets = reconciled.filter(
          (t) => !seenOrderIdsRef.current.has(t.id)
        );
        for (const newTicket of brandNewTickets) {
          seenOrderIdsRef.current.add(newTicket.id);
          triggerNewOrderAlert(newTicket.id);
        }

        return reconciled;
      });
    },
    [reconcileTickets, triggerNewOrderAlert]
  );

  const refreshTickets = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await kitchenApi.listTickets();
      if (res.ok) {
        applyIncomingTickets(res.data);
      } else if (res.status === 401 || res.code === "UNAUTHENTICATED") {
        router.refresh();
      }
    } catch {
      // tolerate background network hiccup
    } finally {
      setIsRefreshing(false);
    }
  }, [applyIncomingTickets, router]);

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
          if (orderId && !seenOrderIdsRef.current.has(orderId)) {
            seenOrderIdsRef.current.add(orderId);
            triggerNewOrderAlert(orderId);
          }
          // Refresh tickets via API client
          kitchenApi.listTickets().then((res) => {
            if (res.ok) {
              applyIncomingTickets(res.data);
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
          // Re-fetch via API client and reconcile monotonically
          kitchenApi.listTickets().then((res) => {
            if (res.ok) {
              applyIncomingTickets(res.data);
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
  }, [supabase, realtimeChannel, triggerNewOrderAlert, applyIncomingTickets, router]);

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
          applyIncomingTickets(res.data);
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
  }, [applyIncomingTickets, router]);

  // Handle transition tap action (enforcing valid transition server-side)
  const handleTransition = async (orderId: string, toStatus: OrderStatus) => {
    // Prevent duplicate in-flight transition on the same order
    if (inFlightOrderIds.has(orderId)) return;

    setInFlightOrderIds((prev) => new Set([...prev, orderId]));

    // 1. Register pending transition with target status and rank
    pendingTransitionsRef.current.set(orderId, {
      toStatus,
      targetRank: STATUS_RANK[toStatus],
      timestamp: Date.now(),
    });

    // 2. Optimistic UI update immediately
    setTickets((prev) =>
      prev
        .map((t) => (t.id === orderId ? { ...t, status: toStatus } : t))
        .filter((t) => t.status !== "served" && t.status !== "cancelled")
    );

    try {
      const result = await kitchenApi.transition(orderId, toStatus);
      if (!result.ok) {
        if (result.status === 401 || result.code === "UNAUTHENTICATED") {
          router.refresh();
          return;
        }
        // Transition genuinely failed: delete pending transition and revert to server state
        pendingTransitionsRef.current.delete(orderId);
        const refreshed = await kitchenApi.listTickets();
        if (refreshed.ok) {
          setTickets(refreshed.data.filter((t) => t.status !== "served" && t.status !== "cancelled"));
        }
      } else {
        // Transition confirmed by server: retain pending transition for 3s buffer
        // to protect against any delayed in-flight polls started before DB commit
        setTimeout(() => {
          pendingTransitionsRef.current.delete(orderId);
        }, 3000);
      }
    } catch {
      // In case of unexpected network failure, clear pending and restore
      pendingTransitionsRef.current.delete(orderId);
      const refreshed = await kitchenApi.listTickets();
      if (refreshed.ok) {
        setTickets(refreshed.data.filter((t) => t.status !== "served" && t.status !== "cancelled"));
      }
    } finally {
      setInFlightOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
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
                  isPending={inFlightOrderIds.has(ticket.id)}
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
                  isPending={inFlightOrderIds.has(ticket.id)}
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
                  isPending={inFlightOrderIds.has(ticket.id)}
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
