"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  yOffset?: number;
}

/**
 * Scroll reveal component:
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
  const shouldReduceMotion = useReducedMotion();

  // 1. Without JS (SSR) or 2. Under prefers-reduced-motion:
  // Render fully visible without hidden opacity or offset
  if (!isMounted || shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
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
    </motion.div>
  );
}
