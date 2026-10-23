"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChefHat, AlertCircle, ArrowRight } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { resolveSiteUrl } from "@/lib/site-urls";

export interface KitchenLoginProps {
  managerUrl?: string | null;
}

export function KitchenLogin({ managerUrl }: KitchenLoginProps) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    const form = e?.currentTarget;
    const formUsername = form ? (new FormData(form).get("username") as string) : "";
    const formPassword = form ? (new FormData(form).get("password") as string) : "";
    const targetUsername = (username || formUsername || "").trim();
    const targetPassword = password || formPassword || "";
    if (!targetUsername || !targetPassword || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await authApi.login(targetUsername, targetPassword);
      if (res.ok) {
        window.location.reload();
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError((err as Error).message ?? "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#110F0E] text-[#FAF7F2] flex flex-col items-center justify-center p-4">
      {/* Ambient warm tandoor ember glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-96 w-96 rounded-full bg-[var(--primary)]/10 blur-3xl -top-20"
      />

      <Card className="relative w-full max-w-md bg-[#1A1816] border-[#2C2825] shadow-2xl text-[#FAF7F2]">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-white mb-3 shadow-lg ring-4 ring-[var(--primary)]/20">
            <ChefHat className="h-7 w-7" />
          </div>
          <span className="eyebrow text-[10px] text-amber-300 tracking-[0.2em]">
            Masala Lane Kitchen · KDS
          </span>
          <CardTitle className="text-2xl font-bold tracking-tight text-[#FAF7F2] font-serif mt-1">
            Kitchen Display
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400 mt-1">
            Live Kitchen Display System. Enter your authorized kitchen staff or floor manager credentials.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-950/80 border border-red-700/80 p-3 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="staff-username"
                className="block text-xs sm:text-sm font-mono uppercase tracking-wider text-zinc-400 mb-1"
              >
                Staff Username
              </label>
              <input
                id="staff-username" name="username"
                data-testid="kitchen-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Staff username"
                className="w-full h-11 px-3.5 text-base rounded-lg bg-[#25211D] border border-[#38332D] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] font-mono transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="staff-password"
                className="block text-xs sm:text-sm font-mono uppercase tracking-wider text-zinc-400 mb-1"
              >
                Password
              </label>
              <input
                id="staff-password" name="password"
                data-testid="kitchen-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-11 px-3.5 text-base rounded-lg bg-[#25211D] border border-[#38332D] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] font-mono transition-colors"
              />
            </div>

            <Button
              type="submit"
              data-testid="kitchen-login-btn"
              size="lg"
              variant="primary"
              isLoading={isLoading}
              className="w-full h-12 min-h-[48px] font-bold uppercase tracking-wider shadow-md mt-2 text-base"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign In to KDS Board
            </Button>
          </form>

          {/* Conditional Manager Console Link */}
          {(managerUrl !== undefined ? managerUrl : resolveSiteUrl("manager", "/admin")) && (
            <div className="pt-2 text-center">
              <Link
                href={(managerUrl !== undefined ? managerUrl : resolveSiteUrl("manager", "/admin"))!}
                className="text-xs text-zinc-400 hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1.5 font-medium"
              >
                <span>Manager console</span>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
