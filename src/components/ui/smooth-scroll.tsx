"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

export interface SmoothScrollProps {
  children: React.ReactNode;
}

/**
 * Smooth scrolling provider powered by Lenis:
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

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [pathname]);

  return <>{children}</>;
}
