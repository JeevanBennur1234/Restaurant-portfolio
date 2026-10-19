import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { db } from "@/server/db";
import { tables } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { TableTokenForm } from "@/components/guest/table-token-form";
import { Button } from "@/components/ui/button";
import {
  Smartphone,
  QrCode,
  ArrowRight,
  ShieldCheck,
  Utensils,
  Terminal,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Table Ordering | Masala Lane",
  description: "Start customer dine-in table ordering at Masala Lane.",
};

function getDatabaseHostInfo(): { isLocal: boolean; host: string } {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return { isLocal: false, host: "unknown" };
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname.toLowerCase();
    const isSupabase = host.includes("supabase");
    const allowed =
      ["localhost", "127.0.0.1", "::1", "postgres", "0.0.0.0"].includes(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal");
    return { isLocal: allowed && !isSupabase, host };
  } catch {
    const match = connectionString.match(/@([^:/]+)/);
    const host = match ? match[1].toLowerCase() : "";
    const isSupabase = host.includes("supabase");
    const allowed =
      ["localhost", "127.0.0.1", "::1", "postgres", "0.0.0.0"].includes(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal");
    return { isLocal: allowed && !isSupabase, host };
  }
}

async function DevLauncherSection() {
  await connection();
  const dbHost = getDatabaseHostInfo();
  const configuredToken = process.env.DEV_TABLE_TOKEN?.trim();

  let devTable: { tableNumber: string; qrToken: string } | null = null;
  let devLauncherError: string | null = null;

  if (!dbHost.isLocal) {
    devLauncherError = `Isolated local database required. Runtime database points to '${dbHost.host}' (Supabase). The local ordering launcher is disabled to prevent writing test orders to remote databases.`;
  } else if (!configuredToken) {
    devLauncherError = `DEV_TABLE_TOKEN is not configured. Set DEV_TABLE_TOKEN in your environment to enable the 1-click ordering launcher. Automatic fallback table discovery is disabled.`;
  } else {
    const table = await db.query.tables.findFirst({
      where: and(
        eq(tables.qrToken, configuredToken),
        eq(tables.isActive, true)
      ),
    });
    if (table) {
      devTable = {
        tableNumber: table.tableNumber,
        qrToken: table.qrToken,
      };
    } else {
      devLauncherError = `Table with token '${configuredToken}' was not found or is inactive in the local database. Verify that your local database is seeded and that the token matches an active table.`;
    }
  }

  return (
    <section
      data-testid="dev-table-section"
      className="p-5 sm:p-6 rounded-[var(--radius-xl)] bg-gradient-to-br from-[#2E2723] to-[#1F1A18] text-[#FAF7F2] border border-[#D97706]/40 shadow-lg space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-mono font-bold tracking-wider uppercase text-amber-300">
          <Terminal className="h-4 w-4" />
          <span>Local Development Session</span>
        </div>
        <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30">
          Dev Only
        </span>
      </div>

      {devTable ? (
        <div className="space-y-3">
          <p className="text-xs sm:text-sm text-[#EAE2D8] leading-relaxed">
            Active test table detected from your isolated development database (
            <strong className="text-white font-semibold">{devTable.tableNumber}</strong>). You can launch genuine table ordering directly:
          </p>
          <div className="pt-1">
            <Link href={`/t/${devTable.qrToken}`} className="block">
              <Button
                variant="primary"
                size="md"
                data-testid="dev-start-order-btn"
                className="w-full sm:w-auto px-6 font-semibold justify-between sm:justify-center shadow-md min-h-[48px]"
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                <span>Start Ordering at {devTable.tableNumber}</span>
              </Button>
            </Link>
          </div>
          <p className="text-[11px] text-[#A89E94] font-mono">
            Target: /t/{devTable.qrToken.slice(0, 8)}... (Table: {devTable.tableNumber})
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-xs text-[#EAE2D8]">
          <p className="text-amber-200 font-semibold">
            {devLauncherError}
          </p>
          <p className="text-[11px] text-[#A89E94] leading-relaxed">
            To use the local ordering launcher, ensure your application points to an isolated local PostgreSQL database and configure an active table token:
          </p>
          <code className="block p-2 rounded-md bg-black/40 font-mono text-[11px] text-amber-200 whitespace-pre-wrap break-all">
            DEV_TABLE_TOKEN=&lt;active_table_qr_token&gt;
          </code>
        </div>
      )}
    </section>
  );
}

export default function OrderEntryPage() {
  // Launcher is strictly enabled only in development or test environment, never in production
  const isLauncherAllowed =
    (process.env.NODE_ENV === "development" ||
      process.env.ENABLE_DEV_TABLE_LAUNCHER === "true") &&
    process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-4 sm:px-8 py-3.5 backdrop-blur-md shadow-xs">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-subtle)] text-[var(--primary)] group-hover:opacity-90 transition-opacity">
            <Utensils className="h-4 w-4" />
          </div>
          <div>
            <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Masala Lane
            </span>
            <span className="hidden sm:inline-block ml-2 text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase">
              Table Dining
            </span>
          </div>
        </Link>

        <Link
          href="/"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors min-h-[44px] inline-flex items-center"
        >
          Back to Restaurant
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-8 py-8 sm:py-12 space-y-8">
        {/* Editorial Heading */}
        <div className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--primary-subtle)] text-[var(--primary)] text-xs font-semibold tracking-wider uppercase font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
            <span>Contactless Dining</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            Order at Your Table
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-xl leading-relaxed">
            Every dining table at Masala Lane is linked to our digital kitchen line. Scan the QR code standee on your dining table to open your live menu and place orders directly.
          </p>
        </div>

        {/* Local Development Mode Bridge (Strictly hidden in production & gated by isLauncherAllowed) */}
        {isLauncherAllowed && (
          <Suspense
            fallback={
              <div
                data-testid="dev-table-section"
                className="p-5 sm:p-6 rounded-[var(--radius-xl)] bg-[#2E2723] animate-pulse h-32"
              />
            }
          >
            <DevLauncherSection />
          </Suspense>
        )}

        {/* Step-by-Step Table Ordering Guide */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: How to order at table */}
          <div className="p-6 rounded-[var(--radius-xl)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[var(--primary-subtle)] flex items-center justify-center text-[var(--primary)] shrink-0">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-[var(--text-primary)]">
                  Dining at Masala Lane?
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Instant, app-free dining from your phone
                </p>
              </div>
            </div>

            <ol className="space-y-3 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed list-decimal list-inside">
              <li>
                <strong className="text-[var(--text-primary)]">Scan your table QR:</strong> Point your camera at the brass standee on your dining table.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Select dishes:</strong> Browse live tandoor and curry specials, select modifiers, and add items to your order.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Settle your way:</strong> Choose instant online payment or Pay at Counter, and track ticket status live.
              </li>
            </ol>
          </div>

          {/* Card 2: Manual Token / QR Link Entry */}
          <div className="p-6 rounded-[var(--radius-xl)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[var(--secondary-subtle)] flex items-center justify-center text-[var(--secondary)] shrink-0">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-[var(--text-primary)]">
                  Have a Table Code or Link?
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Enter your table session token manually
                </p>
              </div>
            </div>

            <TableTokenForm />
          </div>
        </section>

        {/* Security & Authenticity Guarantee */}
        <section className="p-5 rounded-[var(--radius-lg)] bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] flex items-start gap-3.5 text-xs text-[var(--text-secondary)]">
          <ShieldCheck className="h-5 w-5 text-[var(--primary)] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold text-[var(--text-primary)]">
              Secure Dine-In Protection
            </h3>
            <p className="leading-relaxed">
              Every order placed through DinePulse is cryptographically bound to an active dining table and tracked in real-time on our live kitchen display systems.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
