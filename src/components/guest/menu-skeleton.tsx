import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function MenuSkeleton() {
  return (
    <div className="flex-1 flex flex-col pb-24">
      {/* Skeleton Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      {/* Search & Filters Skeleton */}
      <div className="p-4 space-y-3 bg-[var(--bg-app)]">
        <Skeleton className="h-10 w-full rounded-[var(--radius-md)]" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      </div>

      {/* Category Tabs Skeleton */}
      <div className="flex gap-2 px-4 py-2 border-b border-[var(--border-subtle)] overflow-hidden">
        <Skeleton className="h-8 w-28 rounded-full shrink-0" />
        <Skeleton className="h-8 w-32 rounded-full shrink-0" />
        <Skeleton className="h-8 w-28 rounded-full shrink-0" />
        <Skeleton className="h-8 w-24 rounded-full shrink-0" />
      </div>

      {/* Cards List Skeleton */}
      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-3.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-xs"
          >
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded-xs" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="pt-2 flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-16 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-24 w-24 rounded-[var(--radius-md)] shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
