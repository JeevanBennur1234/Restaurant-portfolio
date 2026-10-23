"use client";

import * as React from "react";
import {
  IndianRupee,
  ShoppingBag,
  TrendingUp,
  Clock,
  Award,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPaiseToINR } from "@/lib/currency";
import { adminApi } from "@/lib/api/admin";
import { userMessageFor } from "@/lib/api/errors";
import type { AdminReportsData } from "@/lib/api/types";

export function AdminReportsTab() {
  const [data, setData] = React.useState<AdminReportsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReports = React.useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const res = await adminApi.getReports();
      if (res.ok) {
        setData(res.data);
      } else {
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        const msg =
          res.status === 403
            ? res.message
            : res.status === 429 && res.retryAfter
            ? `Too many requests. Please retry in ${res.retryAfter}s.`
            : userMessageFor(res.code, res.message || "Failed to load reports");
        setError(msg);
      }
    } catch (err) {
      setError((err as Error).message || "Error loading reports");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    adminApi.getReports().then((res) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (res.ok) {
        setData(res.data);
      } else {
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        const msg =
          res.status === 403
            ? res.message
            : res.status === 429 && res.retryAfter
            ? `Too many requests. Please retry in ${res.retryAfter}s.`
            : userMessageFor(res.code, res.message || "Failed to load reports");
        setError(msg);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  const reports = data || {
    todayRevenuePaise: 0,
    todayOrderCount: 0,
    todayAvgTicketPaise: 0,
    avgPrepTimeMinutes: 15,
    topItems: [],
    sevenDayHistory: [],
  };

  // Compute maximum revenue in 7 days for bar scaling
  const maxRevenue = Math.max(
    ...reports.sevenDayHistory.map((d) => d.revenuePaise),
    100000 // minimum baseline ₹1,000 for zero state
  );

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
        <div>
          <span className="eyebrow text-[10px] text-amber-700 font-semibold tracking-[0.2em]">
            Executive Overview
          </span>
          <h3 className="font-serif text-lg sm:text-xl font-bold text-[var(--text-primary)]">
            Sales & Operational Analytics
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Real-time daily turnover, ticket volume, kitchen prep benchmark, and 7-day revenue trend.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchReports(true)}
          isLoading={isLoading}
          className="text-xs self-start sm:self-auto h-9 px-3"
          leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />}
        >
          Refresh Data
        </Button>
      </div>

      {/* KPI Cards Grid with Large Display Numerals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Today's Revenue */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs hover:border-[var(--border-strong)] transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Today&apos;s Revenue
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                <IndianRupee className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="text-2xl font-normal text-[var(--text-primary)] leading-none tabular-nums">
              {formatPaiseToINR(reports.todayRevenuePaise)}
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2">
              Active &amp; completed orders today
            </p>
          </CardContent>
        </Card>

        {/* 2. Today's Order Count */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs hover:border-[var(--border-strong)] transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Orders Today
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300">
                <ShoppingBag className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] font-mono leading-none tabular-nums">
              {reports.todayOrderCount}
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2">
              Total dining tickets received
            </p>
          </CardContent>
        </Card>

        {/* 3. Average Ticket Size */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs hover:border-[var(--border-strong)] transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Average Ticket
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="text-2xl font-normal text-[var(--text-primary)] leading-none tabular-nums">
              {formatPaiseToINR(reports.todayAvgTicketPaise)}
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2">
              Average spend per dining table
            </p>
          </CardContent>
        </Card>

        {/* 4. Average Prep Time */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs hover:border-[var(--border-strong)] transition-all">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Avg. Prep Time
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300">
                <Clock className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] font-mono leading-none tabular-nums">
              {reports.avgPrepTimeMinutes} <span className="text-xl font-sans font-medium text-[var(--text-secondary)]">min</span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2">
              From order placed to kitchen ready
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Brand-Coloured 7-Day Revenue & Orders Trend Chart */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
          <div>
            <h4 className="font-serif text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[var(--primary)]" />
              <span>7-Day Revenue &amp; Ticket Volume Trend</span>
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Daily gross sales and ticket turnover over the last 7 calendar days.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-xs bg-[var(--primary)]" />
              <span className="text-[var(--text-secondary)]">Today (Terracotta)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-xs bg-[var(--accent)]" />
              <span className="text-[var(--text-secondary)]">Past Days (Saffron)</span>
            </div>
          </div>
        </div>

        {/* Chart Visualization Container */}
        <div className="pt-6 pb-2">
          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end border-b border-[var(--border-subtle)] pb-4">
            {reports.sevenDayHistory.map((day, idx) => {
              const heightPct = Math.max(
                8,
                Math.round((day.revenuePaise / maxRevenue) * 100)
              );
              const isToday = idx === reports.sevenDayHistory.length - 1;

              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center justify-end group"
                >
                  {/* Tooltip / Value on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-2 text-center text-[10px] font-mono bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 px-2 py-1 rounded-md shadow-lg pointer-events-none whitespace-nowrap z-10 tabular-nums">
                    <div className="font-normal">{formatPaiseToINR(day.revenuePaise)}</div>
                    <div className="text-[9px] opacity-80">{day.orderCount} orders</div>
                  </div>

                  {/* Order count label */}
                  <div className="flex flex-col items-center mb-1.5">
                    <span className="text-[11px] sm:text-xs font-mono font-bold text-[var(--text-primary)] tabular-nums">
                      {day.orderCount}
                    </span>
                    <span className="text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                      {day.orderCount === 1 ? "tkt" : "tkts"}
                    </span>
                  </div>

                  {/* Brand-Coloured Bar with fixed height track */}
                  <div className="w-full max-w-[48px] h-36 sm:h-44 bg-[var(--bg-subtle)] rounded-t-xl overflow-hidden flex flex-col justify-end p-1 border border-[var(--border-subtle)] shadow-inner">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full min-h-[6px] rounded-t-md transition-all duration-500 ${
                        isToday
                          ? "bg-gradient-to-t from-[var(--primary)] to-[#D96B43] shadow-md ring-1 ring-[var(--primary)]"
                          : "bg-gradient-to-t from-[var(--accent)] to-[#E8A663] hover:from-[var(--primary)] hover:to-[#D96B43] opacity-90 hover:opacity-100"
                      }`}
                    />
                  </div>

                  {/* Day Label & Amount */}
                  <div className="mt-3 text-center">
                    <div
                      className={`text-xs font-semibold ${
                        isToday ? "text-[var(--primary)] font-bold" : "text-[var(--text-primary)]"
                      }`}
                    >
                      {day.dayLabel}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums">
                      {day.date.slice(5)}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)] tabular-nums mt-0.5">
                      {formatPaiseToINR(day.revenuePaise)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Selling Items Table (Scrolls horizontally inside container on small screens) */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-serif text-base sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              <span>Top 5 High-Demand Menu Dishes</span>
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Ranked by total quantity ordered and cumulative revenue contribution.
            </p>
          </div>
        </div>

        {reports.topItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
            No item sales recorded yet.
          </div>
        ) : (
          /* Container ensures table scrolls horizontally on small screens without breaking layout */
          <div className="w-full overflow-x-auto no-scrollbar sm:scrollbar-thin rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full text-left text-sm border-collapse min-w-[540px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[var(--text-secondary)] font-mono uppercase text-xs tracking-wider">
                  <th className="py-3.5 px-4 font-semibold">Rank</th>
                  <th className="py-3.5 px-4 font-semibold">Item Name</th>
                  <th className="py-3.5 px-4 text-center font-semibold">Units Sold</th>
                  <th className="py-3.5 px-4 text-right font-semibold">Revenue Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {reports.topItems.map((item, index) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    className="hover:bg-[var(--bg-subtle)]/80 focus-within:bg-[var(--bg-subtle)]/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)] transition-colors cursor-default"
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-4 font-mono font-bold text-sm text-[var(--primary)]">
                      #{index + 1}
                    </td>

                    {/* Item */}
                    <td className="py-3.5 px-4 font-semibold text-sm sm:text-base text-[var(--text-primary)]">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border ${
                            item.isVeg ? "border-emerald-600 bg-white" : "border-amber-900 bg-white"
                          }`}
                        >
                          <div
                            className={`h-1.5 w-1.5 rounded-full ${
                              item.isVeg ? "bg-emerald-600" : "bg-amber-900"
                            }`}
                          />
                        </div>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {item.name}
                        </span>
                      </div>
                    </td>

                    {/* Units Sold */}
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-[var(--text-primary)] tabular-nums">
                      {item.totalQuantity}
                    </td>

                    {/* Revenue */}
                    <td className="py-3.5 px-4 text-right text-base text-[var(--text-primary)] tabular-nums">
                      {formatPaiseToINR(item.totalRevenuePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
