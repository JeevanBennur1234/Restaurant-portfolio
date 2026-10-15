import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WakeLockManager } from "@/components/kitchen/use-wake-lock";

describe("Kitchen Tablet WakeLockManager & Hook Logic", () => {
  let mockSentinel: {
    released: boolean;
    type: "screen";
    release: ReturnType<typeof vi.fn>;
    onrelease: ((ev: Event) => void) | null;
  };
  let mockRequest: ReturnType<typeof vi.fn>;

  const originalWindow = (globalThis as Record<string, unknown>).window;
  const originalDocument = (globalThis as Record<string, unknown>).document;

  beforeEach(() => {
    mockRequest = vi.fn(async () => {
      const sentinel = {
        released: false,
        type: "screen" as const,
        release: vi.fn(async () => {
          sentinel.released = true;
          if (typeof sentinel.onrelease === "function") {
            (sentinel.onrelease as (ev: Event) => void)(new Event("release"));
          }
        }),
        onrelease: null as ((ev: Event) => void) | null,
      };
      mockSentinel = sentinel;
      return sentinel;
    });

    // Mock initial sentinel
    void (mockRequest as () => Promise<unknown>)();
    mockRequest.mockClear();

    // Mock browser environment
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>).document = {
      visibilityState: "visible",
    };
    Object.defineProperty(navigator, "wakeLock", {
      value: {
        request: mockRequest,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as Record<string, unknown>).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }

    if (originalDocument !== undefined) {
      (globalThis as Record<string, unknown>).document = originalDocument;
    } else {
      delete (globalThis as Record<string, unknown>).document;
    }

    delete (navigator as unknown as Record<string, unknown>).wakeLock;
    vi.restoreAllMocks();
  });

  it("detects browser support correctly", () => {
    const manager = new WakeLockManager();
    expect(manager.isSupported()).toBe(true);

    delete (navigator as unknown as Record<string, unknown>).wakeLock;
    expect(manager.isSupported()).toBe(false);
  });

  it("handles unsupported browsers silently without errors", async () => {
    delete (navigator as unknown as Record<string, unknown>).wakeLock;
    const stateCallback = vi.fn();
    const manager = new WakeLockManager(stateCallback);

    const result = await manager.request();
    expect(result).toBe(false);
    expect(manager.isActive).toBe(false);
    expect(stateCallback).toHaveBeenCalledWith(false);
  });

  it("requests wake lock and transitions to active state", async () => {
    const stateCallback = vi.fn();
    const manager = new WakeLockManager(stateCallback);

    const result = await manager.request();
    expect(result).toBe(true);
    expect(mockRequest).toHaveBeenCalledWith("screen");
    expect(manager.isActive).toBe(true);
    expect(stateCallback).toHaveBeenCalledWith(true);
  });

  it("releases wake lock and transitions to inactive state", async () => {
    const stateCallback = vi.fn();
    const manager = new WakeLockManager(stateCallback);

    await manager.request();
    expect(manager.isActive).toBe(true);

    await manager.release();
    expect(mockSentinel.release).toHaveBeenCalled();
    expect(manager.isActive).toBe(false);
    expect(stateCallback).toHaveBeenLastCalledWith(false);
  });

  it("releases sentinel cleanly on destroy()", async () => {
    const manager = new WakeLockManager();
    await manager.request();
    expect(manager.isActive).toBe(true);

    manager.destroy();
    expect(mockSentinel.release).toHaveBeenCalled();
    expect(manager.isActive).toBe(false);
  });

  it("re-acquires wake lock when visibility changes to visible", async () => {
    const manager = new WakeLockManager();
    await manager.request();
    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Simulate system release when hidden
    mockSentinel.released = true;
    if (mockSentinel.onrelease) {
      mockSentinel.onrelease(new Event("release"));
    }

    // Now document returns to visible
    (globalThis as { document: { visibilityState: string } }).document.visibilityState = "visible";
    await manager.handleVisibilityChange();

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(manager.isActive).toBe(true);
  });

  it("does NOT re-acquire wake lock if user explicitly released it", async () => {
    const manager = new WakeLockManager();
    await manager.request();
    await manager.release(); // User explicitly releases

    // Document returns to visible
    (globalThis as { document: { visibilityState: string } }).document.visibilityState = "visible";
    await manager.handleVisibilityChange();

    // Still only 1 call from initial request
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(manager.isActive).toBe(false);
  });

  it("silently handles wake lock request rejection (e.g. low battery or permission denied)", async () => {
    mockRequest.mockRejectedValueOnce(new Error("NotAllowedError"));
    const stateCallback = vi.fn();
    const manager = new WakeLockManager(stateCallback);

    const result = await manager.request();
    expect(result).toBe(false);
    expect(manager.isActive).toBe(false);
    expect(stateCallback).toHaveBeenCalledWith(false);
  });
});
