"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { authApi } from "@/lib/api/auth";
import type { StaffSession } from "@/lib/api/types";
import { resolveSiteUrl } from "@/lib/site-urls";

export type AdminTab = "orders" | "menu" | "tables" | "reports";

interface AdminNavbarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  session: StaffSession;
  activeOrdersCount?: number;
  kitchenUrl?: string | null;
  customerUrl?: string | null;
}

export function AdminNavbar({
  activeTab,
  onTabChange,
  session,
  activeOrdersCount = 0,
  kitchenUrl,
  customerUrl,
}: AdminNavbarProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const brandHomeUrl = customerUrl ?? resolveSiteUrl("customer", "/") ?? "/";

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApi.logout();
      router.refresh();
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
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Authentic restaurant brand; always returns to the public Masala Lane home page. */}
          <Link
            href={brandHomeUrl}
            data-testid="admin-brand-home-link"
            aria-label={`Go to ${session.restaurantName || "Masala Lane"} main page`}
            title={`Open ${session.restaurantName || "Masala Lane"} main page`}
            className="group flex min-w-0 items-center gap-3 rounded-xl py-1 pr-2 transition-colors hover:bg-[var(--bg-subtle)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--primary)]/25 bg-[var(--primary-subtle)] text-[var(--primary)] shadow-xs transition-transform group-hover:scale-105">
              <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-serif text-lg sm:text-xl font-bold tracking-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--primary)]">
                  {session.restaurantName || "Masala Lane"}
                </span>
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                  Manager Hub
                </span>
              </span>
              <span className="mt-0.5 block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                DinePulse Admin · {session.username}
              </span>
            </span>
          </Link>

          {/* Center Tabs Desktop with High-Contrast Active State */}
          <nav
            aria-label="Admin Navigation Tabs"
            className="hidden md:flex items-center gap-1.5 bg-[var(--bg-subtle)] p-1.5 rounded-xl border border-[var(--border-subtle)]"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  data-testid={`admin-nav-${item.id}`}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] min-h-[40px] ${
                    isActive
                      ? "bg-[var(--primary)] text-white shadow-xs font-semibold"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] font-medium"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`ml-1 rounded-full text-xs font-bold px-2 py-0.5 ${
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
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {(kitchenUrl !== undefined ? kitchenUrl : resolveSiteUrl("kitchen", "/kitchen")) && (
              <Link
                href={(kitchenUrl !== undefined ? kitchenUrl : resolveSiteUrl("kitchen", "/kitchen"))!}
                target="_blank"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors border border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                title="Open Kitchen Display System in new tab"
              >
                <ChefHat className="h-3.5 w-3.5" />
                <span>Kitchen KDS</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Link>
            )}

            {(customerUrl !== undefined ? customerUrl : resolveSiteUrl("customer", "/")) && (
              <Link
                href={(customerUrl !== undefined ? customerUrl : resolveSiteUrl("customer", "/"))!}
                target="_blank"
                className="hidden lg:inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors border border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                title="Open Guest Ordering preview"
              >
                <span>Guest Menu</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Link>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              isLoading={isLoggingOut}
              className="h-8.5 text-xs text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              leftIcon={<LogOut className="h-3.5 w-3.5" />}
            >
              Sign out
            </Button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar with Clean Tabs */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1.5 border-t border-[var(--border-subtle)] no-scrollbar">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                data-testid={`admin-nav-mobile-${item.id}`}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex shrink-0 items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium cursor-pointer min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${
                  isActive
                    ? "bg-[var(--primary)] text-white font-semibold shadow-xs"
                    : "text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
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
