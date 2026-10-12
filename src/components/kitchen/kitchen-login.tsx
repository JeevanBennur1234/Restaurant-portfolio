"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChefHat, AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { loginStaffAction } from "@/server/actions/kitchen";
import { demoLoginAction } from "@/server/actions/demo";

export interface KitchenLoginProps {
  isDemoMode?: boolean;
}

export function KitchenLogin({ isDemoMode = false }: KitchenLoginProps) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isDemoLoading, setIsDemoLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username || !password || isLoading || isDemoLoading) return;

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

  const handleDemoLogin = async () => {
    if (isLoading || isDemoLoading) return;
    setIsDemoLoading(true);
    setError(null);
    try {
      const res = await demoLoginAction("kitchen");
      if (res.success) {
        window.location.reload();
      } else {
        setError(res.error ?? "Demo login failed");
      }
    } catch (err) {
      setError((err as Error).message ?? "Authentication failed");
    } finally {
      setIsDemoLoading(false);
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
                placeholder="Staff username"
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
              disabled={isDemoLoading}
              className="w-full h-12 font-bold uppercase tracking-wider shadow-md mt-2"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign In to KDS Board
            </Button>
          </form>

          {/* Demo Mode Button (only rendered when isDemoMode is true from server, no client credentials) */}
          {isDemoMode && (
            <div className="pt-3 border-t border-[#2C2825] space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block text-center">
                Demo Preview Access
              </span>
              <Button
                type="button"
                variant="outline"
                isLoading={isDemoLoading}
                disabled={isLoading}
                onClick={handleDemoLogin}
                className="w-full h-11 border-[#38332D] bg-[#231F1C] hover:bg-[#2c2723] hover:border-[var(--primary)] text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Continue as demo kitchen</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
