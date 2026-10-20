import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockHttpSend, mockChannel, mockSupabaseClient } = vi.hoisted(() => {
  const mockRemoveChannel = vi.fn().mockResolvedValue("ok");
  const mockHttpSend = vi.fn().mockResolvedValue({ success: true });
  const mockChannel = {
    httpSend: mockHttpSend,
    subscribe: vi.fn(),
    send: vi.fn(),
  };
  const mockSupabaseClient = {
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: mockRemoveChannel,
  };
  return { mockHttpSend, mockChannel, mockSupabaseClient };
});

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    PAYMENTS_MODE: "online",
    DATABASE_URL: "postgres://mock",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
    NEXT_PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_key",
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

import { getRestaurantChannel, publishRealtimeEvent } from "@/server/realtime";

describe("Supabase Realtime Security", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockChannel.httpSend = mockHttpSend;
    mockChannel.subscribe.mockReset();
    mockChannel.send.mockReset().mockResolvedValue("ok");
    mockHttpSend.mockResolvedValue({ success: true });
    mockSupabaseClient.channel.mockReturnValue(mockChannel);
  });

  it("Requirement 2: getRestaurantChannel derives HMAC-SHA256 channel name with 24 hex chars", () => {
    const restaurantId = "rest_12345";
    const channelName = getRestaurantChannel(restaurantId);

    // Format: restaurant:<24 hex characters>
    expect(channelName).toMatch(/^restaurant:[a-f0-9]{24}$/);
    // Never reveals raw restaurant ID
    expect(channelName).not.toContain(restaurantId);
  });

  it("Requirement 2: getRestaurantChannel is deterministic and restaurant-isolated", () => {
    const channel1 = getRestaurantChannel("restaurant_alpha");
    const channel2 = getRestaurantChannel("restaurant_alpha");
    const channelBeta = getRestaurantChannel("restaurant_beta");

    expect(channel1).toBe(channel2);
    expect(channel1).not.toBe(channelBeta);
  });

  it("Requirement 1: publishRealtimeEvent sends via httpSend and always cleans up channel with removeChannel", async () => {
    const channelName = getRestaurantChannel("rest_test");
    const payload = { orderId: "ord_1", status: "placed" };

    await publishRealtimeEvent(channelName, "order.created", payload);

    expect(mockSupabaseClient.channel).toHaveBeenCalledWith(channelName);
    expect(mockHttpSend).toHaveBeenCalledWith("order.created", payload);
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel);
  });

  it("Requirement 1: publishRealtimeEvent cleans up channel even if publish throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockHttpSend.mockRejectedValueOnce(new Error("Network timeout"));

    const channelName = getRestaurantChannel("rest_test");
    await expect(
      publishRealtimeEvent(channelName, "order.created", { orderId: "ord_2" })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Realtime Publish Error]"),
      "Network timeout"
    );
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel);
    errorSpy.mockRestore();
  });

  it("treats an HTTP broadcast error status as a failed publish without failing the API call", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockHttpSend.mockResolvedValueOnce({
      success: false,
      status: 503,
      error: "service unavailable",
    });

    await expect(
      publishRealtimeEvent("restaurant:test", "order.created", { orderId: "ord_3" })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Realtime Publish Error]"),
      "HTTP broadcast failed with status 503"
    );
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel);
    errorSpy.mockRestore();
  });

  it("warns once at the 1500 ms fallback timeout and ignores a late SUBSCRIBED callback", async () => {
    const channel = mockChannel as unknown as { httpSend?: typeof mockHttpSend };
    delete channel.httpSend;
    let onStatus: ((status: string) => void) | undefined;
    mockChannel.subscribe.mockImplementation((callback: (status: string) => void) => {
      onStatus = callback;
      return mockChannel;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();

    const publish = publishRealtimeEvent("restaurant:test", "order.ready", {
      private: "must-not-be-logged",
    });
    expect(mockChannel.subscribe).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1500);
    await expect(publish).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      "[Realtime Publish Timeout] Channel: restaurant:test | Event: order.ready"
    );
    expect(warnSpy.mock.calls.flat().join(" ")).not.toContain("must-not-be-logged");

    onStatus?.("SUBSCRIBED");
    await Promise.resolve();
    expect(mockChannel.send).not.toHaveBeenCalled();
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel);

    warnSpy.mockRestore();
    vi.useRealTimers();
  });
});
