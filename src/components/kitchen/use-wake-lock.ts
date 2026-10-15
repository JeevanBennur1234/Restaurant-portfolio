"use client";

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";

export interface UseWakeLockOptions {
  autoRequest?: boolean;
}

export interface UseWakeLockResult {
  isSupported: boolean;
  isActive: boolean;
  request: () => Promise<boolean>;
  release: () => Promise<void>;
}

export interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  type: "screen";
  release(): Promise<void>;
  onrelease: ((this: WakeLockSentinelLike, ev: Event) => void) | null;
}

export interface NavigatorWithWakeLock {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinelLike>;
  };
}

/**
 * Encapsulated Screen Wake Lock Manager for kitchen tablets.
 * Manages sentinel lifecycle, visibilitychange events, and silent fallback handling.
 */
export class WakeLockManager {
  private sentinel: WakeLockSentinelLike | null = null;
  public wantsLock = false;
  private onStateChange?: (isActive: boolean) => void;

  constructor(onStateChange?: (isActive: boolean) => void) {
    this.onStateChange = onStateChange;
  }

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      "wakeLock" in navigator &&
      Boolean((navigator as NavigatorWithWakeLock).wakeLock)
    );
  }

  get isActive(): boolean {
    return Boolean(this.sentinel && !this.sentinel.released);
  }

  async request(): Promise<boolean> {
    this.wantsLock = true;
    if (!this.isSupported()) {
      this.onStateChange?.(false);
      return false;
    }

    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) {
      this.onStateChange?.(false);
      return false;
    }

    try {
      if (this.sentinel && !this.sentinel.released) {
        this.onStateChange?.(true);
        return true;
      }

      const sentinel = await nav.wakeLock.request("screen");
      this.sentinel = sentinel;
      this.onStateChange?.(true);

      sentinel.onrelease = () => {
        this.onStateChange?.(false);
      };

      return true;
    } catch {
      this.onStateChange?.(false);
      return false;
    }
  }

  async release(): Promise<void> {
    this.wantsLock = false;
    try {
      if (this.sentinel && !this.sentinel.released) {
        await this.sentinel.release();
      }
    } catch {
      // Silent error handling
    } finally {
      this.sentinel = null;
      this.onStateChange?.(false);
    }
  }

  async handleVisibilityChange(): Promise<void> {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      this.wantsLock &&
      (!this.sentinel || this.sentinel.released)
    ) {
      await this.request();
    }
  }

  destroy(): void {
    this.wantsLock = false;
    if (this.sentinel && !this.sentinel.released) {
      this.sentinel.release().catch(() => {});
      this.sentinel = null;
    }
    this.onStateChange?.(false);
  }
}

/**
 * Screen Wake Lock hook for kitchen tablets and display lines.
 * - Handles visibilitychange re-acquisition when returning to tab/screen.
 * - Releases wake lock automatically on unmount.
 * - Silently handles unsupported browsers, system restrictions, and permission rejections.
 */
function emptySubscribe() {
  return () => {};
}

function checkSupport() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "wakeLock" in navigator
  );
}

function getServerSnapshot() {
  return false;
}

export function useWakeLock(
  options: UseWakeLockOptions = {}
): UseWakeLockResult {
  const { autoRequest = true } = options;
  const [isActive, setIsActive] = useState(false);
  const isSupported = useSyncExternalStore(
    emptySubscribe,
    checkSupport,
    getServerSnapshot
  );

  const managerRef = useRef<WakeLockManager | null>(null);

  useEffect(() => {
    const manager = new WakeLockManager(setIsActive);
    managerRef.current = manager;

    const onVisibilityChange = () => {
      void manager.handleVisibilityChange();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    if (autoRequest) {
      void manager.request();
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      manager.destroy();
      managerRef.current = null;
    };
  }, [autoRequest]);

  const request = useCallback(async (): Promise<boolean> => {
    if (!managerRef.current) return false;
    return managerRef.current.request();
  }, []);

  const release = useCallback(async (): Promise<void> => {
    if (!managerRef.current) return;
    return managerRef.current.release();
  }, []);

  return {
    isSupported,
    isActive,
    request,
    release,
  };
}
