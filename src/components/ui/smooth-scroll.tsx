"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

export interface SmoothScrollProps {
  children: React.ReactNode;
}

/**
 * Smooth scrolling provider powered by Lenis:
 * - Lazy-loaded dynamically on client only to keep first-load JS minimal
 * - Disabled under prefers-reduced-motion
 * - Never mounts on guest ordering (/t/*), kitchen display (/kitchen) or admin hub (/admin)
 */
export function SmoothScroll({ children }: SmoothScrollProps) {
  const pathname = usePathname();

  React.useEffect(() => {
    // 1. Safety guard: never mount on guest ordering (/t/*), kitchen, or admin
    if (
      pathname?.startsWith("/t/") ||
      pathname === "/kitchen" ||
      pathname?.startsWith("/kitchen/") ||
      pathname === "/admin" ||
      pathname?.startsWith("/admin/")
    ) {
      return;
    }

    // 2. Disabled under prefers-reduced-motion
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let isDestroyed = false;
    let lenisInstance: { raf: (time: number) => void; destroy: () => void } | null = null;
    let rafId: number;

    // Dynamically lazy-load Lenis
    import("lenis").then(({ default: Lenis }) => {
      if (isDestroyed) return;

      const lenis = new Lenis({
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
      });

      lenisInstance = lenis;

      function raf(time: number) {
        lenis.raf(time);
        rafId = requestAnimationFrame(raf);
      }

      rafId = requestAnimationFrame(raf);
    });

    return () => {
      isDestroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      lenisInstance?.destroy();
    };
  }, [pathname]);

  return <>{children}</>;
}
