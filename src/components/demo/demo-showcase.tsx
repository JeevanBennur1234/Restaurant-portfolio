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
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveSiteUrl } from "@/lib/site-urls";

export interface DemoShowcaseProps {
  isDemoMode: boolean;
  kitchenUrl?: string | null;
  managerUrl?: string | null;
}

export function DemoShowcase({
  isDemoMode,
  kitchenUrl,
  managerUrl,
}: DemoShowcaseProps) {
  const [activeTab, setActiveTab] = React.useState<"split" | "guest" | "kitchen" | "manager">("split");
  const [opsView, setOpsView] = React.useState<"kitchen" | "manager">("kitchen");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [iframeKey, setIframeKey] = React.useState(0);

  const effectiveKitchenUrl =
    kitchenUrl !== undefined && kitchenUrl !== null
      ? (kitchenUrl.startsWith("/")
          ? `/demo-enter?role=kitchen`
          : `${kitchenUrl.replace(/\/$/, "")}/demo-enter`)
      : resolveSiteUrl("kitchen", "/demo-enter");

  const effectiveManagerUrl =
    managerUrl !== undefined && managerUrl !== null
      ? (managerUrl.startsWith("/")
          ? `/demo-enter?role=manager`
          : `${managerUrl.replace(/\/$/, "")}/demo-enter`)
      : resolveSiteUrl("manager", "/demo-enter");

  const effectiveGuestUrl =
    resolveSiteUrl("customer", "/t/demo-table-7") || "/t/demo-table-7";

  const directKitchenUrl = resolveSiteUrl("kitchen", "/kitchen") || "/kitchen";
  const directManagerUrl = resolveSiteUrl("manager", "/admin") || "/admin";

  const handleOpenKitchen = () => {
    window.open(effectiveKitchenUrl || directKitchenUrl, "_blank");
  };

  const handleOpenManager = () => {
    window.open(effectiveManagerUrl || directManagerUrl, "_blank");
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[var(--bg-surface)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="font-serif text-2xl font-bold tracking-tight text-[var(--primary)] group-hover:opacity-90 transition-opacity">
                Masala Lane
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
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] bg-[var(--primary)]/10 hover:bg-[var(--primary)]/15 px-3.5 py-2 rounded-full transition-colors min-h-[44px]"
            >
              <span>Contact Intallo</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Showcase Hero */}
      <section className="px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto w-full text-center space-y-4">
        <div className="inline-flex items-center gap-2">
          <span className="eyebrow-label text-[#D97706]">
            00 / Live Split-Screen Showcase
          </span>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.05]">
            Instant QR Dining &amp; Real-Time Kitchen Operations
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed font-sans max-w-2xl mx-auto">
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
            onClick={() => window.open(effectiveGuestUrl, "_blank")}
            leftIcon={<Smartphone className="h-4 w-4" />}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            className="shadow-md min-h-[44px] px-5"
          >
            Open as Guest (Table 7)
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={handleOpenKitchen}
            disabled={!isDemoMode}
            leftIcon={<ChefHat className="h-4 w-4" />}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            className="shadow-md bg-[#2E2723] text-[#FAF7F2] hover:bg-[#221C19] border border-[var(--border-subtle)] min-h-[44px] px-5"
          >
            Open as Kitchen
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={handleOpenManager}
            disabled={!isDemoMode}
            leftIcon={<ShieldCheck className="h-4 w-4 text-[var(--primary)]" />}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            className="shadow-sm min-h-[44px] px-5"
          >
            Open as Manager
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Reload live screens"
            className="text-xs text-[var(--text-secondary)] min-h-[44px] px-4"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reload Screens
          </Button>
        </div>

        {!isDemoMode && (
          <p className="mt-2 text-xs text-amber-700 font-mono">
            ℹ️ Demo auto-logins are only active when DEMO_MODE=&quot;true&quot;.
          </p>
        )}

        {/* Responsive View Switcher for smaller screens */}
        <div className="mt-6 lg:hidden flex items-center justify-center gap-1.5 p-1 bg-[var(--bg-subtle)] rounded-full max-w-xs mx-auto border border-[var(--border-subtle)]">
          <button
            onClick={() => setActiveTab("guest")}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-colors min-h-[44px] flex items-center justify-center ${
              activeTab === "guest"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)]"
            }`}
          >
            Guest View
          </button>
          <button
            onClick={() => setActiveTab("kitchen")}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-colors min-h-[44px] flex items-center justify-center ${
              activeTab === "kitchen"
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)]"
            }`}
          >
            Operations View
          </button>
        </div>
      </section>

      {/* Split Screen Showcase */}
      <section className="flex-1 px-4 sm:px-8 pb-16 max-w-7xl mx-auto w-full">
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
                  01 / Guest App (Table 7)
                </span>
              </div>
              <a
                href={effectiveGuestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-[var(--primary)] hover:underline flex items-center gap-1 min-h-[44px]"
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
                  src={effectiveGuestUrl}
                  title="Guest Ordering App (Table 7)"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Live Kitchen Display / Manager Console (7 columns on desktop) */}
          <div
            className={`lg:col-span-7 flex flex-col ${
              activeTab === "guest" ? "hidden lg:flex" : "flex"
            }`}
          >
            <div className="w-full flex items-center justify-between mb-3 px-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-[var(--bg-subtle)] p-1 rounded-lg border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setOpsView("kitchen")}
                    className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-all cursor-pointer ${
                      opsView === "kitchen"
                        ? "bg-[#2E2723] text-white shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    Kitchen (KDS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpsView("manager")}
                    className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-all cursor-pointer ${
                      opsView === "manager"
                        ? "bg-[var(--primary)] text-white shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    Manager Console
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {opsView === "kitchen" ? (
                  <a
                    href={effectiveKitchenUrl || directKitchenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-[var(--primary)] hover:underline flex items-center gap-1 min-h-[44px]"
                  >
                    <span>Open in Tab</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <a
                    href={effectiveManagerUrl || directManagerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-[var(--primary)] hover:underline flex items-center gap-1 min-h-[44px]"
                  >
                    <span>Open in Tab</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Tablet / KDS Display Frame */}
            <div className="relative w-full h-[720px] rounded-[24px] bg-stone-950 p-3 shadow-2xl border-4 border-stone-800 ring-1 ring-stone-950/20">
              <div className="relative w-full h-full rounded-[16px] overflow-hidden bg-[#161412]">
                {opsView === "kitchen" ? (
                  effectiveKitchenUrl ? (
                    <iframe
                      key={`kitchen-${iframeKey}`}
                      src={effectiveKitchenUrl}
                      title="Kitchen Display System"
                      className="w-full h-full border-0"
                    />
                  ) : (
                    /* Clear Not-Configured State */
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-zinc-300 space-y-4">
                      <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <AlertTriangle className="h-7 w-7" />
                      </div>
                      <div className="space-y-1.5 max-w-sm">
                        <h3 className="font-serif text-lg font-bold text-white">
                          Kitchen Display Not Configured
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                          In multi-site mode, set{" "}
                          <code className="text-amber-300 font-mono bg-zinc-800 px-1 py-0.5 rounded">
                            NEXT_PUBLIC_KITCHEN_SITE_URL
                          </code>{" "}
                          in your environment to enable cross-site embedding.
                        </p>
                      </div>
                      <a
                        href={directKitchenUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white border border-zinc-700 transition-colors"
                      >
                        <span>Open in new tab</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )
                ) : effectiveManagerUrl ? (
                  <iframe
                    key={`manager-${iframeKey}`}
                    src={effectiveManagerUrl}
                    title="Manager Console"
                    className="w-full h-full border-0"
                  />
                ) : (
                  /* Clear Not-Configured State */
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-zinc-300 space-y-4">
                    <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <AlertTriangle className="h-7 w-7" />
                    </div>
                    <div className="space-y-1.5 max-w-sm">
                      <h3 className="font-serif text-lg font-bold text-white">
                        Manager Console Not Configured
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                        In multi-site mode, set{" "}
                        <code className="text-amber-300 font-mono bg-zinc-800 px-1 py-0.5 rounded">
                          NEXT_PUBLIC_MANAGER_SITE_URL
                        </code>{" "}
                        in your environment to enable cross-site embedding.
                      </p>
                    </div>
                    <a
                      href={directManagerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white border border-zinc-700 transition-colors"
                    >
                      <span>Open in new tab</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Banner with CTA to Intallo */}
      <footer className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-8 px-4 text-center">
        <div className="max-w-2xl mx-auto space-y-3">
          <p className="text-xs uppercase font-mono tracking-widest text-[var(--text-muted)]">
            DinePulse Architecture &amp; Design
          </p>
          <p className="font-serif text-lg font-bold text-[var(--text-primary)]">
            Crafted by Intallo for modern restaurants &amp; multi-outlet chains
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
