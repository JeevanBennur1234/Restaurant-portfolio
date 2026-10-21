import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ToastProvider } from "@/components/ui/toast";
import { GlobalFooter } from "@/components/layout/global-footer";
import "./globals.css";

const playfair = localFont({
  src: "./fonts/PlayfairDisplay-Variable.ttf",
  variable: "--font-playfair",
  display: "swap",
  weight: "400 900",
});

const plusJakarta = localFont({
  src: "./fonts/PlusJakartaSans-Variable.ttf",
  variable: "--font-plus-jakarta",
  display: "swap",
  weight: "200 800",
});

import { env } from "@/server/env";

const siteName =
  process.env.NEXT_PUBLIC_SITE_NAME || env.NEXT_PUBLIC_SITE_NAME || "DinePulse";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: {
    default: `${siteName} by Intallo | Smart QR Dining & Real-Time KDS`,
    template: `%s | ${siteName}`,
  },
  description:
    "Demo restaurant ordering system by Intallo. Premium casual dining, instant table ordering, and real-time kitchen operations.",
  keywords: [
    "restaurant ordering",
    "QR menu",
    "kitchen display system",
    "KDS",
    "table ordering",
    "DinePulse",
    "Intallo",
  ],
  authors: [{ name: "Intallo", url: "https://intallo.in" }],
  openGraph: {
    title: "DinePulse by Intallo | Smart QR Dining & Real-Time KDS",
    description:
      "Instant QR table ordering and zero-latency kitchen coordination for modern Indian dining.",
    url: env.APP_URL,
    siteName: "DinePulse",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DinePulse by Intallo | Smart QR Dining & Real-Time KDS",
    description:
      "Instant QR table ordering and zero-latency kitchen coordination for modern Indian dining.",
    creator: "@IntalloHQ",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF7F2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${plusJakarta.variable} antialiased`}
    >
      <body className="min-h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
        <ToastProvider>
          <div className="flex-1 flex flex-col">{children}</div>
          <Suspense fallback={null}>
            <GlobalFooter />
          </Suspense>
        </ToastProvider>
      </body>
    </html>
  );
}
