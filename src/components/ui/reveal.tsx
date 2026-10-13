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
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

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

  const [MotionDiv, setMotionDiv] = React.useState<React.ComponentType<any> | null>(null);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduceMotion(true);
      return;
    }

    let isSubscribed = true;
    import("motion/react")
      .then((mod) => {
        if (isSubscribed) {
          setMotionDiv(() => mod.motion.div);
        }
      })
      .catch(() => {
        // Fallback to static div if module fails to load
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  // 1. Without JS (SSR), 2. Under prefers-reduced-motion, or 3. While motion is lazy-loading:
  // Render fully visible fallback without hidden opacity or offset
  if (!isMounted || reduceMotion || !MotionDiv) {
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
