"use client";

import * as React from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { customerApi } from "@/lib/api/customer";
import type { TabDetailsData } from "@/lib/api/types";

export interface UseLiveTabOptions {
  token: string;
  initialTab?: TabDetailsData | null;
  enabled?: boolean;
  onTabClosed?: () => void;
}

export function useLiveTab({
  token,
  initialTab = null,
  enabled = true,
  onTabClosed,
}: UseLiveTabOptions) {
  const [tab, setTab] = React.useState<TabDetailsData | null>(initialTab ?? null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isReconnecting, setIsReconnecting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isRealtimeLive, setIsRealtimeLive] = React.useState(false);

  const prevStatusRef = React.useRef<string | null>(initialTab?.status ?? null);
  const isRealtimeLiveRef = React.useRef(false);
  const onTabClosedRef = React.useRef(onTabClosed);

  React.useEffect(() => {
    isRealtimeLiveRef.current = isRealtimeLive;
  }, [isRealtimeLive]);

  React.useEffect(() => {
    onTabClosedRef.current = onTabClosed;
  }, [onTabClosed]);

  const supabase = React.useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("placeholder") &&
      !supabaseAnonKey.includes("placeholder")
    ) {
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return null;
  }, []);

  const fetchTab = React.useCallback(async () => {
    if (!token) return;
    try {
      const res = await customerApi.getActiveTab(token);
      if (res.ok && res.data) {
        setTab(res.data);
        setErrorMessage(null);
        setIsReconnecting(false);

        if (
          res.data.status === "closed" &&
          prevStatusRef.current &&
          prevStatusRef.current !== "closed"
        ) {
          onTabClosedRef.current?.();
        }
        prevStatusRef.current = res.data.status;
      } else {
        if (!isRealtimeLiveRef.current) {
          setIsReconnecting(true);
        }
      }
    } catch {
      if (!isRealtimeLiveRef.current) {
        setIsReconnecting(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Initial fetch (asynchronous within effect callback)
  React.useEffect(() => {
    if (!enabled || !token) return;
    let isMounted = true;

    customerApi
      .getActiveTab(token)
      .then((res) => {
        if (!isMounted) return;
        setIsLoading(false);
        if (res.ok) {
          if (res.data) {
            setTab(res.data);
            setErrorMessage(null);
            setIsReconnecting(false);
            prevStatusRef.current = res.data.status;
          }
        } else {
          setErrorMessage(res.message || "Could not load dining tab");
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoading(false);
        setErrorMessage("Network error while loading tab");
      });

    return () => {
      isMounted = false;
    };
  }, [enabled, token]);

  // Realtime subscriptions
  const tabId = tab?.id;
  const realtimeChannel = tab?.realtimeChannel;
  const orderIds = tab?.orders?.map((o) => o.orderId).join(",") ?? "";

  React.useEffect(() => {
    if (!enabled || !supabase || !tabId) return;

    const channels: RealtimeChannel[] = [];

    // 1. Subscribe to HMAC-derived restaurant channel
    if (realtimeChannel) {
      const restChan = supabase
        .channel(realtimeChannel)
        .on("broadcast", { event: "tab.bill_requested" }, () => {
          fetchTab();
        })
        .on("broadcast", { event: "tab.round_added" }, () => {
          fetchTab();
        })
        .on("broadcast", { event: "tab.updated" }, () => {
          fetchTab();
        })
        .on("broadcast", { event: "tab.closed" }, () => {
          setTab((prev) =>
            prev ? { ...prev, status: "closed", paymentStatus: "paid" } : null
          );
          fetchTab();
          onTabClosedRef.current?.();
        })
        .on("broadcast", { event: "order.status_changed" }, () => {
          fetchTab();
        })
        .on("broadcast", { event: "order.paid" }, () => {
          fetchTab();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setIsRealtimeLive(true);
            setIsReconnecting(false);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setIsRealtimeLive(false);
          }
        });
      channels.push(restChan);
    }

    // 2. Subscribe to tab-specific channel tab:${tabId}
    const tabChan = supabase
      .channel(`tab:${tabId}`)
      .on("broadcast", { event: "tab.bill_requested" }, () => {
        fetchTab();
      })
      .on("broadcast", { event: "tab.updated" }, () => {
        fetchTab();
      })
      .on("broadcast", { event: "tab.closed" }, () => {
        setTab((prev) =>
          prev ? { ...prev, status: "closed", paymentStatus: "paid" } : null
        );
        fetchTab();
        onTabClosedRef.current?.();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsRealtimeLive(true);
          setIsReconnecting(false);
        }
      });
    channels.push(tabChan);

    // 3. Subscribe to each round order channel
    if (orderIds) {
      const splitOrderIds = orderIds.split(",").filter(Boolean);
      for (const ordId of splitOrderIds) {
        const ordChan = supabase
          .channel(`order:${ordId}`)
          .on("broadcast", { event: "order.status_changed" }, () => {
            fetchTab();
          })
          .on("broadcast", { event: "order.paid" }, () => {
            fetchTab();
          })
          .subscribe();
        channels.push(ordChan);
      }
    }

    return () => {
      for (const ch of channels) {
        supabase.removeChannel(ch);
      }
    };
  }, [
    enabled,
    supabase,
    tabId,
    realtimeChannel,
    orderIds,
    fetchTab,
  ]);

  // Polling fallback (every 5 seconds, paused when document is hidden)
  React.useEffect(() => {
    if (!enabled || !token) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return; // Pause polling when tab is hidden
      }
      fetchTab();
    }, 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchTab();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleLocalUpdate = () => {
      fetchTab();
    };
    window.addEventListener("dinepulse:tab-updated", handleLocalUpdate);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("dinepulse:tab-updated", handleLocalUpdate);
    };
  }, [enabled, token, fetchTab]);

  return {
    tab,
    setTab,
    isLoading,
    isReconnecting,
    isRealtimeLive,
    errorMessage,
    setErrorMessage,
    refreshTab: () => fetchTab(),
  };
}
