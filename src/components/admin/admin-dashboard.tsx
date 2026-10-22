"use client";

import * as React from "react";
import Link from "next/link";
import { AdminNavbar, type AdminTab } from "./admin-navbar";
import { AdminOrdersTab } from "./admin-orders-tab";
import { AdminMenuTab } from "./admin-menu-tab";
import { AdminTablesTab } from "./admin-tables-tab";
import { AdminReportsTab } from "./admin-reports-tab";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { StaffSession } from "@/server/auth";
import type { AdminOrderRow } from "@/lib/api/types";

export interface AdminDashboardProps {
  session: StaffSession;
  realtimeChannel: string;
  initialOrders?: AdminOrderRow[];
  initialPagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  kitchenUrl?: string | null;
  customerUrl?: string | null;
}

function AdminDashboardContent({
  session,
  realtimeChannel,
  initialOrders,
  initialPagination,
  kitchenUrl,
  customerUrl,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = React.useState<AdminTab>("orders");
  const [activeOrdersCount, setActiveOrdersCount] = React.useState(0);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const { showToast } = useToast();

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

  // Connect to realtime event channel
  React.useEffect(() => {
    if (!supabase || !realtimeChannel) return;

    let channel: RealtimeChannel | null = null;

    try {
      channel = supabase
        .channel(realtimeChannel)
        .on("broadcast", { event: "order.created" }, () => {
          showToast({
            title: "New Dining Order Placed",
            message: "A new dining order was received",
            variant: "info",
          });
          setActiveOrdersCount((prev) => prev + 1);
          setRefreshKey((prev) => prev + 1);
        })
        .on("broadcast", { event: "order.status_changed" }, (msg) => {
          const payload = msg.payload as { toStatus?: string } | undefined;
          showToast({
            title: "Order Status Updated",
            message: payload?.toStatus
              ? `Order status changed to ${payload.toStatus}`
              : "An order status was updated",
            variant: "default",
          });
          setRefreshKey((prev) => prev + 1);
        })
        .on("broadcast", { event: "order.paid" }, () => {
          showToast({
            title: "Online Payment Received",
            message: "An order payment was confirmed",
            variant: "success",
          });
          setRefreshKey((prev) => prev + 1);
        });

      channel.subscribe();
    } catch (err) {
      console.warn("Realtime subscription fallback:", (err as Error).message);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, realtimeChannel, showToast]);

  // Polling fallback to keep dashboard updated
  React.useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-subtle)] flex flex-col text-[var(--text-primary)]">
      {/* Top Navigation */}
      <AdminNavbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        session={session}
        activeOrdersCount={activeOrdersCount}
        kitchenUrl={kitchenUrl}
        customerUrl={customerUrl}
      />

      {/* Main Tab Content */}
      <main className="mx-auto flex-1 w-[calc(100%-24px)] sm:w-[90%] max-w-[1500px] py-4">
        {activeTab === "orders" && (
          <AdminOrdersTab
            onOrderUpdate={() => setRefreshKey((prev) => prev + 1)}
            refreshKey={refreshKey}
            initialOrders={initialOrders}
            initialPagination={initialPagination}
          />
        )}

        {activeTab === "menu" && <AdminMenuTab />}

        {activeTab === "tables" && <AdminTablesTab />}

        {activeTab === "reports" && <AdminReportsTab />}
      </main>

      {/* Persistent Footer Requirement */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-4 text-center text-xs text-[var(--text-secondary)]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="font-serif">
            Masala Lane · Fine Indian Dining System
          </p>
          <p>
            Concept preview by{" "}
            <Link
              href="https://intallo.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Intallo
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

export function AdminDashboard(props: AdminDashboardProps) {
  return (
    <ToastProvider>
      <AdminDashboardContent {...props} />
    </ToastProvider>
  );
}
