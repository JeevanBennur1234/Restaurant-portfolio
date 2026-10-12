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
    DEMO_MODE: "false",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
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
    vi.clearAllMocks();
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
    mockHttpSend.mockRejectedValueOnce(new Error("Network timeout"));

    const channelName = getRestaurantChannel("rest_test");
    await publishRealtimeEvent(channelName, "order.created", { orderId: "ord_2" });

    // Must still execute removeChannel in finally block
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
