"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-8 shadow-[var(--shadow-card)] text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-bold text-[var(--text-primary)]">
            Something went wrong
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            An unexpected error occurred while loading this page. Our team has been notified.
          </p>
          {error.digest && (
            <p className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-subtle)] py-1 px-2 rounded inline-block">
              Error Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => reset()}
            className="flex-1 justify-center"
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Try Again
          </Button>

          <Link href="/" className="flex-1">
            <Button
              variant="outline"
              size="md"
              className="w-full justify-center"
              leftIcon={<Home className="h-4 w-4" />}
            >
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
