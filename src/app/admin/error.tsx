"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Admin dashboard error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-8 shadow-[var(--shadow-card)] text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--primary)] font-bold">
            Manager Admin Hub
          </span>
          <h1 className="font-serif text-2xl font-bold text-[var(--text-primary)]">
            Dashboard Error
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Failed to load manager operations data. Check your staff session permissions or retry.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => reset()}
            className="flex-1 justify-center"
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Retry Dashboard
          </Button>

          <Link href="/admin" className="flex-1">
            <Button
              variant="outline"
              size="md"
              className="w-full justify-center"
              leftIcon={<LayoutDashboard className="h-4 w-4" />}
            >
              Admin Hub
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
