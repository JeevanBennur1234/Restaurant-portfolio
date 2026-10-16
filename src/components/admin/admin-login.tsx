"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  AlertCircle,
  UtensilsCrossed,
  ChefHat,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { authApi, demoLoginAction } from "@/lib/api/auth";
import { resolveSiteUrl } from "@/lib/site-urls";

export interface AdminLoginProps {
  isDemoMode?: boolean;
  kitchenUrl?: string | null;
}

export function AdminLogin({ isDemoMode = false, kitchenUrl }: AdminLoginProps) {
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
      const res = await authApi.login(username, password);
      if (res.ok) {
        window.location.reload();
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError((err as Error).message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (isLoading || isDemoLoading) return;
    setIsDemoLoading(true);
    setError(null);
    try {
      const res = await demoLoginAction("manager");
      if (res.success) {
        window.location.reload();
      } else {
        setError(res.error || "Demo login failed");
      }
    } catch (err) {
      setError((err as Error).message || "Authentication failed");
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col items-center justify-center p-4 text-[var(--text-primary)]">
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-96 w-96 rounded-full bg-[var(--primary)]/10 blur-3xl -top-20"
      />

      <Card className="relative w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-elevated)] text-[var(--text-primary)] rounded-[var(--radius-xl)]">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-white mb-3 shadow-md ring-4 ring-[var(--primary)]/15">
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <span className="eyebrow text-[10px] text-amber-700 tracking-[0.2em]">
            Masala Lane Hub · Operations
          </span>
          <CardTitle className="text-2xl font-bold tracking-tight font-serif text-[var(--text-primary)] mt-1">
            Manager Console
          </CardTitle>
          <CardDescription className="text-xs text-[var(--text-secondary)] mt-1">
            Sign in with authorized restaurant manager or administrative credentials.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/70 border border-red-300 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="admin-username"
                className="block text-xs font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-1"
              >
                Manager Username
              </label>
              <input
                id="admin-username"
                data-testid="admin-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Manager username"
                className="w-full h-11 px-3.5 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] font-mono transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-1"
              >
                Password
              </label>
              <input
                id="admin-password"
                data-testid="admin-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-11 px-3.5 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] font-mono transition-colors"
              />
            </div>

            <Button
              type="submit"
              data-testid="admin-login-btn"
              size="lg"
              variant="primary"
              isLoading={isLoading}
              disabled={isDemoLoading}
              className="w-full h-12 min-h-[48px] font-bold uppercase tracking-wider shadow-md mt-2 text-sm"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign In to Admin Hub
            </Button>
          </form>

          {/* Demo Mode Button (only rendered when isDemoMode is true from server, no client credentials) */}
          {isDemoMode && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] block text-center">
                Demo Preview Access
              </span>

              <Button
                type="button"
                data-testid="admin-demo-login-btn"
                variant="outline"
                isLoading={isDemoLoading}
                disabled={isLoading}
                onClick={handleDemoLogin}
                className="w-full h-11 min-h-[44px] border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] hover:border-[var(--primary)] text-[var(--text-primary)] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Continue as demo manager</span>
              </Button>
            </div>
          )}

          {/* Conditional Open Kitchen Display Link */}
          {(kitchenUrl !== undefined ? kitchenUrl : resolveSiteUrl("kitchen", "/kitchen")) && (
            <div className="pt-2 text-center">
              <Link
                href={(kitchenUrl !== undefined ? kitchenUrl : resolveSiteUrl("kitchen", "/kitchen"))!}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1.5 font-medium"
              >
                <ChefHat className="h-3.5 w-3.5" />
                <span>Open kitchen display</span>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
