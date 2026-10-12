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

interface AdminDashboardProps {
  session: StaffSession;
}

function AdminDashboardContent({ session }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = React.useState<AdminTab>("orders");
  const [activeOrdersCount, setActiveOrdersCount] = React.useState(0);
  const { showToast } = useToast();

  // Connect to realtime event channel
  React.useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let channel: RealtimeChannel | null = null;

    if (
      supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("placeholder") &&
      !supabaseAnonKey.includes("placeholder")
    ) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        channel = supabase
          .channel(`restaurant:${session.restaurantId}`)
          .on("broadcast", { event: "order.created" }, (msg) => {
            const payload = msg.payload as { orderNumber?: string; tableNumber?: string };
            showToast({
              title: "New Dining Order Placed",
              message: `${payload.orderNumber || "Order"} placed from ${payload.tableNumber || "a table"}`,
              variant: "info",
            });
            setActiveOrdersCount((prev) => prev + 1);
          })
          .on("broadcast", { event: "order.status_changed" }, (msg) => {
            const payload = msg.payload as {
              orderNumber?: string;
              toStatus?: string;
              tableNumber?: string;
            };
            showToast({
              title: "Order Status Updated",
              message: `${payload.orderNumber || "Order"} is now ${payload.toStatus || "updated"}`,
              variant: "default",
            });
          })
          .on("broadcast", { event: "order.paid" }, (msg) => {
            const payload = msg.payload as { orderNumber?: string; tableNumber?: string };
            showToast({
              title: "Online Payment Received",
              message: `${payload.orderNumber || "Order"} at ${payload.tableNumber || "table"} confirmed via Razorpay`,
              variant: "success",
            });
          });

        channel.subscribe();
      } catch (err) {
        console.warn("Realtime subscription fallback:", (err as Error).message);
      }
    }

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [session.restaurantId, showToast]);

  return (
    <div className="min-h-screen bg-[var(--bg-subtle)] flex flex-col text-[var(--text-primary)]">
      {/* Top Navigation */}
      <AdminNavbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        session={session}
        activeOrdersCount={activeOrdersCount}
      />

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "orders" && (
          <AdminOrdersTab onOrderUpdate={() => {}} />
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

export function AdminDashboard({ session }: AdminDashboardProps) {
  return (
    <ToastProvider>
      <AdminDashboardContent session={session} />
    </ToastProvider>
  );
}
