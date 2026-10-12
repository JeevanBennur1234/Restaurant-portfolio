"use client";

import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Critical root application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAF7F2] text-[#1B1714] font-sans flex items-center justify-center p-4 m-0">
        <div className="w-full max-w-md bg-white border border-[#E8E2D9] rounded-2xl p-6 sm:p-8 shadow-xl text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-2xl font-bold text-[#1B1714]">
              Critical System Error
            </h1>
            <p className="text-xs sm:text-sm text-[#6E645A]">
              A fatal error prevented the application layout from rendering. Please refresh to restore the session.
            </p>
            {error.digest && (
              <p className="text-[10px] font-mono text-[#998D7F] bg-[#F4EFE6] py-1 px-2 rounded inline-block">
                Digest: {error.digest}
              </p>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-[#882914] hover:bg-[#6E1F0E] text-white text-sm font-semibold shadow-md transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
