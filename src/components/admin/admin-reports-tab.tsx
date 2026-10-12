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
import {
  getAdminReportsAction,
  type AdminReportsData,
} from "@/server/actions/admin";

export function AdminReportsTab() {
  const [data, setData] = React.useState<AdminReportsData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReports = React.useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const res = await getAdminReportsAction();
      if (res.success && res.reports) {
        setData(res.reports);
      } else {
        setError(res.error || "Failed to load reports");
      }
    } catch (err) {
      setError((err as Error).message || "Error loading reports");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;
    getAdminReportsAction().then((res) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (res.success && res.reports) {
        setData(res.reports);
      } else {
        setError(res.error || "Failed to load reports");
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
          <h3 className="font-serif text-lg font-bold text-[var(--text-primary)]">
            Executive Analytics & Sales Reports
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Today&apos;s real-time order volume, ticket benchmarks, kitchen turnaround, and 7-day revenue trend.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchReports(true)}
          isLoading={isLoading}
          className="text-xs self-start sm:self-auto"
          leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />}
        >
          Refresh Data
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Today's Revenue */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Today&apos;s Revenue
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400">
                <IndianRupee className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="font-serif text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {formatPaiseToINR(reports.todayRevenuePaise)}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              Active &amp; completed dining orders today
            </p>
          </CardContent>
        </Card>

        {/* 2. Today's Order Count */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Orders Today
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400">
                <ShoppingBag className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="font-serif text-2xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
              {reports.todayOrderCount}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              Total dining tickets received
            </p>
          </CardContent>
        </Card>

        {/* 3. Average Ticket Size */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Average Ticket
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="font-serif text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {formatPaiseToINR(reports.todayAvgTicketPaise)}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              Average spend per dining table
            </p>
          </CardContent>
        </Card>

        {/* 4. Average Prep Time */}
        <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] font-mono uppercase tracking-wider">
                Avg. Prep Time
              </span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400">
                <Clock className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="font-serif text-2xl font-bold tracking-tight text-[var(--text-primary)] font-mono">
              {reports.avgPrepTimeMinutes} mins
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              From order placed to kitchen ready
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Revenue & Orders Chart */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
          <div>
            <h4 className="font-serif text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <BarChart3 className="h-4.5 w-4.5 text-[var(--primary)]" />
              <span>7-Day Sales &amp; Order Volume Trend</span>
            </h4>
            <p className="text-xs text-[var(--text-secondary)]">
              Daily gross sales and ticket quantities over the last 7 calendar days.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-xs bg-[var(--primary)]" />
              <span className="text-[var(--text-secondary)]">Daily Revenue</span>
            </div>
          </div>
        </div>

        {/* Chart Visualization Container */}
        <div className="pt-6 pb-2">
          <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-56 border-b border-[var(--border-subtle)] pb-2">
            {reports.sevenDayHistory.map((day, idx) => {
              const heightPct = Math.max(
                8,
                Math.round((day.revenuePaise / maxRevenue) * 100)
              );
              const isToday = idx === reports.sevenDayHistory.length - 1;

              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center justify-end h-full group"
                >
                  {/* Tooltip / Value on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-2 text-center text-[10px] font-mono bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-2 py-1 rounded-md shadow-lg pointer-events-none whitespace-nowrap z-10">
                    <div className="font-bold">{formatPaiseToINR(day.revenuePaise)}</div>
                    <div className="text-[9px] opacity-80">{day.orderCount} orders</div>
                  </div>

                  {/* Order count pill */}
                  <span className="text-[10px] font-mono font-semibold text-[var(--text-muted)] mb-1">
                    {day.orderCount} orders
                  </span>

                  {/* Revenue Bar */}
                  <div className="w-full max-w-[42px] bg-[var(--bg-subtle)] rounded-t-lg overflow-hidden flex flex-col justify-end p-0.5">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-md transition-all duration-500 ${
                        isToday
                          ? "bg-[var(--primary)] shadow-sm"
                          : "bg-[var(--accent)] hover:bg-[var(--primary)]"
                      }`}
                    />
                  </div>

                  {/* Day Label */}
                  <div className="mt-3 text-center">
                    <div
                      className={`text-xs font-semibold ${
                        isToday ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                      }`}
                    >
                      {day.dayLabel}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono">
                      {day.date.slice(5)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Selling Items Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-serif text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Award className="h-4.5 w-4.5 text-amber-500" />
              <span>Top 5 High-Demand Menu Dishes</span>
            </h4>
            <p className="text-xs text-[var(--text-secondary)]">
              Ranked by quantity ordered and cumulative revenue contribution.
            </p>
          </div>
        </div>

        {reports.topItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
            No item sales recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[var(--text-secondary)] font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3 text-center">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Revenue Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {reports.topItems.map((item, index) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40 transition-colors">
                    {/* Rank */}
                    <td className="py-3 px-3 font-mono font-bold text-xs text-[var(--primary)]">
                      #{index + 1}
                    </td>

                    {/* Item */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border ${
                            item.isVeg ? "border-emerald-600 bg-white" : "border-red-700 bg-white"
                          }`}
                        >
                          <div
                            className={`h-1.5 w-1.5 rounded-full ${
                              item.isVeg ? "bg-emerald-600" : "bg-red-700"
                            }`}
                          />
                        </div>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {item.name}
                        </span>
                      </div>
                    </td>

                    {/* Units Sold */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-[var(--text-primary)]">
                      {item.totalQuantity}
                    </td>

                    {/* Revenue */}
                    <td className="py-3 px-3 text-right font-mono font-semibold text-[var(--text-primary)]">
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
