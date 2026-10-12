"use client";

import * as React from "react";
import Link from "next/link";
import {
  UtensilsCrossed,
  ChefHat,
  ShoppingBag,
  Layers,
  QrCode,
  BarChart3,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutStaffAction } from "@/server/actions/kitchen";
import type { StaffSession } from "@/server/auth";

export type AdminTab = "orders" | "menu" | "tables" | "reports";

interface AdminNavbarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  session: StaffSession;
  activeOrdersCount?: number;
}

export function AdminNavbar({
  activeTab,
  onTabChange,
  session,
  activeOrdersCount = 0,
}: AdminNavbarProps) {
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutStaffAction();
      window.location.reload();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: "orders",
      label: "Live Orders",
      icon: <ShoppingBag className="h-4 w-4" />,
      badge: activeOrdersCount > 0 ? activeOrdersCount : undefined,
    },
    {
      id: "menu",
      label: "Menu & Modifiers",
      icon: <Layers className="h-4 w-4" />,
    },
    {
      id: "tables",
      label: "Tables & QRs",
      icon: <QrCode className="h-4 w-4" />,
    },
    {
      id: "reports",
      label: "Reports & Insights",
      icon: <BarChart3 className="h-4 w-4" />,
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo & Restaurant Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow-sm">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg font-bold tracking-tight text-[var(--text-primary)]">
                  {session.restaurantName || "Masala Lane"}
                </span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                  Manager Hub
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                DinePulse Admin · {session.username}
              </p>
            </div>
          </div>

          {/* Center Tabs Desktop */}
          <nav className="hidden md:flex items-center gap-1 bg-[var(--bg-subtle)] p-1 rounded-xl border border-[var(--border-subtle)]">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-[var(--bg-surface)] text-[var(--primary)] shadow-xs font-semibold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/50"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-1 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold px-1.5 py-0.2">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <Link
              href="/kitchen"
              target="_blank"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors border border-[var(--border-subtle)]"
              title="Open Kitchen Display System in new tab"
            >
              <ChefHat className="h-3.5 w-3.5" />
              <span>Kitchen KDS</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Link>

            <Link
              href="/t/demo"
              target="_blank"
              className="hidden lg:inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors border border-[var(--border-subtle)]"
              title="Open Guest Ordering preview"
            >
              <span>Guest Menu</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              className="h-8 text-xs text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400"
              leftIcon={<LogOut className="h-3.5 w-3.5" />}
            >
              Sign out
            </Button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-[var(--border-subtle)] scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  isActive
                    ? "bg-[var(--primary)] text-white font-semibold"
                    : "text-[var(--text-secondary)] bg-[var(--bg-subtle)]"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 text-[9px] font-bold ${
                      isActive
                        ? "bg-white text-[var(--primary)]"
                        : "bg-[var(--primary)] text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
