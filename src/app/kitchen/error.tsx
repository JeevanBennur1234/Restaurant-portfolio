"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, LogIn } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function KitchenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Kitchen Display error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#161412] text-[#F3EFEA] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1F1C19] border border-[#2C2825] rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
        <div className="w-12 h-12 rounded-full bg-red-950/80 border border-red-800 text-red-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-500 font-bold">
            Kitchen Display System
          </span>
          <h1 className="font-serif text-2xl font-bold text-zinc-100">
            Kitchen Feed Disconnected
          </h1>
          <p className="text-xs text-zinc-400">
            An error interrupted the real-time ticket stream. Try reconnecting or re-authenticating your kitchen station.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => reset()}
            className="flex-1 justify-center bg-orange-600 hover:bg-orange-700 text-white"
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Reconnect Feed
          </Button>

          <Link href="/kitchen" className="flex-1">
            <Button
              variant="outline"
              size="md"
              className="w-full justify-center border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              leftIcon={<LogIn className="h-4 w-4" />}
            >
              Kitchen Station
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
