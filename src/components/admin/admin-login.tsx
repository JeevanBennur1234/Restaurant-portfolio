"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  UtensilsCrossed,
  ChefHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { loginStaffAction } from "@/server/actions/kitchen";

export function AdminLogin() {
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
        setError(res.error || "Invalid manager credentials");
      }
    } catch (err) {
      setError((err as Error).message || "Authentication failed");
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
        setError(res.error || "Authentication failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-subtle)] flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-xl text-[var(--text-primary)]">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-white mb-3 shadow-md">
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight font-serif text-[var(--text-primary)]">
            Masala Lane Management
          </CardTitle>
          <CardDescription className="text-xs text-[var(--text-secondary)]">
            DinePulse Admin Console · Sign in with floor manager or administrative credentials.
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
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="manager"
                className="w-full h-11 px-3.5 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] font-mono"
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
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-11 px-3.5 text-sm rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] font-mono"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              variant="primary"
              isLoading={isLoading}
              className="w-full h-11 font-bold uppercase tracking-wider shadow-md mt-2"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Sign In to Admin Hub
            </Button>
          </form>

          {/* Quick Demo Access Pills */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] block text-center">
              Demo Preview Quick Sign-In
            </span>

            <button
              type="button"
              onClick={() => handleQuickLogin("manager", "manager123")}
              className="w-full p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--primary)] text-left flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    Floor Manager Login
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-mono">
                    manager / manager123
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wider">
                1-Click Login →
              </span>
            </button>
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/kitchen"
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1"
            >
              <ChefHat className="h-3.5 w-3.5" />
              <span>Looking for Kitchen Display System? Open /kitchen</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
