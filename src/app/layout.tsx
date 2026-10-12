import type { Metadata, Viewport } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "600", "700"],
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Masala Lane | DinePulse by Intallo",
  description:
    "Demo restaurant ordering system by Intallo. Premium casual dining, instant table ordering.",
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
          <footer className="py-6 px-4 text-center text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <p>
              Concept preview by{" "}
              <a
                href="https://intallo.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--primary)] hover:underline underline-offset-4 transition-colors"
              >
                Intallo
              </a>
            </p>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
