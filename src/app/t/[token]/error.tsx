"use client";

import * as React from "react";
import { Utensils, RefreshCw, QrCode } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GuestTableError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Guest table ordering error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-[var(--shadow-card)] text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
          <Utensils className="h-6 w-6 text-[var(--primary)]" />
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
            Table Ordering
          </span>
          <h1 className="font-serif text-xl font-bold text-[var(--text-primary)]">
            Menu Temporarily Unavailable
          </h1>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            We couldn&apos;t load the table menu right now. Please tap retry or ask a restaurant captain for assistance.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => reset()}
            className="w-full justify-center"
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Retry Loading Menu
          </Button>

          <Link href="/demo" className="w-full">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center text-xs"
              leftIcon={<QrCode className="h-3.5 w-3.5" />}
            >
              Back to Demo Launch
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
