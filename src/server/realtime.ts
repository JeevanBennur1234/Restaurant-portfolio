import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Generic Realtime publisher interface allowing the underlying transport
 * (Supabase Realtime, Pusher, Ably, WebSockets) to be swapped cleanly.
 */
export interface RealtimeProvider {
  publish(channelName: string, event: string, payload: unknown): Promise<void>;
}

/**
 * Supabase Realtime Provider implementation
 */
export class SupabaseRealtimeProvider implements RealtimeProvider {
  private client: SupabaseClient | null = null;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Only instantiate if real or valid credentials exist (not placeholder)
    if (
      supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes("placeholder") &&
      !supabaseKey.includes("placeholder")
    ) {
      this.client = createClient(supabaseUrl, supabaseKey);
    }
  }

  async publish(channelName: string, event: string, payload: unknown): Promise<void> {
    if (!this.client) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[Realtime Mock Broadcast] Channel: ${channelName} | Event: ${event}`,
          payload
        );
      }
      return;
    }

    try {
      const channel = this.client.channel(channelName);
      await channel.send({
        type: "broadcast",
        event,
        payload,
      });
    } catch (error) {
      console.error(
        `[Realtime Publish Error] Channel: ${channelName} | Event: ${event}:`,
        (error as Error).message
      );
    }
  }
}

// Default provider instance (swappable per deployment)
const defaultProvider: RealtimeProvider = new SupabaseRealtimeProvider();

/**
 * Unified server helper to broadcast events across DinePulse realtime channels.
 */
export async function publishRealtimeEvent(
  channelName: string,
  event: string,
  payload: unknown
): Promise<void> {
  await defaultProvider.publish(channelName, event, payload);
}
