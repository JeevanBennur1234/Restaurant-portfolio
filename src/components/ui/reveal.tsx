"use client";

import * as React from "react";

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
}

/**
 * Scroll reveal component:
 * - Lazy-loads motion/react on client only to keep first-load JS minimal (<200KB)
 * - Fades and translates up when scrolled into view (once only)
 * - Renders fully visible without JS (SSR progressive enhancement)
 * - Renders fully visible without motion when prefers-reduced-motion is active
 */
type MotionDivProps = React.HTMLAttributes<HTMLDivElement> & {
  initial?: unknown;
  whileInView?: unknown;
  viewport?: unknown;
  transition?: unknown;
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

const subscribeReducedMotion = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
};
const getReducedMotionSnapshot = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
const getReducedMotionServerSnapshot = () => false;

export function Reveal({
  children,
  className = "",
  delay = 0,
  duration = 0.6,
  yOffset = 24,
}: RevealProps) {
  const isMounted = React.useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  const isReducedMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  const [MotionDiv, setMotionDiv] = React.useState<React.ComponentType<MotionDivProps> | null>(null);

  React.useEffect(() => {
    if (isReducedMotion) return;

    let isSubscribed = true;
    import("motion/react")
      .then((mod) => {
        if (isSubscribed) {
          setMotionDiv(() => mod.motion.div as unknown as React.ComponentType<MotionDivProps>);
        }
      })
      .catch(() => {
        // Fallback to static div if module fails to load
      });

    return () => {
      isSubscribed = false;
    };
  }, [isReducedMotion]);

  // 1. Without JS (SSR), 2. Under prefers-reduced-motion, or 3. While motion is lazy-loading:
  // Render fully visible fallback without hidden opacity or offset
  if (!isMounted || isReducedMotion || !MotionDiv) {
    return <div className={className}>{children}</div>;
  }

  const Component = MotionDiv;

  return (
    <Component
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1], // Smooth cubic-bezier
      }}
      className={className}
    >
      {children}
    </Component>
  );
}
