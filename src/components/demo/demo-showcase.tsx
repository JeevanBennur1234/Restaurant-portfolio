"use client";

import * as React from "react";
import Link from "next/link";
import {
  Smartphone,
  ChefHat,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { demoLoginAction } from "@/server/actions/demo";

interface DemoShowcaseProps {
  isDemoMode: boolean;
}

export function DemoShowcase({ isDemoMode }: DemoShowcaseProps) {
  const [activeTab, setActiveTab] = React.useState<"split" | "guest" | "kitchen">("split");
  const [isLoggingInKitchen, setIsLoggingInKitchen] = React.useState(false);
  const [isLoggingInManager, setIsLoggingInManager] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [iframeKey, setIframeKey] = React.useState(0);

  const handleKitchenLogin = async () => {
    try {
      setIsLoggingInKitchen(true);
      setErrorMessage(null);
      const res = await demoLoginAction("kitchen");
      if (res.success && res.redirectTo) {
        window.open(res.redirectTo, "_blank");
        // Reload iframes so session is recognized
        setIframeKey((prev) => prev + 1);
      } else {
        setErrorMessage(res.error || "Failed to log in as demo kitchen");
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "An unexpected error occurred");
    } finally {
      setIsLoggingInKitchen(false);
    }
  };

  const handleManagerLogin = async () => {
    try {
      setIsLoggingInManager(true);
      setErrorMessage(null);
      const res = await demoLoginAction("manager");
      if (res.success && res.redirectTo) {
        window.open(res.redirectTo, "_blank");
      } else {
        setErrorMessage(res.error || "Failed to log in as demo manager");
      }
    } catch (err) {
      setErrorMessage((err as Error).message || "An unexpected error occurred");
    } finally {
      setIsLoggingInManager(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[var(--bg-surface)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="font-serif text-xl font-bold tracking-tight text-[var(--primary)] group-hover:opacity-90">
                DinePulse
              </span>
            </Link>
            <div className="h-4 w-px bg-[var(--border-subtle)]" />
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-600/30 text-[10px] font-semibold tracking-wide uppercase px-2.5 py-0.5"
            >
              <Sparkles className="h-3 w-3 mr-1 inline-block" />
              Concept Preview
            </Badge>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="https://intallo.in/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/15 px-3 py-1.5 rounded-lg transition-colors"
            >
              <span>Contact Intallo</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Showcase Hero */}
      <section className="px-4 sm:px-8 pt-8 pb-6 max-w-7xl mx-auto w-full text-center">
        <div className="max-w-3xl mx-auto space-y-3">
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[var(--text-primary)]">
            Instant QR Dining & Real-Time Kitchen Operations
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed font-sans">
            A unified hospitality architecture by Intallo: guest self-ordering, automated server-verified billing, and a zero-latency digital kitchen dispatch system.
          </p>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mt-4 max-w-xl mx-auto p-3 text-xs bg-red-50 text-red-800 border border-red-200 rounded-lg flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Quick Launch Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={() => window.open("/t/demo-table-7", "_blank")}
            leftIcon={<Smartphone className="h-4 w-4" />}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            className="shadow-md"
          >
            Open as Guest (Table 7)
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={handleKitchenLogin}
            isLoading={isLoggingInKitchen}
            disabled={!isDemoMode}
            leftIcon={<ChefHat className="h-4 w-4" />}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            className="shadow-md bg-stone-800 text-stone-100 hover:bg-stone-900 border border-stone-700"
          >
            Open as Kitchen
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={handleManagerLogin}
            isLoading={isLoggingInManager}
            disabled={!isDemoMode}
            leftIcon={<ShieldCheck className="h-4 w-4 text-[var(--primary)]" />}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            className="shadow-sm"
          >
            Open as Manager
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Reload live screens"
            className="text-xs text-[var(--text-secondary)]"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Reload Screens
          </Button>
        </div>

        {!isDemoMode && (
          <p className="mt-2 text-xs text-amber-700 font-mono">
            ℹ️ Demo auto-logins are only active when DEMO_MODE=&quot;true&quot;.
          </p>
        )}

        {/* Responsive View Switcher for smaller screens */}
        <div className="mt-6 lg:hidden flex items-center justify-center gap-1 p-1 bg-[var(--bg-subtle)] rounded-lg max-w-xs mx-auto border border-[var(--border-subtle)]">
          <button
            onClick={() => setActiveTab("guest")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === "guest"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)]"
            }`}
          >
            Guest View
          </button>
          <button
            onClick={() => setActiveTab("kitchen")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === "kitchen"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)]"
            }`}
          >
            Kitchen View
          </button>
        </div>
      </section>

      {/* Split Screen Showcase */}
      <section className="flex-1 px-4 sm:px-8 pb-12 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Guest App in Phone Frame (5 columns on desktop) */}
          <div
            className={`lg:col-span-5 flex flex-col items-center ${
              activeTab === "kitchen" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="w-full flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Guest App (Table 7)
                </span>
              </div>
              <a
                href="/t/demo-table-7"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                <span>Fullscreen</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Smartphone Mockup Frame */}
            <div className="relative w-full max-w-[380px] h-[720px] rounded-[48px] bg-stone-900 p-3 shadow-2xl border-4 border-stone-800 ring-1 ring-stone-950/20">
              {/* Speaker / Dynamic Island Pill */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-4 bg-stone-950 rounded-full z-20 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-stone-800 mr-2" />
                <div className="h-1.5 w-1.5 rounded-full bg-stone-800" />
              </div>

              {/* Screen Container */}
              <div className="relative w-full h-full rounded-[38px] overflow-hidden bg-white">
                <iframe
                  key={`guest-${iframeKey}`}
                  src="/t/demo-table-7"
                  title="Guest Ordering App (Table 7)"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Live Kitchen Display Board (7 columns on desktop) */}
          <div
            className={`lg:col-span-7 flex flex-col ${
              activeTab === "guest" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="w-full flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Live Kitchen Display System (KDS)
                </span>
              </div>
              <a
                href="/kitchen"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-[var(--primary)] hover:underline flex items-center gap-1"
              >
                <span>Open in Tab</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Tablet / KDS Display Frame */}
            <div className="relative w-full h-[720px] rounded-[24px] bg-stone-950 p-3 shadow-2xl border-4 border-stone-800 ring-1 ring-stone-950/20">
              <div className="relative w-full h-full rounded-[16px] overflow-hidden bg-[#161412]">
                <iframe
                  key={`kitchen-${iframeKey}`}
                  src="/kitchen"
                  title="Kitchen Display System"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Banner with CTA to Intallo */}
      <footer className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-8 px-4 text-center">
        <div className="max-w-2xl mx-auto space-y-3">
          <p className="text-xs uppercase font-mono tracking-widest text-[var(--text-muted)]">
            DinePulse Architecture & Design
          </p>
          <p className="font-serif text-lg font-bold text-[var(--text-primary)]">
            Crafted by Intallo for modern restaurants & multi-outlet chains
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Need high-conversion digital menus, kitchen automation, or custom point-of-sale integrations?
          </p>
          <div className="pt-2">
            <a
              href="https://intallo.in/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium text-xs shadow-md transition-all"
            >
              <span>Get in Touch with Intallo</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
