"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChefHat, ShieldCheck, KeyRound, AlertCircle, ArrowRight } from "lucide-react";
import { loginStaffAction } from "@/server/actions/kitchen";

export function KitchenLogin() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username || !password || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await loginStaffAction({ username, password });
      if (res.success) {
        window.location.reload();
      } else {
        setError(res.error ?? "Invalid staff credentials");
      }
    } catch (err) {
      setError((err as Error).message ?? "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setIsLoading(true);
    setError(null);
    try {
      const res = await loginStaffAction({ username: user, password: pass });
      if (res.success) {
        window.location.reload();
      } else {
        setError(res.error ?? "Authentication failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#110F0E] text-white flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#1A1816] border-[#2C2825] shadow-2xl text-white">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-white mb-3 shadow-lg">
            <ChefHat className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white font-serif">
            Masala Lane KDS
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Kitchen Display System & Station Management. Enter authorized kitchen or manager credentials.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-950/70 border border-red-700 p-3 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="staff-username"
                className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1"
              >
                Staff Username
              </label>
              <input
                id="staff-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="kitchen or manager"
                className="w-full h-11 px-3.5 text-sm rounded-lg bg-[#25211D] border border-[#38332D] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--primary)] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="staff-password"
                className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1"
              >
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-11 px-3.5 text-sm rounded-lg bg-[#25211D] border border-[#38332D] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--primary)] font-mono"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              variant="primary"
              isLoading={isLoading}
              className="w-full h-12 font-bold uppercase tracking-wider shadow-md mt-2"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign In to KDS Board
            </Button>
          </form>

          {/* Quick Demo Access Pills */}
          <div className="pt-3 border-t border-[#2C2825] space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block text-center">
              Demo Preview Quick Sign-In
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("kitchen", "kitchen123")}
                className="p-2.5 rounded-lg bg-[#231F1C] border border-[#36302B] hover:border-[var(--primary)] text-left flex items-center gap-2 cursor-pointer transition-colors"
              >
                <KeyRound className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-zinc-200">Kitchen Chef</div>
                  <div className="text-[10px] text-zinc-500 font-mono">kitchen / kitchen123</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("manager", "manager123")}
                className="p-2.5 rounded-lg bg-[#231F1C] border border-[#36302B] hover:border-[var(--primary)] text-left flex items-center gap-2 cursor-pointer transition-colors"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-zinc-200">Floor Manager</div>
                  <div className="text-[10px] text-zinc-500 font-mono">manager / manager123</div>
                </div>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
